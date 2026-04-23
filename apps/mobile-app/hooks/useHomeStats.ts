/**
 * useHomeStats — home-screen dashboard data layer.
 *
 * AGENT NOTE: [2026-04-23] - mobile-coder
 *
 * Previously fired 6 concurrent queries (get_my_drops + get_my_sessions +
 * profiles select + rewards select + get_my_redemptions + gym_memberships
 * select). Now calls a single RPC `get_home_dashboard(p_gym_id)` which
 * returns the combined payload as JSON. See migration
 * 20260423220000_get_home_dashboard_rpc.sql.
 *
 * The hook also exposes checkin_status so home.tsx no longer needs its own
 * rpc('get_checkin_status') call.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { log } from '@/lib/logger';
import { supabase } from '@/lib/supabase';
import { useSession } from './useSession';

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
    endedAt: string;
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

export interface CheckinStatus {
  already_checked_in: boolean;
  checkin_drops: number;
  gym_name: string;
  total_checkins: number;
}

interface DashboardPayload {
  profile: { streak_days: number | null; last_visit_date: string | null } | null;
  week_drops: { amount: number; transaction_type: string; created_at: string }[];
  last_session: { ended_at: string; duration_seconds: number | null; drops_earned: number | null } | null;
  local_drops_balance: number | null;
  rewards: {
    id: string;
    name: string;
    price_drops: number;
    image_url: string | null;
    reward_type: string;
    redemption_limit: string | null;
    stock: number | null;
  }[];
  active_redemptions: { reward_id: string; created_at: string }[];
  checkin_status: CheckinStatus | null;
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

export function useHomeStats(gymId: string | null) {
  const { session } = useSession();
  const [stats, setStats] = useState<HomeStats>(EMPTY_STATS);
  const [checkinStatus, setCheckinStatus] = useState<CheckinStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!session?.user) return;

    try {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const dayOfWeek = now.getDay();

      const { data, error } = await supabase.rpc('get_home_dashboard', {
        p_gym_id: gymId ?? null,
      });

      if (error) {
        log.error('[useHomeStats] get_home_dashboard error:', error);
        return;
      }

      const payload = (data ?? {}) as DashboardPayload;

      // ── today's drops (capped + bonus split) ──
      const allWeekDrops = payload.week_drops ?? [];
      const todayTx = allWeekDrops.filter((d) => new Date(d.created_at) >= todayStart);
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

      // ── last workout ──
      const ls = payload.last_session;
      const lastWorkout: HomeStats['lastWorkout'] = ls
        ? {
            durationSeconds: ls.duration_seconds || 0,
            dropsEarned: ls.drops_earned || 0,
            endedAt: ls.ended_at,
          }
        : null;

      // ── streak (validated against last_visit_date) ──
      const rawStreak = payload.profile?.streak_days ?? 0;
      const lastVisitStr = payload.profile?.last_visit_date;
      let streak = rawStreak;
      if (lastVisitStr && rawStreak > 0) {
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

      // ── closest reward ──
      const freshDrops = payload.local_drops_balance ?? 0;
      let closestReward: HomeStats['closestReward'] = null;
      if (gymId) {
        const rewards = payload.rewards ?? [];
        const redeemed = payload.active_redemptions ?? [];
        if (rewards.length > 0) {
          const available = rewards.filter((r) => {
            if (r.stock !== null && r.stock <= 0) return false;
            const limit: string = r.redemption_limit || 'unlimited';
            if (limit === 'unlimited') return true;
            const matching = redeemed.filter((rd) => rd.reward_id === r.id);
            if (matching.length === 0) return true;
            if (limit === 'once') return false;
            const periodStart = getPeriodStart(limit, now);
            return !matching.some((rd) => new Date(rd.created_at) >= periodStart);
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

      // ── weekly activity (Mon→Sun) ──
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
      setCheckinStatus(payload.checkin_status ?? null);
    } catch (error) {
      log.error('[useHomeStats] Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id, gymId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return useMemo(
    () => ({ stats, checkinStatus, loading, refresh }),
    [stats, checkinStatus, loading, refresh],
  );
}
