import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { log } from '@/lib/logger';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';

export type RewardedSessionsCapMode = 'off' | 'soft' | 'hard';

export interface DropLimitStatus {
  rewardedSessionsToday: number;
  maxRewardedSessionsPerDay: number;
  maxDropsPerSession: number;
  /** Capped drops minted today (session + checkin only) — used for limit checks */
  mintedToday: number;
  /** All drops minted today (including bonus) — for display purposes */
  mintedTodayAll: number;
  maxDropsPerDay: number;
  mintedWeek: number;
  maxDropsPerWeek: number;
  rewardedSessionsCapMode: RewardedSessionsCapMode;
  sessionRestartGraceSec: number;
  /** true when a HARD cap prevents earning drops in the next session */
  limitReached: boolean;
  /** true when user is on their last rewarded session today (only meaningful in hard mode) */
  nearLimit: boolean;
  sessionsRemaining: number;
  /** true when sessions-per-day cap exceeded but mode is soft (informational, non-blocking) */
  softSessionWarning: boolean;
  /** Remaining daily drop budget */
  dailyRemaining: number;
  /** Remaining weekly drop budget */
  weeklyRemaining: number;
  loading: boolean;
}

const DEFAULTS: DropLimitStatus = {
  rewardedSessionsToday: 0,
  maxRewardedSessionsPerDay: 4,
  maxDropsPerSession: 120,
  mintedToday: 0,
  mintedTodayAll: 0,
  maxDropsPerDay: 300,
  mintedWeek: 0,
  maxDropsPerWeek: 1500,
  rewardedSessionsCapMode: 'soft',
  sessionRestartGraceSec: 300,
  limitReached: false,
  nearLimit: false,
  sessionsRemaining: 4,
  softSessionWarning: false,
  dailyRemaining: 300,
  weeklyRemaining: 1500,
  loading: true,
};

function getBelgradeDateString(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Belgrade' });
}

export function useDropLimitStatus(gymId: string | null | undefined): DropLimitStatus & { refresh: () => void } {
  const { session: authSession } = useSession();
  const [status, setStatus] = useState<DropLimitStatus>(DEFAULTS);

  // Sentinel for the most recently requested gymId. Lets us discard stale
  // RPC responses when the user switches gyms mid-flight, and immediately
  // reset the gauge to 0 / defaults the moment gymId changes (so the user
  // never sees the previous gym's "minted today / week" values bleed into
  // the new gym's view).
  const activeGymRef = useRef<string | null>(gymId ?? null);

  const load = useCallback(async () => {
    if (!authSession?.user || !gymId) return;

    const requestedGymId = gymId;

    try {
      const todayStr = getBelgradeDateString(new Date());
      const weekStart = new Date();
      const dayOfWeek = weekStart.getDay();
      const weekOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      weekStart.setDate(weekStart.getDate() - weekOffset);
      weekStart.setHours(0, 0, 0, 0);

      const EARNED_TYPES = ['session', 'checkin', 'challenge', 'bonus', 'arena', 'referral_reward'];
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      // Fire all 3 queries in parallel
      const [limitsRes, sessionRes, txRes] = await Promise.all([
        supabase.rpc('get_user_drop_limits', { p_gym_id: requestedGymId }),
        supabase.rpc('get_my_sessions', {
          p_gym_id: requestedGymId,
          p_active_only: false,
          p_since: weekStart.toISOString(),
          p_limit: 50,
        }),
        supabase.rpc('get_my_drops', {
          p_gym_id: requestedGymId,
          p_types: EARNED_TYPES,
          p_since: weekStart.toISOString(),
          p_limit: 5000,
        }),
      ]);

      if (activeGymRef.current !== requestedGymId) {
        return;
      }

      let maxSessionDrops = 120;
      let maxSession = 4;
      let maxDay = 300;
      let maxWeek = 1500;
      let capMode: RewardedSessionsCapMode = 'soft';
      let graceSec = 300;

      // get_user_drop_limits failures previously fell through silently and
      // pinned the UI to the hardcoded defaults above (300 / 1500), making
      // every gym look identical regardless of its tokenomics_config row.
      // Surface them now so we never lose visibility on a misconfigured RPC
      // again.
      if (limitsRes.error) {
        log.warn('[useDropLimitStatus] get_user_drop_limits failed', {
          gymId,
          error: limitsRes.error,
        });
      }

      const rpcRow = Array.isArray(limitsRes.data) ? limitsRes.data[0] : limitsRes.data;
      if (rpcRow) {
        maxSessionDrops = Math.max(1, Number(rpcRow.max_drops_per_session ?? 120));
        maxSession = Number(rpcRow.max_rewarded_sessions_per_day ?? 4);
        maxDay = Number(rpcRow.max_drops_per_day ?? 300);
        maxWeek = Number(rpcRow.max_drops_per_week ?? 1500);
        if (rpcRow.rewarded_sessions_cap_mode) {
          const mode = String(rpcRow.rewarded_sessions_cap_mode);
          if (mode === 'off' || mode === 'soft' || mode === 'hard') {
            capMode = mode;
          }
        }
        if (rpcRow.session_restart_grace_sec != null) {
          graceSec = Math.max(0, Number(rpcRow.session_restart_grace_sec));
        }
      } else if (!limitsRes.error) {
        log.warn('[useDropLimitStatus] get_user_drop_limits returned no row', { gymId });
      }

      let rewardedToday = 0;
      const completedSessions = (sessionRes.data ?? []).filter((s: any) => !s.is_active && (s.drops_earned ?? 0) > 0);
      for (const row of completedSessions) {
        const dateStr = getBelgradeDateString(new Date(row.started_at));
        if (dateStr === todayStr) rewardedToday += 1;
      }

      const txRows = (txRes.data ?? []).filter((d: any) => (d.amount ?? 0) > 0);

      const CAPPED_TYPES = new Set(['session', 'checkin']);
      let cappedDropsToday = 0;
      let cappedDropsWeek = 0;
      let allDropsToday = 0;
      for (const row of txRows ?? []) {
        const a = row.amount ?? 0;
        const isToday = new Date(row.created_at) >= todayStart;
        if (CAPPED_TYPES.has(row.transaction_type)) {
          cappedDropsWeek += a;
          if (isToday) cappedDropsToday += a;
        }
        if (isToday) allDropsToday += a;
      }

      const sessionsRemaining = Math.max(0, maxSession - rewardedToday);
      const dayRemaining = Math.max(0, maxDay - cappedDropsToday);
      const weekRemaining = Math.max(0, maxWeek - cappedDropsWeek);

      // Session cap blocks ONLY in hard mode
      const sessionCapBlocks = capMode === 'hard' && sessionsRemaining <= 0;
      const dayCapped = dayRemaining <= 0;
      const weekCapped = weekRemaining <= 0;

      const limitReached = sessionCapBlocks || dayCapped || weekCapped;
      const nearLimit = !limitReached && capMode === 'hard' && sessionsRemaining === 1;
      const softSessionWarning = capMode === 'soft' && sessionsRemaining <= 0 && !dayCapped && !weekCapped;

      if (activeGymRef.current !== requestedGymId) {
        return;
      }

      setStatus({
        rewardedSessionsToday: rewardedToday,
        maxRewardedSessionsPerDay: maxSession,
        maxDropsPerSession: maxSessionDrops,
        mintedToday: cappedDropsToday,
        mintedTodayAll: allDropsToday,
        maxDropsPerDay: maxDay,
        mintedWeek: cappedDropsWeek,
        maxDropsPerWeek: maxWeek,
        rewardedSessionsCapMode: capMode,
        sessionRestartGraceSec: graceSec,
        limitReached,
        nearLimit,
        sessionsRemaining,
        softSessionWarning,
        dailyRemaining: dayRemaining,
        weeklyRemaining: weekRemaining,
        loading: false,
      });
    } catch (err) {
      log.warn('[useDropLimitStatus] Failed to load:', err);
      setStatus((prev) => ({ ...prev, loading: false }));
    }
  }, [authSession?.user, gymId]);

  useEffect(() => {
    // Reset to DEFAULTS the instant gymId changes so the gauge / "+ bonus"
    // pill immediately stops showing the previous gym's totals while the
    // RPC for the new gym is in flight.
    activeGymRef.current = gymId ?? null;
    setStatus({ ...DEFAULTS, loading: true });
    void load();
  }, [load, gymId]);

  return useMemo(() => ({ ...status, refresh: load }), [status, load]);
}
