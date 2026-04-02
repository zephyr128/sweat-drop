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
export type ReferralJourneyStage =
  | 'invited'
  | 'joined'
  | 'first_checkin'
  | 'verified_checkin'
  | 'rewarded'
  | 'cap_blocked'
  | 'blocked'
  | 'expired';

export type ReferralJourneyStepKey =
  | 'invite_sent'
  | 'friend_joined'
  | 'first_checkin'
  | 'verified_checkin'
  | 'reward_settled';

export interface ReferralJourneyStep {
  key: ReferralJourneyStepKey;
  completed: boolean;
  current: boolean;
  at?: string | null;
}

export interface FriendInviteStatusRow {
  id: string;
  title: string;
  subtitle?: string;
  state: FriendInviteStatusState;
  stage: ReferralJourneyStage;
  steps: ReferralJourneyStep[];
  progress?: {
    completed: number;
    total: number;
  };
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
const PREVIEW_API_BASE = 'https://sweat-drop.com/api/referral-preview/';

export function buildJoinUrl(code: string): string {
  return `${JOIN_BASE_URL}${encodeURIComponent(code)}`;
}

export function buildJoinDeepLink(code: string): string {
  return `${JOIN_DEEP_LINK_PREFIX}${encodeURIComponent(code)}`;
}

// ── Referral code preview (resolves gym info from invite code) ──

export interface ReferralPreviewResult {
  status: 'valid' | 'expired' | 'used' | 'invalid' | 'error';
  gymId: string | null;
  gymName: string | null;
  gymCity: string | null;
  gymLogoUrl: string | null;
  gymPrimaryColor: string | null;
  referrerName: string | null;
}

const EMPTY_PREVIEW: ReferralPreviewResult = {
  status: 'error',
  gymId: null,
  gymName: null,
  gymCity: null,
  gymLogoUrl: null,
  gymPrimaryColor: null,
  referrerName: null,
};

function parsePreviewPayload(d: Record<string, unknown>): ReferralPreviewResult {
  return {
    status: (d.status as ReferralPreviewResult['status']) || 'error',
    gymId: (d.gym_id as string) || null,
    gymName: (d.gym_name as string) || null,
    gymCity: (d.gym_city as string) || null,
    gymLogoUrl: (d.gym_logo_url as string) || null,
    gymPrimaryColor: (d.gym_primary_color as string) || null,
    referrerName: (d.referrer_name as string) || null,
  };
}

/**
 * Preview a referral code to get gym info + referrer name.
 * Tries the Supabase RPC first (reliable, same DB), falls back to the
 * landing page HTTP API if the RPC doesn't exist yet.
 */
export async function previewReferralCode(code: string): Promise<ReferralPreviewResult> {
  const trimmed = code.trim().toUpperCase();
  if (!trimmed || trimmed.length < 4) return { ...EMPTY_PREVIEW, status: 'invalid' };

  // 1. Try Supabase RPC directly (bypass the custom wrapper to avoid type issues)
  try {
    const { data, error } = await supabase.rpc('preview_referral_code', {
      p_invite_code: trimmed,
    });
    if (__DEV__) {
      console.log('[previewReferralCode] RPC response:', JSON.stringify({ data, error: error?.message }));
    }
    if (!error && data && typeof data === 'object' && !Array.isArray(data)) {
      const d = data as Record<string, unknown>;
      if (d.status) return parsePreviewPayload(d);
    }
    // Even if the status field is missing, if we got data back it means the
    // function exists. Don't fall through to HTTP.
    if (!error && data != null) {
      if (__DEV__) console.warn('[previewReferralCode] RPC returned unexpected shape:', data);
      return EMPTY_PREVIEW;
    }
    if (error) {
      if (__DEV__) console.warn('[previewReferralCode] RPC error:', error.code, error.message);
      if (!isFriendSocialBackendUnavailable(error)) {
        return EMPTY_PREVIEW;
      }
      // Function doesn't exist on this server — fall through to HTTP
    }
  } catch (e) {
    if (__DEV__) console.warn('[previewReferralCode] RPC exception:', e);
  }

  // 2. Fallback: landing page HTTP API
  try {
    const resp = await fetch(`${PREVIEW_API_BASE}${encodeURIComponent(trimmed)}`, {
      headers: { Accept: 'application/json' },
    });
    if (__DEV__) console.log('[previewReferralCode] HTTP status:', resp.status);
    if (!resp.ok) return EMPTY_PREVIEW;
    const d = (await resp.json()) as Record<string, unknown>;
    return parsePreviewPayload(d);
  } catch (e) {
    if (__DEV__) console.warn('[previewReferralCode] HTTP exception:', e);
    return EMPTY_PREVIEW;
  }
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
  noGym: boolean;
  errorMessage?: string;
}> {
  if (!gymId) return { code: null, joinUrl: null, deepLink: null, unavailable: false, noGym: true };

  const primary = await rpc('create_referral_invite', { p_gym_id: gymId });
  if (!primary.error) {
    const result = parseInviteResult(primary.data);
    if (__DEV__) console.log('[InviteAPI] create_referral_invite →', JSON.stringify(primary.data));
    return { ...result, unavailable: false, noGym: false };
  }
  if (__DEV__) console.warn('[InviteAPI] create_referral_invite error:', primary.error.message, primary.error.code);
  if (!isFriendSocialBackendUnavailable(primary.error)) {
    return { code: null, joinUrl: null, deepLink: null, unavailable: false, noGym: false, errorMessage: primary.error.message };
  }

  const fallback = await rpcFirstWorkingName<unknown>([
    'get_my_friend_invite_code',
    'get_friend_invite_code',
  ]);
  if (fallback.error) return { code: null, joinUrl: null, deepLink: null, unavailable: false, noGym: false, errorMessage: fallback.error.message };
  if (fallback.unavailable) return { code: null, joinUrl: null, deepLink: null, unavailable: true, noGym: false };
  const result = parseInviteResult(fallback.data);
  return { ...result, unavailable: false, noGym: false };
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
  const formatLocalDateTime = (iso: string | null | undefined): string | null => {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return new Intl.DateTimeFormat(undefined, {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  };

  const mapTimelineRow = (row: Record<string, unknown>): FriendInviteStatusRow => {
    const rowId = String(
      row.referral_id ??
      row.id ??
      `${String(row.created_at ?? 'unknown')}:${String(row.status ?? 'unknown')}`,
    );
    const status = String(row.status ?? '').toLowerCase();
    const currentStatus = String(row.current_status ?? status).toLowerCase();
    const inviteeName = typeof row.invitee_name === 'string' ? row.invitee_name : null;
    const createdAt = formatLocalDateTime(typeof row.created_at === 'string' ? row.created_at : null);
    const joinedAt = formatLocalDateTime(typeof row.joined_at === 'string' ? row.joined_at : null);
    const firstCheckinAt = formatLocalDateTime(
      typeof row.qualified_checkin_at === 'string' ? row.qualified_checkin_at : null,
    );
    const verifiedAt = formatLocalDateTime(
      typeof row.qualified_verified_at === 'string' ? row.qualified_verified_at : null,
    );
    const rewardedAt = formatLocalDateTime(typeof row.rewarded_at === 'string' ? row.rewarded_at : null);
    const rewardBlockReason =
      typeof row.reward_block_reason === 'string' ? row.reward_block_reason : null;
    const blockReason = typeof row.block_reason === 'string' ? row.block_reason : null;
    const rawCreatedAt = typeof row.created_at === 'string' ? row.created_at : null;
    const rawJoinedAt = typeof row.joined_at === 'string' ? row.joined_at : null;
    const rawFirstCheckinAt = typeof row.qualified_checkin_at === 'string' ? row.qualified_checkin_at : null;
    const rawVerifiedAt = typeof row.qualified_verified_at === 'string' ? row.qualified_verified_at : null;
    const rawRewardedAt = typeof row.rewarded_at === 'string' ? row.rewarded_at : null;
    const defaultSteps: ReferralJourneyStep[] = [
      { key: 'invite_sent', completed: true, current: false, at: rawCreatedAt },
      { key: 'friend_joined', completed: false, current: false, at: rawJoinedAt },
      { key: 'first_checkin', completed: false, current: false, at: rawFirstCheckinAt },
      { key: 'verified_checkin', completed: false, current: false, at: rawVerifiedAt },
      { key: 'reward_settled', completed: false, current: false, at: rawRewardedAt },
    ];

    if (status === 'rewarded' && rewardBlockReason === 'monthly_cap_reached') {
      const steps: ReferralJourneyStep[] = [
        { ...defaultSteps[0], completed: true },
        { ...defaultSteps[1], completed: true },
        { ...defaultSteps[2], completed: true },
        { ...defaultSteps[3], completed: true },
        { ...defaultSteps[4], completed: true, current: true },
      ];
      return {
        id: rowId,
        title: 'Referral settled (monthly cap reached)',
        subtitle: rewardedAt
          ? `Verified check-in completed at ${rewardedAt}. Reward payout skipped this month because cap is reached.`
          : 'Verified check-in completed. Reward payout skipped this month because cap is reached.',
        state: 'info',
        stage: 'cap_blocked',
        steps,
        progress: { completed: 4, total: 4 },
      };
    }

    if (status === 'rewarded' || currentStatus === 'rewarded') {
      const steps: ReferralJourneyStep[] = [
        { ...defaultSteps[0], completed: true },
        { ...defaultSteps[1], completed: true },
        { ...defaultSteps[2], completed: true },
        { ...defaultSteps[3], completed: true },
        { ...defaultSteps[4], completed: true, current: true },
      ];
      return {
        id: rowId,
        title: 'Referral rewarded',
        subtitle: rewardedAt
          ? `Drops granted at ${rewardedAt}.`
          : 'Drops granted.',
        state: 'completed',
        stage: 'rewarded',
        steps,
        progress: { completed: 4, total: 4 },
      };
    }

    if (status === 'blocked' || currentStatus === 'blocked') {
      const steps: ReferralJourneyStep[] = [
        { ...defaultSteps[0], completed: true, current: true },
        defaultSteps[1],
        defaultSteps[2],
        defaultSteps[3],
        defaultSteps[4],
      ];
      return {
        id: rowId,
        title: 'Referral blocked',
        subtitle: blockReason ? `Reason: ${blockReason}` : 'This referral cannot progress.',
        state: 'failed',
        stage: 'blocked',
        steps,
      };
    }

    if (status === 'expired' || currentStatus === 'expired') {
      const steps: ReferralJourneyStep[] = [
        { ...defaultSteps[0], completed: true, current: true },
        defaultSteps[1],
        defaultSteps[2],
        defaultSteps[3],
        defaultSteps[4],
      ];
      return {
        id: rowId,
        title: 'Referral expired',
        subtitle: 'Invite was not completed before expiry.',
        state: 'failed',
        stage: 'expired',
        steps,
      };
    }

    if (currentStatus === 'verified_checkin') {
      const steps: ReferralJourneyStep[] = [
        { ...defaultSteps[0], completed: true },
        { ...defaultSteps[1], completed: true },
        { ...defaultSteps[2], completed: true },
        { ...defaultSteps[3], completed: true, current: true },
        defaultSteps[4],
      ];
      return {
        id: rowId,
        title: 'Verified check-in completed',
        subtitle: verifiedAt
          ? `Completed at ${verifiedAt}. Waiting for reward settlement.`
          : 'Waiting for reward settlement.',
        state: 'pending',
        stage: 'verified_checkin',
        steps,
        progress: { completed: 3, total: 4 },
      };
    }

    if (currentStatus === 'first_checkin' || currentStatus === 'qualified_checkin') {
      const steps: ReferralJourneyStep[] = [
        { ...defaultSteps[0], completed: true },
        { ...defaultSteps[1], completed: true },
        { ...defaultSteps[2], completed: true, current: true },
        defaultSteps[3],
        defaultSteps[4],
      ];
      return {
        id: rowId,
        title: 'First check-in completed',
        subtitle: firstCheckinAt
          ? `Completed at ${firstCheckinAt}. Waiting for identity verification.`
          : 'Waiting for identity verification.',
        state: 'pending',
        stage: 'first_checkin',
        steps,
        progress: { completed: 3, total: 4 },
      };
    }

    if (currentStatus === 'joined' || status === 'active') {
      const steps: ReferralJourneyStep[] = [
        { ...defaultSteps[0], completed: true },
        { ...defaultSteps[1], completed: true, current: true },
        defaultSteps[2],
        defaultSteps[3],
        defaultSteps[4],
      ];
      return {
        id: rowId,
        title: inviteeName ? `${inviteeName} joined with your code` : 'Code used by friend',
        subtitle: joinedAt
          ? `Joined at ${joinedAt}. Waiting for first check-in.`
          : 'Waiting for first check-in.',
        state: 'pending',
        stage: 'joined',
        steps,
        progress: { completed: 2, total: 4 },
      };
    }

    const steps: ReferralJourneyStep[] = [
      { ...defaultSteps[0], completed: true, current: true },
      defaultSteps[1],
      defaultSteps[2],
      defaultSteps[3],
      defaultSteps[4],
    ];
    return {
      id: rowId,
      title: 'Invite sent',
      subtitle: createdAt
        ? `Sent at ${createdAt}. Waiting for your friend to use the code.`
        : 'Waiting for your friend to use the code.',
      state: 'pending',
      stage: 'invited',
      steps,
      progress: { completed: 1, total: 4 },
    };
  };

  if (gymId) {
    const rpcRows = await rpc('get_my_referrals', { p_gym_id: gymId });
    if (!rpcRows.error && rpcRows.data && typeof rpcRows.data === 'object') {
      const payload = rpcRows.data as Record<string, unknown>;
      const referrals = Array.isArray(payload.referrals)
        ? (payload.referrals as Record<string, unknown>[])
        : [];
      return {
        items: referrals.map(mapTimelineRow),
        unavailable: false,
      };
    }
    if (rpcRows.error && !isFriendSocialBackendUnavailable(rpcRows.error)) {
      return { items: [], unavailable: false, errorMessage: rpcRows.error.message };
    }

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
          subtitle: formatLocalDateTime(String(r.updated_at ?? r.created_at ?? '')) ?? undefined,
          state,
          stage:
            state === 'completed'
              ? 'rewarded'
              : state === 'failed'
                ? 'blocked'
                : status === 'active'
                  ? 'joined'
                  : 'invited',
          steps: [
            {
              key: 'invite_sent',
              completed: true,
              current: state === 'pending',
              at: typeof r.created_at === 'string' ? r.created_at : null,
            },
            { key: 'friend_joined', completed: status === 'active' || status === 'rewarded', current: false },
            { key: 'first_checkin', completed: status === 'rewarded', current: false },
            { key: 'verified_checkin', completed: status === 'rewarded', current: false },
            { key: 'reward_settled', completed: status === 'rewarded', current: state === 'completed' },
          ],
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
  noGym: boolean;
  message?: string;
}> {
  const code = rawCode.trim();
  if (!code) return { ok: false, unavailable: false, noGym: false };
  if (!gymId) return { ok: false, unavailable: false, noGym: true };

  const primary = await rpc('apply_referral_code', {
    p_invite_code: code,
    p_gym_id: gymId,
  });
  if (!primary.error) {
    const parsed = parseRpcSuccessPayload(primary.data);
    return { ok: parsed.ok, unavailable: false, noGym: false, message: parsed.message };
  }
  if (!isFriendSocialBackendUnavailable(primary.error)) {
    return { ok: false, unavailable: false, noGym: false, message: primary.error.message };
  }

  const fallback = await rpcFirstWorkingName<unknown>(
    ['apply_friend_invite_code', 'apply_friend_referral_code'],
    { p_code: code },
  );
  if (fallback.error) return { ok: false, unavailable: false, noGym: false, message: fallback.error.message };
  if (fallback.unavailable) return { ok: false, unavailable: true, noGym: false };
  const parsed = parseRpcSuccessPayload(fallback.data);
  return { ok: parsed.ok, unavailable: false, noGym: false, message: parsed.message };
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

// ── Received referral (inbound — where user is the invitee) ──

export interface ReceivedReferral {
  referralId: string;
  referrerName: string | null;
  gymName: string | null;
  gymCity: string | null;
  status: string;
  currentStatus: string;
  joinedAt: string | null;
  qualifiedCheckinAt: string | null;
  qualifiedVerifiedAt: string | null;
  rewardedAt: string | null;
  rewardBlockReason: string | null;
  createdAt: string;
}

export async function fetchMyReceivedReferral(): Promise<ReceivedReferral | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return null;

    const { data, error } = await supabase
      .from('referrals')
      .select(`
        id,
        status,
        joined_at,
        qualified_checkin_at,
        qualified_verified_at,
        rewarded_at,
        reward_block_reason,
        created_at,
        referrer:referrer_user_id ( username, full_name ),
        gym:gym_id ( name, city )
      `)
      .eq('invitee_user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;

    const referrer = data.referrer as unknown as { username?: string; full_name?: string } | null;
    const gym = data.gym as unknown as { name?: string; city?: string } | null;

    const st = String(data.status ?? '').toLowerCase();
    let currentStatus = st;
    if (st === 'rewarded') currentStatus = 'rewarded';
    else if (st === 'blocked') currentStatus = 'blocked';
    else if (data.qualified_verified_at) currentStatus = 'verified_checkin';
    else if (data.qualified_checkin_at) currentStatus = 'first_checkin';
    else if (st === 'active') currentStatus = 'joined';
    else currentStatus = 'accepted';

    return {
      referralId: String(data.id),
      referrerName: referrer?.full_name || referrer?.username || null,
      gymName: gym?.name || null,
      gymCity: gym?.city || null,
      status: st,
      currentStatus,
      joinedAt: data.joined_at ? String(data.joined_at) : null,
      qualifiedCheckinAt: data.qualified_checkin_at ? String(data.qualified_checkin_at) : null,
      qualifiedVerifiedAt: data.qualified_verified_at ? String(data.qualified_verified_at) : null,
      rewardedAt: data.rewarded_at ? String(data.rewarded_at) : null,
      rewardBlockReason: data.reward_block_reason ? String(data.reward_block_reason) : null,
      createdAt: String(data.created_at),
    };
  } catch {
    return null;
  }
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
