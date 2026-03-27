import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({
  getCurrentProfile: vi.fn(),
}));

vi.mock('@/lib/supabase-server', () => ({
  createClient: vi.fn(),
}));

import { getCurrentProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase-server';
import {
  listMembers,
  listRedemptions,
  listStoreItems,
  listMachines,
  listStaff,
  listChallenges,
  listArenas,
} from '../list-actions';

const MEMBER_ITEMS = [
  { id: 'u1', username: 'Alice', email: 'alice@test.com', full_name: 'Alice A', avatar_url: null, total_drops: 500, streak_days: 10, last_visit_date: '2026-03-20', is_newcomer: false, local_drops_balance: 300, joined_at: '2025-01-01' },
  { id: 'u2', username: 'Bob', email: 'bob@test.com', full_name: 'Bob B', avatar_url: null, total_drops: 100, streak_days: 0, last_visit_date: '2026-01-01', is_newcomer: false, local_drops_balance: 50, joined_at: '2025-02-01' },
];

function makeRpcResponse(items: unknown[], total = items.length, page = 1, limit = 25) {
  return {
    items,
    total_count: total,
    page,
    limit,
    total_pages: Math.max(1, Math.ceil(total / limit)),
  };
}

function setupMocks(role = 'gym_owner') {
  vi.mocked(getCurrentProfile).mockResolvedValue({
    id: 'owner-1',
    email: 'test@test.com',
    username: 'Test',
    role: role as any,
    assigned_gym_id: null,
    owner_id: null,
    home_gym_id: null,
  });

  const rpcFn = vi.fn(async () => ({
    data: makeRpcResponse(MEMBER_ITEMS),
    error: null,
  }));

  vi.mocked(createClient).mockResolvedValue({ rpc: rpcFn } as any);
  return { rpcFn };
}

describe('listMembers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns paginated members with correct shape', async () => {
    setupMocks();
    const result = await listMembers('gym-1');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.items).toHaveLength(2);
    expect(result.data.total).toBe(2);
    expect(result.data.page).toBe(1);
    expect(result.data.limit).toBe(25);
    expect(result.data.totalPages).toBe(1);
    expect(result.data.items[0]).toHaveProperty('username');
  });

  it('passes search query to RPC', async () => {
    const { rpcFn } = setupMocks();
    await listMembers('gym-1', { q: 'alice' });
    expect(rpcFn).toHaveBeenCalledWith('admin_list_members', expect.objectContaining({
      p_search: 'alice',
    }));
  });

  it('passes pagination to RPC', async () => {
    const { rpcFn } = setupMocks();
    await listMembers('gym-1', { page: 3, limit: 10 });
    expect(rpcFn).toHaveBeenCalledWith('admin_list_members', expect.objectContaining({
      p_page: 3,
      p_limit: 10,
    }));
  });

  it('passes sort to RPC', async () => {
    const { rpcFn } = setupMocks();
    await listMembers('gym-1', { sortBy: 'username', sortDir: 'asc' });
    expect(rpcFn).toHaveBeenCalledWith('admin_list_members', expect.objectContaining({
      p_sort_by: 'username',
      p_sort_dir: 'asc',
    }));
  });

  it('rejects unauthorized role', async () => {
    setupMocks('receptionist');
    const result = await listMembers('gym-1');
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toMatch(/Unauthorized/i);
  });

  it('handles RPC error', async () => {
    setupMocks();
    vi.mocked(createClient).mockResolvedValue({
      rpc: vi.fn(async () => ({ data: null, error: { message: 'DB error' } })),
    } as any);
    const result = await listMembers('gym-1');
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe('DB error');
  });

  it('handles RPC Unauthorized response', async () => {
    setupMocks();
    vi.mocked(createClient).mockResolvedValue({
      rpc: vi.fn(async () => ({ data: { error: 'Unauthorized' }, error: null })),
    } as any);
    const result = await listMembers('gym-1');
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe('Unauthorized');
  });

  it('clamps limit to max 100', async () => {
    const { rpcFn } = setupMocks();
    await listMembers('gym-1', { limit: 999 });
    expect(rpcFn).toHaveBeenCalledWith('admin_list_members', expect.objectContaining({
      p_limit: 100,
    }));
  });
});

describe('listRedemptions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns paginated shape', async () => {
    setupMocks();
    const result = await listRedemptions('gym-1');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toHaveProperty('items');
    expect(result.data).toHaveProperty('total');
    expect(result.data).toHaveProperty('totalPages');
  });

  it('passes status filter to RPC', async () => {
    const { rpcFn } = setupMocks();
    await listRedemptions('gym-1', { filters: { status: 'pending' } });
    expect(rpcFn).toHaveBeenCalledWith('admin_list_redemptions', expect.objectContaining({
      p_status: 'pending',
    }));
  });

  it('allows receptionist access', async () => {
    setupMocks('receptionist');
    const result = await listRedemptions('gym-1');
    expect(result.success).toBe(true);
  });
});

describe('listStoreItems', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns paginated shape', async () => {
    setupMocks();
    const result = await listStoreItems('gym-1');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toHaveProperty('items');
    expect(result.data).toHaveProperty('totalPages');
  });

  it('passes active filter to RPC', async () => {
    const { rpcFn } = setupMocks();
    await listStoreItems('gym-1', { filters: { active: true } });
    expect(rpcFn).toHaveBeenCalledWith('admin_list_rewards', expect.objectContaining({
      p_is_active: true,
    }));
  });
});

describe('listMachines', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns paginated shape', async () => {
    setupMocks();
    const result = await listMachines('gym-1');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toHaveProperty('items');
    expect(result.data).toHaveProperty('totalPages');
  });

  it('allows receptionist access', async () => {
    setupMocks('receptionist');
    const result = await listMachines('gym-1');
    expect(result.success).toBe(true);
  });

  it('passes type filter to RPC', async () => {
    const { rpcFn } = setupMocks();
    await listMachines('gym-1', { filters: { type: 'treadmill' } });
    expect(rpcFn).toHaveBeenCalledWith('admin_list_machines', expect.objectContaining({
      p_type: 'treadmill',
    }));
  });
});

describe('listStaff', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns paginated shape', async () => {
    setupMocks();
    const result = await listStaff('gym-1');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toHaveProperty('items');
    expect(result.data).toHaveProperty('totalPages');
  });

  it('rejects receptionist access', async () => {
    setupMocks('receptionist');
    const result = await listStaff('gym-1');
    expect(result.success).toBe(false);
  });
});

describe('listChallenges', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns paginated shape', async () => {
    setupMocks();
    const result = await listChallenges('gym-1');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toHaveProperty('items');
    expect(result.data).toHaveProperty('totalPages');
  });

  it('passes active filter to RPC', async () => {
    const { rpcFn } = setupMocks();
    await listChallenges('gym-1', { filters: { active: true } });
    expect(rpcFn).toHaveBeenCalledWith('admin_list_challenges', expect.objectContaining({
      p_is_active: true,
    }));
  });
});

describe('listArenas', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns paginated shape', async () => {
    setupMocks();
    const result = await listArenas('gym-1');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toHaveProperty('items');
    expect(result.data).toHaveProperty('totalPages');
  });

  it('passes active filter to RPC', async () => {
    const { rpcFn } = setupMocks();
    await listArenas('gym-1', { filters: { active: false } });
    expect(rpcFn).toHaveBeenCalledWith('admin_list_arenas', expect.objectContaining({
      p_is_active: false,
    }));
  });
});
