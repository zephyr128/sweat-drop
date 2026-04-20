'use server';

import { getAdminClient } from '@/lib/utils/supabase-admin';
import { revalidatePath } from 'next/cache';
import { getCurrentProfile } from '../auth';

export async function getPendingRedemptionCount(gymId: string): Promise<number> {
  try {
    const profile = await getCurrentProfile();
    if (!profile) return 0;
    const allowed = ['superadmin', 'gym_owner', 'gym_admin', 'receptionist'];
    if (!allowed.includes(profile.role)) return 0;

    const supabase = getAdminClient();
    if (!supabase) return 0;

    const { count, error } = await supabase
      .from('redemptions')
      .select('*', { count: 'exact', head: true })
      .eq('gym_id', gymId)
      .eq('status', 'pending');

    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

export interface RedemptionKpiCounts {
  pending: number;
  awaitingShipment: number;
  readyToCollect: number;
}

/**
 * Returns three KPI counts for the Desk shell in a single query.
 * awaitingShipment: physical prizes not yet received at gym
 * readyToCollect:   store rewards + physical prizes already received
 */
export async function getRedemptionKpiCounts(gymId: string): Promise<RedemptionKpiCounts> {
  const zero = { pending: 0, awaitingShipment: 0, readyToCollect: 0 };
  try {
    const profile = await getCurrentProfile();
    if (!profile) return zero;
    const allowed = ['superadmin', 'gym_owner', 'gym_admin', 'receptionist'];
    if (!allowed.includes(profile.role)) return zero;

    const supabase = getAdminClient();
    if (!supabase) return zero;

    const { data, error } = await supabase
      .from('redemptions')
      .select('source_type, fulfilled_at')
      .eq('gym_id', gymId)
      .in('status', ['pending', 'pending_verification']);

    if (error || !data) return zero;

    let awaitingShipment = 0;
    let readyToCollect = 0;
    const physicalSources = ['arena_prize', 'leaderboard_prize'];

    for (const r of data as { source_type: string | null; fulfilled_at: string | null }[]) {
      if (physicalSources.includes(r.source_type ?? '') && !r.fulfilled_at) {
        awaitingShipment++;
      } else {
        readyToCollect++;
      }
    }

    return { pending: data.length, awaitingShipment, readyToCollect };
  } catch {
    return zero;
  }
}

export async function confirmRedemption(redemptionId: string, gymId: string) {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return { success: false, error: 'Not authenticated' };
    }

    // Verify access: user must own the gym (owner_id) or have it assigned (assigned_gym_id)
    if (profile.role === 'gym_owner' || profile.role === 'gym_admin' || profile.role === 'receptionist') {
      const supabaseAdminCheck = getAdminClient();
      if (!supabaseAdminCheck) {
        return { success: false, error: 'Admin client not available. Check server environment variables.' };
      }
      const { data: gym } = await supabaseAdminCheck
        .from('gyms')
        .select('owner_id')
        .eq('id', gymId)
        .single();
      
      if (!gym) {
        return { success: false, error: 'Gym not found' };
      }
      
      const gymData = gym as { owner_id: string | null; [key: string]: any };
      const ownsGym = gymData.owner_id === profile.id;
      const isAssignedGym = profile.assigned_gym_id === gymId;
      
      if (!ownsGym && !isAssignedGym) {
        return { success: false, error: 'Unauthorized' };
      }
    }

    if (profile.role !== 'gym_owner' && profile.role !== 'gym_admin' && profile.role !== 'receptionist' && profile.role !== 'superadmin') {
      return { success: false, error: 'Unauthorized' };
    }

    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available. Check server environment variables.' };
    }
    const { data, error } = await (supabaseAdmin.rpc('confirm_redemption', {
      p_redemption_id: redemptionId,
      p_confirmed_by: profile.id,
    } as any) as any);

    if (error) throw error;

    const rpcResult = (data as any)?.[0] as { success?: boolean; error_message?: string } | null;
    if (!rpcResult || !rpcResult.success) {
      return { success: false, error: rpcResult?.error_message || 'Failed to confirm redemption' };
    }

    revalidatePath(`/dashboard/gym/${gymId}/redemptions`);
    return { success: true };
  } catch (error: any) {
    // Error confirming redemption
    return { success: false, error: error.message };
  }
}

export async function cancelRedemption(redemptionId: string, gymId: string, reason?: string) {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return { success: false, error: 'Not authenticated' };
    }

    // Verify access: user must own the gym (owner_id) or have it assigned (assigned_gym_id)
    if (profile.role === 'gym_owner' || profile.role === 'gym_admin' || profile.role === 'receptionist') {
      const supabaseAdminCheck = getAdminClient();
      if (!supabaseAdminCheck) {
        return { success: false, error: 'Admin client not available. Check server environment variables.' };
      }
      const { data: gym } = await supabaseAdminCheck
        .from('gyms')
        .select('owner_id')
        .eq('id', gymId)
        .single();
      
      if (!gym) {
        return { success: false, error: 'Gym not found' };
      }
      
      const gymData = gym as { owner_id: string | null; [key: string]: any };
      const ownsGym = gymData.owner_id === profile.id;
      const isAssignedGym = profile.assigned_gym_id === gymId;
      
      if (!ownsGym && !isAssignedGym) {
        return { success: false, error: 'Unauthorized' };
      }
    }

    if (profile.role !== 'gym_owner' && profile.role !== 'gym_admin' && profile.role !== 'receptionist' && profile.role !== 'superadmin') {
      return { success: false, error: 'Unauthorized' };
    }

    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available. Check server environment variables.' };
    }
    const { data, error } = await (supabaseAdmin.rpc('cancel_redemption', {
      p_redemption_id: redemptionId,
      p_cancelled_by: profile.id,
      p_reason: reason || null,
    } as any) as any);

    if (error) throw error;

    const rpcResult = (data as any)?.[0] as { success?: boolean; error_message?: string } | null;
    if (!rpcResult || !rpcResult.success) {
      return { success: false, error: rpcResult?.error_message || 'Failed to cancel redemption' };
    }

    revalidatePath(`/dashboard/gym/${gymId}/redemptions`);
    return { success: true };
  } catch (error: any) {
    // Error cancelling redemption
    return { success: false, error: error.message };
  }
}

export async function validateRedemptionCode(code: string, gymId: string) {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return { success: false, error: 'Not authenticated' };
    }

    // Verify access: user must own the gym (owner_id) or have it assigned (assigned_gym_id)
    if (profile.role === 'gym_owner' || profile.role === 'gym_admin' || profile.role === 'receptionist') {
      const supabaseAdminCheck = getAdminClient();
      if (!supabaseAdminCheck) {
        return { success: false, error: 'Admin client not available. Check server environment variables.', data: null };
      }
      const { data: gym } = await supabaseAdminCheck
        .from('gyms')
        .select('owner_id')
        .eq('id', gymId)
        .single();
      
      if (!gym) {
        return { success: false, error: 'Gym not found' };
      }
      
      const gymData = gym as { owner_id: string | null; [key: string]: any };
      const ownsGym = gymData.owner_id === profile.id;
      const isAssignedGym = profile.assigned_gym_id === gymId;
      
      if (!ownsGym && !isAssignedGym) {
        return { success: false, error: 'Unauthorized' };
      }
    }

    if (profile.role !== 'gym_owner' && profile.role !== 'gym_admin' && profile.role !== 'receptionist' && profile.role !== 'superadmin') {
      return { success: false, error: 'Unauthorized' };
    }

    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available. Check server environment variables.', data: null };
    }
    const { data, error } = await (supabaseAdmin.rpc('find_redemption_by_code', {
      p_code: code,
    } as any) as any);

    if (error) throw error;

    const rpcData = data as any;
    if (!rpcData || !Array.isArray(rpcData) || rpcData.length === 0) {
      return { success: false, error: 'Redemption not found' };
    }

    const redemption = data[0] as { redemption_id: string; gym_id: string; [key: string]: any };

    // Verify it belongs to this gym
    if (redemption.gym_id !== gymId) {
      return { success: false, error: 'Redemption belongs to a different gym' };
    }

    // Fetch full redemption details
    const { data: fullRedemption, error: fetchError } = await supabaseAdmin
      .from('redemptions')
      .select(`
        *,
        profiles:user_id (id, username, email),
        rewards:reward_id (id, name, reward_type, price_drops, image_url)
      `)
      .eq('id', redemption.redemption_id)
      .single();

    if (fetchError) throw fetchError;

    return { success: true, redemption: fullRedemption };
  } catch (error: any) {
    // Error validating redemption code
    return { success: false, error: error.message };
  }
}
