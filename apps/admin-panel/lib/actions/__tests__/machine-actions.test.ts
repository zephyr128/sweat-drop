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
import { updateMachine } from '../machine-actions';

function setupUpdateChain() {
  const secondEq = vi.fn(async () => ({ error: null }));
  const firstEq = vi.fn(() => ({ eq: secondEq }));
  const update = vi.fn(() => ({ eq: firstEq }));
  const from = vi.fn(() => ({ update }));
  vi.mocked(getAdminClient).mockReturnValue({ from } as any);
  return { from, update, firstEq, secondEq };
}

describe('updateMachine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentProfile).mockResolvedValue({
      id: 'admin-1',
      email: 'admin@test.com',
      username: 'Admin',
      role: 'superadmin',
      assigned_gym_id: null,
      owner_id: null,
      home_gym_id: null,
    } as any);
  });

  it('rejects invalid machine type payload', async () => {
    setupUpdateChain();

    const result = await updateMachine('m1', 'g1', { type: 'weight' as any });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.toLowerCase()).toContain('invalid');
  });

  it('rejects empty update payload', async () => {
    setupUpdateChain();

    const result = await updateMachine('m1', 'g1', {});

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain('No fields to update');
  });

  it('accepts stepper update and calls machines table update', async () => {
    const { from, update } = setupUpdateChain();

    const result = await updateMachine('m1', 'g1', { type: 'stepper' });

    expect(result.success).toBe(true);
    expect(from).toHaveBeenCalledWith('machines');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ type: 'stepper' }));
  });
});

