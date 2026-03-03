'use server';

import { getAdminClient } from '@/lib/utils/supabase-admin';
import { getCurrentProfile } from '../auth';

interface LeaderboardSnapshot {
  id: string;
  gym_id: string;
  period: 'weekly' | 'monthly';
  period_start: string;
  period_end: string;
  rankings: Array<{
    rank: number;
    user_id: string;
    username: string;
    drops: number;
  }>;
  prizes_distributed: boolean;
  created_at: string;
}

export async function getLeaderboardSnapshots(
  gymId: string,
  period?: 'weekly' | 'monthly',
  page: number = 1,
  perPage: number = 20
): Promise<{ success: boolean; data?: LeaderboardSnapshot[]; total?: number; error?: string }> {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return { success: false, error: 'Not authenticated' };
    }

    // Authorization
    if (!['superadmin', 'gym_owner', 'gym_admin'].includes(profile.role)) {
      return { success: false, error: 'Unauthorized' };
    }

    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available.' };
    }

    // Verify gym access for non-superadmin
    if (profile.role !== 'superadmin') {
      const { data: gym } = await supabaseAdmin
        .from('gyms')
        .select('owner_id')
        .eq('id', gymId)
        .single();

      if (!gym) return { success: false, error: 'Gym not found' };
      const gymData = gym as { owner_id: string | null };
      const ownsGym = gymData.owner_id === profile.id;
      const isAssigned = profile.assigned_gym_id === gymId;
      if (!ownsGym && !isAssigned) {
        return { success: false, error: 'Unauthorized for this gym' };
      }
    }

    const from = (page - 1) * perPage;
    const to = from + perPage - 1;

    let query = supabaseAdmin
      .from('leaderboard_snapshots')
      .select('*', { count: 'exact' })
      .eq('gym_id', gymId)
      .order('period_end', { ascending: false })
      .range(from, to);

    if (period) {
      query = query.eq('period', period);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    return {
      success: true,
      data: (data as unknown as LeaderboardSnapshot[]) || [],
      total: count ?? 0,
    };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Failed to fetch leaderboard snapshots';
    return { success: false, error: errMsg };
  }
}

export async function getCurrentLeaderboard(
  gymId: string,
  period: 'weekly' | 'monthly' = 'weekly',
  limit: number = 10
): Promise<{
  success: boolean;
  data?: Array<{
    rank: number;
    user_id: string;
    username: string;
    avatar_url: string | null;
    score: number;
    score_label: string;
    is_newcomer: boolean;
    streak_days: number;
  }>;
  error?: string;
}> {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return { success: false, error: 'Not authenticated' };
    }

    if (!['superadmin', 'gym_owner', 'gym_admin'].includes(profile.role)) {
      return { success: false, error: 'Unauthorized' };
    }

    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available.' };
    }

    const { data, error } = await (supabaseAdmin.rpc('get_leaderboard', {
      p_type: 'gym',
      p_scope_id: gymId,
      p_period: period,
      p_limit: limit,
      p_newcomer_only: false,
    }) as ReturnType<typeof supabaseAdmin.rpc>);

    if (error) throw error;

    return {
      success: true,
      data: (data as Array<{
        rank: number;
        user_id: string;
        username: string;
        avatar_url: string | null;
        score: number;
        score_label: string;
        is_newcomer: boolean;
        streak_days: number;
      }>) || [],
    };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Failed to fetch leaderboard';
    return { success: false, error: errMsg };
  }
}

export async function updateLeaderboardRewards(input: {
  gymId: string;
  rank1: string;
  rank2: string;
  rank3: string;
  period?: 'weekly' | 'monthly';
}): Promise<{ success: boolean; error?: string }> {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return { success: false, error: 'Not authenticated' };
    }

    if (!['superadmin', 'gym_owner', 'gym_admin'].includes(profile.role)) {
      return { success: false, error: 'Unauthorized' };
    }

    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available.' };
    }

    const period = input.period || 'monthly';

    // Upsert rewards for ranks 1, 2, 3
    const rewards = [
      { rank_position: 1, reward_name: input.rank1 },
      { rank_position: 2, reward_name: input.rank2 },
      { rank_position: 3, reward_name: input.rank3 },
    ];

    for (const reward of rewards) {
      const { error } = await supabaseAdmin
        .from('leaderboard_rewards')
        .upsert(
          {
            gym_id: input.gymId,
            rank_position: reward.rank_position,
            reward_name: reward.reward_name,
            reward_type: 'custom',
            period,
            is_active: true,
          },
          {
            onConflict: 'gym_id,rank_position,period',
          }
        );

      if (error) throw error;
    }

    return { success: true };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Failed to update leaderboard rewards';
    return { success: false, error: errMsg };
  }
}
