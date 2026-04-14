import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';
import type {
  DropLimitsConfig,
  DropHistoryContext,
  StreakContext,
  MachineDropConfig,
  DiminishingConfig,
  RewardedSessionsCapMode,
} from '@/lib/workout/live-drops-estimator';

function getBelgradeDateString(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Belgrade',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

export interface WorkoutEconomyRefs {
  dropLimitsRef: React.MutableRefObject<DropLimitsConfig>;
  dropHistoryRef: React.MutableRefObject<DropHistoryContext>;
  streakContextRef: React.MutableRefObject<StreakContext>;
  machineConfigRef: React.MutableRefObject<MachineDropConfig | null>;
  diminishingConfigRef: React.MutableRefObject<DiminishingConfig | null>;
  mergedPriorDropsRef: React.MutableRefObject<number>;
}

interface UseWorkoutEconomyOptions {
  userId: string | undefined;
  gymId: string | undefined;
  sessionId: string | undefined;
  sessionStartedAt: string | undefined;
  machineType: string;
  /** Called after limits are loaded so caller can update UI state (targetDrops, dailyRemaining, etc.) */
  onLimitsLoaded?: (maxSessionDrops: number, initialDayRemaining: number, initialSegTarget: number) => void;
}

/**
 * Loads economy data (limits, history, streak, machine config) from Supabase
 * and populates the returned refs. The caller receives stable refs for use in
 * the timer/estimator.
 *
 * Mirrors the production `get_user_drop_limits` RPC flow with direct-table fallbacks.
 */
export function useWorkoutEconomy({
  userId,
  gymId,
  sessionId,
  sessionStartedAt,
  machineType,
  onLimitsLoaded,
}: UseWorkoutEconomyOptions): WorkoutEconomyRefs {
  const dropLimitsRef = useRef<DropLimitsConfig>({
    maxDropsPerSession: 120,
    maxRewardedSessionsPerDay: 4,
    maxDropsPerDay: 300,
    maxDropsPerWeek: 1500,
    rewardedSessionsCapMode: 'soft',
  });
  const dropHistoryRef = useRef<DropHistoryContext>({
    rewardedSessionsToday: 0,
    mintedToday: 0,
    mintedWeek: 0,
  });
  const streakContextRef = useRef<StreakContext>({
    streakDays: 0,
    lastVisitDate: null,
  });
  const machineConfigRef = useRef<MachineDropConfig | null>(null);
  const diminishingConfigRef = useRef<DiminishingConfig | null>(null);
  const mergedPriorDropsRef = useRef<number>(0);

  useEffect(() => {
    if (!userId || !gymId || !sessionId) return;

    const loadLiveEconomyContext = async () => {
      // ── Drop limits ────────────────────────────────────────────────────────
      try {
        // Prefer SECURITY DEFINER RPC (RLS-safe). Falls back to direct table reads.
        const { data: rpcLimits } = await supabase.rpc('get_user_drop_limits', {
          p_gym_id: gymId,
        });

        const rpcRow = Array.isArray(rpcLimits) ? rpcLimits[0] : rpcLimits;
        let effectiveLimits = rpcRow as {
          max_drops_per_session?: number;
          max_rewarded_sessions_per_day?: number;
          max_drops_per_day?: number;
          max_drops_per_week?: number;
          rewarded_sessions_cap_mode?: string;
          session_soft_tier_1_factor?: number;
          session_soft_tier_2_factor?: number;
          session_soft_tier_1_span_ratio?: number;
          split_merge_window_sec?: number;
        } | null;

        if (!effectiveLimits) {
          const [gymTokenomics, globalTokenomics, gymLimitsFallback, defaultLimitsFallback] =
            await Promise.all([
              supabase
                .from('tokenomics_config')
                .select('max_drops_per_session,max_rewarded_sessions_per_day,max_drops_per_day,max_drops_per_week')
                .eq('gym_id', gymId)
                .maybeSingle(),
              supabase
                .from('tokenomics_config')
                .select('max_drops_per_session,max_rewarded_sessions_per_day,max_drops_per_day,max_drops_per_week')
                .is('gym_id', null)
                .maybeSingle(),
              supabase
                .from('drop_limits')
                .select('max_drops_per_session,max_rewarded_sessions_per_day,max_drops_per_day,max_drops_per_week')
                .eq('gym_id', gymId)
                .eq('enabled', true)
                .maybeSingle(),
              supabase
                .from('drop_limits')
                .select('max_drops_per_session,max_rewarded_sessions_per_day,max_drops_per_day,max_drops_per_week')
                .is('gym_id', null)
                .eq('enabled', true)
                .maybeSingle(),
            ]);
          effectiveLimits =
            gymTokenomics.data ||
            globalTokenomics.data ||
            gymLimitsFallback.data ||
            defaultLimitsFallback.data;
        }

        if (effectiveLimits) {
          const maxSessionDrops = Math.max(1, Number(effectiveLimits.max_drops_per_session ?? 120));
          const maxDayDrops = Math.max(maxSessionDrops, Number(effectiveLimits.max_drops_per_day ?? 300));
          const maxWeekDrops = Math.max(maxDayDrops, Number(effectiveLimits.max_drops_per_week ?? 1500));
          const maxRewardedSessions = Math.max(1, Number(effectiveLimits.max_rewarded_sessions_per_day ?? 4));
          let capMode: RewardedSessionsCapMode = 'soft';
          const rawMode = effectiveLimits.rewarded_sessions_cap_mode;
          if (rawMode === 'off' || rawMode === 'soft' || rawMode === 'hard') {
            capMode = rawMode;
          }
          dropLimitsRef.current = {
            maxDropsPerSession: maxSessionDrops,
            maxRewardedSessionsPerDay: maxRewardedSessions,
            maxDropsPerDay: maxDayDrops,
            maxDropsPerWeek: maxWeekDrops,
            rewardedSessionsCapMode: capMode,
            sessionSoftTier1Factor:
              effectiveLimits.session_soft_tier_1_factor != null
                ? Number(effectiveLimits.session_soft_tier_1_factor)
                : undefined,
            sessionSoftTier2Factor:
              effectiveLimits.session_soft_tier_2_factor != null
                ? Number(effectiveLimits.session_soft_tier_2_factor)
                : undefined,
            sessionSoftTier1SpanRatio:
              effectiveLimits.session_soft_tier_1_span_ratio != null
                ? Number(effectiveLimits.session_soft_tier_1_span_ratio)
                : undefined,
            splitMergeWindowSec:
              effectiveLimits.split_merge_window_sec != null
                ? Number(effectiveLimits.split_merge_window_sec)
                : undefined,
          };

          const initialDayRemaining = Math.max(0, maxDayDrops - dropHistoryRef.current.mintedToday);
          const initialSegTarget = Math.max(1, Math.min(maxSessionDrops, initialDayRemaining));
          onLimitsLoaded?.(maxSessionDrops, initialDayRemaining, initialSegTarget);
        }
      } catch (limitsError) {
        log.warn('[useWorkoutEconomy] Could not load economy limits, using defaults.', limitsError);
      }

      // ── Streak / profile ───────────────────────────────────────────────────
      try {
        const { data: profileRow } = await supabase
          .from('profiles')
          .select('streak_days,last_visit_date')
          .eq('id', userId)
          .maybeSingle();

        if (profileRow) {
          streakContextRef.current = {
            streakDays: profileRow.streak_days ?? 0,
            lastVisitDate: profileRow.last_visit_date ?? null,
          };
        }
      } catch (profileError) {
        log.warn('[useWorkoutEconomy] Could not load profile streak.', profileError);
      }

      // ── Session drop history ───────────────────────────────────────────────
      try {
        const { data: rewardedSessions } = await supabase
          .from('sessions')
          .select('drops_earned,started_at,ended_at,machine_id')
          .eq('user_id', userId)
          .eq('is_active', false)
          .gt('drops_earned', 0)
          .neq('id', sessionId)
          .limit(500);

        const now = new Date();
        const todayStr = getBelgradeDateString(now);
        const todayDate = new Date(`${todayStr}T00:00:00.000Z`);
        const dayOfWeek = todayDate.getUTCDay();
        const weekOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const weekStartDate = new Date(todayDate);
        weekStartDate.setUTCDate(weekStartDate.getUTCDate() - weekOffset);
        const weekStartStr = weekStartDate.toISOString().slice(0, 10);

        let rewardedSessionsToday = 0;
        let mintedToday = 0;
        let mintedWeek = 0;
        let mergedPriorDrops = 0;

        const mergeWindowSec = dropLimitsRef.current.splitMergeWindowSec ?? 900;
        const sessionStartMs = sessionStartedAt ? new Date(sessionStartedAt).getTime() : 0;

        for (const row of rewardedSessions || []) {
          const dateStr = getBelgradeDateString(new Date(row.started_at));
          const earned = row.drops_earned ?? 0;
          if (dateStr === todayStr) {
            rewardedSessionsToday += 1;
            mintedToday += earned;

            if (row.ended_at) {
              const endedMs = new Date(row.ended_at).getTime();
              if (endedMs <= sessionStartMs && sessionStartMs <= endedMs + mergeWindowSec * 1000) {
                mergedPriorDrops += earned;
              }
            }
          }
          if (dateStr >= weekStartStr) {
            mintedWeek += earned;
          }
        }

        dropHistoryRef.current = { rewardedSessionsToday, mintedToday, mintedWeek };
        mergedPriorDropsRef.current = mergedPriorDrops;
      } catch (historyError) {
        log.warn('[useWorkoutEconomy] Could not load rewarded sessions history.', historyError);
      }

      // ── Machine drop config ────────────────────────────────────────────────
      try {
        const resolvedType = (machineType || 'generic').toLowerCase();
        const { data: dmcRow } = await supabase
          .from('drop_model_config')
          .select('machine_base_json, full_rate_until_min, reduced_rate_until_min, low_rate_until_min, post_limit_factor')
          .or(`gym_id.eq.${gymId},gym_id.is.null`)
          .order('gym_id', { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle();

        if (dmcRow?.machine_base_json) {
          const json = dmcRow.machine_base_json as Record<string, Record<string, number>>;
          const mcfg = json[resolvedType] ?? json['generic'];
          if (mcfg) {
            machineConfigRef.current = {
              baseRatePerMin: mcfg.baseRatePerMin ?? 1.0,
              maxMultiplier: mcfg.maxMultiplier ?? 1.8,
              maxDropsPerMinute: mcfg.maxDropsPerMinute ?? 3.0,
              sustainedHighEffortRatio: mcfg.sustainedHighEffortRatio ?? 0.55,
            };
          }
        }

        if (dmcRow?.full_rate_until_min != null) {
          diminishingConfigRef.current = {
            fullRateUntilMin: Number(dmcRow.full_rate_until_min),
            reducedRateUntilMin: Number(dmcRow.reduced_rate_until_min ?? 90),
            lowRateUntilMin: Number(dmcRow.low_rate_until_min ?? 120),
            postLimitFactor: Number(dmcRow.post_limit_factor ?? 0.4),
          };
        }
      } catch (configError) {
        log.warn('[useWorkoutEconomy] Could not load drop_model_config, using defaults.', configError);
      }
    };

    void loadLiveEconomyContext();
  }, [userId, gymId, sessionId, machineType]);

  return {
    dropLimitsRef,
    dropHistoryRef,
    streakContextRef,
    machineConfigRef,
    diminishingConfigRef,
    mergedPriorDropsRef,
  };
}
