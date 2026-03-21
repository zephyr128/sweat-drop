'use server';

import { getAdminClient } from '@/lib/utils/supabase-admin';
import { createClient as createServerClient } from '@/lib/supabase-server';
import { revalidatePath } from 'next/cache';
import { getCurrentProfile } from '../auth';

export interface ArenaInvitation {
  id: string;
  arena_id: string;
  invited_gym_id: string;
  invited_by: string;
  invited_user_id: string | null;
  status: 'pending' | 'accepted' | 'declined' | 'withdrawn';
  revenue_share_percent: number;
  revenue_share_note: string | null;
  responded_at: string | null;
  responded_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  gym_name?: string;
  owner_name?: string;
  arena_name?: string;
  arena_start_date?: string;
  arena_end_date?: string;
  arena_scoring_model?: string;
  arena_prizes?: Array<{ rank: number; prize: string }>;
  arena_is_active?: boolean;
  arena_is_finalized?: boolean;
}

export interface GymScoreEntry {
  gym_id: string;
  gym_name: string;
  score: number;
  sessions: number;
}

export interface GymBreakdownPrivacy {
  own_gym_score: number;
  other_gyms_score: number;
  total_sessions: number;
}

export type GymBreakdown = GymScoreEntry[] | GymBreakdownPrivacy;

export interface ArenaResult {
  rank: number;
  user_id: string;
  username: string;
  avatar_url: string | null;
  email: string | null;
  gym_name: string;
  /** Gym id to open member detail (membership context) */
  member_gym_id: string | null;
  final_score: number;
  prize: string | null;
  redemption_code: string | null;
  redemption_status: string | null;
  gym_breakdown: GymBreakdown | null;
}

export async function sendArenaInvitations(
  arenaId: string,
  gymIds: string[],
  revenueSharePercent: number,
  revenueShareNote?: string
): Promise<{ success: boolean; sentCount?: number; error?: string }> {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return { success: false, error: 'Not authenticated' };
    }

    if (profile.role !== 'superadmin') {
      return { success: false, error: 'Only superadmin can send arena invitations' };
    }

    // CRITICAL: Use authenticated client for RPC calls that check auth.uid()
    // The admin (service role) client has NO user session, so auth.uid() returns null
    // inside SECURITY DEFINER functions, causing the is_superadmin() check to fail.
    const supabase = await createServerClient();

    const { data, error } = await supabase.rpc('send_arena_invitations', {
      p_arena_id: arenaId,
      p_gym_ids: gymIds,
      p_revenue_share_percent: revenueSharePercent,
      p_revenue_share_note: revenueShareNote || null,
    });

    if (error) {
      console.error('[sendArenaInvitations] RPC error:', error);
      throw error;
    }

    const result = (data as any)?.[0] || data;
    const sentCount = result?.sent_count ?? 0;
    const errorMessage = result?.error_message;

    if (errorMessage) {
      return { success: false, error: errorMessage };
    }

    revalidatePath('/dashboard/arenas');
    return { success: true, sentCount };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Failed to send invitations';
    return { success: false, error: errMsg };
  }
}

export async function getArenaInvitations(
  arenaId: string
): Promise<{ success: boolean; data?: ArenaInvitation[]; error?: string }> {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return { success: false, error: 'Not authenticated' };
    }

    if (!['superadmin', 'gym_owner', 'gym_admin'].includes(profile.role)) {
      return { success: false, error: 'Unauthorized' };
    }

    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available.' };
    }

    const { data, error } = await supabaseAdmin
      .from('arena_invitations')
      .select(`
        *,
        gyms:invited_gym_id (name),
        invited_profile:invited_user_id (username)
      `)
      .eq('arena_id', arenaId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const invitations: ArenaInvitation[] = ((data || []) as any[]).map((inv) => ({
      id: inv.id,
      arena_id: inv.arena_id,
      invited_gym_id: inv.invited_gym_id,
      invited_by: inv.invited_by,
      invited_user_id: inv.invited_user_id,
      status: inv.status,
      revenue_share_percent: Number(inv.revenue_share_percent) || 0,
      revenue_share_note: inv.revenue_share_note,
      responded_at: inv.responded_at,
      responded_by: inv.responded_by,
      created_at: inv.created_at,
      updated_at: inv.updated_at,
      gym_name: inv.gyms?.name || 'Unknown',
      owner_name: inv.invited_profile?.username || 'Unknown',
    }));

    return { success: true, data: invitations };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Failed to fetch invitations';
    return { success: false, error: errMsg };
  }
}

export async function getPendingInvitations(
  gymId?: string
): Promise<{ success: boolean; data?: ArenaInvitation[]; error?: string }> {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return { success: false, error: 'Not authenticated' };
    }

    if (!['superadmin', 'gym_owner', 'gym_admin'].includes(profile.role)) {
      return { success: false, error: 'Unauthorized' };
    }

    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available.' };
    }

    let query = supabaseAdmin
      .from('arena_invitations')
      .select(`
        *,
        gyms:invited_gym_id (name),
        arenas:arena_id (name, start_date, end_date, scoring_model, prizes)
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (gymId) {
      query = query.eq('invited_gym_id', gymId);
    }

    const { data, error } = await query;
    if (error) throw error;

    const invitations: ArenaInvitation[] = ((data || []) as any[]).map((inv) => ({
      id: inv.id,
      arena_id: inv.arena_id,
      invited_gym_id: inv.invited_gym_id,
      invited_by: inv.invited_by,
      invited_user_id: inv.invited_user_id,
      status: inv.status,
      revenue_share_percent: Number(inv.revenue_share_percent) || 0,
      revenue_share_note: inv.revenue_share_note,
      responded_at: inv.responded_at,
      responded_by: inv.responded_by,
      created_at: inv.created_at,
      updated_at: inv.updated_at,
      gym_name: inv.gyms?.name || 'Unknown',
      arena_name: inv.arenas?.name || 'Unknown',
      arena_start_date: inv.arenas?.start_date,
      arena_end_date: inv.arenas?.end_date,
      arena_scoring_model: inv.arenas?.scoring_model,
      arena_prizes: inv.arenas?.prizes,
    }));

    return { success: true, data: invitations };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Failed to fetch invitations';
    return { success: false, error: errMsg };
  }
}

export async function respondToInvitation(
  invitationId: string,
  response: 'accepted' | 'declined'
): Promise<{ success: boolean; error?: string }> {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return { success: false, error: 'Not authenticated' };
    }

    if (!['superadmin', 'gym_owner', 'gym_admin'].includes(profile.role)) {
      return { success: false, error: 'Unauthorized' };
    }

    // Use authenticated client for RPC calls that check auth.uid()
    const supabase = await createServerClient();

    const { data, error } = await supabase.rpc('respond_to_arena_invitation', {
      p_invitation_id: invitationId,
      p_response: response,
    });

    if (error) {
      console.error('[respondToInvitation] RPC error:', error);
      throw error;
    }

    const result = (data as any)?.[0] || data;
    if (result?.success === false) {
      return { success: false, error: result.error_message || 'Failed to respond' };
    }

    revalidatePath('/dashboard/arenas');
    return { success: true };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Failed to respond to invitation';
    return { success: false, error: errMsg };
  }
}

export async function getArenaResults(
  arenaId: string,
  viewingGymId?: string
): Promise<{ success: boolean; data?: ArenaResult[]; error?: string }> {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return { success: false, error: 'Not authenticated' };
    }

    if (!['superadmin', 'gym_owner', 'gym_admin'].includes(profile.role)) {
      return { success: false, error: 'Unauthorized' };
    }

    // Use authenticated client for RPC calls that check auth.uid()
    const supabase = await createServerClient();

    const { data, error } = await supabase.rpc('get_arena_results', {
      p_arena_id: arenaId,
    });

    if (error) {
      console.error('[getArenaResults] RPC error:', error);
      throw error;
    }

    // Determine caller's gym for privacy view
    // Priority: explicit viewingGymId > assigned_gym_id
    const isSuperadmin = profile.role === 'superadmin';
    const callerGymId: string | null = viewingGymId || profile.assigned_gym_id || null;

    const supabaseAdmin = getAdminClient();

    // For non-superadmin: fetch participant gym_ids to anonymize gym names
    const userGymMap = new Map<string, string>();
    if (!isSuperadmin && callerGymId && supabaseAdmin) {
      const { data: participants } = await supabaseAdmin
        .from('arena_participants')
        .select('user_id, gym_id')
        .eq('arena_id', arenaId);
      const list = (participants ?? []) as Array<{ user_id: string; gym_id: string }>;
      for (const p of list) {
        userGymMap.set(p.user_id, p.gym_id);
      }
    }

    // Fetch user emails via auth admin API (superadmin only)
    const userEmailMap = new Map<string, string>();
    if (isSuperadmin && supabaseAdmin && data && (data as any[]).length > 0) {
      const userIds = (data as any[]).map((r) => r.user_id).filter(Boolean);
      // Batch fetch from profiles table which mirrors auth.users email
      const { data: profileEmails } = await supabaseAdmin
        .from('profiles')
        .select('id, email')
        .in('id', userIds);
      if (profileEmails) {
        for (const p of profileEmails as any[]) {
          if (p.email) userEmailMap.set(p.id, p.email);
        }
      }
      // Fallback: fetch from auth.users for any missing emails
      const missingIds = userIds.filter((id: string) => !userEmailMap.has(id));
      if (missingIds.length > 0) {
        try {
          const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
          if (authUsers?.users) {
            for (const u of authUsers.users) {
              if (missingIds.includes(u.id) && u.email) {
                userEmailMap.set(u.id, u.email);
              }
            }
          }
        } catch (authErr) {
          console.error('[getArenaResults] Failed to fetch auth emails:', authErr);
        }
      }
    }

    const results: ArenaResult[] = ((data || []) as any[]).map((r) => {
      const breakdown = r.gym_breakdown;

      // Determine displayed gym name from breakdown (top-scoring gym)
      // instead of arena_results.gym_id which may be the user's home gym
      let displayGymName = r.gym_name || 'Unknown';
      let displayGymId: string | null = null;

      if (isSuperadmin && Array.isArray(breakdown) && breakdown.length > 0) {
        // Superadmin: breakdown is array sorted by score DESC, use first entry
        displayGymName = breakdown[0].gym_name || displayGymName;
        displayGymId = breakdown[0].gym_id || null;
      } else if (!isSuperadmin && callerGymId) {
        // Gym owner: check if user belongs to caller's gym via participant map
        const participantGymId = userGymMap.get(r.user_id);
        displayGymId = participantGymId || null;

        // Use breakdown to determine if user has activity in our gym
        if (breakdown && !Array.isArray(breakdown) && 'own_gym_score' in breakdown) {
          if (breakdown.own_gym_score > 0 && breakdown.own_gym_score >= breakdown.other_gyms_score) {
            // User's primary activity is in our gym — show our gym name
            // (displayGymName from RPC is fine since it's the home gym)
          } else {
            displayGymName = 'Other Gym';
          }
        } else if (participantGymId && participantGymId !== callerGymId) {
          displayGymName = 'Other Gym';
        }
      }

      const rawAv = r.avatar_url;
      const avatarNorm =
        typeof rawAv === 'string' && rawAv.trim() ? rawAv.trim() : null;

      const memberGymId =
        displayGymId ||
        userGymMap.get(r.user_id) ||
        (typeof (r as { gym_id?: string }).gym_id === 'string'
          ? (r as { gym_id: string }).gym_id
          : null);

      return {
        rank: r.rank,
        user_id: r.user_id,
        username: r.username || 'Unknown',
        avatar_url: avatarNorm,
        email: isSuperadmin ? (userEmailMap.get(r.user_id) || null) : null,
        gym_name: displayGymName,
        member_gym_id: memberGymId,
        final_score: Number(r.final_score) || 0,
        prize: r.prize || null,
        redemption_code: r.redemption_code || null,
        redemption_status: r.redemption_status || null,
        gym_breakdown: r.gym_breakdown || null,
      };
    });

    return { success: true, data: results };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Failed to fetch arena results';
    return { success: false, error: errMsg };
  }
}

export async function getAcceptedInvitations(
  gymId: string
): Promise<{ success: boolean; data?: ArenaInvitation[]; error?: string }> {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return { success: false, error: 'Not authenticated' };
    }

    if (!['superadmin', 'gym_owner', 'gym_admin'].includes(profile.role)) {
      return { success: false, error: 'Unauthorized' };
    }

    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available.' };
    }

    const { data, error } = await supabaseAdmin
      .from('arena_invitations')
      .select(`
        *,
        gyms:invited_gym_id (name),
        arenas:arena_id (name, start_date, end_date, scoring_model, prizes, is_active, is_finalized)
      `)
      .eq('invited_gym_id', gymId)
      .eq('status', 'accepted')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const invitations: ArenaInvitation[] = ((data || []) as any[]).map((inv) => ({
      id: inv.id,
      arena_id: inv.arena_id,
      invited_gym_id: inv.invited_gym_id,
      invited_by: inv.invited_by,
      invited_user_id: inv.invited_user_id,
      status: inv.status,
      revenue_share_percent: Number(inv.revenue_share_percent) || 0,
      revenue_share_note: inv.revenue_share_note,
      responded_at: inv.responded_at,
      responded_by: inv.responded_by,
      created_at: inv.created_at,
      updated_at: inv.updated_at,
      gym_name: inv.gyms?.name || 'Unknown',
      arena_name: inv.arenas?.name || 'Unknown',
      arena_start_date: inv.arenas?.start_date,
      arena_end_date: inv.arenas?.end_date,
      arena_scoring_model: inv.arenas?.scoring_model,
      arena_prizes: inv.arenas?.prizes,
      arena_is_active: inv.arenas?.is_active,
      arena_is_finalized: inv.arenas?.is_finalized,
    }));

    return { success: true, data: invitations };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Failed to fetch accepted invitations';
    return { success: false, error: errMsg };
  }
}

export async function withdrawFromArena(
  arenaId: string,
  gymId: string
): Promise<{ success: boolean; participantsRemoved?: number; dropsRefunded?: number; error?: string }> {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return { success: false, error: 'Not authenticated' };
    }

    if (!['superadmin', 'gym_owner', 'gym_admin'].includes(profile.role)) {
      return { success: false, error: 'Unauthorized' };
    }

    // Use authenticated client for RPC calls that check auth.uid()
    const supabase = await createServerClient();

    const { data, error } = await supabase.rpc('withdraw_gym_from_arena', {
      p_arena_id: arenaId,
      p_gym_id: gymId,
    });

    if (error) {
      console.error('[withdrawFromArena] RPC error:', error);
      throw error;
    }

    const result = data as any;
    if (result?.success === false) {
      return { success: false, error: result.error || 'Failed to withdraw' };
    }

    revalidatePath('/dashboard/arenas');
    return {
      success: true,
      participantsRemoved: result?.participants_removed ?? 0,
      dropsRefunded: result?.drops_refunded_total ?? 0,
    };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Failed to withdraw from arena';
    return { success: false, error: errMsg };
  }
}

export async function getPendingInvitationCount(
  gymId: string
): Promise<number> {
  try {
    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) return 0;

    const { count, error } = await supabaseAdmin
      .from('arena_invitations')
      .select('id', { count: 'exact', head: true })
      .eq('invited_gym_id', gymId)
      .eq('status', 'pending');

    if (error) return 0;
    return count || 0;
  } catch {
    return 0;
  }
}
