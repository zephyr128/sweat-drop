'use server';

import { getCurrentProfile, type UserProfile } from '@/lib/auth';
import { getAdminClient } from '@/lib/utils/supabase-admin';

// ── Aggregate stats ──────────────────────────────────────────

export interface ReferralStats {
  invitesSent: number;
  joined: number;
  verifiedCheckin: number;
  rewarded: number;
  capBlocked: number;
}

/** @deprecated Use ReferralStats instead. */
export type ReferralPilotStats = ReferralStats;

// ── Per-row detail ───────────────────────────────────────────

export type ReferralStage =
  | 'invited'
  | 'registered'
  | 'checked_in'
  | 'verified'
  | 'rewarded'
  | 'cap_blocked'
  | 'blocked'
  | 'expired';

export interface ReferralListItem {
  id: string;
  inviteCode: string;
  referrerName: string;
  inviteeName: string | null;
  stage: ReferralStage;
  createdAt: string;
  joinedAt: string | null;
  verifiedAt: string | null;
  rewardedAt: string | null;
  blockReason: string | null;
}

export interface ReferralData {
  stats: ReferralStats;
  list: ReferralListItem[];
}

// ── Auth helper (shared) ─────────────────────────────────────

async function authorizeGymAccess(
  gymId: string,
): Promise<{ profile: UserProfile; admin: ReturnType<typeof getAdminClient> } | { error: string }> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: 'Unauthorized' };

  const allowed = ['superadmin', 'gym_owner', 'gym_admin'];
  if (!allowed.includes(profile.role)) return { error: 'Unauthorized' };

  if (profile.role === 'gym_admin' && profile.assigned_gym_id !== gymId) {
    return { error: 'Unauthorized' };
  }

  const admin = getAdminClient();
  if (!admin) return { error: 'Admin client unavailable' };

  if (profile.role === 'gym_owner') {
    const { data: gym } = await admin
      .from('gyms')
      .select('owner_id')
      .eq('id', gymId)
      .single() as { data: { owner_id: string | null } | null };
    if (!gym || gym.owner_id !== profile.id) {
      return { error: 'Unauthorized' };
    }
  }

  return { profile, admin };
}

// ── DB row shape ─────────────────────────────────────────────

type ReferralRow = {
  id: string;
  invite_code: string;
  status: string;
  referrer_user_id: string;
  invitee_user_id: string | null;
  qualified_checkin_at: string | null;
  qualified_verified_at: string | null;
  qualified_first_workout_at: string | null;
  reward_block_reason: string | null;
  joined_at: string | null;
  rewarded_at: string | null;
  created_at: string;
};

function deriveStage(r: ReferralRow): ReferralStage {
  if (r.status === 'expired') return 'expired';
  if (r.status === 'blocked') return 'blocked';
  if (r.status === 'rewarded' && r.reward_block_reason === 'monthly_cap_reached') return 'cap_blocked';
  if (r.status === 'rewarded') return 'rewarded';
  if ((r.qualified_verified_at ?? r.qualified_first_workout_at) != null) return 'verified';
  if (r.qualified_checkin_at != null) return 'checked_in';
  if (r.invitee_user_id && ['active', 'rewarded'].includes(r.status)) return 'registered';
  return 'invited';
}

// ── Public actions ───────────────────────────────────────────

/**
 * Combined stats + list for the referral dashboard card.
 */
export async function getReferralData(
  gymId: string,
): Promise<{ data: ReferralData | null; error?: string }> {
  const auth = await authorizeGymAccess(gymId);
  if ('error' in auth) return { data: null, error: auth.error };
  const { admin } = auth;

  // Select all columns — newer migrations add qualified_verified_at,
  // qualified_first_workout_at, reward_block_reason, joined_at which may
  // not exist in every deployment yet. Using * avoids column-not-found errors.
  const { data: rawData, error } = await admin!
    .from('referrals')
    .select('*')
    .eq('gym_id', gymId)
    .order('created_at', { ascending: false });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (rawData as any[] | null)?.map((r): ReferralRow => ({
    id: r.id,
    invite_code: r.invite_code,
    status: r.status,
    referrer_user_id: r.referrer_user_id,
    invitee_user_id: r.invitee_user_id ?? null,
    qualified_checkin_at: r.qualified_checkin_at ?? null,
    qualified_verified_at: r.qualified_verified_at ?? null,
    qualified_first_workout_at: r.qualified_first_workout_at ?? null,
    reward_block_reason: r.reward_block_reason ?? null,
    joined_at: r.joined_at ?? null,
    rewarded_at: r.rewarded_at ?? null,
    created_at: r.created_at,
  })) ?? null;

  if (error) {
    console.error('[getReferralData]', (error as any).message ?? error);
    return { data: null, error: String((error as any).message ?? 'Query failed') };
  }

  const rows = data ?? [];

  // Collect unique profile IDs for name lookup
  const profileIds = new Set<string>();
  for (const r of rows) {
    profileIds.add(r.referrer_user_id);
    if (r.invitee_user_id) profileIds.add(r.invitee_user_id);
  }

  const nameMap = new Map<string, string>();
  if (profileIds.size > 0) {
    const { data: profiles } = await admin!
      .from('profiles')
      .select('id, username, full_name')
      .in('id', Array.from(profileIds)) as unknown as {
        data: Array<{ id: string; username: string | null; full_name: string | null }> | null;
      };
    for (const p of profiles ?? []) {
      nameMap.set(p.id, p.username || p.full_name || p.id.slice(0, 8));
    }
  }

  const getName = (id: string | null): string | null =>
    id ? (nameMap.get(id) ?? id.slice(0, 8)) : null;

  const list: ReferralListItem[] = rows.map((r) => ({
    id: r.id,
    inviteCode: r.invite_code,
    referrerName: getName(r.referrer_user_id)!,
    inviteeName: getName(r.invitee_user_id),
    stage: deriveStage(r),
    createdAt: r.created_at,
    joinedAt: r.joined_at,
    verifiedAt: r.qualified_verified_at ?? r.qualified_first_workout_at,
    rewardedAt: r.rewarded_at,
    blockReason: r.reward_block_reason,
  }));

  const stats: ReferralStats = {
    invitesSent: rows.length,
    joined: rows.filter(
      (r) => r.invitee_user_id && ['active', 'rewarded'].includes(r.status),
    ).length,
    verifiedCheckin: rows.filter(
      (r) => (r.qualified_verified_at ?? r.qualified_first_workout_at) != null,
    ).length,
    rewarded: rows.filter(
      (r) => r.status === 'rewarded' && r.reward_block_reason == null,
    ).length,
    capBlocked: rows.filter(
      (r) => r.reward_block_reason === 'monthly_cap_reached',
    ).length,
  };

  return { data: { stats, list } };
}

/** @deprecated Use getReferralData instead — returns both stats and list. */
export async function getReferralPilotStats(
  gymId: string,
): Promise<{ data: ReferralStats | null; error?: string }> {
  const result = await getReferralData(gymId);
  if (!result.data) return { data: null, error: result.error };
  return { data: result.data.stats };
}
