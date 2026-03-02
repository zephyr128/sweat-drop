import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useSession } from './useSession';

/* ── Types ────────────────────────────────────────── */
export interface HomeStats {
  /** Consecutive days with at least one completed session */
  streak: number;
  /** Drops earned today (positive transactions) */
  todayDrops: number;
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
  lastWorkout: null,
  closestReward: null,
  weeklyActivity: [],
  activeDaysThisWeek: 0,
};

/* ── Hook ────────────────────────────────────────── */
export function useHomeStats(gymId: string | null, localDrops: number) {
  const { session } = useSession();
  const [stats, setStats] = useState<HomeStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!session?.user) return;
    const userId = session.user.id;

    try {
      const now = new Date();

      // ── 1. Today's drops ──────────────────────────
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const { data: todayTx } = await supabase
        .from('drops_transactions')
        .select('amount')
        .eq('user_id', userId)
        .gte('created_at', todayStart.toISOString())
        .gt('amount', 0);

      const todayDrops = todayTx?.reduce((s, t) => s + (t.amount || 0), 0) || 0;

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

      // ── 3. Streak (consecutive days with a session) ─
      // Fetch distinct session dates for the last 60 days
      const sixtyDaysAgo = new Date(now);
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

      const { data: sessionDates } = await supabase
        .from('sessions')
        .select('started_at')
        .eq('user_id', userId)
        .eq('is_active', false)
        .gte('started_at', sixtyDaysAgo.toISOString())
        .order('started_at', { ascending: false });

      let streak = 0;
      if (sessionDates && sessionDates.length > 0) {
        // Build a set of unique dates (YYYY-MM-DD)
        const uniqueDates = new Set<string>();
        for (const s of sessionDates) {
          if (s.started_at) {
            uniqueDates.add(new Date(s.started_at).toISOString().split('T')[0]);
          }
        }

        // Walk backwards from today (or yesterday if no session today)
        const todayStr = todayStart.toISOString().split('T')[0];
        let checkDate = new Date(todayStart);

        // If today doesn't have a session, start from yesterday
        if (!uniqueDates.has(todayStr)) {
          checkDate.setDate(checkDate.getDate() - 1);
        }

        while (true) {
          const dateStr = checkDate.toISOString().split('T')[0];
          if (uniqueDates.has(dateStr)) {
            streak++;
            checkDate.setDate(checkDate.getDate() - 1);
          } else {
            break;
          }
        }
      }

      // ── 4. Closest reward ─────────────────────────
      let closestReward: HomeStats['closestReward'] = null;
      if (gymId) {
        const { data: rewards } = await supabase
          .from('rewards')
          .select('id, name, price_drops, image_url, reward_type')
          .eq('gym_id', gymId)
          .eq('is_active', true)
          .order('price_drops', { ascending: true })
          .limit(10);

        if (rewards && rewards.length > 0) {
          // Find the cheapest reward user can't yet afford
          const cantAfford = rewards.find((r) => r.price_drops > localDrops);
          // Or the cheapest they CAN afford (so we can prompt redemption)
          const canAfford = rewards.find((r) => r.price_drops <= localDrops);

          const target = cantAfford || canAfford;
          if (target) {
            closestReward = {
              id: target.id,
              name: target.name,
              priceDrops: target.price_drops,
              imageUrl: target.image_url,
              rewardType: target.reward_type,
              dropsAway: target.price_drops - localDrops,
              canAfford: target.price_drops <= localDrops,
            };
          }
        }
      }

      // ── 5. Weekly activity (last 7 days) ──────────
      const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ...
      // Calculate Monday of this week
      const monday = new Date(now);
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      monday.setDate(now.getDate() + diffToMonday);
      monday.setHours(0, 0, 0, 0);

      const { data: weekSessions } = await supabase
        .from('sessions')
        .select('started_at, drops_earned')
        .eq('user_id', userId)
        .eq('is_active', false)
        .gte('started_at', monday.toISOString())
        .order('started_at', { ascending: true });

      // Group by day index (0=Mon, 6=Sun)
      const dailyDrops: number[] = [0, 0, 0, 0, 0, 0, 0];
      if (weekSessions) {
        for (const s of weekSessions) {
          if (s.started_at) {
            const d = new Date(s.started_at);
            let idx = d.getDay() - 1; // Mon=0 .. Sat=5
            if (idx < 0) idx = 6; // Sun=6
            dailyDrops[idx] += s.drops_earned || 0;
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
        lastWorkout,
        closestReward,
        weeklyActivity,
        activeDaysThisWeek,
      });
    } catch (error) {
      console.error('[useHomeStats] Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id, gymId, localDrops]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { stats, loading, refresh };
}
