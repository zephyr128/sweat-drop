import { useState, useEffect, useCallback } from 'react';
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

      // ── 1. Today's drops (earned only — excludes refunds) ──
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const { data: todayTx } = await supabase
        .from('drops_transactions')
        .select('amount, transaction_type')
        .eq('user_id', userId)
        .gte('created_at', todayStart.toISOString())
        .gt('amount', 0)
        .in('transaction_type', ['session', 'checkin', 'challenge', 'bonus', 'arena', 'referral_reward']);

      const CAPPED_TYPES = new Set(['session', 'checkin']);
      let todayCappedDrops = 0;
      let todayBonusDrops = 0;
      for (const tx of todayTx ?? []) {
        const a = tx.amount ?? 0;
        if (CAPPED_TYPES.has(tx.transaction_type)) {
          todayCappedDrops += a;
        } else {
          todayBonusDrops += a;
        }
      }
      const todayDrops = todayCappedDrops + todayBonusDrops;

      // ── 2. Last workout ───────────────────────────
      const { data: lastSession } = await supabase
        .from('sessions')
        .select('duration_seconds, drops_earned, ended_at')
        .eq('user_id', userId)
        .eq('is_active', false)
        .order('ended_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const lastWorkout: HomeStats['lastWorkout'] = lastSession
        ? {
            durationSeconds: lastSession.duration_seconds || 0,
            dropsEarned: lastSession.drops_earned || 0,
            endedAt: lastSession.ended_at,
          }
        : null;

      // ── 3. Streak — use server-computed value (profiles.streak_days) ─
      // The backend (award_drops + perform_checkin) maintains streak_days
      // using Belgrade timezone and only counts sessions with drops_earned > 0.
      // Client-side recomputation was buggy (counted 0-drop sessions).
      const { data: profileRow } = await supabase
        .from('profiles')
        .select('streak_days')
        .eq('id', userId)
        .single();

      const streak = profileRow?.streak_days ?? 0;

      // ── 4. Closest reward (excluding already-claimed) ──
      let closestReward: HomeStats['closestReward'] = null;
      if (gymId) {
        const [{ data: rewards }, { data: redemptions }, { data: membership }] = await Promise.all([
          supabase
            .from('rewards')
            .select('id, name, price_drops, image_url, reward_type, redemption_limit, stock')
            .eq('gym_id', gymId)
            .eq('is_active', true)
            .order('price_drops', { ascending: true })
            .limit(20),
          supabase
            .from('redemptions')
            .select('reward_id, created_at, status')
            .eq('user_id', userId)
            .eq('gym_id', gymId)
            .in('status', ['pending', 'confirmed']),
          supabase
            .from('gym_memberships')
            .select('local_drops_balance')
            .eq('user_id', userId)
            .eq('gym_id', gymId)
            .maybeSingle(),
        ]);

        const freshDrops = membership?.local_drops_balance ?? 0;

        if (rewards && rewards.length > 0) {
          const redeemed = redemptions || [];

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

      // ── 5. Weekly activity (all drop sources, Mon–Sun) ──────────
      const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ...
      // Calculate Monday of this week
      const monday = new Date(now);
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      monday.setDate(now.getDate() + diffToMonday);
      monday.setHours(0, 0, 0, 0);

      const { data: weekTx } = await supabase
        .from('drops_transactions')
        .select('created_at, amount')
        .eq('user_id', userId)
        .gt('amount', 0)
        .gte('created_at', monday.toISOString())
        .in('transaction_type', ['session', 'checkin', 'challenge', 'bonus', 'arena', 'referral_reward']);

      // Group by day index (0=Mon, 6=Sun)
      const dailyDrops: number[] = [0, 0, 0, 0, 0, 0, 0];
      if (weekTx) {
        for (const tx of weekTx) {
          if (tx.created_at) {
            const d = new Date(tx.created_at);
            let idx = d.getDay() - 1; // Mon=0 .. Sat=5
            if (idx < 0) idx = 6; // Sun=6
            dailyDrops[idx] += tx.amount || 0;
          }
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

  return { stats, loading, refresh };
}
