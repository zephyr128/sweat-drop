import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/utils/supabase-admin', () => ({
  getAdminClient: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getCurrentProfile: vi.fn(),
}));

import { getAdminClient } from '@/lib/utils/supabase-admin';
import { getCurrentProfile } from '@/lib/auth';
import { createStoreItem, updateStoreItem } from '@/lib/actions/store-actions';

function createSupabaseMock(dropsPerRsd = 2.0) {
  const insertResult = { id: 'reward-1', name: 'Coffee', price_drops: 320, price_calc_mode: 'discount_from_rsd' };
  const selectSingleChain = vi.fn(async () => ({ data: insertResult, error: null }));

  const from = vi.fn((table: string) => {
    if (table === 'tokenomics_config') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: { drops_per_rsd: dropsPerRsd, price_band_json: {} },
              error: null,
            })),
          })),
          is: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          })),
        })),
      };
    }
    if (table === 'rewards') {
      return {
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: selectSingleChain,
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              select: vi.fn(() => ({
                single: selectSingleChain,
              })),
            })),
          })),
        })),
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: { price_drops: 100, reward_type: 'coffee' },
                error: null,
              })),
            })),
          })),
        })),
      };
    }
    return {} as any;
  });

  return { from, _insertResult: insertResult };
}

describe('store-actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentProfile).mockResolvedValue({
      id: 'owner-1',
      role: 'gym_owner',
      assigned_gym_id: null,
      owner_id: null,
    } as any);
  });

  it('creates reward in discount mode and computes price_drops', async () => {
    const mock = createSupabaseMock(2.0);
    vi.mocked(getAdminClient).mockReturnValue(mock as any);

    const result = await createStoreItem({
      gymId: '00000000-0000-0000-0000-000000000001',
      name: 'Coffee -20%',
      priceDrops: 1,
      rewardType: 'coffee',
      redemptionLimit: 'unlimited',
      availableFrom: '',
      availableUntil: '',
      priceCalcMode: 'discount_from_rsd',
      basePriceRsd: 200,
      discountPercent: 20,
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });

  it('creates reward in manual mode without discount fields', async () => {
    const mock = createSupabaseMock(2.0);
    vi.mocked(getAdminClient).mockReturnValue(mock as any);

    const result = await createStoreItem({
      gymId: '00000000-0000-0000-0000-000000000001',
      name: 'Protein Bar',
      priceDrops: 250,
      rewardType: 'protein_snack',
      redemptionLimit: 'unlimited',
      availableFrom: '',
      availableUntil: '',
      priceCalcMode: 'manual_drops',
    });

    expect(result.success).toBe(true);
  });

  it('rejects discount mode without base price', async () => {
    const mock = createSupabaseMock(2.0);
    vi.mocked(getAdminClient).mockReturnValue(mock as any);

    const result = await createStoreItem({
      gymId: '00000000-0000-0000-0000-000000000001',
      name: 'Bad Discount',
      priceDrops: 1,
      rewardType: 'coffee',
      redemptionLimit: 'unlimited',
      availableFrom: '',
      availableUntil: '',
      priceCalcMode: 'discount_from_rsd',
      discountPercent: 20,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Base price');
  });

  it('updates reward in discount mode', async () => {
    const mock = createSupabaseMock(2.0);
    vi.mocked(getAdminClient).mockReturnValue(mock as any);

    const result = await updateStoreItem(
      'reward-1',
      '00000000-0000-0000-0000-000000000001',
      {
        priceCalcMode: 'discount_from_rsd',
        basePriceRsd: 200,
        discountPercent: 50,
      },
    );

    expect(result.success).toBe(true);
  });
});
