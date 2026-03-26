import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({
  getCurrentProfile: vi.fn(),
}));

vi.mock('@/lib/utils/supabase-admin', () => ({
  getAdminClient: vi.fn(),
}));

import { getCurrentProfile } from '@/lib/auth';
import { getAdminClient } from '@/lib/utils/supabase-admin';
import { getGymExpiryPressure } from '@/lib/actions/member-detail-actions';

function createSupabaseMock(txRows: Array<{ user_id: string; amount: number }> = []) {
  const from = vi.fn((table: string) => {
    if (table === 'drops_transactions') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(function (this: any) { return this; }),
          gt: vi.fn(function (this: any) { return this; }),
          not: vi.fn(function (this: any) { return this; }),
          lte: vi.fn(function (this: any) { return this; }),
          in: vi.fn(function (this: any) { return this; }),
          limit: vi.fn(async () => ({ data: txRows, error: null })),
        })),
      };
    }
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(async () => ({ data: { owner_id: 'owner-1' }, error: null })),
        })),
      })),
    };
  });
  return { from };
}

describe('getGymExpiryPressure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns expiry pressure from transaction rows', async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({
      id: 'owner-1',
      role: 'gym_owner',
      assigned_gym_id: null,
    } as any);

    vi.mocked(getAdminClient).mockReturnValue(createSupabaseMock([
      { user_id: 'u-1', amount: 100 },
      { user_id: 'u-1', amount: 50 },
      { user_id: 'u-2', amount: 200 },
    ]) as any);

    const result = await getGymExpiryPressure('gym-1');

    expect(result.success).toBe(true);
    expect(result.data?.dropsExpiring30d).toBe(350);
    expect(result.data?.membersAffected).toBe(2);
  });

  it('returns zero when no expiring transactions', async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({
      id: 'owner-1',
      role: 'gym_owner',
      assigned_gym_id: null,
    } as any);

    vi.mocked(getAdminClient).mockReturnValue(createSupabaseMock([]) as any);

    const result = await getGymExpiryPressure('gym-1');

    expect(result.success).toBe(true);
    expect(result.data?.dropsExpiring30d).toBe(0);
    expect(result.data?.membersAffected).toBe(0);
  });

  it('rejects unauthorized role', async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({
      id: 'u-1',
      role: 'receptionist',
      assigned_gym_id: 'gym-1',
    } as any);

    const result = await getGymExpiryPressure('gym-1');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Unauthorized');
  });
});
