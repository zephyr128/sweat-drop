'use server';

import { createClient } from '@/lib/supabase-server';
import { getAdminClient } from '@/lib/utils/supabase-admin';
import { logger } from '@/lib/utils/logger';
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
      await sendInvitationEmail(data);
    } catch (emailError) {
      logger.error('Failed to send invitation email', { emailError, invitationId: data.id });
      // Don't fail the invitation creation if email fails
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

    if (!staffError && staffData) {
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
 * Send invitation email to staff member.
 * Uses Resend API when RESEND_API_KEY is set, otherwise logs the URL for manual sharing.
 */
async function sendInvitationEmail(invitation: Record<string, unknown>) {
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
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const fromAddress = process.env.RESEND_FROM_EMAIL || 'SweatDrop <noreply@sweatdrop.com>';

    if (RESEND_API_KEY) {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromAddress,
          to: invitation.email,
          subject: `You've been invited to join ${gymName} as ${roleName}`,
          html: [
            '<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0A0A0A;color:#ffffff;border-radius:12px">',
            `<h2 style="margin:0 0 16px;color:#00E5FF">Staff Invitation</h2>`,
            `<p style="color:#d4d4d8">You've been invited to join <strong style="color:#fff">${gymName}</strong> as a <strong style="color:#00E5FF">${roleName}</strong>.</p>`,
            `<a href="${acceptUrl}" style="display:inline-block;margin:20px 0;padding:12px 28px;background:#00E5FF;color:#000;font-weight:bold;text-decoration:none;border-radius:8px">Accept Invitation</a>`,
            `<p style="font-size:12px;color:#71717a;margin-top:24px">Or copy this link:<br/><a href="${acceptUrl}" style="color:#00E5FF;word-break:break-all">${acceptUrl}</a></p>`,
            '</div>',
          ].join(''),
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        logger.error('Resend API error', { status: response.status, body, email: invitation.email });

        // Update delivery status — table not in generated types, use untyped query
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabaseAdmin as any).from('staff_invitations')
          .update({ email_delivery_status: 'failed', email_failure_reason: `Resend ${response.status}` })
          .eq('id', invitation.id);
      } else {
        logger.info('Staff invitation email sent via Resend', { email: invitation.email, gymName });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabaseAdmin as any).from('staff_invitations')
          .update({ email_delivery_status: 'sent', email_sent_at: new Date().toISOString() })
          .eq('id', invitation.id);
      }
    } else {
      logger.info('Staff Invitation Created (no email provider)', {
        email: invitation.email,
        gymName,
        roleName,
        acceptUrl,
        note: 'Set RESEND_API_KEY to enable email delivery. Share the URL manually for now.',
      });
    }
  } catch (error) {
    logger.error('Error sending invitation email', { error, invitationId: invitation.id });
  }
}
