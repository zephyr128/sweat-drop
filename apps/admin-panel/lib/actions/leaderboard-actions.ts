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

interface LeaderboardPrizeRedemptionRow {
  id: string;
  user_id: string;
  redemption_code: string | null;
  description: string | null;
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
  period: 'weekly' | 'monthly' | 'all_time' = 'weekly',
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

    const { data, error } = await (supabaseAdmin.rpc as any)('get_leaderboard', {
      p_type: 'gym',
      p_scope_id: gymId,
      p_period: period,
      p_limit: limit,
      p_newcomer_only: false,
    });

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

export async function getLeaderboardRewards(
  gymId: string,
  period: 'weekly' | 'monthly'
): Promise<{
  success: boolean;
  data?: { rank1: string; rank2: string; rank3: string };
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

    const { data, error } = await supabaseAdmin
      .from('leaderboard_rewards')
      .select('rank_position, reward_name')
      .eq('gym_id', gymId)
      .eq('period', period)
      .eq('is_active', true)
      .order('rank_position', { ascending: true });

    if (error) throw error;

    const rewards = { rank1: '', rank2: '', rank3: '' };
    if (data) {
      for (const row of data as { rank_position: number; reward_name: string }[]) {
        if (row.rank_position === 1) rewards.rank1 = row.reward_name;
        if (row.rank_position === 2) rewards.rank2 = row.reward_name;
        if (row.rank_position === 3) rewards.rank3 = row.reward_name;
      }
    }

    return { success: true, data: rewards };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Failed to fetch leaderboard rewards';
    return { success: false, error: errMsg };
  }
}

export async function distributeLeaderboardPrizesNow(
  gymId: string,
  period: 'weekly' | 'monthly' = 'weekly'
): Promise<{ success: boolean; winners?: number; error?: string }> {
  try {
    const profile = await getCurrentProfile();
    if (!profile) return { success: false, error: 'Not authenticated' };

    if (!['superadmin', 'gym_owner', 'gym_admin'].includes(profile.role)) {
      return { success: false, error: 'Unauthorized' };
    }

    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) return { success: false, error: 'Admin client not available.' };

    // Verify gym access for non-superadmin users
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

    // Verify gym has active rewards configured
    const { data: rewards } = await supabaseAdmin
      .from('leaderboard_rewards')
      .select('id')
      .eq('gym_id', gymId)
      .eq('period', period)
      .eq('is_active', true)
      .limit(1);

    if (!rewards || rewards.length === 0) {
      return { success: false, error: `No active ${period} prizes configured. Save prizes first.` };
    }

    // Call distribute_leaderboard_prizes directly (service_role has EXECUTE grant).
    // p_force=true bypasses the "wait for period end" guard so admin can distribute anytime.
    const { data, error } = await (supabaseAdmin.rpc as any)('distribute_leaderboard_prizes', {
      p_gym_id: gymId,
      p_period: period,
      p_force: true,
    });

    if (error) throw error;

    const winners = (data as number) ?? 0;

    // Send push notifications to winners via the send-push edge function.
    // The RPC already created the redemption rows — we just need to look them up
    // and push to each winner individually.
    if (winners > 0) {
      try {
        const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
        const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

        const { data: newRedemptionsRaw } = await supabaseAdmin
          .from('redemptions')
          .select('id, user_id, redemption_code, description')
          .eq('gym_id', gymId)
          .eq('source_type', 'leaderboard_prize')
          .in('status', ['pending', 'claimed'])
          .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
          .order('created_at', { ascending: false });
        const newRedemptions = (newRedemptionsRaw ?? []) as LeaderboardPrizeRedemptionRow[];

        if (supabaseUrl && serviceKey && newRedemptions?.length) {
          const { data: gymRow } = await supabaseAdmin
            .from('gyms')
            .select('name')
            .eq('id', gymId)
            .single();
          const gymName = (gymRow as { name: string } | null)?.name ?? 'your gym';

          for (const redemption of newRedemptions) {
            const { data: profileRow } = await supabaseAdmin
              .from('profiles')
              .select('expo_push_token')
              .eq('id', redemption.user_id)
              .single();

            const token = (profileRow as { expo_push_token: string | null } | null)?.expo_push_token;
            if (!token) continue;

            const hasCode = !!redemption.redemption_code;
            const body = hasCode
              ? `You won a prize at ${gymName}! Show code ${redemption.redemption_code} at the desk to collect it. 🎁`
              : `Congratulations! You won a ${period} leaderboard prize at ${gymName}! 🏆`;

            const pushData: Record<string, string> = {
              type: 'leaderboard_prize',
              gym_id: gymId,
              period,
            };
            if (redemption.id) pushData.redemption_id = redemption.id;
            if (redemption.redemption_code) pushData.redemption_code = redemption.redemption_code;

            await fetch(`${supabaseUrl}/functions/v1/send-push`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${serviceKey}`,
              },
              body: JSON.stringify({
                client_ref: 'leaderboard_prize',
                tokens: [token],
                title: '🏆 You Won a Leaderboard Prize!',
                body,
                data: pushData,
              }),
            });
          }
        }
      } catch {
        // Push notification failure is non-critical; prizes were already created
      }
    }

    return { success: true, winners };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Failed to distribute prizes';
    return { success: false, error: errMsg };
  }
}

export interface DistributionWinner {
  user_id: string;
  username: string;
  rank: number;
  prize_name: string | null;
  redemption_id: string;
  redemption_code: string | null;
  status: string;
  confirmed_at: string | null;
  created_at: string;
  expires_at: string | null;
}

export interface DistributionSnapshot {
  snapshot_id: string;
  period: 'weekly' | 'monthly';
  period_start: string;
  period_end: string;
  distributed_at: string;
  winners: DistributionWinner[];
}

export async function getDistributionHistory(
  gymId: string,
  page: number = 1,
  perPage: number = 10
): Promise<{
  success: boolean;
  data?: DistributionSnapshot[];
  total?: number;
  error?: string;
}> {
  try {
    const profile = await getCurrentProfile();
    if (!profile) return { success: false, error: 'Not authenticated' };

    if (!['superadmin', 'gym_owner', 'gym_admin'].includes(profile.role)) {
      return { success: false, error: 'Unauthorized' };
    }

    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) return { success: false, error: 'Admin client not available.' };

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

    const { data: snapshots, error: snapError, count } = await supabaseAdmin
      .from('leaderboard_snapshots')
      .select('id, period, period_start, period_end, created_at, rankings', { count: 'exact' })
      .eq('gym_id', gymId)
      .eq('prizes_distributed', true)
      .order('period_end', { ascending: false })
      .range(from, to);

    if (snapError) throw snapError;
    if (!snapshots || snapshots.length === 0) {
      return { success: true, data: [], total: 0 };
    }

    type SnapshotRow = {
      id: string;
      period: 'weekly' | 'monthly';
      period_start: string;
      period_end: string;
      created_at: string;
      rankings: Array<{ rank: number; user_id: string; username: string; drops: number }>;
    };

    const typedSnapshots = snapshots as SnapshotRow[];
    const snapshotIds = typedSnapshots.map((s) => s.id);

    // Fetch redemptions for these snapshots via description pattern or by period range + source_type
    // We match on gym_id + source_type='leaderboard_prize' + created_at within the period window
    // Since snapshots store period_end, we use a broad period range query
    const earliestStart = typedSnapshots.reduce(
      (min, s) => (s.period_start < min ? s.period_start : min),
      typedSnapshots[0].period_start
    );
    const latestEnd = typedSnapshots.reduce(
      (max, s) => (s.period_end > max ? s.period_end : max),
      typedSnapshots[0].period_end
    );

    const { data: redemptions, error: redError } = await supabaseAdmin
      .from('redemptions')
      .select('id, user_id, status, redemption_code, confirmed_at, created_at, description, expires_at')
      .eq('gym_id', gymId)
      .eq('source_type', 'leaderboard_prize')
      .gte('created_at', earliestStart)
      .lte('created_at', latestEnd + 'T23:59:59Z')
      .order('created_at', { ascending: false });

    if (redError) throw redError;

    type RedemptionRow = {
      id: string;
      user_id: string;
      status: string;
      redemption_code: string | null;
      confirmed_at: string | null;
      created_at: string;
      description: string | null;
      expires_at: string | null;
    };

    const typedRedemptions = (redemptions || []) as RedemptionRow[];

    // Fetch leaderboard_rewards for prize names (both periods present in snapshots)
    const periods = [...new Set(typedSnapshots.map((s) => s.period))];
    const { data: rewardRows } = await supabaseAdmin
      .from('leaderboard_rewards')
      .select('rank_position, reward_name, period')
      .eq('gym_id', gymId)
      .in('period', periods)
      .eq('is_active', true)
      .order('rank_position', { ascending: true });

    type RewardRow = { rank_position: number; reward_name: string; period: string };
    const rewardsByPeriod: Record<string, Record<number, string>> = {};
    for (const r of (rewardRows || []) as RewardRow[]) {
      if (!rewardsByPeriod[r.period]) rewardsByPeriod[r.period] = {};
      rewardsByPeriod[r.period][r.rank_position] = r.reward_name;
    }

    // Match redemptions to snapshots by user_id + created_at falling within the snapshot's period
    const result: DistributionSnapshot[] = typedSnapshots.map((snapshot) => {
      const periodStart = new Date(snapshot.period_start);
      const periodEnd = new Date(snapshot.period_end + 'T23:59:59Z');

      // top-3 winners from rankings
      const top3 = (snapshot.rankings || []).filter((r) => r.rank <= 3);
      const prizeMap = rewardsByPeriod[snapshot.period] || {};

      const winners: DistributionWinner[] = top3.map((rankEntry) => {
        const redemption = typedRedemptions.find(
          (red) =>
            red.user_id === rankEntry.user_id &&
            new Date(red.created_at) >= periodStart &&
            new Date(red.created_at) <= periodEnd
        );

        return {
          user_id: rankEntry.user_id,
          username: rankEntry.username,
          rank: rankEntry.rank,
          prize_name: prizeMap[rankEntry.rank] ?? null,
          redemption_id: redemption?.id ?? '',
          redemption_code: redemption?.redemption_code ?? null,
          status: redemption?.status ?? 'unknown',
          confirmed_at: redemption?.confirmed_at ?? null,
          created_at: redemption?.created_at ?? snapshot.created_at,
          expires_at: redemption?.expires_at ?? null,
        };
      });

      return {
        snapshot_id: snapshot.id,
        period: snapshot.period,
        period_start: snapshot.period_start,
        period_end: snapshot.period_end,
        distributed_at: snapshot.created_at,
        winners,
      };
    });

    // Suppress unused variable warning — snapshotIds reserved for future snapshot-id-based matching
    void snapshotIds;

    return { success: true, data: result, total: count ?? 0 };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Failed to fetch distribution history';
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
          } as any,
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
