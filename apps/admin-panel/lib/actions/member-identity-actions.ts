'use server';

import { createClient } from '@/lib/supabase-server';
import { logger } from '@/lib/utils/logger';
import { getCurrentProfile } from '@/lib/auth';

export interface IdentityCandidate {
  user_id: string;
  username: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  role: string;
  membership: {
    membership_id: string;
    local_drops_balance: number;
    joined_at: string;
  } | null;
  identity: {
    identity_id: string | null;
    is_verified: boolean;
    full_name_verified: string | null;
    external_membership_id: string | null;
    verified_by: string | null;
    verified_at: string | null;
    verification_notes: string | null;
  };
  last_checkin: string | null;
  total_checkins: number;
}

export interface VerifyResult {
  identity_id: string;
  verified_by: string;
  verified_at: string;
}

/**
 * Fetch identity + profile data for a member at check-in.
 * Calls RPC get_checkin_identity_candidates.
 */
export async function getCheckinIdentityCandidate(
  gymId: string,
  userId: string,
): Promise<{ success: boolean; data?: IdentityCandidate; error?: string }> {
  try {
    if (!gymId || !userId) {
      return { success: false, error: 'Gym ID and User ID are required' };
    }

    const supabase = await createClient();

    const { data, error } = await supabase.rpc('get_checkin_identity_candidates', {
      p_gym_id: gymId,
      p_user_id: userId,
    });

    if (error) throw error;

    const result = data as Record<string, unknown> | null;
    if (!result || result.error) {
      return { success: false, error: (result?.error as string) || 'User not found' };
    }

    return { success: true, data: result as unknown as IdentityCandidate };
  } catch (error: unknown) {
    logger.error('Error fetching identity candidate', { error, gymId, userId });
    return { success: false, error: error instanceof Error ? error.message : 'Failed to fetch identity data' };
  }
}

/**
 * Save identity info without marking verified.
 * Calls RPC upsert_physical_member_identity.
 */
export async function upsertPhysicalMemberIdentity(
  gymId: string,
  userId: string,
  fullNameVerified?: string | null,
  externalMembershipId?: string | null,
  verificationNotes?: string | null,
): Promise<{ success: boolean; data?: { identity_id: string }; error?: string }> {
  try {
    if (!gymId || !userId) {
      return { success: false, error: 'Gym ID and User ID are required' };
    }

    const profile = await getCurrentProfile();
    if (!profile) return { success: false, error: 'Not authenticated' };

    const ALLOWED = ['superadmin', 'gym_owner', 'gym_admin', 'receptionist'];
    if (!ALLOWED.includes(profile.role)) return { success: false, error: 'Unauthorized' };

    const supabase = await createClient();

    const { data, error } = await supabase.rpc('upsert_physical_member_identity', {
      p_gym_id: gymId,
      p_user_id: userId,
      p_full_name_verified: fullNameVerified ?? null,
      p_external_membership_id: externalMembershipId ?? null,
      p_verification_notes: verificationNotes ?? null,
    });

    if (error) throw error;

    const result = data as Record<string, unknown> | null;
    if (result?.error) {
      return { success: false, error: result.error as string };
    }

    return { success: true, data: { identity_id: result?.identity_id as string } };
  } catch (error: unknown) {
    logger.error('Error upserting member identity', { error, gymId, userId });
    return { success: false, error: error instanceof Error ? error.message : 'Failed to save identity' };
  }
}

/**
 * Verify a member's physical identity (marks is_verified = true with audit trail).
 * Calls RPC verify_member_identity.
 */
export async function verifyMemberIdentity(
  gymId: string,
  userId: string,
  fullNameVerified?: string | null,
  externalMembershipId?: string | null,
  verificationNotes?: string | null,
): Promise<{ success: boolean; data?: VerifyResult; error?: string }> {
  try {
    if (!gymId || !userId) {
      return { success: false, error: 'Gym ID and User ID are required' };
    }

    const profile = await getCurrentProfile();
    if (!profile) return { success: false, error: 'Not authenticated' };

    const ALLOWED = ['superadmin', 'gym_owner', 'gym_admin', 'receptionist'];
    if (!ALLOWED.includes(profile.role)) return { success: false, error: 'Unauthorized' };

    const supabase = await createClient();

    const { data, error } = await supabase.rpc('verify_member_identity', {
      p_gym_id: gymId,
      p_user_id: userId,
      p_full_name_verified: fullNameVerified ?? null,
      p_external_membership_id: externalMembershipId ?? null,
      p_verification_notes: verificationNotes ?? null,
    });

    if (error) throw error;

    const result = data as Record<string, unknown> | null;
    if (result?.error) {
      return { success: false, error: result.error as string };
    }

    return {
      success: true,
      data: {
        identity_id: result?.identity_id as string,
        verified_by: result?.verified_by as string,
        verified_at: result?.verified_at as string,
      },
    };
  } catch (error: unknown) {
    logger.error('Error verifying member identity', { error, gymId, userId });
    return { success: false, error: error instanceof Error ? error.message : 'Failed to verify identity' };
  }
}
