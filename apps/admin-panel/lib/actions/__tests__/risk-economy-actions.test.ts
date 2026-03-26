import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({
  getCurrentProfile: vi.fn(),
}));

vi.mock('@/lib/utils/supabase-admin', () => ({
  getAdminClient: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { getCurrentProfile } from '@/lib/auth';
import { getAdminClient } from '@/lib/utils/supabase-admin';
import {
  freezeUserDrops,
  getGymRiskDashboard,
  quarantineRedemption,
  updateGymEconomyConfig,
} from '@/lib/actions/risk-economy-actions';

function createSupabaseMock() {
  const upsert = vi.fn(async () => ({ error: null }));
  const insertFraud = vi.fn(async () => ({ error: null }));
  const insertAny = vi.fn(async () => ({ error: null }));
  const rpc = vi.fn(async () => ({ data: [{ success: true }], error: null }));

  const from = vi.fn((table: string) => {
    if (table === 'tokenomics_config') {
      return {
        upsert,
      };
    }
    if (table === 'fraud_events') {
      return {
        insert: insertFraud,
      };
    }
    if (table === 'redemptions') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({ data: { user_id: 'u-1' }, error: null })),
          })),
        })),
      };
    }
    if (table === 'sessions') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(async () => ({ data: [], error: null })),
            })),
          })),
        })),
      };
    }
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(async () => ({ data: { owner_id: 'owner-1' }, error: null })),
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          order: vi.fn(() => ({
            limit: vi.fn(async () => ({ data: [], error: null })),
          })),
        })),
        is: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        })),
      })),
      insert: insertAny,
    };
  });

  return {
    from,
    rpc,
    _spies: { upsert, insertFraud, insertAny, rpc },
  };
}

describe('risk-economy actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthorized role on risk dashboard', async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({
      id: 'u-r',
      role: 'receptionist',
      assigned_gym_id: 'g-1',
    } as any);
    vi.mocked(getAdminClient).mockReturnValue(createSupabaseMock() as any);

    const result = await getGymRiskDashboard('g-1');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Unauthorized role');
  });

  it('applies clamps when saving economy settings', async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({
      id: 'u-super',
      role: 'superadmin',
    } as any);
    const supabase = createSupabaseMock();
    vi.mocked(getAdminClient).mockReturnValue(supabase as any);

    const result = await updateGymEconomyConfig('g-1', {
      maxDropsPerSession: -1,
      maxDropsPerDay: -10,
      maxDropsPerWeek: 1500,
      maxRewardedSessionsPerDay: -2,
      maxCheckinDropsPerDay: -3,
      priceBandJson: { coffee: { min: 10, max: 20 } },
    });

    expect(result.success).toBe(true);
    expect(supabase._spies.upsert).toHaveBeenCalledTimes(1);
    const payload = (supabase._spies.upsert as any).mock.calls[0][0] as {
      max_drops_per_session: number;
      max_drops_per_day: number;
      max_rewarded_sessions_per_day: number;
      max_checkin_drops_per_day: number;
    };
    expect(payload.max_drops_per_session).toBe(0);
    expect(payload.max_drops_per_day).toBe(0);
    expect(payload.max_rewarded_sessions_per_day).toBe(0);
    expect(payload.max_checkin_drops_per_day).toBe(0);
  });

  it('creates soft-freeze audit event', async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({
      id: 'u-super',
      role: 'superadmin',
    } as any);
    const supabase = createSupabaseMock();
    vi.mocked(getAdminClient).mockReturnValue(supabase as any);

    const result = await freezeUserDrops('g-1', 'u-1', 'test reason');
    expect(result.success).toBe(true);
    expect(supabase._spies.insertFraud).toHaveBeenCalledTimes(1);
    expect(((supabase._spies.insertFraud as any).mock.calls[0][0] as { event_type: string }).event_type).toBe('manual_freeze_account');
  });

  it('quarantines redemption through cancel_redemption rpc', async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({
      id: 'u-super',
      role: 'superadmin',
    } as any);
    const supabase = createSupabaseMock();
    vi.mocked(getAdminClient).mockReturnValue(supabase as any);

    const result = await quarantineRedemption('g-1', 'r-1', 'suspicious');
    expect(result.success).toBe(true);
    expect(supabase._spies.rpc).toHaveBeenCalledWith('cancel_redemption', expect.any(Object));
  });
});

