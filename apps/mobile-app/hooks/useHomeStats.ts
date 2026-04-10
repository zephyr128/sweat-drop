import { useState, useEffect, useCallback, useMemo } from 'react';
import { log } from '@/lib/logger';
import { supabase } from '@/lib/supabase';
import { useSession } from './useSession';

/* ── Types ────────────────────────────────────────── */
export interface HomeStats {
  /** Consecutive days with at least one completed session */
  streak: number;
  /** Total drops earned today (all sources) */
  todayDrops: number;
  /** Drops earned today from capped sources only (session + checkin) */
  todayCappedDrops: number;
  /** Bonus drops today that bypass the daily cap (challenge, referral, arena, bonus) */
  todayBonusDrops: number;
  /** Info about the most recent completed session */
  lastWorkout: {
    durationSeconds: number;
    dropsEarned: number;
    endedAt: string; // ISO date string
  } | null;
  /** The cheapest reward the user cannot yet afford, or the cheapest they CAN afford */
  closestReward: {
    id: string;
    name: string;
    priceDrops: number;
    imageUrl: string | null;
    rewardType: string;
    /** positive = need more drops, 0 or negative = can afford */
    dropsAway: number;
    canAfford: boolean;
  } | null;
  /** Drops earned per day for the last 7 days (Mon→Sun aligned) */
  weeklyActivity: { day: string; drops: number; isToday: boolean }[];
  /** Number of days active this week */
  activeDaysThisWeek: number;
}

const EMPTY_STATS: HomeStats = {
  streak: 0,
  todayDrops: 0,
  todayCappedDrops: 0,
  todayBonusDrops: 0,
  lastWorkout: null,
  closestReward: null,
  weeklyActivity: [],
  activeDaysThisWeek: 0,
};

function getPeriodStart(limit: string, now: Date): Date {
  if (limit === 'once') return new Date(0);
  if (limit === 'once_per_day') {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (limit === 'once_per_week') {
    const d = new Date(now);
    const day = d.getDay();
    const diff = day === 0 ? 6 : day - 1;
    d.setDate(d.getDate() - diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (limit === 'once_per_month') {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
  return new Date(0);
}

/* ── Hook ────────────────────────────────────────── */
export function useHomeStats(gymId: string | null) {
  const { session } = useSession();
  const [stats, setStats] = useState<HomeStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!session?.user) return;
    const userId = session.user.id;

    try {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const EARNED_TYPES = ['session', 'checkin', 'challenge', 'bonus', 'arena', 'referral_reward'];
      const dayOfWeek = now.getDay();
      const monday = new Date(now);
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      monday.setDate(now.getDate() + diffToMonday);
      monday.setHours(0, 0, 0, 0);

      // Fire ALL queries in parallel — no waterfalls
      // Merged today + week drops into one RPC (week ⊇ today)
      const [weekDropsRes, lastSessionRes, profileRes, rewardsRes, redemptionsRes, membershipRes] = await Promise.all([
        // 1+4. Week drops (superset of today's) — single RPC replaces two .from() calls
        supabase.rpc('get_my_drops', {
          p_gym_id: null,
          p_types: EARNED_TYPES,
          p_since: monday.toISOString(),
          p_limit: 5000,
        }),
        // 2. Last workout
        supabase.rpc('get_my_sessions', {
          p_gym_id: null,
          p_active_only: false,
          p_since: null,
          p_limit: 5,
        }),
        // 3. Streak from profile
        supabase
          .from('profiles')
          .select('streak_days, last_visit_date')
          .eq('id', userId)
          .single(),
        // 5. Rewards (gym-dependent, skipped if no gymId)
        gymId
          ? supabase
              .from('rewards')
              .select('id, name, price_drops, image_url, reward_type, redemption_limit, stock')
              .eq('gym_id', gymId)
              .eq('is_active', true)
              .order('price_drops', { ascending: true })
              .limit(20)
          : Promise.resolve({ data: null }),
        // 6. Redemptions via RPC
        gymId
          ? supabase.rpc('get_my_redemptions', {
              p_gym_id: gymId,
              p_statuses: ['pending', 'confirmed'],
              p_limit: null,
            })
          : Promise.resolve({ data: null }),
        gymId
          ? supabase
              .from('gym_memberships')
              .select('local_drops_balance')
              .eq('user_id', userId)
              .eq('gym_id', gymId)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      // Process today's + weekly drops from the combined week RPC result
      const allWeekDrops = (weekDropsRes.data ?? []).filter((d: any) => (d.amount ?? 0) > 0);
      const todayTx = allWeekDrops.filter((d: any) => new Date(d.created_at) >= todayStart);
      const CAPPED_TYPES = new Set(['session', 'checkin']);
      let todayCappedDrops = 0;
      let todayBonusDrops = 0;
      for (const tx of todayTx) {
        const a = tx.amount ?? 0;
        if (CAPPED_TYPES.has(tx.transaction_type)) {
          todayCappedDrops += a;
        } else {
          todayBonusDrops += a;
        }
      }
      const todayDrops = todayCappedDrops + todayBonusDrops;

      // Process last workout (RPC returns array; pick latest completed)
      const allRecentSessions = lastSessionRes.data ?? [];
      const latestCompleted = allRecentSessions
        .filter((s: any) => !s.is_active)
        .sort((a: any, b: any) => new Date(b.ended_at).getTime() - new Date(a.ended_at).getTime())[0] ?? null;
      const lastWorkout: HomeStats['lastWorkout'] = latestCompleted
        ? {
            durationSeconds: latestCompleted.duration_seconds || 0,
            dropsEarned: latestCompleted.drops_earned || 0,
            endedAt: latestCompleted.ended_at,
          }
        : null;

      // Process streak — validate against last_visit_date to avoid stale values
      // when the user hasn't worked out for >1 day (backend only updates on workout)
      const rawStreak = profileRes.data?.streak_days ?? 0;
      const lastVisitStr = profileRes.data?.last_visit_date;
      let streak = rawStreak;
      if (lastVisitStr && rawStreak > 0) {
        // Use Belgrade timezone to match backend logic (UTC+1/UTC+2)
        const belgradeTodayStr = new Date().toLocaleDateString('sv-SE', {
          timeZone: 'Europe/Belgrade',
        });
        const belgradeTodayMs = new Date(belgradeTodayStr + 'T00:00:00').getTime();
        const lastVisitMs = new Date(lastVisitStr + 'T00:00:00').getTime();
        const diffDays = Math.floor((belgradeTodayMs - lastVisitMs) / (1000 * 60 * 60 * 24));
        if (diffDays > 1) {
          streak = 0;
        }
      }

      // Process closest reward
      let closestReward: HomeStats['closestReward'] = null;
      if (gymId) {
        const rewards = rewardsRes.data;
        const redemptions = redemptionsRes.data;
        const freshDrops = (membershipRes.data as any)?.local_drops_balance ?? 0;

        if (rewards && rewards.length > 0) {
          const redeemed = redemptions || [];
          const available = rewards.filter((r) => {
            if (r.stock !== null && r.stock <= 0) return false;
            const limit: string = r.redemption_limit || 'unlimited';
            if (limit === 'unlimited') return true;
            const matching = redeemed.filter((rd: any) => rd.reward_id === r.id);
            if (matching.length === 0) return true;
            if (limit === 'once') return false;
            const periodStart = getPeriodStart(limit, now);
            return !matching.some((rd: any) => new Date(rd.created_at) >= periodStart);
          });

          if (available.length > 0) {
            const cantAfford = available.find((r) => r.price_drops > freshDrops);
            const canAffordItem = available.find((r) => r.price_drops <= freshDrops);
            const target = cantAfford || canAffordItem;
            if (target) {
              closestReward = {
                id: target.id,
                name: target.name,
                priceDrops: target.price_drops,
                imageUrl: target.image_url,
                rewardType: target.reward_type,
                dropsAway: target.price_drops - freshDrops,
                canAfford: target.price_drops <= freshDrops,
              };
            }
          }
        }
      }

      // Process weekly activity (reuses allWeekDrops from combined RPC)
      const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const dailyDrops: number[] = [0, 0, 0, 0, 0, 0, 0];
      for (const tx of allWeekDrops) {
        if (tx.created_at) {
          const d = new Date(tx.created_at);
          let idx = d.getDay() - 1;
          if (idx < 0) idx = 6;
          dailyDrops[idx] += tx.amount || 0;
        }
      }

      const todayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const weeklyActivity = DAYS.map((day, i) => ({
        day,
        drops: dailyDrops[i],
        isToday: i === todayIndex,
      }));

      const activeDaysThisWeek = dailyDrops.filter((d) => d > 0).length;

      setStats({
        streak,
        todayDrops,
        todayCappedDrops,
        todayBonusDrops,
        lastWorkout,
        closestReward,
        weeklyActivity,
        activeDaysThisWeek,
      });
    } catch (error) {
      log.error('[useHomeStats] Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id, gymId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return useMemo(() => ({ stats, loading, refresh }), [stats, loading, refresh]);
}
