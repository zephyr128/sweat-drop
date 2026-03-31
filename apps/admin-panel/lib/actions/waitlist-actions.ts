'use server';

import { getAdminClient } from '@/lib/utils/supabase-admin';
import { getCurrentProfile } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

export type WaitlistStatus = 'pending' | 'contacted' | 'onboarded' | 'dismissed';

export interface WaitlistEntry {
  id: string;
  user_id: string | null;
  gym_name: string;
  city: string | null;
  country: string | null;
  notes: string | null;
  status: WaitlistStatus;
  created_at: string;
  updated_at: string;
  user_email: string | null;
  user_username: string | null;
}

export async function getWaitlistEntries(statusFilter?: WaitlistStatus | 'all'): Promise<{
  success: boolean;
  data?: WaitlistEntry[];
  pendingCount?: number;
  error?: string;
}> {
  try {
    const profile = await getCurrentProfile();
    if (!profile || profile.role !== 'superadmin') {
      return { success: false, error: 'Only superadmins can view the waitlist' };
    }

    const admin = getAdminClient();
    if (!admin) return { success: false, error: 'Admin client not available' };

    let query = admin
      .from('gym_waitlist')
      .select('*')
      .order('created_at', { ascending: false });

    if (statusFilter && statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    const { data: rawEntries, error } = await query as {
      data: Array<{
        id: string;
        user_id: string | null;
        gym_name: string;
        city: string | null;
        country: string | null;
        notes: string | null;
        status: WaitlistStatus;
        created_at: string;
        updated_at: string;
      }> | null;
      error: { message: string } | null;
    };

    if (error) throw new Error(error.message);

    const userIds = (rawEntries ?? [])
      .map((e) => e.user_id)
      .filter((uid): uid is string => uid !== null);

    let profileMap: Record<string, { email: string | null; username: string | null }> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await admin
        .from('profiles')
        .select('id, email, username')
        .in('id', userIds) as {
        data: Array<{ id: string; email: string | null; username: string | null }> | null;
      };
      for (const p of profiles ?? []) {
        profileMap[p.id] = { email: p.email, username: p.username };
      }
    }

    const entries: WaitlistEntry[] = (rawEntries ?? []).map((e) => ({
      ...e,
      user_email: e.user_id ? (profileMap[e.user_id]?.email ?? null) : null,
      user_username: e.user_id ? (profileMap[e.user_id]?.username ?? null) : null,
    }));

    const { count } = await admin
      .from('gym_waitlist')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');

    return { success: true, data: entries, pendingCount: count ?? 0 };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to load waitlist' };
  }
}

export async function updateWaitlistStatus(
  entryId: string,
  status: WaitlistStatus,
): Promise<{ success: boolean; error?: string }> {
  try {
    const profile = await getCurrentProfile();
    if (!profile || profile.role !== 'superadmin') {
      return { success: false, error: 'Only superadmins can update waitlist status' };
    }

    const admin = getAdminClient();
    if (!admin) return { success: false, error: 'Admin client not available' };

    const { error } = await (admin.from('gym_waitlist') as any)
      .update({ status })
      .eq('id', entryId);

    if (error) throw new Error(error.message);

    revalidatePath('/dashboard/super/waitlist');
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update status' };
  }
}

export async function getPendingWaitlistCount(): Promise<number> {
  try {
    const profile = await getCurrentProfile();
    if (!profile || profile.role !== 'superadmin') return 0;

    const admin = getAdminClient();
    if (!admin) return 0;

    const { count } = await admin
      .from('gym_waitlist')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');

    return count ?? 0;
  } catch {
    return 0;
  }
}
