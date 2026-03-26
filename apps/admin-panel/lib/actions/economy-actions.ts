'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentProfile } from '@/lib/auth';
import { getAdminClient } from '@/lib/utils/supabase-admin';
import { createClient as createUserClient } from '@/lib/supabase-server';

type PriceBandMap = Record<string, { min: number; max: number }>;
type MachineType = 'treadmill' | 'bike' | 'elliptical' | 'stepper' | 'generic';

const DROP_MODEL_META_KEY = '__drop_model';
const DROP_MODEL_DRAFT_KEY = '__draft_config';

const SAFE_RANGES = {
  maxDropsPerSession: { min: 1, max: 500, recommended: [80, 160] as [number, number] },
  maxDropsPerDay: { min: 20, max: 3000, recommended: [200, 500] as [number, number] },
  maxDropsPerWeek: { min: 100, max: 10000, recommended: [1200, 2500] as [number, number] },
  maxRewardedSessionsPerDay: { min: 1, max: 12, recommended: [3, 6] as [number, number] },
};

export interface DiminishingThresholds {
  fullRateUntilMin: number;
  reducedRateUntilMin: number;
  lowRateUntilMin: number;
  postLimitFactor: number;
}

export interface MachineBaseSettings {
  baseRatePerMin: number;
  targetIntensityFactor: number;
  highIntensityFactor: number;
  maxIntensityFactor: number;
}

export type BandEnforcementMode = 'warn' | 'enforce';

export interface EconomyConfig {
  maxDropsPerSession: number;
  maxDropsPerDay: number;
  maxDropsPerWeek: number;
  maxRewardedSessionsPerDay: number;
  maxCheckinDropsPerDay: number;
  diminishing: DiminishingThresholds;
  machineBase: Record<MachineType, MachineBaseSettings>;
  priceBandJson: PriceBandMap;
  dropsPerRsd: number;
  currencyCode: string;
  calibrationMeta?: Record<string, unknown>;
  bandEnforcementMode: BandEnforcementMode;
}

export type EconomyConfigUpdateInput = Partial<EconomyConfig> & {
  maxDropsPerSession: number;
  maxDropsPerDay: number;
  priceBandJson?: PriceBandMap;
  dropsPerRsd?: number;
  currencyCode?: string;
  calibrationMeta?: Record<string, unknown>;
  bandEnforcementMode?: BandEnforcementMode;
};

export interface EconomySummary {
  burnMintRatio: number;
  top1SharePct: number;
  minted30d: number;
  burned30d: number;
  capHitRate7d: number;
  risk: 'green' | 'yellow' | 'red';
  riskLabel: string;
}

export interface EconomyRewardGuardrail {
  id: string;
  name: string;
  rewardType: string;
  priceDrops: number;
  normalizedDrops: number;
  minRecommended: number | null;
  maxRecommended: number | null;
  inBand: boolean;
  complianceReason: string;
  priceCalcMode: 'manual_drops' | 'discount_from_rsd';
  basePriceRsd: number | null;
  discountPercent: number | null;
  finalPriceRsdSnapshot: number | null;
}

export interface EconomyValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface DropPreviewInput {
  machineType: Exclude<MachineType, 'generic'>;
  durationMin: number;
  avgRpm?: number;
  avgSpeedKmh?: number;
  inclinePct?: number;
  cadencePerMin?: number;
  simulateSpikes?: boolean;
}

export interface DropPreviewResult {
  expectedRawDrops: number;
  adjustedDrops: number;
  reducedByDiminishing: number;
  appliedCap: 'none' | 'session_cap';
  finalDrops: number;
  explanation: string[];
  source: 'rpc' | 'mock';
}

function recommendedDefaults(): EconomyConfig {
  return {
    maxDropsPerSession: 120,
    maxDropsPerDay: 300,
    maxDropsPerWeek: 1500,
    maxRewardedSessionsPerDay: 4,
    maxCheckinDropsPerDay: 1,
    diminishing: {
      fullRateUntilMin: 45,
      reducedRateUntilMin: 90,
      lowRateUntilMin: 120,
      postLimitFactor: 0.4,
    },
    machineBase: {
      treadmill: { baseRatePerMin: 1.4, targetIntensityFactor: 1.1, highIntensityFactor: 1.28, maxIntensityFactor: 1.55 },
      bike: { baseRatePerMin: 1.2, targetIntensityFactor: 1.05, highIntensityFactor: 1.25, maxIntensityFactor: 1.45 },
      elliptical: { baseRatePerMin: 1.3, targetIntensityFactor: 1.08, highIntensityFactor: 1.24, maxIntensityFactor: 1.46 },
      stepper: { baseRatePerMin: 1.25, targetIntensityFactor: 1.06, highIntensityFactor: 1.22, maxIntensityFactor: 1.42 },
      generic: { baseRatePerMin: 1.0, targetIntensityFactor: 1.0, highIntensityFactor: 1.1, maxIntensityFactor: 1.2 },
    },
    priceBandJson: {},
    dropsPerRsd: 2.0,
    currencyCode: 'RSD',
    bandEnforcementMode: 'warn' as BandEnforcementMode,
  };
}

const DEFAULT_PRICE_BANDS: PriceBandMap = {
  coffee:        { min: 120, max: 220 },
  protein_snack: { min: 180, max: 320 },
  day_pass:      { min: 500, max: 900 },
  pt_intro:      { min: 1200, max: 2200 },
  merch_small:   { min: 700, max: 1500 },
  merch_premium: { min: 1800, max: 4000 },
  membership:    { min: 3000, max: 10000 },
  physical:      { min: 1, max: 100000 },
};

function parsePriceBands(raw: unknown): PriceBandMap {
  const out: PriceBandMap = { ...DEFAULT_PRICE_BANDS };
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (key.startsWith('__') || !value || typeof value !== 'object') continue;
    const min = Number((value as Record<string, unknown>).min);
    const max = Number((value as Record<string, unknown>).max);
    if (Number.isFinite(min) && Number.isFinite(max)) out[key] = { min, max };
  }
  return out;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function toNum(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseDropModel(raw: unknown): Pick<EconomyConfig, 'diminishing' | 'machineBase'> {
  const defaults = recommendedDefaults();
  if (!raw || typeof raw !== 'object') {
    return { diminishing: defaults.diminishing, machineBase: defaults.machineBase };
  }

  const source = raw as Record<string, unknown>;
  const diminishingSrc = (source.diminishing || {}) as Record<string, unknown>;
  const machineSrc = (source.machineBase || {}) as Record<string, unknown>;

  const diminishing: DiminishingThresholds = {
    fullRateUntilMin: Number(diminishingSrc.fullRateUntilMin ?? defaults.diminishing.fullRateUntilMin),
    reducedRateUntilMin: Number(diminishingSrc.reducedRateUntilMin ?? defaults.diminishing.reducedRateUntilMin),
    lowRateUntilMin: Number(diminishingSrc.lowRateUntilMin ?? defaults.diminishing.lowRateUntilMin),
    postLimitFactor: Number(diminishingSrc.postLimitFactor ?? defaults.diminishing.postLimitFactor),
  };

  const machineBase = { ...defaults.machineBase };
  for (const key of Object.keys(machineBase) as MachineType[]) {
    const entry = (machineSrc[key] || {}) as Record<string, unknown>;
    machineBase[key] = {
      baseRatePerMin: Number(entry.baseRatePerMin ?? machineBase[key].baseRatePerMin),
      targetIntensityFactor: Number(entry.targetIntensityFactor ?? machineBase[key].targetIntensityFactor),
      highIntensityFactor: Number(entry.highIntensityFactor ?? machineBase[key].highIntensityFactor),
      maxIntensityFactor: Number(entry.maxIntensityFactor ?? machineBase[key].maxIntensityFactor),
    };
  }

  return { diminishing, machineBase };
}

function parseDropModelContract(raw: unknown): Pick<EconomyConfig, 'diminishing' | 'machineBase'> | null {
  const defaults = recommendedDefaults();
  if (!raw || typeof raw !== 'object') return null;

  const source = raw as Record<string, unknown>;
  const machineBaseJson = (source.machine_base_json || {}) as Record<string, unknown>;
  const machineBase = { ...defaults.machineBase };

  for (const key of Object.keys(machineBase) as MachineType[]) {
    const entry = (machineBaseJson[key] || {}) as Record<string, unknown>;
    const baseRate = Number(entry.baseRatePerMin ?? machineBase[key].baseRatePerMin);
    const maxMultiplier = Number(entry.maxMultiplier ?? machineBase[key].maxIntensityFactor);
    const target = Math.min(maxMultiplier, Number(entry.targetIntensityFactor ?? machineBase[key].targetIntensityFactor));
    const high = Math.min(maxMultiplier, Number(entry.highIntensityFactor ?? machineBase[key].highIntensityFactor));
    machineBase[key] = {
      baseRatePerMin: Number.isFinite(baseRate) ? baseRate : machineBase[key].baseRatePerMin,
      targetIntensityFactor: Number.isFinite(target) ? target : machineBase[key].targetIntensityFactor,
      highIntensityFactor: Number.isFinite(high) ? high : machineBase[key].highIntensityFactor,
      maxIntensityFactor: Number.isFinite(maxMultiplier) ? maxMultiplier : machineBase[key].maxIntensityFactor,
    };
  }

  return {
    diminishing: {
      fullRateUntilMin: Number(source.full_rate_until_min ?? defaults.diminishing.fullRateUntilMin),
      reducedRateUntilMin: Number(source.reduced_rate_until_min ?? defaults.diminishing.reducedRateUntilMin),
      lowRateUntilMin: Number(source.low_rate_until_min ?? defaults.diminishing.lowRateUntilMin),
      postLimitFactor: Number(source.post_limit_factor ?? defaults.diminishing.postLimitFactor),
    },
    machineBase,
  };
}

function toDropModelContractMachineBase(machineBase: EconomyConfig['machineBase']) {
  const result: Record<string, Record<string, number>> = {};
  for (const key of Object.keys(machineBase) as MachineType[]) {
    const entry = machineBase[key];
    const maxMultiplier = Math.max(entry.maxIntensityFactor, entry.highIntensityFactor, entry.targetIntensityFactor, 1);
    result[key] = {
      baseRatePerMin: round2(entry.baseRatePerMin),
      maxMultiplier: round2(maxMultiplier),
      maxDropsPerMinute: round2(entry.baseRatePerMin * maxMultiplier * 1.8),
      spikeRatioThreshold: 1.8,
      spikeWindowSec: 20,
      sustainedWindowSec: 60,
      sustainedHighEffortRatio: 0.55,
    };
  }
  return result;
}

function validateEconomyConfig(config: EconomyConfig): EconomyValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const capChecks: Array<[number, keyof typeof SAFE_RANGES, string]> = [
    [config.maxDropsPerSession, 'maxDropsPerSession', 'Max drops/session'],
    [config.maxDropsPerDay, 'maxDropsPerDay', 'Max drops/day'],
    [config.maxDropsPerWeek, 'maxDropsPerWeek', 'Max drops/week'],
    [config.maxRewardedSessionsPerDay, 'maxRewardedSessionsPerDay', 'Max rewarded sessions/day'],
  ];

  for (const [value, key, label] of capChecks) {
    const range = SAFE_RANGES[key];
    if (!Number.isFinite(value) || value <= 0) errors.push(`${label} must be a positive number.`);
    if (value < range.min || value > range.max) {
      errors.push(`${label} must be between ${range.min} and ${range.max}.`);
    }
    if (value < range.recommended[0] || value > range.recommended[1]) {
      warnings.push(`${label} is outside recommended range (${range.recommended[0]}-${range.recommended[1]}).`);
    }
  }

  if (config.maxDropsPerSession > config.maxDropsPerDay) {
    errors.push('Max drops/session cannot exceed max drops/day.');
  }
  if (config.maxDropsPerDay > config.maxDropsPerWeek) {
    errors.push('Max drops/day cannot exceed max drops/week.');
  }

  const d = config.diminishing;
  if (d.fullRateUntilMin <= 0) errors.push('Full-rate threshold must be greater than 0.');
  if (!(d.fullRateUntilMin <= d.reducedRateUntilMin && d.reducedRateUntilMin <= d.lowRateUntilMin)) {
    errors.push('Threshold ordering must be full <= reduced <= low.');
  }
  if (d.postLimitFactor < 0 || d.postLimitFactor > 1) {
    errors.push('Post-limit factor must be in [0, 1].');
  }

  for (const [machineType, settings] of Object.entries(config.machineBase)) {
    if (settings.baseRatePerMin <= 0) errors.push(`${machineType}: base rate must be > 0.`);
    if (settings.targetIntensityFactor <= 0) errors.push(`${machineType}: target factor must be > 0.`);
    if (settings.targetIntensityFactor > settings.highIntensityFactor || settings.highIntensityFactor > settings.maxIntensityFactor) {
      errors.push(`${machineType}: intensity factors must satisfy target <= high <= max.`);
    }
  }

  for (const [category, band] of Object.entries(config.priceBandJson || {})) {
    if (!Number.isFinite(Number(band.min)) || !Number.isFinite(Number(band.max))) {
      errors.push(`Price band "${category}" must have numeric min and max.`);
      continue;
    }
    if (Number(band.min) < 0 || Number(band.max) < 0) {
      errors.push(`Price band "${category}" cannot be negative.`);
    }
    if (Number(band.min) > Number(band.max)) {
      errors.push(`Price band "${category}" requires min <= max.`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

function computeRisk(config: EconomyConfig, burnMintRatio: number, top1SharePct: number): EconomySummary['risk'] {
  const inflationProne = config.maxDropsPerDay > 700 || config.maxDropsPerWeek > 4000 || config.maxDropsPerSession > 220;
  const ratioPct = burnMintRatio * 100;

  // Healthy range: 20–80% spend/earn ratio.
  // <10% = severe accumulation (inflationary), >120% = severe drain (deflationary).
  // Both extremes are red; mild deviations are yellow.
  const severeImbalance = ratioPct < 10 || ratioPct > 120;
  const mildImbalance = ratioPct < 20 || ratioPct > 80;

  if (inflationProne || severeImbalance || top1SharePct > 35) return 'red';
  if (mildImbalance || top1SharePct > 20) return 'yellow';
  return 'green';
}

function riskLabel(risk: EconomySummary['risk']) {
  if (risk === 'green') return 'Stable';
  if (risk === 'yellow') return 'Watch';
  return 'High risk';
}

async function verifyGymAccess(gymId: string) {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: 'Not authenticated' } as const;
  if (profile.role === 'superadmin') return { ok: true, profile } as const;
  if (profile.role !== 'gym_owner' && profile.role !== 'gym_admin') {
    return { ok: false, error: 'Unauthorized role' } as const;
  }

  const supabase = getAdminClient();
  if (!supabase) return { ok: false, error: 'Admin client not available' } as const;
  const { data: gym } = await supabase.from('gyms').select('owner_id').eq('id', gymId).single();
  if (!gym) return { ok: false, error: 'Gym not found' } as const;

  const ownsGym = (gym as { owner_id: string | null }).owner_id === profile.id;
  const isAssignedGym = profile.assigned_gym_id === gymId;
  if (!ownsGym && !isAssignedGym) return { ok: false, error: 'Unauthorized' } as const;
  return { ok: true, profile } as const;
}

function applyDiminishing(rawPerMin: number, durationMin: number, d: DiminishingThresholds) {
  const fullMins = Math.min(durationMin, d.fullRateUntilMin);
  const reducedMins = Math.max(0, Math.min(durationMin, d.reducedRateUntilMin) - d.fullRateUntilMin);
  const lowMins = Math.max(0, Math.min(durationMin, d.lowRateUntilMin) - d.reducedRateUntilMin);
  const postMins = Math.max(0, durationMin - d.lowRateUntilMin);
  return (fullMins * rawPerMin) + (reducedMins * rawPerMin * 0.8) + (lowMins * rawPerMin * 0.6) + (postMins * rawPerMin * d.postLimitFactor);
}

function intensityForInput(input: DropPreviewInput, config: EconomyConfig): { intensity: number; notes: string[] } {
  const notes: string[] = [];
  const machine = input.machineType;
  const settings = config.machineBase[machine] || config.machineBase.generic;
  let intensity = settings.targetIntensityFactor;

  if (machine === 'bike') {
    const rpm = Number(input.avgRpm || 0);
    if (rpm < 40) intensity = 0.4;
    else if (rpm < 60) intensity = 0.8;
    else if (rpm <= 85) intensity = settings.targetIntensityFactor;
    else if (rpm <= 105) intensity = settings.highIntensityFactor;
    else intensity = settings.maxIntensityFactor;
    if (rpm >= 85) notes.push('High intensity sustained bonus applied');
  } else if (machine === 'treadmill') {
    const speed = Number(input.avgSpeedKmh || 0);
    const incline = Number(input.inclinePct || 0);
    if (speed < 5.5) intensity = 0.85;
    else if (speed < 8.5) intensity = settings.targetIntensityFactor;
    else if (speed < 12) intensity = settings.highIntensityFactor;
    else intensity = settings.maxIntensityFactor;
    intensity = Math.min(settings.maxIntensityFactor, intensity + Math.min(Math.max(incline, 0), 15) * 0.015);
    if (speed >= 8.5 || incline >= 6) notes.push('High intensity sustained bonus applied');
  } else {
    const cadence = Number(input.cadencePerMin || 0);
    if (cadence < 70) intensity = 0.85;
    else if (cadence < 100) intensity = settings.targetIntensityFactor;
    else if (cadence < 130) intensity = settings.highIntensityFactor;
    else intensity = settings.maxIntensityFactor;
  }

  if (!Number.isFinite(intensity) || intensity <= 0) intensity = settings.targetIntensityFactor;
  return { intensity, notes };
}

/**
 * TODO(supabase-dba): replace this mocked simulation with RPC contract:
 * preview_drop_calculation(
 *   p_gym_id uuid,
 *   p_machine_type text,
 *   p_duration_min int,
 *   p_avg_rpm numeric,
 *   p_avg_speed_kmh numeric,
 *   p_incline_pct numeric,
 *   p_cadence_per_min numeric,
 *   p_simulate_spikes boolean
 * ) returns jsonb
 */
function mockPreviewCalculation(config: EconomyConfig, input: DropPreviewInput): DropPreviewResult {
  const machine = config.machineBase[input.machineType] || config.machineBase.generic;
  const duration = clampNumber(Math.round(input.durationMin || 0), 1, 240);
  const { intensity, notes } = intensityForInput(input, config);

  let rawPerMin = machine.baseRatePerMin * intensity;

  if (input.simulateSpikes) {
    rawPerMin *= 0.88;
    notes.push('Short spike ignored by anti-spike filter');
  }

  const expectedRawDrops = round2(duration * rawPerMin);
  const adjustedDrops = round2(applyDiminishing(rawPerMin, duration, config.diminishing));
  const reducedByDiminishing = round2(Math.max(0, expectedRawDrops - adjustedDrops));

  const finalDrops = Math.min(adjustedDrops, config.maxDropsPerSession);
  const appliedCap = finalDrops < adjustedDrops ? 'session_cap' : 'none';
  if (appliedCap === 'session_cap') notes.push('Session hit per-session cap');

  return {
    expectedRawDrops,
    adjustedDrops,
    reducedByDiminishing,
    appliedCap,
    finalDrops: round2(finalDrops),
    explanation: Array.from(new Set(notes)),
    source: 'mock',
  };
}

export async function getEconomyConfig(gymId: string) {
  const auth = await verifyGymAccess(gymId);
  if (!auth.ok) return { success: false, error: auth.error };

  const supabase = getAdminClient();
  if (!supabase) return { success: false, error: 'Admin client not available' };

  const [cfgGym, cfgGlobal, modelCfgGym, modelCfgGlobal, snapshotsRes, sessionsRes, rewardsRes, complianceRes] = await Promise.all([
    (supabase.from('tokenomics_config') as any).select('*').eq('gym_id', gymId).maybeSingle(),
    (supabase.from('tokenomics_config') as any).select('*').is('gym_id', null).maybeSingle(),
    (supabase.from('drop_model_config') as any)
      .select('full_rate_until_min,reduced_rate_until_min,low_rate_until_min,post_limit_factor,machine_base_json,updated_at')
      .eq('gym_id', gymId)
      .maybeSingle(),
    (supabase.from('drop_model_config') as any)
      .select('full_rate_until_min,reduced_rate_until_min,low_rate_until_min,post_limit_factor,machine_base_json,updated_at')
      .eq('gym_id', null)
      .maybeSingle(),
    (supabase.from('economy_snapshots_daily') as any)
      .select('minted_drops, burned_drops, burn_mint_ratio, top1_share_pct')
      .eq('gym_id', gymId)
      .order('snapshot_date', { ascending: false })
      .limit(30),
    (supabase.from('sessions') as any)
      .select('drops_earned')
      .eq('gym_id', gymId)
      .eq('is_active', false)
      .gte('started_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .limit(3000),
    (supabase.from('rewards') as any)
      .select('id, name, reward_type, price_drops, is_active, price_calc_mode, base_price_rsd, discount_percent, final_price_rsd_snapshot, drops_per_rsd_snapshot')
      .eq('gym_id', gymId)
      .eq('is_active', true)
      .order('price_drops', { ascending: false })
      .limit(300),
    ((supabase.rpc as any)('get_gym_reward_compliance_discount_aware', { p_gym_id: gymId }) as any),
  ]);

  const cfg = (cfgGym.data || cfgGlobal.data) as Record<string, unknown> | null;
  if (!cfg) return { success: false, error: 'tokenomics_config not found (run tokenomics migration)' };
  if (snapshotsRes.error && snapshotsRes.error.code !== 'PGRST116') return { success: false, error: snapshotsRes.error.message };
  if (sessionsRes.error) return { success: false, error: sessionsRes.error.message };
  if (rewardsRes.error) return { success: false, error: rewardsRes.error.message };

  const defaults = recommendedDefaults();
  const priceBandJson = parsePriceBands(cfg.price_band_json);
  const dropModelContract = parseDropModelContract(modelCfgGym.data || modelCfgGlobal.data);
  const meta = dropModelContract || parseDropModel((cfg.price_band_json as Record<string, unknown> | null)?.[DROP_MODEL_META_KEY]);
  const rawDropsPerRsd = Number(cfg.drops_per_rsd);
  const dropsPerRsd = Number.isFinite(rawDropsPerRsd) && rawDropsPerRsd > 0 ? rawDropsPerRsd : defaults.dropsPerRsd;
  const currencyCode = typeof cfg.currency_code === 'string' && cfg.currency_code.trim() ? cfg.currency_code.trim() : defaults.currencyCode;
  const calibrationMeta = (cfg.calibration_meta && typeof cfg.calibration_meta === 'object') ? cfg.calibration_meta as Record<string, unknown> : undefined;
  const rawEnforcementMode = cfg.band_enforcement_mode;
  const bandEnforcementMode: BandEnforcementMode = rawEnforcementMode === 'enforce' ? 'enforce' : 'warn';

  const config: EconomyConfig = {
    maxDropsPerSession: Number(cfg.max_drops_per_session || defaults.maxDropsPerSession),
    maxDropsPerDay: Number(cfg.max_drops_per_day || defaults.maxDropsPerDay),
    maxDropsPerWeek: Number(cfg.max_drops_per_week || defaults.maxDropsPerWeek),
    maxRewardedSessionsPerDay: Number(cfg.max_rewarded_sessions_per_day || defaults.maxRewardedSessionsPerDay),
    maxCheckinDropsPerDay: Number(cfg.max_checkin_drops_per_day || defaults.maxCheckinDropsPerDay),
    diminishing: meta.diminishing,
    machineBase: meta.machineBase,
    priceBandJson,
    dropsPerRsd,
    currencyCode,
    calibrationMeta,
    bandEnforcementMode,
  };

  const snapshots = (snapshotsRes.data || []) as Array<{
    minted_drops: number;
    burned_drops: number;
    burn_mint_ratio: number;
    top1_share_pct: number;
  }>;
  const sessions = (sessionsRes.data || []) as Array<{ drops_earned: number | null }>;
  const rewards = (rewardsRes.data || []) as Array<{
    id: string;
    name: string;
    reward_type: string;
    price_drops: number;
    price_calc_mode?: string;
    base_price_rsd?: number | null;
    discount_percent?: number | null;
    final_price_rsd_snapshot?: number | null;
    drops_per_rsd_snapshot?: number | null;
  }>;
  const minted30d = snapshots.reduce((sum, s) => sum + Number(s.minted_drops || 0), 0);
  const burned30d = snapshots.reduce((sum, s) => sum + Number(s.burned_drops || 0), 0);
  const burnMintRatio = minted30d > 0 ? burned30d / minted30d : 0;
  const top1SharePct = snapshots.length > 0
    ? snapshots.reduce((sum, s) => sum + Number(s.top1_share_pct || 0), 0) / snapshots.length
    : 0;
  const capHits = sessions.filter((s) => Number(s.drops_earned || 0) >= config.maxDropsPerSession).length;
  const capHitRate7d = sessions.length > 0 ? capHits / sessions.length : 0;

  const risk = computeRisk(config, burnMintRatio, top1SharePct);
  const draftRaw = (cfg.price_band_json as Record<string, unknown> | null)?.[DROP_MODEL_DRAFT_KEY];

  type RpcComplianceRow = {
    reward_id: string;
    reward_name: string;
    reward_type: string;
    final_price_drops: number;
    discount_percent: number;
    price_calc_mode: string;
    normalized_price_drops: number;
    band_min: number | null;
    band_max: number | null;
    in_band: boolean;
    compliance_reason: string;
  };

  const rpcRows = (!complianceRes.error && Array.isArray(complianceRes.data))
    ? complianceRes.data as RpcComplianceRow[]
    : null;

  const guardrails: EconomyRewardGuardrail[] = rpcRows
    ? rpcRows.map((c) => {
        const r = rewards.find((rw) => rw.id === c.reward_id);
        return {
          id: c.reward_id,
          name: c.reward_name,
          rewardType: c.reward_type || 'physical',
          priceDrops: Number(c.final_price_drops || 0),
          normalizedDrops: Math.round(Number(c.normalized_price_drops || c.final_price_drops || 0)),
          minRecommended: c.band_min != null ? Number(c.band_min) : null,
          maxRecommended: c.band_max != null ? Number(c.band_max) : null,
          inBand: Boolean(c.in_band),
          complianceReason: c.compliance_reason || '',
          priceCalcMode: (c.price_calc_mode === 'discount_from_rsd' ? 'discount_from_rsd' : 'manual_drops') as 'manual_drops' | 'discount_from_rsd',
          basePriceRsd: r?.base_price_rsd != null ? Number(r.base_price_rsd) : null,
          discountPercent: c.discount_percent != null ? Number(c.discount_percent) : null,
          finalPriceRsdSnapshot: r?.final_price_rsd_snapshot != null ? Number(r.final_price_rsd_snapshot) : null,
        };
      })
    : rewards.map((r) => {
        const band = priceBandJson[r.reward_type] || priceBandJson.physical || null;
        const minRecommended = band ? Number(band.min) : null;
        const maxRecommended = band ? Number(band.max) : null;
        const mode = r.price_calc_mode === 'discount_from_rsd' ? 'discount_from_rsd' : 'manual_drops';
        const finalDrops = Number(r.price_drops || 0);
        const disc = Number(r.discount_percent || 0);

        const normalizedDrops = mode === 'discount_from_rsd' && disc > 0 && disc < 100
          ? Math.round(finalDrops / (1 - disc / 100))
          : finalDrops;

        const noBand = minRecommended == null || maxRecommended == null;
        const inBand = noBand || (normalizedDrops >= minRecommended && normalizedDrops <= maxRecommended);

        let complianceReason = '';
        if (noBand) {
          complianceReason = 'no_band_defined';
        } else if (inBand) {
          complianceReason = disc > 0 && mode === 'discount_from_rsd' ? 'in_band_discount_normalized' : 'in_band';
        } else if (normalizedDrops < minRecommended!) {
          complianceReason = disc > 0 && mode === 'discount_from_rsd' ? 'below_band_min_discount_normalized' : 'below_band_min';
        } else {
          complianceReason = disc > 0 && mode === 'discount_from_rsd' ? 'above_band_max_discount_normalized' : 'above_band_max';
        }

        return {
          id: r.id,
          name: r.name,
          rewardType: r.reward_type || 'physical',
          priceDrops: finalDrops,
          normalizedDrops,
          minRecommended,
          maxRecommended,
          inBand,
          complianceReason,
          priceCalcMode: mode as 'manual_drops' | 'discount_from_rsd',
          basePriceRsd: r.base_price_rsd != null ? Number(r.base_price_rsd) : null,
          discountPercent: r.discount_percent != null ? Number(r.discount_percent) : null,
          finalPriceRsdSnapshot: r.final_price_rsd_snapshot != null ? Number(r.final_price_rsd_snapshot) : null,
        };
      });

  return {
    success: true,
    data: {
      config,
      summary: {
        burnMintRatio: round2(burnMintRatio),
        top1SharePct: round2(top1SharePct),
        minted30d,
        burned30d,
        capHitRate7d: round2(capHitRate7d),
        risk,
        riskLabel: riskLabel(risk),
      } as EconomySummary,
      draftExists: Boolean(draftRaw),
      defaults: recommendedDefaults(),
      guardrails,
    },
  };
}

export async function updateEconomyConfig(
  gymId: string,
  payload: EconomyConfig | EconomyConfigUpdateInput,
  mode: 'draft' | 'publish',
) {
  const auth = await verifyGymAccess(gymId);
  if (!auth.ok) return { success: false, error: auth.error };

  const supabase = getAdminClient();
  if (!supabase) return { success: false, error: 'Admin client not available' };

  const currentConfigResult = await getEconomyConfig(gymId);
  if (!currentConfigResult.success || !currentConfigResult.data) {
    return { success: false, error: currentConfigResult.error || 'Failed to load current config' };
  }
  const currentConfig = currentConfigResult.data.config;

  const mergedPayload: EconomyConfig = {
    ...currentConfig,
    ...payload,
    maxDropsPerSession: Math.max(1, Math.round(Number(payload.maxDropsPerSession ?? currentConfig.maxDropsPerSession))),
    maxDropsPerDay: Math.max(1, Math.round(Number(payload.maxDropsPerDay ?? currentConfig.maxDropsPerDay))),
    diminishing: {
      ...currentConfig.diminishing,
      ...(payload as Partial<EconomyConfig>).diminishing,
    },
    machineBase: {
      ...currentConfig.machineBase,
      ...(payload as Partial<EconomyConfig>).machineBase,
    },
    priceBandJson: (payload as Partial<EconomyConfig>).priceBandJson ?? currentConfig.priceBandJson,
  };
  mergedPayload.maxDropsPerDay = Math.max(mergedPayload.maxDropsPerSession, mergedPayload.maxDropsPerDay);
  mergedPayload.maxDropsPerWeek = Math.max(mergedPayload.maxDropsPerWeek, mergedPayload.maxDropsPerDay);

  const validation = validateEconomyConfig(mergedPayload);
  if (!validation.valid) return { success: false, error: validation.errors[0], validation };

  const { data: existing } = await (supabase.from('tokenomics_config') as any)
    .select('price_band_json')
    .eq('gym_id', gymId)
    .maybeSingle();
  const existingJson = ((existing as Record<string, unknown> | null)?.price_band_json || {}) as Record<string, unknown>;

  const mergedBands = { ...mergedPayload.priceBandJson } as Record<string, unknown>;
  const nextMeta = {
    diminishing: mergedPayload.diminishing,
    machineBase: mergedPayload.machineBase,
    updated_at: new Date().toISOString(),
  };

  const nextPriceBandJson: Record<string, unknown> = {
    ...mergedBands,
    [DROP_MODEL_META_KEY]: nextMeta,
  };

  let upsertPayload: Record<string, unknown> = {
    gym_id: gymId,
    updated_at: new Date().toISOString(),
  };

  if (mode === 'draft') {
    upsertPayload = {
      ...upsertPayload,
      price_band_json: {
        ...existingJson,
        [DROP_MODEL_DRAFT_KEY]: mergedPayload,
      },
    };
  } else {
    const dropsPerRsdVal = Number(mergedPayload.dropsPerRsd);
    const currencyCodeVal = typeof mergedPayload.currencyCode === 'string' && mergedPayload.currencyCode.trim()
      ? mergedPayload.currencyCode.trim() : 'RSD';

    upsertPayload = {
      ...upsertPayload,
      max_drops_per_session: Math.round(mergedPayload.maxDropsPerSession),
      max_drops_per_day: Math.round(mergedPayload.maxDropsPerDay),
      max_drops_per_week: Math.round(mergedPayload.maxDropsPerWeek),
      max_rewarded_sessions_per_day: Math.round(mergedPayload.maxRewardedSessionsPerDay),
      max_checkin_drops_per_day: Math.round(mergedPayload.maxCheckinDropsPerDay),
      price_band_json: nextPriceBandJson,
      enabled_at: new Date().toISOString(),
      drops_per_rsd: Number.isFinite(dropsPerRsdVal) && dropsPerRsdVal > 0 ? dropsPerRsdVal : 2.0,
      currency_code: currencyCodeVal,
      calibration_meta: mergedPayload.calibrationMeta ?? {},
      band_enforcement_mode: mergedPayload.bandEnforcementMode === 'enforce' ? 'enforce' : 'warn',
    };
  }

  const { error } = await (supabase.from('tokenomics_config') as any)
    .upsert(upsertPayload, { onConflict: 'gym_id' });
  if (error) return { success: false, error: error.message };

  if (mode === 'publish') {
    const nowIso = new Date().toISOString();
    const dropModelPayload = {
      full_rate_until_min: Math.round(mergedPayload.diminishing.fullRateUntilMin),
      reduced_rate_until_min: Math.round(mergedPayload.diminishing.reducedRateUntilMin),
      low_rate_until_min: Math.round(mergedPayload.diminishing.lowRateUntilMin),
      post_limit_factor: round2(mergedPayload.diminishing.postLimitFactor),
      machine_base_json: toDropModelContractMachineBase(mergedPayload.machineBase),
      enabled_at: nowIso,
      updated_at: nowIso,
    };
    const { data: updatedRows, error: modelUpdateError } = await (supabase.from('drop_model_config') as any)
      .update(dropModelPayload)
      .eq('gym_id', gymId)
      .select('id');
    if (modelUpdateError) {
      return { success: false, error: `Saved tokenomics but failed drop model update: ${modelUpdateError.message}` };
    }
    if (!Array.isArray(updatedRows) || updatedRows.length === 0) {
      const { error: modelInsertError } = await (supabase.from('drop_model_config') as any)
        .insert({
          gym_id: gymId,
          ...dropModelPayload,
        });
      if (modelInsertError) {
        return { success: false, error: `Saved tokenomics but failed drop model insert: ${modelInsertError.message}` };
      }
    }

    // Keep gym check-in setting aligned with economy config for consistency.
    const { error: gymSyncError } = await (supabase.from('gyms') as any)
      .update({
        checkin_drops: Math.round(mergedPayload.maxCheckinDropsPerDay),
        updated_at: new Date().toISOString(),
      })
      .eq('id', gymId);
    if (gymSyncError) return { success: false, error: `Saved economy but failed check-in sync: ${gymSyncError.message}` };
  }

  revalidatePath(`/dashboard/gym/${gymId}/economy`);
  revalidatePath(`/dashboard/gym/${gymId}/dashboard`);
  revalidatePath(`/dashboard/gym/${gymId}/store`);
  revalidatePath(`/dashboard/gym/${gymId}/checkin`);

  return {
    success: true,
    validation,
    message: mode === 'draft' ? 'Draft saved' : 'Settings published',
  };
}

export async function getGymConversionRate(gymId: string): Promise<{ success: boolean; dropsPerRsd: number; currencyCode: string; error?: string }> {
  const auth = await verifyGymAccess(gymId);
  if (!auth.ok) return { success: false, dropsPerRsd: 2.0, currencyCode: 'RSD', error: auth.error };

  const supabase = getAdminClient();
  if (!supabase) return { success: false, dropsPerRsd: 2.0, currencyCode: 'RSD', error: 'Admin client not available' };

  const [gymCfg, globalCfg] = await Promise.all([
    (supabase.from('tokenomics_config') as any).select('drops_per_rsd, currency_code').eq('gym_id', gymId).maybeSingle(),
    (supabase.from('tokenomics_config') as any).select('drops_per_rsd, currency_code').is('gym_id', null).maybeSingle(),
  ]);

  const cfg = (gymCfg.data || globalCfg.data) as Record<string, unknown> | null;
  const raw = Number(cfg?.drops_per_rsd);
  const dropsPerRsd = Number.isFinite(raw) && raw > 0 ? raw : 2.0;
  const currencyCode = typeof cfg?.currency_code === 'string' && (cfg.currency_code as string).trim() ? (cfg.currency_code as string).trim() : 'RSD';

  return { success: true, dropsPerRsd, currencyCode };
}

export async function computeDiscountPrice(basePriceRsd: number, discountPercent: number, dropsPerRsd: number): Promise<{ effectiveRsd: number; effectiveDrops: number }> {
  const effectiveRsd = basePriceRsd * (1 - Math.min(95, Math.max(0, discountPercent)) / 100);
  const effectiveDrops = Math.max(1, Math.round(effectiveRsd * dropsPerRsd));
  return { effectiveRsd: Math.round(effectiveRsd * 100) / 100, effectiveDrops };
}

export async function previewDropCalculation(gymId: string, input: DropPreviewInput) {
  const auth = await verifyGymAccess(gymId);
  if (!auth.ok) return { success: false, error: auth.error };

  const cfgResult = await getEconomyConfig(gymId);
  if (!cfgResult.success || !cfgResult.data) return { success: false, error: cfgResult.error };
  const config = cfgResult.data.config;

  const supabase = await createUserClient();
  if (!supabase) {
    return { success: true, data: mockPreviewCalculation(config, input), backendDependency: 'User client unavailable, used mock preview.' };
  }

  const rpcPayload = {
    p_gym_id: gymId,
    p_machine_type: input.machineType,
    p_duration_min: Math.round(input.durationMin),
    p_avg_rpm: input.avgRpm ?? null,
    p_avg_speed_kmh: input.avgSpeedKmh ?? null,
    p_incline_pct: input.inclinePct ?? null,
    p_cadence_per_min: input.cadencePerMin ?? null,
    p_calories_fallback: null,
    p_simulate_spikes: Boolean(input.simulateSpikes),
  };

  const { data, error } = await (supabase.rpc('preview_drop_calculation', rpcPayload as any) as any);
  if (!error && data) {
    const row = Array.isArray(data) ? data[0] : data;
    const result = (row?.preview || row?.payload || row?.preview_drop_calculation || row) as Record<string, unknown>;

    // Accept both camelCase and snake_case RPC payloads.
    const expectedRawDrops = toNum(result?.expectedRawDrops ?? result?.expected_raw_drops);
    const adjustedDrops = toNum(result?.adjustedDrops ?? result?.adjusted_drops);
    const reducedByDiminishing = toNum(result?.reducedByDiminishing ?? result?.reduced_by_diminishing);
    const finalDrops = toNum(result?.finalDrops ?? result?.final_drops);
    const appliedCapRaw = result?.appliedCap ?? result?.applied_cap;
    const explanationRaw = result?.explanation ?? result?.notes;

    if (finalDrops != null) {
      return {
        success: true,
        data: {
          expectedRawDrops: round2(expectedRawDrops ?? 0),
          adjustedDrops: round2(adjustedDrops ?? 0),
          reducedByDiminishing: round2(reducedByDiminishing ?? 0),
          appliedCap: appliedCapRaw === 'session_cap' ? 'session_cap' : 'none',
          finalDrops: round2(finalDrops),
          explanation: Array.isArray(explanationRaw) ? explanationRaw.map((x) => String(x)) : [],
          source: 'rpc',
        } as DropPreviewResult,
      };
    }
  }

  return {
    success: true,
    data: mockPreviewCalculation(config, input),
    backendDependency: error?.message
      ? `Preview RPC error: ${error.message}. Using estimated mode.`
      : 'RPC preview_drop_calculation is missing or returned invalid payload. Using estimated mode.',
  };
}


export async function getBandEnforcementMode(
  gymId: string
): Promise<{ success: boolean; mode: BandEnforcementMode; error?: string }> {
  const auth = await verifyGymAccess(gymId);
  if (!auth.ok) return { success: false, mode: 'warn', error: auth.error };

  const supabase = getAdminClient();
  if (!supabase) return { success: false, mode: 'warn', error: 'Admin client not available' };

  const { data } = await (supabase.from('tokenomics_config') as any)
    .select('band_enforcement_mode')
    .eq('gym_id', gymId)
    .maybeSingle();

  const raw = (data as Record<string, unknown> | null)?.band_enforcement_mode;
  return { success: true, mode: raw === 'enforce' ? 'enforce' : 'warn' };
}
