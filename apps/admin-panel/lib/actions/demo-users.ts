'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase-server';
import { getCurrentProfile } from '@/lib/auth';
import { getAdminClient } from '@/lib/utils/supabase-admin';

const ToggleSchema = z.object({
  user_id: z.string().uuid(),
  is_demo: z.boolean(),
});

const SEARCH_MAX_LENGTH = 120;

export interface DemoUserRow {
  id: string;
  email: string | null;
  username: string;
  full_name: string | null;
  role: string;
  home_gym_id: string | null;
  created_at: string;
  is_demo: boolean;
}

export interface DemoUsersPageData {
  query: string;
  demoUsers: DemoUserRow[];
  searchResults: DemoUserRow[];
}

function normalizeSearchTerm(raw?: string): string {
  const parsed = z.string().trim().max(SEARCH_MAX_LENGTH).catch('').parse(raw ?? '');
  // Keep search expression PostgREST-safe before embedding in ilike filter.
  return parsed
    .replace(/[^a-zA-Z0-9@._+\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toDemoUserRow(input: Record<string, unknown>): DemoUserRow {
  return {
    id: String(input.id ?? ''),
    email: typeof input.email === 'string' ? input.email : null,
    username: typeof input.username === 'string' ? input.username : 'unknown-user',
    full_name: typeof input.full_name === 'string' ? input.full_name : null,
    role: typeof input.role === 'string' ? input.role : 'user',
    home_gym_id: typeof input.home_gym_id === 'string' ? input.home_gym_id : null,
    created_at: typeof input.created_at === 'string' ? input.created_at : '',
    is_demo: Boolean(input.is_demo),
  };
}

async function maybeWriteAuditLog(payload: {
  changedBy: string;
  targetUserId: string;
  previousValue: boolean;
  nextValue: boolean;
  targetEmail: string | null;
  targetUsername: string;
}) {
  const admin = getAdminClient();
  if (!admin) return;

  // Best-effort insert: only writes if a compatible public.audit_log table exists.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin.from('audit_log') as any).insert({
    action: 'profile_demo_flag_toggled',
    entity_type: 'profiles',
    entity_id: payload.targetUserId,
    actor_id: payload.changedBy,
    metadata: {
      previous_is_demo: payload.previousValue,
      next_is_demo: payload.nextValue,
      target_email: payload.targetEmail,
      target_username: payload.targetUsername,
      source: 'admin_panel_demo_users',
    },
  });

  if (!error) return;

  const missingTablePattern = /(Could not find the table|relation .*audit_log.* does not exist)/i;
  if (!missingTablePattern.test(error.message)) {
    console.warn('[toggleDemoFlag] audit_log insert failed:', error.message);
  }
}

export async function getDemoUsersPageData(rawQuery?: string): Promise<{
  success: boolean;
  data?: DemoUsersPageData;
  error?: string;
}> {
  try {
    const profile = await getCurrentProfile();
    if (!profile || profile.role !== 'superadmin') {
      return { success: false, error: 'Only superadmins can view demo users.' };
    }

    const admin = getAdminClient();
    if (!admin) {
      return { success: false, error: 'Admin client not available.' };
    }

    const query = normalizeSearchTerm(rawQuery);

    const { data: demoRows, error: demoError } = await admin
      .from('profiles')
      .select('id, email, username, full_name, role, home_gym_id, created_at, is_demo')
      .eq('is_demo', true)
      .order('updated_at', { ascending: false })
      .limit(200);

    if (demoError) {
      return { success: false, error: demoError.message };
    }

    let searchRows: Array<Record<string, unknown>> = [];
    if (query.length > 0) {
      const { data, error } = await admin
        .from('profiles')
        .select('id, email, username, full_name, role, home_gym_id, created_at, is_demo')
        .or(`email.ilike.%${query}%,username.ilike.%${query}%`)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        return { success: false, error: error.message };
      }
      searchRows = (data ?? []) as Array<Record<string, unknown>>;
    }

    return {
      success: true,
      data: {
        query,
        demoUsers: ((demoRows ?? []) as Array<Record<string, unknown>>).map(toDemoUserRow),
        searchResults: searchRows.map(toDemoUserRow),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load demo users.',
    };
  }
}

export async function toggleDemoFlag(
  input: z.infer<typeof ToggleSchema>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const parsed = ToggleSchema.parse(input);

    const profile = await getCurrentProfile();
    if (!profile || profile.role !== 'superadmin') {
      return { success: false, error: 'Only superadmins can toggle demo flag.' };
    }

    const admin = getAdminClient();
    if (!admin) {
      return { success: false, error: 'Admin client not available.' };
    }

    const { data: targetRow, error: targetError } = await admin
      .from('profiles')
      .select('id, email, username, is_demo')
      .eq('id', parsed.user_id)
      .single();

    if (targetError || !targetRow) {
      return { success: false, error: 'Target user not found.' };
    }

    const targetRecord = targetRow as Record<string, unknown>;
    const previousValue = Boolean(targetRecord.is_demo);
    if (previousValue === parsed.is_demo) {
      return { success: true };
    }

    const supabase = await createClient();
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ is_demo: parsed.is_demo })
      .eq('id', parsed.user_id);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    const targetEmail =
      typeof targetRecord.email === 'string'
        ? (targetRecord.email as string)
        : null;
    const targetUsername =
      typeof targetRecord.username === 'string'
        ? (targetRecord.username as string)
        : 'unknown-user';

    await maybeWriteAuditLog({
      changedBy: profile.id,
      targetUserId: parsed.user_id,
      previousValue,
      nextValue: parsed.is_demo,
      targetEmail,
      targetUsername,
    });

    revalidatePath('/dashboard/demo-users');
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to toggle demo flag.',
    };
  }
}
