'use server';

import {
  type ListQueryInput,
  type ListActionResult,
  type MemberFilters,
  type MemberRow,
  type RedemptionFilters,
  type RedemptionRow,
  type StoreItemFilters,
  type StoreItemRow,
  type MachineFilters,
  type MachineRow,
  type StaffFilters,
  type StaffRow,
  type ChallengeFilters,
  type ChallengeRow,
  type ArenaFilters,
  type ArenaRow,
  sanitizeListInput,
  authorizeForRpc,
  parseRpcResponse,
} from './list-helpers';

export async function listMembers(
  gymId: string,
  input?: ListQueryInput<MemberFilters>,
): Promise<ListActionResult<MemberRow>> {
  const auth = await authorizeForRpc(['superadmin', 'gym_owner', 'gym_admin', 'receptionist']);
  if (!auth.ok) return { success: false, error: auth.error };

  const { q, page, limit, sortBy, sortDir } = sanitizeListInput(input);

  const { data, error } = await auth.sessionClient.rpc('admin_list_members', {
    p_gym_id: gymId,
    p_search: q || null,
    p_page: page,
    p_limit: limit,
    p_sort_by: sortBy || 'created_at',
    p_sort_dir: sortDir,
  });

  if (error) return { success: false, error: error.message };

  const parsed = parseRpcResponse<MemberRow>(data);
  if ('error' in parsed) return { success: false, error: parsed.error };
  return { success: true, data: parsed };
}

// ── Redemptions ───────────────────────────────────────────────────

export async function listRedemptions(
  gymId: string,
  input?: ListQueryInput<RedemptionFilters>,
): Promise<ListActionResult<RedemptionRow>> {
  const auth = await authorizeForRpc(['superadmin', 'gym_owner', 'gym_admin', 'receptionist']);
  if (!auth.ok) return { success: false, error: auth.error };

  const { q, page, limit, sortBy, sortDir, filters } = sanitizeListInput(input);
  const statusFilter = filters.status && filters.status !== 'all' ? filters.status : null;

  const { data, error } = await auth.sessionClient.rpc('admin_list_redemptions', {
    p_gym_id: gymId,
    p_search: q || null,
    p_status: statusFilter,
    p_page: page,
    p_limit: limit,
    p_sort_by: sortBy || 'created_at',
    p_sort_dir: sortDir,
  });

  if (error) return { success: false, error: error.message };

  const parsed = parseRpcResponse<RedemptionRow>(data);
  if ('error' in parsed) return { success: false, error: parsed.error };
  return { success: true, data: parsed };
}

// ── Store Items / Rewards ─────────────────────────────────────────

export async function listStoreItems(
  gymId: string,
  input?: ListQueryInput<StoreItemFilters>,
): Promise<ListActionResult<StoreItemRow>> {
  const auth = await authorizeForRpc(['superadmin', 'gym_owner', 'gym_admin']);
  if (!auth.ok) return { success: false, error: auth.error };

  const { q, page, limit, sortBy, sortDir, filters } = sanitizeListInput(input);
  const isActive = filters.active === true ? true : filters.active === false ? false : null;

  const { data, error } = await auth.sessionClient.rpc('admin_list_rewards', {
    p_gym_id: gymId,
    p_search: q || null,
    p_is_active: isActive,
    p_page: page,
    p_limit: limit,
    p_sort_by: sortBy || 'created_at',
    p_sort_dir: sortDir,
  });

  if (error) return { success: false, error: error.message };

  const parsed = parseRpcResponse<StoreItemRow>(data);
  if ('error' in parsed) return { success: false, error: parsed.error };
  return { success: true, data: parsed };
}

// ── Machines ──────────────────────────────────────────────────────

export async function listMachines(
  gymId: string,
  input?: ListQueryInput<MachineFilters>,
): Promise<ListActionResult<MachineRow>> {
  const auth = await authorizeForRpc();
  if (!auth.ok) return { success: false, error: auth.error };

  const { q, page, limit, sortBy, sortDir, filters } = sanitizeListInput(input);
  const typeFilter = filters.type && filters.type !== 'all' ? filters.type : null;

  const { data, error } = await auth.sessionClient.rpc('admin_list_machines', {
    p_gym_id: gymId,
    p_search: q || null,
    p_type: typeFilter,
    p_page: page,
    p_limit: limit,
    p_sort_by: sortBy || 'name',
    p_sort_dir: sortDir,
  });

  if (error) return { success: false, error: error.message };

  const parsed = parseRpcResponse<MachineRow>(data);
  if ('error' in parsed) return { success: false, error: parsed.error };
  return { success: true, data: parsed };
}

// ── Team / Staff ──────────────────────────────────────────────────

export async function listStaff(
  gymId: string,
  input?: ListQueryInput<StaffFilters>,
): Promise<ListActionResult<StaffRow>> {
  const auth = await authorizeForRpc(['superadmin', 'gym_owner', 'gym_admin']);
  if (!auth.ok) return { success: false, error: auth.error };

  const { q, page, limit, sortBy, sortDir } = sanitizeListInput(input);

  const { data, error } = await auth.sessionClient.rpc('admin_list_team', {
    p_gym_id: gymId,
    p_search: q || null,
    p_page: page,
    p_limit: limit,
    p_sort_by: sortBy || 'created_at',
    p_sort_dir: sortDir,
  });

  if (!error) {
    const parsed = parseRpcResponse<StaffRow>(data);
    if (!('error' in parsed)) return { success: true, data: parsed };
  }

  // Fallback: direct profiles query if RPC fails or returns unparseable data
  return listStaffFallback(gymId, { q, page, limit, sortBy, sortDir });
}

async function listStaffFallback(
  gymId: string,
  { q, page, limit, sortBy, sortDir }: { q: string; page: number; limit: number; sortBy: string; sortDir: string },
): Promise<ListActionResult<StaffRow>> {
  const { getAdminClient } = await import('@/lib/utils/supabase-admin');
  const admin = getAdminClient();
  if (!admin) return { success: false, error: 'Admin client unavailable' };

  let query = admin
    .from('profiles')
    .select('id, username, email, full_name, avatar_url, role, created_at', { count: 'exact' })
    .eq('assigned_gym_id', gymId)
    .in('role', ['gym_admin', 'receptionist']);

  if (q) {
    query = query.or(`username.ilike.%${q}%,email.ilike.%${q}%,full_name.ilike.%${q}%`);
  }

  const validSortCols = ['username', 'email', 'role', 'created_at'];
  const col = validSortCols.includes(sortBy) ? sortBy : 'created_at';
  query = query.order(col, { ascending: sortDir === 'asc' });

  const from = (page - 1) * limit;
  query = query.range(from, from + limit - 1);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows, count, error } = await (query as any);
  if (error) return { success: false, error: error.message };

  const items: StaffRow[] = (rows ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    username: (r.username as string) || '',
    email: (r.email as string) || '',
    full_name: (r.full_name as string) || null,
    avatar_url: (r.avatar_url as string) || null,
    role: (r.role as string) || '',
    created_at: (r.created_at as string) || '',
  }));

  const total = typeof count === 'number' ? count : items.length;
  return {
    success: true,
    data: { items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

// ── Challenges ────────────────────────────────────────────────────

export async function listChallenges(
  gymId: string,
  input?: ListQueryInput<ChallengeFilters>,
): Promise<ListActionResult<ChallengeRow>> {
  const auth = await authorizeForRpc(['superadmin', 'gym_owner', 'gym_admin']);
  if (!auth.ok) return { success: false, error: auth.error };

  const { q, page, limit, sortBy, sortDir, filters } = sanitizeListInput(input);
  const isActive = filters.active === true ? true : filters.active === false ? false : null;

  const { data, error } = await auth.sessionClient.rpc('admin_list_challenges', {
    p_gym_id: gymId,
    p_search: q || null,
    p_is_active: isActive,
    p_page: page,
    p_limit: limit,
    p_sort_by: sortBy || 'created_at',
    p_sort_dir: sortDir,
  });

  if (error) return { success: false, error: error.message };

  const parsed = parseRpcResponse<ChallengeRow>(data);
  if ('error' in parsed) return { success: false, error: parsed.error };
  return { success: true, data: parsed };
}

// ── Arenas ────────────────────────────────────────────────────────

export async function listArenas(
  gymId: string,
  input?: ListQueryInput<ArenaFilters>,
): Promise<ListActionResult<ArenaRow>> {
  const auth = await authorizeForRpc(['superadmin', 'gym_owner', 'gym_admin']);
  if (!auth.ok) return { success: false, error: auth.error };

  const { q, page, limit, sortBy, sortDir, filters } = sanitizeListInput(input);
  const isActive = filters.active === true ? true : filters.active === false ? false : null;

  const { data, error } = await auth.sessionClient.rpc('admin_list_arenas', {
    p_gym_id: gymId,
    p_search: q || null,
    p_is_active: isActive,
    p_page: page,
    p_limit: limit,
    p_sort_by: sortBy || 'created_at',
    p_sort_dir: sortDir,
  });

  if (error) return { success: false, error: error.message };

  const parsed = parseRpcResponse<ArenaRow>(data);
  if ('error' in parsed) return { success: false, error: parsed.error };
  return { success: true, data: parsed };
}


