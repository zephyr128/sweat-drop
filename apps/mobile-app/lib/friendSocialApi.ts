import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

type RpcFn = (name: string, args?: Record<string, unknown>) => Promise<{
  data: unknown;
  error: PostgrestError | null;
}>;

const rpc: RpcFn = (name, args = {}) =>
  (supabase as unknown as { rpc: RpcFn }).rpc(name, args);

export function isFriendSocialBackendUnavailable(error: PostgrestError | null): boolean {
  if (!error) return false;
  const msg = (error.message || '').toLowerCase();
  return (
    error.code === 'PGRST202' ||
    error.code === '42883' ||
    error.code === '42P01' ||
    error.code === '42703' ||
    msg.includes('could not find the function') ||
    msg.includes('does not exist')
  );
}

function parseInviteCodePayload(data: unknown): string | null {
  if (!data) return null;
  if (typeof data === 'string') return data.trim() || null;
  if (Array.isArray(data) && data.length > 0) return parseInviteCodePayload(data[0]);
  if (typeof data === 'object') {
    const o = data as Record<string, unknown>;
    const code = o.invite_code ?? o.code ?? o.inviteCode;
    return typeof code === 'string' ? code.trim() || null : null;
  }
  return null;
}

function parseRpcSuccessPayload(data: unknown): { ok: boolean; message?: string } {
  if (data == null) return { ok: false };
  if (typeof data === 'boolean') return { ok: data };
  if (typeof data === 'object') {
    const o = data as Record<string, unknown>;
    if (o.success === true || o.ok === true) return { ok: true };
    const msg = o.error_message ?? o.message ?? o.error;
    return { ok: false, message: typeof msg === 'string' ? msg : undefined };
  }
  return { ok: false };
}

async function rpcFirstWorkingName<T>(
  names: readonly string[],
  args: Record<string, unknown> = {},
): Promise<{ data: T | null; error: PostgrestError | null; unavailable: boolean }> {
  let sawMissing = false;
  for (const name of names) {
    const { data, error } = await rpc(name, args);
    if (!error) return { data: data as T, error: null, unavailable: false };
    if (isFriendSocialBackendUnavailable(error)) {
      sawMissing = true;
      continue;
    }
    return { data: null, error, unavailable: false };
  }
  return { data: null, error: null, unavailable: sawMissing };
}

export type FriendInviteStatusState = 'pending' | 'completed' | 'failed' | 'info';

export interface FriendInviteStatusRow {
  id: string;
  title: string;
  subtitle?: string;
  state: FriendInviteStatusState;
}

export interface Friend1v1Invitation {
  id: string;
  fromUsername: string;
  challengeType: string;
  durationDays: number;
  expiresAt?: string;
}

const JOIN_BASE_URL = 'https://sweat-drop.com/join/';
const JOIN_DEEP_LINK_PREFIX = 'sweatdrop://join/';

export function buildJoinUrl(code: string): string {
  return `${JOIN_BASE_URL}${encodeURIComponent(code)}`;
}

export function buildJoinDeepLink(code: string): string {
  return `${JOIN_DEEP_LINK_PREFIX}${encodeURIComponent(code)}`;
}

function parseInviteResult(data: unknown): {
  code: string | null;
  joinUrl: string | null;
  deepLink: string | null;
} {
  const code = parseInviteCodePayload(data);
  let joinUrl: string | null = null;
  let deepLink: string | null = null;

  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const o = data as Record<string, unknown>;
    if (typeof o.join_url === 'string' && o.join_url) joinUrl = o.join_url;
    else if (typeof o.joinUrl === 'string' && o.joinUrl) joinUrl = o.joinUrl;
    if (typeof o.deep_link === 'string' && o.deep_link) deepLink = o.deep_link;
    else if (typeof o.deepLink === 'string' && o.deepLink) deepLink = o.deepLink;
  }

  if (code && !joinUrl) joinUrl = buildJoinUrl(code);
  if (code && !deepLink) deepLink = buildJoinDeepLink(code);

  return { code, joinUrl, deepLink };
}

export async function fetchMyFriendInviteCode(gymId: string | null | undefined): Promise<{
  code: string | null;
  joinUrl: string | null;
  deepLink: string | null;
  unavailable: boolean;
  errorMessage?: string;
}> {
  if (!gymId) return { code: null, joinUrl: null, deepLink: null, unavailable: true };

  const primary = await rpc('create_referral_invite', { p_gym_id: gymId });
  if (!primary.error) {
    const result = parseInviteResult(primary.data);
    if (__DEV__) console.log('[InviteAPI] create_referral_invite →', JSON.stringify(primary.data));
    return { ...result, unavailable: false };
  }
  if (__DEV__) console.warn('[InviteAPI] create_referral_invite error:', primary.error.message, primary.error.code);
  if (!isFriendSocialBackendUnavailable(primary.error)) {
    return { code: null, joinUrl: null, deepLink: null, unavailable: false, errorMessage: primary.error.message };
  }

  const fallback = await rpcFirstWorkingName<unknown>([
    'get_my_friend_invite_code',
    'get_friend_invite_code',
  ]);
  if (fallback.error) return { code: null, joinUrl: null, deepLink: null, unavailable: false, errorMessage: fallback.error.message };
  if (fallback.unavailable) return { code: null, joinUrl: null, deepLink: null, unavailable: true };
  const result = parseInviteResult(fallback.data);
  return { ...result, unavailable: false };
}

export interface ReferralMonthlyStats {
  rewardedThisMonth: number;
  monthlyCapMax: number;
  remaining: number;
}

export async function fetchReferralMonthlyStats(
  gymId: string | null | undefined,
): Promise<ReferralMonthlyStats> {
  const MONTHLY_CAP = 5;
  if (!gymId) return { rewardedThisMonth: 0, monthlyCapMax: MONTHLY_CAP, remaining: MONTHLY_CAP };

  try {
    const { data, error } = await rpc('get_referral_stats', { p_gym_id: gymId });
    if (error || !data || typeof data !== 'object') {
      return { rewardedThisMonth: 0, monthlyCapMax: MONTHLY_CAP, remaining: MONTHLY_CAP };
    }
    const stats = data as Record<string, unknown>;
    const monthlyRewardedRaw = Number(stats.monthly_rewarded ?? 0);
    const monthlyCapRaw = Number(stats.monthly_cap ?? MONTHLY_CAP);
    const count = Number.isFinite(monthlyRewardedRaw) ? monthlyRewardedRaw : 0;
    const cap = Number.isFinite(monthlyCapRaw) ? monthlyCapRaw : MONTHLY_CAP;
    return {
      rewardedThisMonth: count,
      monthlyCapMax: cap,
      remaining: Math.max(0, cap - count),
    };
  } catch {
    return { rewardedThisMonth: 0, monthlyCapMax: MONTHLY_CAP, remaining: MONTHLY_CAP };
  }
}

export async function fetchFriendInviteStatusList(gymId: string | null | undefined): Promise<{
  items: FriendInviteStatusRow[];
  unavailable: boolean;
  errorMessage?: string;
}> {
  if (gymId) {
    const rows = await supabase
      .from('referrals')
      .select('id, status, created_at, updated_at, block_reason')
      .eq('gym_id', gymId)
      .order('created_at', { ascending: false })
      .limit(20);
    if (!rows.error) {
      const items = (rows.data ?? []).map((r: any) => {
        const status = String(r.status ?? '').toLowerCase();
        const state: FriendInviteStatusState =
          status === 'rewarded'
            ? 'completed'
            : status === 'blocked'
              ? 'failed'
              : status === 'active' || status === 'pending'
                ? 'pending'
                : 'info';
        return {
          id: String(r.id),
          title:
            state === 'completed'
              ? 'Referral rewarded'
              : state === 'failed'
                ? `Referral blocked${r.block_reason ? ` (${r.block_reason})` : ''}`
                : 'Referral in progress',
          subtitle: String(r.updated_at ?? r.created_at ?? ''),
          state,
        } as FriendInviteStatusRow;
      });
      return { items, unavailable: false };
    }
    if (!isFriendSocialBackendUnavailable(rows.error)) {
      return { items: [], unavailable: false, errorMessage: rows.error.message };
    }
  }

  const fallback = await rpcFirstWorkingName<unknown>([
    'list_friend_invite_status',
    'list_my_friend_invites',
  ]);
  if (fallback.error) return { items: [], unavailable: false, errorMessage: fallback.error.message };
  if (fallback.unavailable) return { items: [], unavailable: true };
  return { items: [], unavailable: false };
}

export async function applyFriendInviteCode(
  rawCode: string,
  gymId: string | null | undefined,
): Promise<{
  ok: boolean;
  unavailable: boolean;
  message?: string;
}> {
  const code = rawCode.trim();
  if (!code) return { ok: false, unavailable: false };
  if (!gymId) return { ok: false, unavailable: true };

  const primary = await rpc('apply_referral_code', {
    p_invite_code: code,
    p_gym_id: gymId,
  });
  if (!primary.error) {
    const parsed = parseRpcSuccessPayload(primary.data);
    return { ok: parsed.ok, unavailable: false, message: parsed.message };
  }
  if (!isFriendSocialBackendUnavailable(primary.error)) {
    return { ok: false, unavailable: false, message: primary.error.message };
  }

  const fallback = await rpcFirstWorkingName<unknown>(
    ['apply_friend_invite_code', 'apply_friend_referral_code'],
    { p_code: code },
  );
  if (fallback.error) return { ok: false, unavailable: false, message: fallback.error.message };
  if (fallback.unavailable) return { ok: false, unavailable: true };
  const parsed = parseRpcSuccessPayload(fallback.data);
  return { ok: parsed.ok, unavailable: false, message: parsed.message };
}

// ── Gym member search (for opponent selection) ──

export interface GymMemberSearchResult {
  userId: string;
  username: string;
  fullName: string | null;
  avatarUrl: string | null;
}

export async function searchGymMembers(
  query: string,
  gymId: string,
  excludeUserId?: string,
): Promise<GymMemberSearchResult[]> {
  const trimmed = query.trim().toLowerCase();
  if (trimmed.length < 2) return [];

  try {
    const { data, error } = await supabase
      .from('gym_memberships')
      .select('user_id, profiles!inner(id, username, full_name, avatar_url)')
      .eq('gym_id', gymId)
      .limit(10);

    if (error || !data) return [];

    const results: GymMemberSearchResult[] = [];
    for (const row of data as any[]) {
      const p = row.profiles;
      if (!p) continue;
      if (excludeUserId && p.id === excludeUserId) continue;
      const username = (p.username || '').toLowerCase();
      const fullName = (p.full_name || '').toLowerCase();
      if (username.includes(trimmed) || fullName.includes(trimmed)) {
        results.push({
          userId: p.id,
          username: p.username || '',
          fullName: p.full_name || null,
          avatarUrl: p.avatar_url || null,
        });
      }
    }
    return results.slice(0, 8);
  } catch {
    return [];
  }
}

export async function resolveUserDisplayNames(
  userIds: string[],
): Promise<Record<string, string>> {
  if (userIds.length === 0) return {};
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, full_name')
      .in('id', userIds);
    if (error || !data) return {};
    const map: Record<string, string> = {};
    for (const row of data as any[]) {
      map[row.id] = row.full_name || row.username || row.id.slice(0, 8);
    }
    return map;
  } catch {
    return {};
  }
}

export type Friend1v1ChallengeType = 'drops_race' | 'streak_race' | 'sessions_race';

export async function createFriend1v1Challenge(params: {
  gymId: string;
  opponentUserId: string;
  challengeType: Friend1v1ChallengeType;
  durationDays: number;
  rewardDropsPerUser?: number;
}): Promise<{ ok: boolean; unavailable: boolean; message?: string }> {
  const primary = await rpc('create_friend_challenge', {
    p_opponent_user_id: params.opponentUserId,
    p_gym_id: params.gymId,
    p_challenge_type: params.challengeType,
    p_duration_days: Math.round(params.durationDays),
    p_reward_drops_per_user: Math.max(0, Math.round(params.rewardDropsPerUser ?? 0)),
    p_tie_mode: 'no_winner',
  });
  if (!primary.error) {
    const parsed = parseRpcSuccessPayload(primary.data);
    return { ok: parsed.ok, unavailable: false, message: parsed.message };
  }
  if (!isFriendSocialBackendUnavailable(primary.error)) {
    return { ok: false, unavailable: false, message: primary.error.message };
  }

  const fallback = await rpcFirstWorkingName<unknown>(
    ['create_friend_1v1_challenge', 'create_friend_one_v_one_challenge'],
    {
      p_opponent_user_id: params.opponentUserId,
      p_opponent_id: params.opponentUserId,
      p_gym_id: params.gymId,
      p_challenge_type: params.challengeType,
      p_type: params.challengeType,
      p_duration_days: Math.round(params.durationDays),
      p_days: Math.round(params.durationDays),
      p_reward_drops_per_user: Math.max(0, Math.round(params.rewardDropsPerUser ?? 0)),
      p_reward_drops: Math.max(0, Math.round(params.rewardDropsPerUser ?? 0)),
      p_tie_mode: 'no_winner',
    },
  );
  if (fallback.error) return { ok: false, unavailable: false, message: fallback.error.message };
  if (fallback.unavailable) return { ok: false, unavailable: true };
  const parsed = parseRpcSuccessPayload(fallback.data);
  return { ok: parsed.ok, unavailable: false, message: parsed.message };
}

export async function fetchFriend1v1Invitations(userId: string | null | undefined): Promise<{
  items: Friend1v1Invitation[];
  unavailable: boolean;
  errorMessage?: string;
}> {
  if (userId) {
    // Opportunistically refresh active challenge scores for this user.
    const active = await supabase
      .from('friend_challenges')
      .select('id')
      .eq('status', 'active')
      .or(`challenger_user_id.eq.${userId},opponent_user_id.eq.${userId}`)
      .limit(10);
    if (!active.error && active.data?.length) {
      await Promise.all(
        active.data.map((row: any) =>
          rpc('refresh_friend_challenge_scores', { p_challenge_id: row.id }),
        ),
      );
    }

    const rows = await supabase
      .from('friend_challenges')
      .select('id, challenge_type, duration_days, pending_expires_at, challenger_user_id')
      .eq('status', 'pending')
      .eq('opponent_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);
    if (!rows.error) {
      const challengerIds = (rows.data ?? [])
        .map((r: any) => r.challenger_user_id)
        .filter(Boolean) as string[];
      const nameMap = await resolveUserDisplayNames([...new Set(challengerIds)]);

      const items = (rows.data ?? []).map((r: any) => ({
        id: String(r.id),
        fromUsername: nameMap[r.challenger_user_id] || String(r.challenger_user_id ?? '—').slice(0, 8),
        challengeType: String(r.challenge_type ?? 'drops_race'),
        durationDays: Number(r.duration_days ?? 0),
        expiresAt: r.pending_expires_at ? String(r.pending_expires_at) : undefined,
      }));
      return { items, unavailable: false };
    }
    if (!isFriendSocialBackendUnavailable(rows.error)) {
      return { items: [], unavailable: false, errorMessage: rows.error.message };
    }
  }

  const fallback = await rpcFirstWorkingName<unknown>([
    'list_friend_1v1_invitations',
    'list_incoming_friend_challenges',
  ]);
  if (fallback.error) return { items: [], unavailable: false, errorMessage: fallback.error.message };
  if (fallback.unavailable) return { items: [], unavailable: true };
  return { items: [], unavailable: false };
}

export async function respondFriend1v1Invitation(
  invitationId: string,
  accept: boolean,
): Promise<{ ok: boolean; unavailable: boolean; message?: string }> {
  const primary = await rpc('respond_friend_challenge', {
    p_challenge_id: invitationId,
    p_accept: accept,
  });
  if (!primary.error) {
    const parsed = parseRpcSuccessPayload(primary.data);
    return { ok: parsed.ok, unavailable: false, message: parsed.message };
  }
  if (!isFriendSocialBackendUnavailable(primary.error)) {
    return { ok: false, unavailable: false, message: primary.error.message };
  }

  const fallback = await rpcFirstWorkingName<unknown>(
    ['respond_friend_1v1_invitation', 'respond_friend_challenge_invitation'],
    {
      p_invitation_id: invitationId,
      p_accept: accept,
    },
  );
  if (fallback.error) return { ok: false, unavailable: false, message: fallback.error.message };
  if (fallback.unavailable) return { ok: false, unavailable: true };
  const parsed = parseRpcSuccessPayload(fallback.data);
  return { ok: parsed.ok, unavailable: false, message: parsed.message };
}
