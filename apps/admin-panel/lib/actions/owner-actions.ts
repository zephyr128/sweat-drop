'use server';

import { getAdminClient } from '@/lib/utils/supabase-admin';
import { revalidatePath } from 'next/cache';
import { getCurrentProfile } from '../auth';

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

    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available. Check server environment variables.' };
    }
    // Check if user already exists
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, email, role')
      .eq('email', input.email)
      .single();

    if (existingProfile) {
      const profileData = existingProfile as { id: string; email: string; role: string };
      // If user exists, check if they're already an owner
      if (profileData.role === 'gym_owner') {
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
    const { data: invitation, error: invitationError } = await (supabaseAdmin
      .from('staff_invitations')
      .insert({
        email: input.email.toLowerCase().trim(),
        role: 'gym_owner',
        invited_by: profile.id,
        gym_id: input.gym_id || null, // If gym_id provided, assign gym on acceptance
      } as any) as any)
      .select()
      .single();

    if (invitationError) throw invitationError;

    // Generate invitation URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const acceptUrl = `${baseUrl}/accept-invitation/${invitation.token}`;

    // Send invitation email
    try {
      await sendOwnerInvitationEmail(invitation);
    } catch (emailError) {
      console.error('Failed to send owner invitation email:', emailError);
      // Don't fail the invitation creation if email fails
    }

    // Log invitation URL clearly for manual sharing (visible in Vercel logs)
    console.log('\n========================================');
    console.log('🚀 OWNER INVITATION LINK GENERATED 🚀');
    console.log('========================================');
    console.log('Email:', invitation.email);
    console.log('Verification Link:', acceptUrl);
    console.log('========================================\n');

    revalidatePath('/dashboard/super/owners');
    return { success: true, data: invitation, invitationUrl: acceptUrl };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Send owner invitation email
 */
async function sendOwnerInvitationEmail(invitation: any, _gymName?: string) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const acceptUrl = `${baseUrl}/accept-invitation/${invitation.token}`;

    // TODO: Integrate with email service (Resend, SendGrid, etc.)
    // For now, log the invitation URL for manual sharing
    // This will appear in Vercel server logs
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

    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available. Check server environment variables.' };
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
          // @ts-expect-error - Supabase type inference issue
          .update({ owner_id: reassignToOwnerId } as any)
          .eq('owner_id', ownerId);

        if (reassignError) throw reassignError;
      } else {
        // Set owner_id to null (gyms will be unassigned)
        const { error: unassignError } = await supabaseAdmin
          .from('gyms')
          // @ts-expect-error - Supabase type inference issue
          .update({ owner_id: null } as any)
          .eq('owner_id', ownerId);

        if (unassignError) throw unassignError;
      }
    }

    // Update profile role to 'user' instead of deleting (to preserve auth user)
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      // @ts-expect-error - Supabase type inference issue
      .update({
        role: 'user',
        owner_id: null,
      } as any)
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

    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available. Check server environment variables.', data: [] };
    }
    // Fetch all gym owners
    const { data: ownersData, error: ownersError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, username, full_name, created_at')
      .eq('role', 'gym_owner')
      .order('created_at', { ascending: false });

    if (ownersError) throw ownersError;

    const ownersDataTyped = (ownersData || []) as Array<{ id: string; email: string; username: string; full_name: string | null; created_at: string }>;

    // Fetch all gyms for these owners
    const ownerIds = ownersDataTyped.map(o => o.id);
    const { data: gymsData, error: gymsError } = ownerIds.length > 0
      ? await supabaseAdmin
          .from('gyms')
          .select('id, name, city, country, status, subscription_type, created_at, owner_id')
          .in('owner_id', ownerIds)
      : { data: [], error: null };

    if (gymsError) {
      console.error('Error fetching gyms:', gymsError);
    }

    const gymsDataTyped = (gymsData || []) as Array<{ id: string; name: string; city: string | null; country: string | null; status: string | null; subscription_type: string; created_at: string; owner_id: string | null }>;

    // Combine owners with their gyms
    const owners = ownersDataTyped.map(owner => ({
      ...owner,
      gyms: gymsDataTyped.filter(g => g.owner_id === owner.id).map(g => ({
        id: g.id,
        name: g.name,
        city: g.city,
        country: g.country,
        status: g.status,
        subscription_type: g.subscription_type,
        created_at: g.created_at,
        owner_id: g.owner_id,
      }))
    }));

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
    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available. Check server environment variables.', data: [] };
    }
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

    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available. Check server environment variables.', data: [] };
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

    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available. Check server environment variables.' };
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

    const invitationData = invitation as { expires_at: string; gyms?: { name: string } | null; [key: string]: any };

    // Check if invitation is expired
    if (new Date(invitationData.expires_at) < new Date()) {
      return { success: false, error: 'Invitation has expired. Please create a new invitation.' };
    }

    // Send invitation email
    try {
      await sendOwnerInvitationEmail(invitationData, invitationData.gyms?.name);
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
