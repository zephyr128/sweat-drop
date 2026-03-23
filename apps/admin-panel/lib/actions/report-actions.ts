'use server';

import { getAdminClient } from '@/lib/utils/supabase-admin';
import { getCurrentProfile } from '../auth';

async function verifyGymAccess(gymId: string) {
  const profile = await getCurrentProfile();
  if (!profile) return { authorized: false, error: 'Not authenticated' } as const;

  if (profile.role === 'superadmin') return { authorized: true, profile } as const;

  if (profile.role !== 'gym_owner' && profile.role !== 'gym_admin') {
    return { authorized: false, error: 'Unauthorized role' } as const;
  }

  const supabase = getAdminClient();
  if (!supabase) return { authorized: false, error: 'Admin client not available' } as const;

  const { data: gym } = await supabase
    .from('gyms').select('owner_id').eq('id', gymId).single();

  if (!gym) return { authorized: false, error: 'Gym not found' } as const;

  const ownsGym = (gym as any).owner_id === profile.id;
  const isAssignedGym = profile.assigned_gym_id === gymId;

  if (!ownsGym && !isAssignedGym) {
    return { authorized: false, error: 'Unauthorized' } as const;
  }

  return { authorized: true, profile } as const;
}

export async function getGymEngagementReport(gymId: string, startDate: string, endDate: string) {
  const auth = await verifyGymAccess(gymId);
  if (!auth.authorized) return { success: false, error: auth.error };

  const supabase = getAdminClient();
  if (!supabase) return { success: false, error: 'Admin client not available' };

  const { data, error } = await (supabase.rpc as any)('get_gym_engagement_report', {
    p_gym_id: gymId, p_start_date: startDate, p_end_date: endDate,
  });

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function getGymStoreReport(gymId: string, startDate: string, endDate: string) {
  const auth = await verifyGymAccess(gymId);
  if (!auth.authorized) return { success: false, error: auth.error };

  const supabase = getAdminClient();
  if (!supabase) return { success: false, error: 'Admin client not available' };

  const { data, error } = await (supabase.rpc as any)('get_gym_store_report', {
    p_gym_id: gymId, p_start_date: startDate, p_end_date: endDate,
  });

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function getGymArenaReport(gymId: string, startDate: string, endDate: string) {
  const auth = await verifyGymAccess(gymId);
  if (!auth.authorized) return { success: false, error: auth.error };

  const supabase = getAdminClient();
  if (!supabase) return { success: false, error: 'Admin client not available' };

  const { data, error } = await (supabase.rpc as any)('get_gym_arena_report', {
    p_gym_id: gymId, p_start_date: startDate, p_end_date: endDate,
  });

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function getGymSessionsTrend(gymId: string, weeks: number = 12) {
  const auth = await verifyGymAccess(gymId);
  if (!auth.authorized) return { success: false, error: auth.error };

  const supabase = getAdminClient();
  if (!supabase) return { success: false, error: 'Admin client not available' };

  const { data, error } = await (supabase.rpc as any)('get_gym_sessions_trend', {
    p_gym_id: gymId, p_weeks: weeks,
  });

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function getGymChallengeReport(gymId: string, startDate: string, endDate: string) {
  const auth = await verifyGymAccess(gymId);
  if (!auth.authorized) return { success: false, error: auth.error };

  const supabase = getAdminClient();
  if (!supabase) return { success: false, error: 'Admin client not available' };

  const { data, error } = await (supabase.rpc as any)('get_gym_challenge_report', {
    p_gym_id: gymId, p_start_date: startDate, p_end_date: endDate,
  });

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function getPlatformReport(startDate: string, endDate: string) {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== 'superadmin') {
    return { success: false, error: 'Superadmin only' };
  }

  const supabase = getAdminClient();
  if (!supabase) return { success: false, error: 'Admin client not available' };

  const { data, error } = await (supabase.rpc as any)('get_platform_report', {
    p_start_date: startDate, p_end_date: endDate,
  });

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}
