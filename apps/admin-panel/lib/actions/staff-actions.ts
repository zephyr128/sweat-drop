'use server';

import { createClient } from '@/lib/supabase-server';
import { getAdminClient } from '@/lib/utils/supabase-admin';
import { logger } from '@/lib/utils/logger';
import { sendEmail, buildStaffInvitationEmailHtml } from '@/lib/utils/email-service';
import { revalidatePath } from 'next/cache';

export interface StaffInvitation {
  id: string;
  gym_id: string;
  email: string;
  token?: string;
  role: 'gym_admin' | 'receptionist';
  status: 'pending' | 'accepted' | 'expired' | 'cancelled';
  created_at: string;
  expires_at: string;
  email_delivery_status: 'pending' | 'sent' | 'failed';
  email_sent_at: string | null;
  email_failure_reason: string | null;
  resend_count: number;
  accepted_at?: string | null;
}

export async function createStaffInvitation(
  gymId: string,
  email: string,
  role: 'gym_admin' | 'receptionist'
) {
  try {
    const supabase = await createClient();

    // Check if user already has a profile with this email
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id, email, role, assigned_gym_id')
      .eq('email', email)
      .single();

    if (existingProfile) {
      // Check if already staff member
      if (existingProfile.assigned_gym_id === gymId && (existingProfile.role === 'gym_admin' || existingProfile.role === 'receptionist')) {
        return { success: false, error: 'User is already a staff member of this gym' };
      }
    }

    // Check for existing pending invitation
    const { data: existingInvitation } = await supabase
      .from('staff_invitations')
      .select('id')
      .eq('gym_id', gymId)
      .eq('email', email)
      .eq('status', 'pending')
      .single();

    if (existingInvitation) {
      return { success: false, error: 'An invitation is already pending for this email' };
    }

    // Create invitation
    const { data, error } = await supabase
      .from('staff_invitations')
      .insert({
        gym_id: gymId,
        email: email.toLowerCase().trim(),
        role,
        invited_by: (await supabase.auth.getUser()).data.user?.id,
      })
      .select()
      .single();

    if (error) throw error;

    // Send invitation email
    try {
      await sendStaffInvitationEmailViaService(data);
    } catch (emailError) {
      logger.error('Failed to send invitation email', { emailError, invitationId: data.id });
    }

    revalidatePath(`/dashboard/gym/${gymId}/team`);
    return { success: true, data };
  } catch (error: any) {
    logger.error('Error creating staff invitation', { error, gymId, email, role });
    return { success: false, error: error.message || 'Failed to create invitation' };
  }
}

export async function getStaffInvitations(gymId: string) {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('staff_invitations')
      .select('*')
      .eq('gym_id', gymId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return { success: true, data: data || [] };
  } catch (error: any) {
    logger.error('Error fetching staff invitations', { error, gymId });
    return { success: false, error: error.message, data: [] };
  }
}

export async function cancelInvitation(invitationId: string, gymId: string) {
  try {
    const supabase = await createClient();

    const { error } = await supabase
      .from('staff_invitations')
      .update({ status: 'cancelled' })
      .eq('id', invitationId)
      .eq('gym_id', gymId);

    if (error) throw error;

    revalidatePath(`/dashboard/gym/${gymId}/team`);
    return { success: true };
  } catch (error: any) {
    logger.error('Error cancelling invitation', { error, invitationId, gymId });
    return { success: false, error: error.message };
  }
}

export async function getStaffMembers(gymId: string) {
  try {
    const supabase = await createClient();

    // Try new gym_staff table first, fallback to profiles
    const { data: staffData, error: staffError } = await supabase
      .rpc('get_gym_staff', { p_gym_id: gymId });

    // Invited staff update profiles (assigned_gym_id) but may have no gym_staff row;
    // empty [] is truthy so we must fall through to profiles when there are no rows.
    if (
      !staffError &&
      Array.isArray(staffData) &&
      staffData.length > 0
    ) {
      return { success: true, data: staffData };
    }

    // Fallback to profiles table
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, email, role, created_at')
      .eq('assigned_gym_id', gymId)
      .in('role', ['gym_admin', 'receptionist'])
      .order('created_at', { ascending: false });

    if (error) throw error;

    return { success: true, data: data || [] };
  } catch (error: any) {
    logger.error('Error fetching staff members', { error, gymId });
    return { success: false, error: error.message, data: [] };
  }
}

/**
 * Assign staff role to a user for a gym
 * Gym owner can assign gym_admin and receptionist
 * Gym admin can assign receptionist
 */
export async function assignStaffRole(
  userId: string,
  gymId: string,
  role: 'gym_admin' | 'receptionist'
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase.rpc('assign_staff_role', {
      p_user_id: userId,
      p_gym_id: gymId,
      p_role: role,
      p_assigned_by: user.id,
    });

    if (error) throw error;

    revalidatePath(`/dashboard/gym/${gymId}/team`);
    return { success: true, data };
  } catch (error: any) {
    logger.error('Error assigning staff role', { error, userId, gymId, role });
    return { success: false, error: error.message };
  }
}

/**
 * Remove staff role assignment
 */
export async function removeStaffRole(userId: string, gymId: string) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await supabase.rpc('remove_staff_role', {
      p_user_id: userId,
      p_gym_id: gymId,
      p_removed_by: user.id,
    });

    if (error) throw error;

    revalidatePath(`/dashboard/gym/${gymId}/team`);
    return { success: true };
  } catch (error: any) {
    logger.error('Error removing staff role', { error, userId, gymId });
    return { success: false, error: error.message };
  }
}

/**
 * Resend invitation email via RPC (resets delivery status, bumps resend_count)
 * then actually re-sends the email via Resend.
 */
export async function resendStaffInvitationEmail(invitationId: string, gymId: string) {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase.rpc('resend_staff_invitation_email', {
      p_invitation_id: invitationId,
    });

    if (error) throw error;

    const result = data as { error?: string; success?: boolean; invitation?: Record<string, unknown> } | null;
    if (result?.error) {
      return { success: false, error: result.error };
    }

    // Actually re-send the email after RPC resets status
    if (result?.invitation) {
      try {
        await sendStaffInvitationEmailViaService(result.invitation);
      } catch (emailError) {
        logger.error('Failed to resend invitation email', { emailError, invitationId });
      }
    }

    revalidatePath(`/dashboard/gym/${gymId}/team`);
    return { success: true, data: result?.invitation };
  } catch (error: any) {
    logger.error('Error resending staff invitation email', { error, invitationId, gymId });
    return { success: false, error: error.message || 'Failed to resend invitation' };
  }
}

/**
 * Build invite accept URL for copy-to-clipboard fallback
 */
export async function getInviteAcceptUrl(token: string): Promise<string> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${baseUrl}/accept-invitation/${token}`;
}

/**
 * Send a staff invitation email using the centralized email service,
 * then update delivery status in the database.
 */
async function sendStaffInvitationEmailViaService(invitation: Record<string, unknown>) {
  try {
    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      logger.error('Admin client not available for sending invitation email');
      return;
    }

    const { data: gym } = await supabaseAdmin
      .from('gyms')
      .select('name, city, country')
      .eq('id', invitation.gym_id as string)
      .single();

    const gymData = gym as { name: string; city: string | null; country: string | null } | null;
    const gymName = gymData?.name || 'the gym';
    const roleName = invitation.role === 'gym_admin' ? 'Gym Admin' : 'Receptionist';
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const acceptUrl = `${baseUrl}/accept-invitation/${invitation.token}`;

    const html = buildStaffInvitationEmailHtml({ gymName, roleName, acceptUrl });
    const result = await sendEmail({
      to: invitation.email as string,
      subject: `You've been invited to join ${gymName} as ${roleName}`,
      html,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (result.success) {
      await (supabaseAdmin as any).from('staff_invitations')
        .update({ email_delivery_status: 'sent', email_sent_at: new Date().toISOString() })
        .eq('id', invitation.id);
    } else if (result.error && result.error !== 'RESEND_API_KEY not configured') {
      await (supabaseAdmin as any).from('staff_invitations')
        .update({ email_delivery_status: 'failed', email_failure_reason: result.error })
        .eq('id', invitation.id);
    }
  } catch (error) {
    logger.error('Error sending invitation email', { error, invitationId: invitation.id });
  }
}
