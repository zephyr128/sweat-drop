import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({
  getCurrentProfile: vi.fn(),
}));

vi.mock('@/lib/utils/supabase-admin', () => ({
  getAdminClient: vi.fn(),
}));

vi.mock('@/lib/supabase-server', () => ({
  createClient: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { getCurrentProfile } from '@/lib/auth';
import { getAdminClient } from '@/lib/utils/supabase-admin';
import { createClient } from '@/lib/supabase-server';
import { getEconomyConfig, previewDropCalculation, updateEconomyConfig, computeDiscountPrice } from '@/lib/actions/economy-actions';

function createSupabaseMock(overrides?: { tokenomicsData?: Record<string, unknown> }) {
  const upsert = vi.fn(async () => ({ error: null }));
  const rpc = vi.fn(async () => ({ data: null, error: { message: 'RPC missing' } }));

  const tokenomicsData = overrides?.tokenomicsData ?? {
    max_drops_per_session: 120,
    max_drops_per_day: 300,
    max_drops_per_week: 1500,
    max_rewarded_sessions_per_day: 4,
    max_checkin_drops_per_day: 1,
    price_band_json: {},
    drops_per_rsd: 2.5,
    currency_code: 'RSD',
    calibration_meta: {},
  };

  const from = vi.fn((table: string) => {
    if (table === 'gyms') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({ data: { owner_id: 'owner-1' }, error: null })),
          })),
        })),
      };
    }
    if (table === 'tokenomics_config') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: tokenomicsData,
              error: null,
            })),
          })),
          is: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          })),
        })),
        upsert,
      };
    }
    if (table === 'economy_snapshots_daily') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(async () => ({
                data: [{ minted_drops: 100, burned_drops: 20, burn_mint_ratio: 0.2, top1_share_pct: 8 }],
                error: null,
              })),
            })),
          })),
        })),
      };
    }
    if (table === 'sessions') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              gte: vi.fn(() => ({
                limit: vi.fn(async () => ({ data: [{ drops_earned: 120 }], error: null })),
              })),
            })),
          })),
        })),
      };
    }
    if (table === 'rewards') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(async () => ({ data: [], error: null })),
              })),
            })),
          })),
        })),
      };
    }
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        })),
      })),
    };
  });

  return { from, rpc, _spies: { upsert, rpc } };
}

describe('economy-actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthorized role', async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({
      id: 'u-1',
      role: 'receptionist',
      assigned_gym_id: 'gym-1',
    } as any);
    vi.mocked(getAdminClient).mockReturnValue(createSupabaseMock() as any);

    const result = await getEconomyConfig('gym-1');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Unauthorized role');
  });

  it('returns mock preview when RPC is unavailable', async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({
      id: 'owner-1',
      role: 'gym_owner',
      assigned_gym_id: null,
    } as any);
    vi.mocked(getAdminClient).mockReturnValue(createSupabaseMock() as any);
    vi.mocked(createClient).mockResolvedValue(createSupabaseMock() as any);

    const result = await previewDropCalculation('gym-1', {
      machineType: 'bike',
      durationMin: 30,
      avgRpm: 90,
      simulateSpikes: true,
    });

    expect(result.success).toBe(true);
    expect(result.data?.source).toBe('mock');
    expect(result.backendDependency).toContain('Preview RPC error');
  });

  it('uses RPC preview when payload is snake_case', async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({
      id: 'owner-1',
      role: 'gym_owner',
      assigned_gym_id: null,
    } as any);
    const supabase = createSupabaseMock();
    (supabase._spies.rpc as any).mockImplementation(async (fnName: string) => {
      if (fnName === 'preview_drop_calculation') {
        return {
          data: {
            expected_raw_drops: 222.6,
            adjusted_drops: 183.65,
            reduced_by_diminishing: 38.95,
            applied_cap: 'none',
            final_drops: 183.65,
            notes: ['RPC result'],
          },
          error: null,
        };
      }
      return { data: null, error: { message: 'RPC missing' } };
    });
    vi.mocked(getAdminClient).mockReturnValue(supabase as any);
    vi.mocked(createClient).mockResolvedValue(supabase as any);

    const result = await previewDropCalculation('gym-1', {
      machineType: 'bike',
      durationMin: 30,
      avgRpm: 90,
      simulateSpikes: false,
    });

    expect(result.success).toBe(true);
    expect(result.data?.source).toBe('rpc');
    expect(result.data?.finalDrops).toBe(183.65);
    expect(result.backendDependency).toBeUndefined();
  });

  it('uses RPC preview when payload is wrapped under payload key', async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({
      id: 'owner-1',
      role: 'gym_owner',
      assigned_gym_id: null,
    } as any);
    const supabase = createSupabaseMock();
    (supabase._spies.rpc as any).mockImplementation(async (fnName: string) => {
      if (fnName === 'preview_drop_calculation') {
        return {
          data: {
            payload: {
              expectedRawDrops: 54,
              adjustedDrops: 54,
              reducedByDiminishing: 0,
              appliedCap: 'none',
              finalDrops: 54,
              explanation: ['bike_rpm_intensity_applied'],
            },
          },
          error: null,
        };
      }
      return { data: null, error: { message: 'RPC missing' } };
    });
    vi.mocked(getAdminClient).mockReturnValue(supabase as any);
    vi.mocked(createClient).mockResolvedValue(supabase as any);

    const result = await previewDropCalculation('gym-1', {
      machineType: 'bike',
      durationMin: 30,
      avgRpm: 90,
      simulateSpikes: false,
    });

    expect(result.success).toBe(true);
    expect(result.data?.source).toBe('rpc');
    expect(result.data?.finalDrops).toBe(54);
    expect(result.backendDependency).toBeUndefined();
  });

  it('loads conversion fields from DB', async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({
      id: 'owner-1',
      role: 'gym_owner',
      assigned_gym_id: null,
    } as any);
    vi.mocked(getAdminClient).mockReturnValue(createSupabaseMock({
      tokenomicsData: {
        max_drops_per_session: 120,
        max_drops_per_day: 300,
        max_drops_per_week: 1500,
        max_rewarded_sessions_per_day: 4,
        max_checkin_drops_per_day: 1,
        price_band_json: {},
        drops_per_rsd: 1.8,
        currency_code: 'RSD',
        calibration_meta: { coffee_anchor: 200 },
      },
    }) as any);

    const result = await getEconomyConfig('gym-1');
    expect(result.success).toBe(true);
    expect(result.data?.config.dropsPerRsd).toBe(1.8);
    expect(result.data?.config.currencyCode).toBe('RSD');
    expect(result.data?.config.calibrationMeta).toEqual({ coffee_anchor: 200 });
  });

  it('defaults conversion when DB fields missing', async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({
      id: 'owner-1',
      role: 'gym_owner',
      assigned_gym_id: null,
    } as any);
    vi.mocked(getAdminClient).mockReturnValue(createSupabaseMock({
      tokenomicsData: {
        max_drops_per_session: 120,
        max_drops_per_day: 300,
        max_drops_per_week: 1500,
        max_rewarded_sessions_per_day: 4,
        max_checkin_drops_per_day: 1,
        price_band_json: {},
      },
    }) as any);

    const result = await getEconomyConfig('gym-1');
    expect(result.success).toBe(true);
    expect(result.data?.config.dropsPerRsd).toBe(2.0);
    expect(result.data?.config.currencyCode).toBe('RSD');
  });

  it('publish persists conversion fields', async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({
      id: 'owner-1',
      role: 'gym_owner',
      assigned_gym_id: null,
    } as any);
    const supabase = createSupabaseMock();

    const updateFn = vi.fn(async () => ({ data: [{ id: 'dm-1' }], error: null }));
    const insertFn = vi.fn(async () => ({ error: null }));
    const gymUpdateFn = vi.fn(async () => ({ error: null }));

    const origFrom = supabase.from;
    supabase.from = vi.fn((table: string) => {
      if (table === 'drop_model_config') {
        return {
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              select: vi.fn(async () => ({ data: [{ id: 'dm-1' }], error: null })),
            })),
          })),
          insert: insertFn,
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            })),
          })),
        } as any;
      }
      if (table === 'gyms') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({ data: { owner_id: 'owner-1' }, error: null })),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(async () => ({ error: null })),
          })),
        } as any;
      }
      return origFrom(table);
    }) as any;

    vi.mocked(getAdminClient).mockReturnValue(supabase as any);

    const result = await updateEconomyConfig(
      'gym-1',
      {
        maxDropsPerSession: 120,
        maxDropsPerDay: 300,
        maxDropsPerWeek: 1500,
        maxRewardedSessionsPerDay: 4,
        maxCheckinDropsPerDay: 1,
        dropsPerRsd: 1.8,
        currencyCode: 'RSD',
        calibrationMeta: { coffee_anchor: 200 },
      } as any,
      'publish',
    );

    expect(result.success).toBe(true);
    expect(supabase._spies.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        drops_per_rsd: 1.8,
        currency_code: 'RSD',
        calibration_meta: { coffee_anchor: 200 },
      }),
      expect.anything(),
    );
  });

  it('uses RPC compliance when get_gym_reward_compliance_discount_aware succeeds', async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({
      id: 'owner-1',
      role: 'gym_owner',
      assigned_gym_id: null,
    } as any);

    const supabase = createSupabaseMock();
    (supabase._spies.rpc as any).mockImplementation(async (fnName: string) => {
      if (fnName === 'get_gym_reward_compliance_discount_aware') {
        return {
          data: [{
            reward_id: 'r-1',
            reward_name: 'Coffee Discount',
            reward_type: 'coffee',
            final_price_drops: 160,
            discount_percent: 20,
            price_calc_mode: 'discount_from_rsd',
            normalized_price_drops: 200,
            band_min: 120,
            band_max: 220,
            in_band: true,
            compliance_reason: 'in_band_discount_normalized',
          }],
          error: null,
        };
      }
      return { data: null, error: { message: 'RPC missing' } };
    });

    vi.mocked(getAdminClient).mockReturnValue(supabase as any);

    const result = await getEconomyConfig('gym-1');
    expect(result.success).toBe(true);
    const guardrails = result.data?.guardrails ?? [];
    expect(guardrails.length).toBe(1);
    expect(guardrails[0].complianceReason).toBe('in_band_discount_normalized');
    expect(guardrails[0].normalizedDrops).toBe(200);
    expect(guardrails[0].inBand).toBe(true);
    expect(guardrails[0].priceCalcMode).toBe('discount_from_rsd');
  });

  it('falls back to JS compliance when RPC fails', async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({
      id: 'owner-1',
      role: 'gym_owner',
      assigned_gym_id: null,
    } as any);

    vi.mocked(getAdminClient).mockReturnValue(createSupabaseMock() as any);

    const result = await getEconomyConfig('gym-1');
    expect(result.success).toBe(true);
    expect(result.data?.guardrails).toEqual([]);
  });

  it('computeDiscountPrice returns correct formula results', async () => {
    const r1 = await computeDiscountPrice(200, 20, 2.0);
    expect(r1.effectiveRsd).toBe(160);
    expect(r1.effectiveDrops).toBe(320);

    const r2 = await computeDiscountPrice(200, 50, 2.0);
    expect(r2.effectiveRsd).toBe(100);
    expect(r2.effectiveDrops).toBe(200);

    const r3 = await computeDiscountPrice(4000, 50, 2.0);
    expect(r3.effectiveRsd).toBe(2000);
    expect(r3.effectiveDrops).toBe(4000);
  });

  it('blocks invalid publish payload', async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({
      id: 'owner-1',
      role: 'gym_owner',
      assigned_gym_id: null,
    } as any);
    const supabase = createSupabaseMock();
    vi.mocked(getAdminClient).mockReturnValue(supabase as any);

    const result = await updateEconomyConfig(
      'gym-1',
      {
        maxDropsPerSession: 0,
        maxDropsPerDay: 10,
        maxDropsPerWeek: 20,
        maxRewardedSessionsPerDay: 0,
        maxCheckinDropsPerDay: 1,
        diminishing: {
          fullRateUntilMin: 90,
          reducedRateUntilMin: 60,
          lowRateUntilMin: 30,
          postLimitFactor: 1.5,
        },
        machineBase: {
          treadmill: { baseRatePerMin: 1, targetIntensityFactor: 1, highIntensityFactor: 1, maxIntensityFactor: 1 },
          bike: { baseRatePerMin: 1, targetIntensityFactor: 1, highIntensityFactor: 1, maxIntensityFactor: 1 },
          elliptical: { baseRatePerMin: 1, targetIntensityFactor: 1, highIntensityFactor: 1, maxIntensityFactor: 1 },
          stepper: { baseRatePerMin: 1, targetIntensityFactor: 1, highIntensityFactor: 1, maxIntensityFactor: 1 },
          generic: { baseRatePerMin: 1, targetIntensityFactor: 1, highIntensityFactor: 1, maxIntensityFactor: 1 },
        },
        priceBandJson: {},
      },
      'publish',
    );

    expect(result.success).toBe(false);
    expect(supabase._spies.upsert).not.toHaveBeenCalled();
  });
});

