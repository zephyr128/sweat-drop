'use server';

import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase-server';
import { revalidatePath } from 'next/cache';
import { getCurrentProfile } from '../auth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

interface CreateOwnerInput {
  email: string;
  username: string;
  full_name?: string;
  gym_id?: string; // Optional: if creating owner for a specific gym
}

/**
 * Create an invitation for a new gym owner (SuperAdmin only)
 * Owner will receive an invitation email and can create their account
 */
export async function createOwner(input: CreateOwnerInput) {
  try {
    const profile = await getCurrentProfile();
    if (!profile || profile.role !== 'superadmin') {
      return { success: false, error: 'Only superadmins can create owners' };
    }

    // Check if user already exists
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, email, role')
      .eq('email', input.email)
      .single();

    if (existingProfile) {
      // If user exists, check if they're already an owner
      if (existingProfile.role === 'gym_owner') {
        return { success: false, error: 'User is already a gym owner' };
      }
      // If user exists with different role, we can still send invitation
      // They can accept it to become owner
    }

    // Check for existing pending invitation
    const { data: existingInvitation } = await supabaseAdmin
      .from('staff_invitations')
      .select('id')
      .eq('email', input.email.toLowerCase().trim())
      .eq('role', 'gym_owner')
      .eq('status', 'pending')
      .single();

    if (existingInvitation) {
      return { success: false, error: 'An invitation is already pending for this email' };
    }

    // Create invitation (no gym_id for general owner invitations)
    const { data: invitation, error: invitationError } = await supabaseAdmin
      .from('staff_invitations')
      .insert({
        email: input.email.toLowerCase().trim(),
        role: 'gym_owner',
        invited_by: profile.id,
        gym_id: input.gym_id || null, // If gym_id provided, assign gym on acceptance
      })
      .select()
      .single();

    if (invitationError) throw invitationError;

    // Send invitation email
    try {
      await sendOwnerInvitationEmail(invitation);
    } catch (emailError) {
      console.error('Failed to send owner invitation email:', emailError);
      // Don't fail the invitation creation if email fails
    }

    revalidatePath('/dashboard/super/owners');
    return { success: true, data: invitation };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Send owner invitation email
 */
async function sendOwnerInvitationEmail(invitation: any, gymName?: string) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const acceptUrl = `${baseUrl}/accept-invitation/${invitation.token}`;

    // TODO: Integrate with email service (Resend, SendGrid, etc.)
    // For now, log the invitation URL for manual sharing
    console.log('Owner Invitation Created', {
      email: invitation.email,
      acceptUrl,
      note: 'Email service not configured. Share this URL manually with the owner.',
    });

    // Option 1: Use Supabase Edge Function (if configured)
    // Option 2: Use Resend API (recommended for production)
    // See staff-actions.ts for example implementation
  } catch (error) {
    console.error('Error sending owner invitation email:', error);
    // Don't throw - email failure shouldn't block invitation creation
  }
}

/**
 * Delete a gym owner (SuperAdmin only)
 * WARNING: This will reassign all their gyms to a different owner or leave them unassigned
 */
export async function deleteOwner(ownerId: string, reassignToOwnerId?: string) {
  try {
    const profile = await getCurrentProfile();
    if (!profile || profile.role !== 'superadmin') {
      return { success: false, error: 'Only superadmins can delete owners' };
    }

    // Check if owner has gyms
    const { data: gyms, error: gymsError } = await supabaseAdmin
      .from('gyms')
      .select('id, name')
      .eq('owner_id', ownerId);

    if (gymsError) throw gymsError;

    // If owner has gyms, reassign them or set to null
    if (gyms && gyms.length > 0) {
      if (reassignToOwnerId) {
        // Reassign all gyms to another owner
        const { error: reassignError } = await supabaseAdmin
          .from('gyms')
          .update({ owner_id: reassignToOwnerId })
          .eq('owner_id', ownerId);

        if (reassignError) throw reassignError;
      } else {
        // Set owner_id to null (gyms will be unassigned)
        const { error: unassignError } = await supabaseAdmin
          .from('gyms')
          .update({ owner_id: null })
          .eq('owner_id', ownerId);

        if (unassignError) throw unassignError;
      }
    }

    // Update profile role to 'user' instead of deleting (to preserve auth user)
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({
        role: 'user',
        owner_id: null,
      })
      .eq('id', ownerId);

    if (updateError) throw updateError;

    // Optionally delete auth user (uncomment if you want to delete the auth user too)
    // await supabaseAdmin.auth.admin.deleteUser(ownerId);

    revalidatePath('/dashboard/super/owners');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Get all gym owners with their gyms (SuperAdmin only)
 */
export async function getOwnersWithGyms() {
  try {
    const profile = await getCurrentProfile();
    if (!profile || profile.role !== 'superadmin') {
      return { success: false, error: 'Only superadmins can view owners', data: [] };
    }

    // Fetch all gym owners
    const { data: ownersData, error: ownersError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, username, full_name, created_at')
      .eq('role', 'gym_owner')
      .order('created_at', { ascending: false });

    if (ownersError) throw ownersError;

    // Fetch all gyms for these owners
    const ownerIds = ownersData?.map(o => o.id) || [];
    const { data: gymsData, error: gymsError } = ownerIds.length > 0
      ? await supabaseAdmin
          .from('gyms')
          .select('id, name, city, country, status, subscription_type, created_at, owner_id')
          .in('owner_id', ownerIds)
      : { data: [], error: null };

    if (gymsError) {
      console.error('Error fetching gyms:', gymsError);
    }

    // Combine owners with their gyms
    const owners = ownersData?.map(owner => ({
      ...owner,
      gyms: gymsData?.filter(g => g.owner_id === owner.id) || []
    })) || [];

    return { success: true, data: owners };
  } catch (error: any) {
    return { success: false, error: error.message, data: [] };
  }
}

/**
 * Get all potential owners (users who can be assigned as owners)
 */
export async function getPotentialOwners() {
  try {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id, email, username, full_name, role')
      .in('role', ['user', 'gym_admin'])
      .order('username');

    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (error: any) {
    return { success: false, error: error.message, data: [] };
  }
}

/**
 * Get pending owner invitations (SuperAdmin only)
 */
export async function getPendingOwnerInvitations() {
  try {
    const profile = await getCurrentProfile();
    if (!profile || profile.role !== 'superadmin') {
      return { success: false, error: 'Only superadmins can view invitations', data: [] };
    }

    const { data, error } = await supabaseAdmin
      .from('staff_invitations')
      .select(`
        *,
        gyms:gym_id (
          id,
          name,
          city,
          country
        ),
        inviter:invited_by (
          id,
          username,
          email
        )
      `)
      .eq('role', 'gym_owner')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (error: any) {
    return { success: false, error: error.message, data: [] };
  }
}

/**
 * Resend owner invitation email (SuperAdmin only)
 */
export async function resendOwnerInvitation(invitationId: string) {
  try {
    const profile = await getCurrentProfile();
    if (!profile || profile.role !== 'superadmin') {
      return { success: false, error: 'Only superadmins can resend invitations' };
    }

    // Fetch invitation details
    const { data: invitation, error: fetchError } = await supabaseAdmin
      .from('staff_invitations')
      .select(`
        *,
        gyms:gym_id (
          id,
          name,
          city,
          country
        )
      `)
      .eq('id', invitationId)
      .eq('role', 'gym_owner')
      .eq('status', 'pending')
      .single();

    if (fetchError || !invitation) {
      return { success: false, error: 'Invitation not found or already accepted' };
    }

    // Check if invitation is expired
    if (new Date(invitation.expires_at) < new Date()) {
      return { success: false, error: 'Invitation has expired. Please create a new invitation.' };
    }

    // Send invitation email
    try {
      await sendOwnerInvitationEmail(invitation, invitation.gyms?.name);
      revalidatePath('/dashboard/super/owners');
      return { success: true };
    } catch (emailError) {
      console.error('Failed to send owner invitation email:', emailError);
      return { success: false, error: 'Failed to send email. Please try again.' };
    }
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
