export type RewardedSessionsCapMode = 'off' | 'soft' | 'hard';
export type SessionTier = 'normal' | 'tier1' | 'tier2';

/** Per-machine config fetched from backend drop_model_config.machine_base_json */
export interface MachineDropConfig {
  baseRatePerMin: number;
  maxMultiplier: number;
  maxDropsPerMinute: number;
  spikeRatioThreshold?: number;
  sustainedHighEffortRatio?: number;
}

export interface DropLimitsConfig {
  maxDropsPerSession: number;
  maxRewardedSessionsPerDay: number;
  maxDropsPerDay: number;
  maxDropsPerWeek: number;
  rewardedSessionsCapMode?: RewardedSessionsCapMode;
  /** Earning rate multiplier after session threshold (default 0.40) */
  sessionSoftTier1Factor?: number;
  /** Earning rate multiplier in deep reduced mode (default 0.15) */
  sessionSoftTier2Factor?: number;
  /** How far past threshold until tier2 kicks in, as ratio of threshold (default 0.5) */
  sessionSoftTier1SpanRatio?: number;
}

export interface DropHistoryContext {
  rewardedSessionsToday: number;
  mintedToday: number;
  mintedWeek: number;
}

export interface StreakContext {
  streakDays: number;
  lastVisitDate: string | null;
}

export interface LiveDropsInput {
  durationSeconds: number;
  calories: number;
  machineType?: 'treadmill' | 'bike' | 'elliptical' | 'stepper' | 'generic' | null;
  avgRpm?: number;
  avgSpeedKmh?: number;
  inclinePct?: number;
  cadencePerMin?: number;
  rpmPeak?: number;
  limits: DropLimitsConfig;
  history: DropHistoryContext;
  streak: StreakContext;
  todayDate: string;
  /** Per-machine config from backend; when provided, overrides hardcoded defaults */
  machineConfig?: MachineDropConfig | null;
}

export interface LiveDropsResult {
  drops: number;
  tier: SessionTier;
  /** Raw uncapped drops before session threshold tiering */
  rawSessionDrops: number;
  sessionThreshold: number;
  dailyRemaining: number;
  weeklyRemaining: number;
  /** true when day or week hard cap is exhausted */
  hardCapReached: boolean;
}

const DEFAULT_DIMINISHING = {
  fullRateUntilMin: 45,
  reducedRateUntilMin: 90,
  lowRateUntilMin: 120,
  postLimitFactor: 0.4,
};

const MACHINE_DEFAULTS: Record<string, MachineDropConfig> = {
  treadmill: { baseRatePerMin: 1.3, maxMultiplier: 2.2, maxDropsPerMinute: 4.2 },
  bike:      { baseRatePerMin: 1.2, maxMultiplier: 2.0, maxDropsPerMinute: 3.6 },
  elliptical:{ baseRatePerMin: 1.15, maxMultiplier: 1.9, maxDropsPerMinute: 3.4 },
  stepper:   { baseRatePerMin: 1.1, maxMultiplier: 1.9, maxDropsPerMinute: 3.2 },
  generic:   { baseRatePerMin: 1.0, maxMultiplier: 1.8, maxDropsPerMinute: 3.0 },
};

/**
 * Backward-compatible wrapper that returns just the drop number.
 * Existing callers (workout.tsx 1-second interval) still work unchanged.
 */
export function estimateLiveDrops(input: LiveDropsInput): number {
  return estimateLiveDropsDetailed(input).drops;
}

/**
 * Full estimation with tier state, daily/weekly remaining, and session threshold.
 * Used by workout UI to show reduced-mode badges and daily budget.
 */
export function estimateLiveDropsDetailed(input: LiveDropsInput): LiveDropsResult {
  const duration = Math.max(0, Math.floor(input.durationSeconds));
  const cappedSec = Math.min(duration, 14400);
  const durationMin = cappedSec / 60;
  const sessionThreshold = Math.max(1, Number(input.limits.maxDropsPerSession || 120));
  const safeDayCap = Math.max(1, Number(input.limits.maxDropsPerDay || 300));
  const safeWeekCap = Math.max(1, Number(input.limits.maxDropsPerWeek || 1500));
  const safeRewardedSessionsCap = Math.max(1, Number(input.limits.maxRewardedSessionsPerDay || 4));

  const tier1Factor = Math.max(0, Math.min(1, Number(input.limits.sessionSoftTier1Factor ?? 0.40)));
  const tier2Factor = Math.max(0, Math.min(1, Number(input.limits.sessionSoftTier2Factor ?? 0.15)));
  const tier1SpanRatio = Math.max(0.1, Math.min(2, Number(input.limits.sessionSoftTier1SpanRatio ?? 0.50)));

  const dayRemaining = Math.max(0, safeDayCap - input.history.mintedToday);
  const weekRemaining = Math.max(0, safeWeekCap - input.history.mintedWeek);
  const hardCapReached = dayRemaining <= 0 || weekRemaining <= 0;

  const machineType = (input.machineType || 'generic').toLowerCase();
  const mcfg = input.machineConfig ?? MACHINE_DEFAULTS[machineType] ?? MACHINE_DEFAULTS.generic;
  const baseRate = mcfg.baseRatePerMin;
  const maxMultiplier = mcfg.maxMultiplier;
  const maxDropsPerMinute = mcfg.maxDropsPerMinute;
  const sustainedRatio = mcfg.sustainedHighEffortRatio ?? 0.55;

  const rpm = Number(input.avgRpm || 0);
  const speed = Number(input.avgSpeedKmh || 0);
  const incline = Math.max(0, Number(input.inclinePct || 0));
  const cadence = Number(input.cadencePerMin ?? input.avgRpm ?? 0);

  // Soft activity guard: return -1 sentinel so caller keeps high-water mark
  if (machineType === 'bike' && rpm < 10) return { drops: -1, tier: 'normal', rawSessionDrops: 0, sessionThreshold, dailyRemaining: dayRemaining, weeklyRemaining: weekRemaining, hardCapReached };
  if (machineType === 'treadmill' && speed < 1) return { drops: -1, tier: 'normal', rawSessionDrops: 0, sessionThreshold, dailyRemaining: dayRemaining, weeklyRemaining: weekRemaining, hardCapReached };
  if ((machineType === 'elliptical' || machineType === 'stepper') && cadence < 10) return { drops: -1, tier: 'normal', rawSessionDrops: 0, sessionThreshold, dailyRemaining: dayRemaining, weeklyRemaining: weekRemaining, hardCapReached };

  let intensity = 1.0;
  if (machineType === 'bike') {
    if (rpm >= 95) intensity = 1.65;
    else if (rpm >= 85) intensity = 1.5;
    else if (rpm >= 75) intensity = 1.35;
    else if (rpm >= 60) intensity = 1.15;
    else if (rpm >= 45) intensity = 1.0;
    else intensity = 0.85;
  } else if (machineType === 'treadmill') {
    if (speed >= 12) intensity = 1.7;
    else if (speed >= 10) intensity = 1.5;
    else if (speed >= 8) intensity = 1.3;
    else if (speed >= 6) intensity = 1.1;
    else intensity = 0.9;
    intensity += Math.min(incline * 0.03, 0.35);
  } else if (machineType === 'elliptical' || machineType === 'stepper') {
    if (cadence >= 90) intensity = 1.55;
    else if (cadence >= 75) intensity = 1.35;
    else if (cadence >= 60) intensity = 1.18;
    else if (cadence >= 45) intensity = 1.0;
    else intensity = 0.85;
  }

  // Backend ALWAYS applies this 0.88 penalty because the client doesn't send
  // quality_flags (high_effort_ratio defaults to 0.5 < sustained_ratio 0.55).
  intensity *= 0.88;

  // Spike penalty: if RPM peak vastly exceeds average, backend applies 0.75x.
  const spikeThreshold = mcfg.spikeRatioThreshold ?? 1.8;
  const rpmPeak = Number(input.rpmPeak || 0);
  let spikePenalty = 1.0;
  if (rpmPeak > 0 && rpm > 0 && rpmPeak > rpm * spikeThreshold) {
    spikePenalty = 0.75;
  }

  intensity = Math.max(0.5, Math.min(intensity, maxMultiplier));

  let raw = durationMin * baseRate * intensity * spikePenalty;
  raw = Math.min(raw, durationMin * maxDropsPerMinute);

  const seg1 = Math.min(durationMin, DEFAULT_DIMINISHING.fullRateUntilMin);
  const seg2 = Math.min(
    Math.max(durationMin - DEFAULT_DIMINISHING.fullRateUntilMin, 0),
    DEFAULT_DIMINISHING.reducedRateUntilMin - DEFAULT_DIMINISHING.fullRateUntilMin
  );
  const seg3 = Math.min(
    Math.max(durationMin - DEFAULT_DIMINISHING.reducedRateUntilMin, 0),
    DEFAULT_DIMINISHING.lowRateUntilMin - DEFAULT_DIMINISHING.reducedRateUntilMin
  );
  const seg4 = Math.max(durationMin - DEFAULT_DIMINISHING.lowRateUntilMin, 0);
  const weightedMin =
    seg1 +
    (seg2 * 0.8) +
    (seg3 * 0.6) +
    (seg4 * DEFAULT_DIMINISHING.postLimitFactor);
  const adjusted = raw * (durationMin > 0 ? weightedMin / durationMin : 0);

  // Calories bonus: backend only applies this for 'generic' machine type.
  // For specific machine types (bike, treadmill, elliptical, stepper),
  // backend uses RPM/speed-based intensity instead.
  const caloriesBonus = machineType === 'generic' && Number.isFinite(input.calories) && input.calories > 0
    ? Math.min(input.calories / 200, 3)
    : 0;
  const rawSessionDrops = Math.max(0, adjusted + caloriesBonus);

  // Hard session-count cap (only in hard mode)
  const capMode = input.limits.rewardedSessionsCapMode ?? 'soft';
  if (capMode === 'hard' && input.history.rewardedSessionsToday >= safeRewardedSessionsCap) {
    return { drops: 0, tier: 'normal', rawSessionDrops: 0, sessionThreshold, dailyRemaining: dayRemaining, weeklyRemaining: weekRemaining, hardCapReached: true };
  }

  // Soft session-threshold tiering:
  // 0..threshold → 100% rate
  // threshold..threshold*(1+spanRatio) → tier1Factor rate
  // beyond → tier2Factor rate
  let tieredDrops: number;
  let tier: SessionTier;

  if (rawSessionDrops <= sessionThreshold) {
    tieredDrops = rawSessionDrops;
    tier = 'normal';
  } else {
    const overThreshold = rawSessionDrops - sessionThreshold;
    const tier1Span = sessionThreshold * tier1SpanRatio;

    if (overThreshold <= tier1Span) {
      tieredDrops = sessionThreshold + overThreshold * tier1Factor;
      tier = 'tier1';
    } else {
      const tier1Contribution = tier1Span * tier1Factor;
      const tier2Excess = overThreshold - tier1Span;
      tieredDrops = sessionThreshold + tier1Contribution + tier2Excess * tier2Factor;
      tier = 'tier2';
    }
  }

  const finalDrops = Math.max(0, Math.round(
    Math.min(tieredDrops, dayRemaining, weekRemaining)
  ));

  return {
    drops: finalDrops,
    tier,
    rawSessionDrops: Math.round(rawSessionDrops),
    sessionThreshold,
    dailyRemaining: Math.max(0, dayRemaining - finalDrops),
    weeklyRemaining: Math.max(0, weekRemaining - finalDrops),
    hardCapReached: finalDrops <= 0 && hardCapReached,
  };
}
