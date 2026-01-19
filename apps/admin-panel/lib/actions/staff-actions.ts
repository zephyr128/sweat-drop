'use server';

import { createClient } from '@/lib/supabase-server';
import { getAdminClient } from '@/lib/utils/supabase-admin';
import { logger } from '@/lib/utils/logger';
import { revalidatePath } from 'next/cache';

export interface StaffInvitation {
  id: string;
  gym_id: string;
  email: string;
  role: 'gym_admin' | 'receptionist';
  status: 'pending' | 'accepted' | 'expired' | 'cancelled';
  created_at: string;
  expires_at: string;
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
 * Send invitation email to staff member
 * For now, logs the invitation URL (development mode)
 * In production, integrate with Resend, SendGrid, or Supabase Edge Function
 */
async function sendInvitationEmail(invitation: any) {
  try {
    // Get gym details
    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      logger.error('Admin client not available for sending invitation email');
      return;
    }
    const { data: gym } = await supabaseAdmin
      .from('gyms')
      .select('name, city, country')
      .eq('id', invitation.gym_id)
      .single();

    const gymData = gym as { name: string; city: string | null; country: string | null } | null;
    const gymName = gymData?.name || 'the gym';
    const roleName = invitation.role === 'gym_admin' ? 'Gym Admin' : 'Receptionist';
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const acceptUrl = `${baseUrl}/accept-invitation/${invitation.token}`;

    // TODO: Integrate with email service (Resend, SendGrid, etc.)
    // For now, log the invitation URL for manual sharing
    logger.info('Staff Invitation Created', {
      email: invitation.email,
      gymName,
      roleName,
      acceptUrl,
      note: 'Email service not configured. Share this URL manually with the staff member.',
    });

    // Option 1: Use Supabase Edge Function (if configured)
    // Uncomment when Edge Function is set up:
    /*
    const supabaseAdmin = getAdminClient();
    const { error: functionError } = await supabaseAdmin.functions.invoke('send-staff-invitation', {
      body: {
        email: invitation.email,
        gymName,
        roleName,
        acceptUrl,
        token: invitation.token,
      },
    });
    if (functionError) {
      logger.error('Edge Function email error', { functionError });
    }
    */

    // Option 2: Use Resend API (recommended for production)
    // Uncomment when Resend is configured:
    /*
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (RESEND_API_KEY) {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'SweatDrop <noreply@sweatdrop.com>',
          to: invitation.email,
          subject: `You've been invited to join ${gymName} as ${roleName}`,
          html: `
            <h2>Staff Invitation</h2>
            <p>You've been invited to join <strong>${gymName}</strong> as a <strong>${roleName}</strong>.</p>
            <p><a href="${acceptUrl}">Click here to accept the invitation</a></p>
            <p>Or copy this link: ${acceptUrl}</p>
          `,
        }),
      });
      if (!response.ok) {
        throw new Error('Failed to send email via Resend');
      }
    }
    */
  } catch (error) {
    logger.error('Error sending invitation email', { error, invitationId: invitation.id });
    // Don't throw - email failure shouldn't block invitation creation
  }
}
