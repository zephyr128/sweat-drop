import { getAdminClient } from '@/lib/utils/supabase-admin';
import { createClient } from '@/lib/supabase-server';
import { getCurrentProfile, type UserProfile, type UserRole } from '../auth';

// ─── Shared List Contract ─────────────────────────────────────────

// Row / filter types live here (not in list-actions.ts which has 'use server')
// so client components can safely import them without hitting the
// "Only async functions are allowed to be exported in a 'use server' file" error.

export interface MemberFilters {
  status?: 'all' | 'active' | 'at_risk' | 'churned';
}

export interface MemberRow {
  id: string;
  username: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  total_drops: number;
  streak_days: number;
  last_visit_date: string | null;
  is_newcomer: boolean;
  local_drops_balance: number;
  joined_at: string;
}

export interface RedemptionFilters {
  status?: 'all' | 'pending' | 'pending_verification' | 'confirmed' | 'cancelled';
}

export interface RedemptionRow {
  id: string;
  user_id: string;
  username: string | null;
  avatar_url: string | null;
  reward_id: string;
  reward_name: string | null;
  drops_spent: number;
  status: 'pending' | 'pending_verification' | 'confirmed' | 'cancelled';
  redemption_code: string;
  source_type: string | null;
  description: string | null;
  created_at: string;
  confirmed_at: string | null;
  fulfilled_at: string | null;
}

export interface StoreItemFilters {
  active?: boolean | 'all';
  rewardType?: string;
}

export interface StoreItemRow {
  id: string;
  name: string;
  description: string | null;
  reward_type: string;
  price_drops: number;
  stock: number | null;
  is_active: boolean;
  image_url: string | null;
  sponsor_name: string | null;
  price_calc_mode: string | null;
  discount_percent: number | null;
  base_price_rsd: number | null;
  available_from: string | null;
  available_until: string | null;
  redemption_limit: string | null;
  created_at: string;
}

export interface MachineFilters {
  type?: string;
}

export interface MachineRow {
  id: string;
  name: string;
  type: string;
  zone: string | null;
  unique_qr_code: string | null;
  qr_uuid: string | null;
  is_active: boolean;
  is_busy: boolean;
  is_under_maintenance: boolean;
  sensor_id: string | null;
  ble_protocol: string | null;
  protocol_verified: boolean;
  current_user_id: string | null;
  last_heartbeat: string | null;
  last_rpm: number | null;
  created_at: string;
}

export interface StaffFilters {
  role?: 'all' | 'gym_admin' | 'receptionist';
}

export interface StaffRow {
  id: string;
  username: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: string;
  created_at: string;
}

export interface ChallengeFilters {
  active?: boolean | 'all';
}

export interface ChallengeRow {
  id: string;
  name: string;
  description: string | null;
  challenge_type: string;
  target_drops: number;
  reward_drops: number;
  streak_days: number | null;
  milestone_threshold: number | null;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  scoring_model: string | null;
  sponsor_name: string | null;
  sponsor_logo: string | null;
  badge_image_url: string | null;
  prize_description: string | null;
  tiers: unknown[] | null;
  created_at: string;
}

export interface ArenaFilters {
  active?: boolean | 'all';
}

export interface ArenaRow {
  id: string;
  name: string;
  description: string | null;
  arena_scope: string;
  scoring_model: string;
  sponsor_name: string | null;
  start_date: string;
  end_date: string;
  is_active: boolean;
  is_finalized: boolean;
  opt_in_type: string | null;
  opt_in_value: number | null;
  card_color: string | null;
  card_text_color: string | null;
  card_gradient_end: string | null;
  participant_count: number;
  gym_count: number;
}

export interface ListQueryInput<F = Record<string, unknown>> {
  q?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  filters?: F;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export type ListActionResult<T> =
  | { success: true; data: PaginatedResult<T> }
  | { success: false; error: string };

// ─── RPC response shape (matches DBA contract) ───────────────────

export interface RpcPaginatedResponse {
  items: unknown[];
  total_count: number;
  page: number;
  limit: number;
  total_pages: number;
  error?: string;
}

// ─── Input Sanitization ───────────────────────────────────────────

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 25;
const DEFAULT_PAGE = 1;

export function sanitizeListInput<F = Record<string, unknown>>(
  raw?: ListQueryInput<F>,
): { q: string; page: number; limit: number; sortBy: string; sortDir: 'asc' | 'desc'; filters: F } {
  const q = typeof raw?.q === 'string' ? raw.q.trim().slice(0, 200) : '';
  const page = Math.max(DEFAULT_PAGE, Math.round(Number(raw?.page) || DEFAULT_PAGE));
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.round(Number(raw?.limit) || DEFAULT_LIMIT)));
  const sortDir = raw?.sortDir === 'asc' ? 'asc' : 'desc';
  const sortBy = typeof raw?.sortBy === 'string' ? raw.sortBy : '';
  const filters = (raw?.filters ?? {}) as F;
  return { q, page, limit, sortBy, sortDir, filters };
}

export function paginationMeta(total: number, page: number, limit: number) {
  return {
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export function rangeFromPage(page: number, limit: number): { from: number; to: number } {
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  return { from, to };
}

/** Parse DBA RPC JSONB response into PaginatedResult */
export function parseRpcResponse<T>(rpcData: unknown): PaginatedResult<T> | { error: string } {
  const d = rpcData as RpcPaginatedResponse | null;
  if (!d) return { error: 'Empty RPC response' };
  if (d.error) return { error: d.error };
  return {
    items: (d.items ?? []) as T[],
    total: d.total_count ?? 0,
    page: d.page ?? 1,
    limit: d.limit ?? DEFAULT_LIMIT,
    totalPages: d.total_pages ?? 1,
  };
}

// ─── Authorization ────────────────────────────────────────────────

export interface AuthzResult {
  ok: true;
  profile: UserProfile;
  supabase: NonNullable<ReturnType<typeof getAdminClient>>;
}

export interface AuthzError {
  ok: false;
  error: string;
}

/** Session-aware Supabase client result (for RPC calls that need auth.uid()) */
export interface SessionAuthzResult {
  ok: true;
  profile: UserProfile;
  sessionClient: Awaited<ReturnType<typeof createClient>>;
}

const GYM_ROLES: UserRole[] = ['superadmin', 'gym_owner', 'gym_admin', 'receptionist'];

export async function authorizeGymList(
  gymId: string,
  allowedRoles: UserRole[] = GYM_ROLES,
): Promise<AuthzResult | AuthzError> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: 'Not authenticated' };
  if (!allowedRoles.includes(profile.role)) return { ok: false, error: 'Unauthorized role' };

  const supabase = getAdminClient();
  if (!supabase) return { ok: false, error: 'Admin client not available' };

  if (profile.role === 'superadmin') return { ok: true, profile, supabase };

  const { data: gym } = await supabase.from('gyms').select('owner_id').eq('id', gymId).single();
  if (!gym) return { ok: false, error: 'Gym not found' };

  const ownsGym = (gym as { owner_id: string | null }).owner_id === profile.id;
  const isAssignedGym = profile.assigned_gym_id === gymId;
  if (!ownsGym && !isAssignedGym) return { ok: false, error: 'Unauthorized: gym access denied' };

  return { ok: true, profile, supabase };
}

/**
 * Lightweight auth check + session client for RPC-backed list actions.
 * RPCs enforce gym access internally via _admin_check_gym_access, so
 * we only need to verify the user is authenticated and has the right role.
 */
export async function authorizeForRpc(
  allowedRoles: UserRole[] = GYM_ROLES,
): Promise<SessionAuthzResult | AuthzError> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: 'Not authenticated' };
  if (!allowedRoles.includes(profile.role)) return { ok: false, error: 'Unauthorized role' };

  const sessionClient = await createClient();
  return { ok: true, profile, sessionClient };
}
