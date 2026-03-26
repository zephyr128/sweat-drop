import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateLiveDrops, estimateLiveDropsDetailed } from '../lib/workout/live-drops-estimator';

const defaultLimits = {
  maxDropsPerSession: 120,
  maxRewardedSessionsPerDay: 4,
  maxDropsPerDay: 300,
  maxDropsPerWeek: 1500,
};

test('accrues small amount in first 2 minutes', () => {
  const result = estimateLiveDrops({
    durationSeconds: 120,
    calories: 7,
    machineType: 'treadmill',
    avgSpeedKmh: 6,
    limits: defaultLimits,
    history: { rewardedSessionsToday: 0, mintedToday: 0, mintedWeek: 0 },
    streak: { streakDays: 0, lastVisitDate: null },
    todayDate: '2026-03-25',
  });
  assert.equal(result, 3);
});

test('applies intensity projection and session cap', () => {
  const result = estimateLiveDrops({
    durationSeconds: 1800,
    calories: 90,
    machineType: 'bike',
    avgRpm: 88,
    limits: { ...defaultLimits, maxDropsPerSession: 50 },
    history: { rewardedSessionsToday: 0, mintedToday: 0, mintedWeek: 0 },
    streak: { streakDays: 8, lastVisitDate: '2026-03-24' },
    todayDate: '2026-03-25',
  });
  // 30min bike at 88rpm with 0.88 sustained penalty always applied.
  // Raw drops land near threshold; result must be positive and reasonable.
  assert.ok(result > 20, `Expected meaningful drops, got ${result}`);
  assert.ok(result <= 60, `Expected drops within threshold range, got ${result}`);
});

test('caps by day and week remaining budget', () => {
  const result = estimateLiveDrops({
    durationSeconds: 1500,
    calories: 80,
    machineType: 'bike',
    avgRpm: 80,
    limits: defaultLimits,
    history: { rewardedSessionsToday: 1, mintedToday: 298, mintedWeek: 1499 },
    streak: { streakDays: 2, lastVisitDate: '2026-03-24' },
    todayDate: '2026-03-25',
  });
  assert.equal(result, 1);
});

test('returns zero if rewarded sessions cap reached in hard mode', () => {
  const result = estimateLiveDrops({
    durationSeconds: 2000,
    calories: 70,
    machineType: 'treadmill',
    avgSpeedKmh: 7,
    limits: { ...defaultLimits, rewardedSessionsCapMode: 'hard' },
    history: { rewardedSessionsToday: 4, mintedToday: 120, mintedWeek: 350 },
    streak: { streakDays: 5, lastVisitDate: '2026-03-24' },
    todayDate: '2026-03-25',
  });
  assert.equal(result, 0);
});

test('still earns drops when sessions cap exceeded in soft mode (default)', () => {
  const result = estimateLiveDrops({
    durationSeconds: 2000,
    calories: 70,
    machineType: 'treadmill',
    avgSpeedKmh: 7,
    limits: defaultLimits,
    history: { rewardedSessionsToday: 4, mintedToday: 120, mintedWeek: 350 },
    streak: { streakDays: 5, lastVisitDate: '2026-03-24' },
    todayDate: '2026-03-25',
  });
  assert.ok(result > 0, `Expected drops > 0 in soft mode, got ${result}`);
});

test('still earns drops when sessions cap exceeded in off mode', () => {
  const result = estimateLiveDrops({
    durationSeconds: 2000,
    calories: 70,
    machineType: 'treadmill',
    avgSpeedKmh: 7,
    limits: { ...defaultLimits, rewardedSessionsCapMode: 'off' },
    history: { rewardedSessionsToday: 4, mintedToday: 120, mintedWeek: 350 },
    streak: { streakDays: 5, lastVisitDate: '2026-03-24' },
    todayDate: '2026-03-25',
  });
  assert.ok(result > 0, `Expected drops > 0 in off mode, got ${result}`);
});

test('returns -1 for bike idle telemetry (rpm 0) so caller keeps high water mark', () => {
  const result = estimateLiveDrops({
    durationSeconds: 360,
    calories: 0,
    machineType: 'bike',
    avgRpm: 0,
    limits: defaultLimits,
    history: { rewardedSessionsToday: 0, mintedToday: 0, mintedWeek: 0 },
    streak: { streakDays: 0, lastVisitDate: null },
    todayDate: '2026-03-25',
  });
  assert.equal(result, -1, 'should return -1 sentinel so UI does not drop');
});

test('drops never decrease even when rpm temporarily drops to 0', () => {
  const limits = defaultLimits;
  const history = { rewardedSessionsToday: 0, mintedToday: 0, mintedWeek: 0 };
  const streak = { streakDays: 0, lastVisitDate: null };
  const today = '2026-03-25';

  const phase1 = estimateLiveDrops({
    durationSeconds: 180,
    calories: 10,
    machineType: 'bike',
    avgRpm: 70,
    limits, history, streak, todayDate: today,
  });
  assert.ok(phase1 > 0, 'should accrue drops while pedaling');

  const phase2 = estimateLiveDrops({
    durationSeconds: 200,
    calories: 10,
    machineType: 'bike',
    avgRpm: 0,
    limits, history, streak, todayDate: today,
  });
  assert.equal(phase2, -1, 'should return -1 sentinel when rpm drops to 0');

  const displayed = Math.max(phase1, phase2);
  assert.equal(displayed, phase1, 'displayed drops stay at previous peak');
});

// ==================== NEW: Tier Transition Tests ====================

test('detailed estimator returns tier=normal when below session threshold', () => {
  const result = estimateLiveDropsDetailed({
    durationSeconds: 120,
    calories: 7,
    machineType: 'bike',
    avgRpm: 70,
    limits: { ...defaultLimits, maxDropsPerSession: 100 },
    history: { rewardedSessionsToday: 0, mintedToday: 0, mintedWeek: 0 },
    streak: { streakDays: 0, lastVisitDate: null },
    todayDate: '2026-03-25',
  });
  assert.equal(result.tier, 'normal');
  assert.equal(result.sessionThreshold, 100);
  assert.ok(result.drops > 0);
  assert.ok(result.drops <= 100);
});

test('threshold crossing switches tier to tier1 (reduced rate)', () => {
  // Use a threshold=40 and a session that generates ~50-55 raw drops
  // so overage (10-15) stays within tier1 span (40 * 0.5 = 20)
  const result = estimateLiveDropsDetailed({
    durationSeconds: 1800,
    calories: 80,
    machineType: 'bike',
    avgRpm: 75,
    limits: { ...defaultLimits, maxDropsPerSession: 40, maxDropsPerDay: 500 },
    history: { rewardedSessionsToday: 0, mintedToday: 0, mintedWeek: 0 },
    streak: { streakDays: 0, lastVisitDate: null },
    todayDate: '2026-03-25',
  });
  assert.equal(result.tier, 'tier1', `Expected tier1 after threshold, got ${result.tier} (raw=${result.rawSessionDrops}, threshold=${result.sessionThreshold})`);
  assert.ok(result.drops > result.sessionThreshold, `drops (${result.drops}) should exceed threshold (${result.sessionThreshold})`);
  assert.ok(result.drops < result.rawSessionDrops, `tiered drops (${result.drops}) should be less than raw (${result.rawSessionDrops})`);
});

test('deep threshold switches tier to tier2', () => {
  const result = estimateLiveDropsDetailed({
    durationSeconds: 5400,
    calories: 300,
    machineType: 'bike',
    avgRpm: 95,
    limits: {
      ...defaultLimits,
      maxDropsPerSession: 20,
      maxDropsPerDay: 500,
      maxDropsPerWeek: 2000,
    },
    history: { rewardedSessionsToday: 0, mintedToday: 0, mintedWeek: 0 },
    streak: { streakDays: 0, lastVisitDate: null },
    todayDate: '2026-03-25',
  });
  assert.equal(result.tier, 'tier2', `Expected tier2, got ${result.tier}`);
  assert.ok(result.drops > result.sessionThreshold, 'drops should exceed threshold in tier2');
});

test('day hard cap stops accrual but workout continues (drops frozen)', () => {
  const result = estimateLiveDropsDetailed({
    durationSeconds: 1800,
    calories: 100,
    machineType: 'bike',
    avgRpm: 80,
    limits: { ...defaultLimits, maxDropsPerSession: 40, maxDropsPerDay: 50, maxDropsPerWeek: 500 },
    history: { rewardedSessionsToday: 1, mintedToday: 50, mintedWeek: 50 },
    streak: { streakDays: 0, lastVisitDate: null },
    todayDate: '2026-03-25',
  });
  assert.equal(result.drops, 0, 'drops should be 0 when day cap exhausted');
  assert.equal(result.hardCapReached, true);
});

test('week hard cap stops accrual', () => {
  const result = estimateLiveDropsDetailed({
    durationSeconds: 1800,
    calories: 100,
    machineType: 'bike',
    avgRpm: 80,
    limits: { ...defaultLimits, maxDropsPerSession: 80, maxDropsPerDay: 300, maxDropsPerWeek: 100 },
    history: { rewardedSessionsToday: 0, mintedToday: 0, mintedWeek: 100 },
    streak: { streakDays: 0, lastVisitDate: null },
    todayDate: '2026-03-25',
  });
  assert.equal(result.drops, 0, 'drops should be 0 when week cap exhausted');
  assert.equal(result.hardCapReached, true);
});

test('no "restart to keep earning" behavior — drops always continue past threshold', () => {
  const limits = {
    ...defaultLimits,
    maxDropsPerSession: 20,
    maxDropsPerDay: 500,
    maxDropsPerWeek: 2000,
  };
  const history = { rewardedSessionsToday: 0, mintedToday: 0, mintedWeek: 0 };
  const streak = { streakDays: 0, lastVisitDate: null };
  const today = '2026-03-25';

  const at15min = estimateLiveDropsDetailed({
    durationSeconds: 900, calories: 50, machineType: 'bike', avgRpm: 85,
    limits, history, streak, todayDate: today,
  });
  const at30min = estimateLiveDropsDetailed({
    durationSeconds: 1800, calories: 100, machineType: 'bike', avgRpm: 85,
    limits, history, streak, todayDate: today,
  });

  assert.ok(at30min.drops >= at15min.drops, 'drops at 30min must be >= drops at 15min');
  assert.ok(at30min.drops > 0, 'drops at 30min must be > 0');
});

test('custom tier factors from backend are respected', () => {
  const sharedInput = {
    durationSeconds: 900,
    calories: 50,
    machineType: 'bike' as const,
    avgRpm: 75,
    history: { rewardedSessionsToday: 0, mintedToday: 0, mintedWeek: 0 },
    streak: { streakDays: 0, lastVisitDate: null },
    todayDate: '2026-03-25',
  };
  const result = estimateLiveDropsDetailed({
    ...sharedInput,
    limits: {
      ...defaultLimits,
      maxDropsPerSession: 10,
      maxDropsPerDay: 500,
      sessionSoftTier1Factor: 0.80,
      sessionSoftTier2Factor: 0.50,
      sessionSoftTier1SpanRatio: 0.50,
    },
  });
  const resultDefault = estimateLiveDropsDetailed({
    ...sharedInput,
    limits: {
      ...defaultLimits,
      maxDropsPerSession: 10,
      maxDropsPerDay: 500,
    },
  });
  assert.ok(result.drops > resultDefault.drops,
    `Custom 0.80 factor (${result.drops}) should yield more than default 0.40 (${resultDefault.drops})`);
});

test('backward compatibility: missing tier fields use safe defaults', () => {
  const result = estimateLiveDropsDetailed({
    durationSeconds: 3600,
    calories: 200,
    machineType: 'bike',
    avgRpm: 90,
    limits: {
      maxDropsPerSession: 30,
      maxRewardedSessionsPerDay: 4,
      maxDropsPerDay: 500,
      maxDropsPerWeek: 2000,
    },
    history: { rewardedSessionsToday: 0, mintedToday: 0, mintedWeek: 0 },
    streak: { streakDays: 0, lastVisitDate: null },
    todayDate: '2026-03-25',
  });
  assert.ok(result.drops > 0, 'should still calculate drops without explicit tier fields');
  assert.ok(result.tier === 'tier1' || result.tier === 'tier2',
    'should enter reduced tier for long session above threshold');
});

test('machineConfig overrides hardcoded defaults when provided', () => {
  const base = {
    durationSeconds: 600,
    machineType: 'bike' as const,
    avgRpm: 80,
    calories: 50,
    limits: { ...defaultLimits, maxDropsPerSession: 200, maxDropsPerDay: 500 },
    history: { rewardedSessionsToday: 0, mintedToday: 0, mintedWeek: 0 },
    streak: { streakDays: 0, lastVisitDate: null },
    todayDate: '2026-03-25',
  };

  const withDefaults = estimateLiveDropsDetailed(base);
  const withCustom = estimateLiveDropsDetailed({
    ...base,
    machineConfig: { baseRatePerMin: 2.0, maxMultiplier: 2.5, maxDropsPerMinute: 5.0 },
  });

  assert.ok(withCustom.drops > withDefaults.drops,
    `Custom config (${withCustom.drops}) should yield more than defaults (${withDefaults.drops})`);
});

test('calories bonus only applies to generic machine type', () => {
  const base = {
    durationSeconds: 600,
    avgRpm: 70,
    limits: defaultLimits,
    history: { rewardedSessionsToday: 0, mintedToday: 0, mintedWeek: 0 },
    streak: { streakDays: 0, lastVisitDate: null },
    todayDate: '2026-03-25',
  };

  const bikeWith200Cal = estimateLiveDropsDetailed({
    ...base, machineType: 'bike', calories: 200,
  });
  const bikeWith0Cal = estimateLiveDropsDetailed({
    ...base, machineType: 'bike', calories: 0,
  });
  assert.equal(bikeWith200Cal.drops, bikeWith0Cal.drops,
    'bike drops should be identical regardless of calories');

  const genericWith200Cal = estimateLiveDropsDetailed({
    ...base, machineType: 'generic', calories: 200,
  });
  const genericWith0Cal = estimateLiveDropsDetailed({
    ...base, machineType: 'generic', calories: 0,
  });
  assert.ok(genericWith200Cal.drops > genericWith0Cal.drops,
    'generic should get a calories bonus');
});

test('spike penalty reduces drops when rpmPeak far exceeds avgRpm', () => {
  const base = {
    durationSeconds: 600,
    machineType: 'bike' as const,
    avgRpm: 80,
    calories: 50,
    limits: defaultLimits,
    history: { rewardedSessionsToday: 0, mintedToday: 0, mintedWeek: 0 },
    streak: { streakDays: 0, lastVisitDate: null },
    todayDate: '2026-03-25',
  };

  const noSpike = estimateLiveDropsDetailed(base);
  const withSpike = estimateLiveDropsDetailed({
    ...base,
    rpmPeak: 200,
  });

  assert.ok(withSpike.drops < noSpike.drops,
    `Spike penalty should reduce drops: spike=${withSpike.drops} vs normal=${noSpike.drops}`);
});

test('estimator is conservative — always at or below backend equivalent', () => {
  const result = estimateLiveDropsDetailed({
    durationSeconds: 240,
    calories: 20,
    machineType: 'bike',
    avgRpm: 75,
    limits: defaultLimits,
    history: { rewardedSessionsToday: 0, mintedToday: 0, mintedWeek: 0 },
    streak: { streakDays: 0, lastVisitDate: null },
    todayDate: '2026-03-25',
  });
  // 4 min bike at 75 rpm: base=1.2, intensity=1.35*0.88=1.188, raw=4*1.2*1.188≈5.7
  // The 0.88 always-on penalty ensures we never over-estimate vs backend.
  assert.ok(result.drops >= 4 && result.drops <= 7,
    `4min@75rpm should yield 4-7 drops, got ${result.drops}`);
});

test('dailyRemaining and weeklyRemaining are computed correctly', () => {
  const result = estimateLiveDropsDetailed({
    durationSeconds: 600,
    calories: 30,
    machineType: 'bike',
    avgRpm: 70,
    limits: { ...defaultLimits, maxDropsPerSession: 80, maxDropsPerDay: 100, maxDropsPerWeek: 500 },
    history: { rewardedSessionsToday: 0, mintedToday: 40, mintedWeek: 200 },
    streak: { streakDays: 0, lastVisitDate: null },
    todayDate: '2026-03-25',
  });
  assert.ok(result.dailyRemaining >= 0, 'dailyRemaining must be non-negative');
  assert.ok(result.weeklyRemaining >= 0, 'weeklyRemaining must be non-negative');
  // dailyRemaining = max(0, (100-40) - drops) <= 60
  assert.ok(result.dailyRemaining <= 60, `dailyRemaining (${result.dailyRemaining}) should reflect mintedToday`);
});
