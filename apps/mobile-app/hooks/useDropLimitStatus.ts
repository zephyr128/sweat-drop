import { useCallback, useEffect, useState } from 'react';
import { log } from '@/lib/logger';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';

export type RewardedSessionsCapMode = 'off' | 'soft' | 'hard';

export interface DropLimitStatus {
  rewardedSessionsToday: number;
  maxRewardedSessionsPerDay: number;
  maxDropsPerSession: number;
  mintedToday: number;
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

export function useDropLimitStatus(gymId: string | null | undefined): DropLimitStatus {
  const { session: authSession } = useSession();
  const [status, setStatus] = useState<DropLimitStatus>(DEFAULTS);

  const load = useCallback(async () => {
    if (!authSession?.user || !gymId) return;

    try {
      let maxSessionDrops = 120;
      let maxSession = 4;
      let maxDay = 300;
      let maxWeek = 1500;
      let capMode: RewardedSessionsCapMode = 'soft';
      let graceSec = 300;

      const { data: rpcLimits } = await supabase.rpc('get_user_drop_limits', {
        p_gym_id: gymId,
      });
      const rpcRow = Array.isArray(rpcLimits) ? rpcLimits[0] : rpcLimits;
      if (rpcRow) {
        maxSessionDrops = Math.max(1, Number(rpcRow.max_drops_per_session ?? 120));
        maxSession = Number(rpcRow.max_rewarded_sessions_per_day ?? 4);
        maxDay = Number(rpcRow.max_drops_per_day ?? 300);
        maxWeek = Number(rpcRow.max_drops_per_week ?? 1500);
        // New fields from refactored RPC (graceful fallback for pre-migration backends)
        if (rpcRow.rewarded_sessions_cap_mode) {
          const mode = String(rpcRow.rewarded_sessions_cap_mode);
          if (mode === 'off' || mode === 'soft' || mode === 'hard') {
            capMode = mode;
          }
        }
        if (rpcRow.session_restart_grace_sec != null) {
          graceSec = Math.max(0, Number(rpcRow.session_restart_grace_sec));
        }
      }

      // Fetch today's/week's rewarded session history (for session-count cap)
      const todayStr = getBelgradeDateString(new Date());
      const weekStart = new Date();
      const dayOfWeek = weekStart.getDay();
      const weekOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      weekStart.setDate(weekStart.getDate() - weekOffset);
      weekStart.setHours(0, 0, 0, 0);
      const weekStartStr = weekStart.toISOString().slice(0, 10);

      // Session count (for per-session cap) — still from sessions table
      const { data: sessionRows } = await supabase
        .from('sessions')
        .select('started_at')
        .eq('user_id', authSession.user.id)
        .eq('is_active', false)
        .gt('drops_earned', 0)
        .gte('started_at', weekStart.toISOString())
        .order('started_at', { ascending: false })
        .limit(50);

      let rewardedToday = 0;
      for (const row of sessionRows ?? []) {
        const dateStr = getBelgradeDateString(new Date(row.started_at));
        if (dateStr === todayStr) rewardedToday += 1;
      }

      // Drop totals — from drops_transactions so all sources are included
      const EARNED_TYPES = ['session', 'checkin', 'challenge', 'bonus', 'arena', 'referral_reward'];
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const { data: txRows } = await supabase
        .from('drops_transactions')
        .select('created_at, amount')
        .eq('user_id', authSession.user.id)
        .in('transaction_type', EARNED_TYPES)
        .gt('amount', 0)
        .gte('created_at', weekStart.toISOString());

      let dropsToday = 0;
      let dropsWeek = 0;
      for (const row of txRows ?? []) {
        const a = row.amount ?? 0;
        dropsWeek += a;
        if (new Date(row.created_at) >= todayStart) dropsToday += a;
      }

      const sessionsRemaining = Math.max(0, maxSession - rewardedToday);
      const dayRemaining = Math.max(0, maxDay - dropsToday);
      const weekRemaining = Math.max(0, maxWeek - dropsWeek);

      // Session cap blocks ONLY in hard mode
      const sessionCapBlocks = capMode === 'hard' && sessionsRemaining <= 0;
      const dayCapped = dayRemaining <= 0;
      const weekCapped = weekRemaining <= 0;

      const limitReached = sessionCapBlocks || dayCapped || weekCapped;
      const nearLimit = !limitReached && capMode === 'hard' && sessionsRemaining === 1;
      const softSessionWarning = capMode === 'soft' && sessionsRemaining <= 0 && !dayCapped && !weekCapped;

      setStatus({
        rewardedSessionsToday: rewardedToday,
        maxRewardedSessionsPerDay: maxSession,
        maxDropsPerSession: maxSessionDrops,
        mintedToday: dropsToday,
        maxDropsPerDay: maxDay,
        mintedWeek: dropsWeek,
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
    void load();
  }, [load]);

  return status;
}
