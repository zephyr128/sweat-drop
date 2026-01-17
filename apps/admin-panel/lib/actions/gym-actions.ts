'use server';

import { createClient as createServerClient } from '@/lib/supabase-server';
import { getAdminClient } from '@/lib/utils/supabase-admin';
import { getCurrentProfile } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { logger } from '@/lib/utils/logger';

interface CreateGymInput {
  name: string;
  city?: string;
  country?: string;
  address?: string;
  owner_id?: string; // SuperAdmin assigns owner when creating gym
  subscription_type?: string;
  // If creating new owner, provide these (no password needed - invitation will be sent):
  owner_email?: string;
  owner_username?: string;
  owner_full_name?: string;
}

interface CreateGymAdminInput {
  email: string;
  password: string;
  username: string;
  gymId: string;
}

/**
 * Create a new gym (superadmin only)
 * Owner must always be assigned - either existing owner_id or new owner credentials
 */
export async function createGym(input: CreateGymInput) {
  try {
    let ownerId = input.owner_id;
    let createdOwnerId: string | null = null;

    // If no owner_id provided, we'll create the gym first, then send invitation
    // The owner will be assigned when they accept the invitation
    let pendingOwnerInvitation: any = null;
    
    if (!ownerId) {
      if (!input.owner_email || !input.owner_username) {
        throw new Error('Owner email and username are required when creating new owner');
      }
      // We'll create the gym first, then create invitation
      // Don't create auth user yet - owner will create account via invitation
    }

    // Create gym (owner_id will be null if creating new owner - will be set when invitation is accepted)
    const supabaseAdmin = getAdminClient();
    const { data, error } = await supabaseAdmin
      .from('gyms')
      .insert({
        name: input.name,
        city: input.city || null,
        country: input.country || null,
        address: input.address || null,
        owner_id: ownerId || null, // Will be null for new owners, set when invitation accepted
        subscription_type: input.subscription_type || 'Basic',
        is_suspended: false,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    // If creating new owner, create invitation
    if (!ownerId && input.owner_email && data) {
      const gymData = data as { id: string; name: string; [key: string]: any };
      const { data: invitation, error: invitationError } = await supabaseAdmin
        .from('staff_invitations')
        .insert({
          email: input.owner_email.toLowerCase().trim(),
          role: 'gym_owner',
          invited_by: (await getCurrentProfile())?.id,
          gym_id: gymData.id, // Link invitation to this gym
        })
        .select()
        .single();

      if (invitationError) {
        console.error('Failed to create owner invitation:', invitationError);
        // Don't fail gym creation if invitation fails
      } else {
        pendingOwnerInvitation = invitation;
        
        // Send invitation email
        try {
          await sendOwnerInvitationEmail(invitation, gymData.name);
        } catch (emailError) {
          console.error('Failed to send owner invitation email:', emailError);
          // Don't fail if email fails
        }
      }
    }

    revalidatePath('/dashboard/gyms');
    revalidatePath('/dashboard/super');
    return { success: true, data };
  } catch (error: any) {
    // Error creating gym
    return { success: false, error: error.message };
  }
}

/**
 * Create a gym admin user
 * This creates both the auth user and the profile entry
 */
export async function createGymAdmin(input: CreateGymAdminInput) {
  try {
    console.log('[createGymAdmin] Creating auth user for:', input.email);
    
    // 1. Create auth user (getAdminClient will throw if env vars are missing)
    const supabaseAdmin = getAdminClient();
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true, // Auto-confirm email
    });

    if (authError) {
      // Auth error creating user
      throw authError;
    }
    
    if (!authData.user) {
      // No user returned from createUser
      throw new Error('Failed to create auth user');
    }

    // Auth user created

    // 2. Create or update profile
    // Creating profile for user
    const { data: profileData, error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: authData.user.id,
        email: input.email,
        username: input.username,
        role: 'gym_admin',
        assigned_gym_id: input.gymId,
      } as any, {
        onConflict: 'id',
      })
      .select()
      .single();

    if (profileError) {
      console.error('[createGymAdmin] Profile error:', profileError);
      // Rollback: delete auth user if profile creation fails
      try {
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
        // Rolled back auth user
      } catch (rollbackError) {
        // Rollback error
      }
      throw profileError;
    }

    // Profile created successfully

    revalidatePath('/dashboard/gyms');
    return { 
      success: true, 
      data: {
        userId: authData.user.id,
        profile: profileData,
      },
    };
  } catch (error: any) {
    // Error creating gym admin
    return { success: false, error: error.message || 'Unknown error occurred' };
  }
}

/**
 * Update gym admin assignment
 */
export async function assignGymAdmin(userId: string, gymId: string) {
  try {
    const supabaseAdmin = getAdminClient();
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update({
        role: 'gym_admin',
        assigned_gym_id: gymId,
      })
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;

    revalidatePath('/dashboard/gyms');
    return { success: true, data };
  } catch (error: any) {
    // Error assigning gym admin
    return { success: false, error: error.message };
  }
}

/**
 * Update gym details
 */
export async function updateGym(gymId: string, input: Partial<CreateGymInput>) {
  try {
    const supabaseAdmin = getAdminClient();
    const { data, error } = await supabaseAdmin
      .from('gyms')
      .update({
        name: input.name,
        city: input.city || null,
        country: input.country || null,
        address: input.address || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', gymId)
      .select()
      .single();

    if (error) throw error;

    revalidatePath('/dashboard/gyms');
    revalidatePath(`/dashboard/gym/${gymId}`);
    return { success: true, data };
  } catch (error: any) {
    // Error updating gym
    return { success: false, error: error.message };
  }
}

/**
 * Suspend a gym (SuperAdmin only)
 */
export async function suspendGym(gymId: string) {
  try {
    const supabase = createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const supabaseAdmin = getAdminClient();
    const { error } = await supabaseAdmin.rpc('suspend_gym', {
      p_gym_id: gymId,
      p_suspended_by: user.id,
    });

    if (error) throw error;

    revalidatePath('/dashboard/gyms');
    revalidatePath('/dashboard/super');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Activate a gym (SuperAdmin only)
 */
export async function activateGym(gymId: string) {
  try {
    const supabase = createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const supabaseAdmin = getAdminClient();
    const { error } = await supabaseAdmin.rpc('activate_gym', {
      p_gym_id: gymId,
      p_activated_by: user.id,
    });

    if (error) throw error;

    revalidatePath('/dashboard/gyms');
    revalidatePath('/dashboard/super');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Get gyms with owner info (for SuperAdmin dashboard)
 */
export async function getGymsWithOwnerInfo() {
  try {
    // Try RPC first, fallback to direct query if RPC doesn't exist yet
    const supabaseAdmin = getAdminClient();
    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('get_gyms_with_owner_info');
    
    if (!rpcError && rpcData) {
      return { success: true, data: rpcData };
    }

    // Fallback: Direct query if RPC function doesn't exist
    const { data: gyms, error: gymsError } = await supabaseAdmin
      .from('gyms')
      .select('id, name, city, country, owner_id, is_suspended, subscription_type')
      .order('name');

    if (gymsError) throw gymsError;

    const gymsData = (gyms || []) as Array<{ id: string; name: string; city: string | null; country: string | null; owner_id: string | null; is_suspended: boolean; subscription_type: string }>;

    // Get owner profiles
    const ownerIds = gymsData.filter(g => g.owner_id).map(g => g.owner_id).filter((id): id is string => id !== null);
    const { data: profiles } = ownerIds.length > 0 
      ? await supabaseAdmin
          .from('profiles')
          .select('id, email, full_name')
          .in('id', ownerIds)
      : { data: [] };

    const profilesData = (profiles || []) as Array<{ id: string; email: string | null; full_name: string | null }>;

    // Get machine counts
    const gymIds = gymsData.map(g => g.id);
    const { data: machines } = gymIds.length > 0
      ? await supabaseAdmin
          .from('machines')
          .select('gym_id, id')
          .in('gym_id', gymIds)
          .eq('is_under_maintenance', false)
      : { data: [] };

    const machinesData = (machines || []) as Array<{ gym_id: string; id: string }>;

    // Transform data to match RPC format
    const transformed = gymsData.map(gym => {
      const ownerProfile = profilesData.find(p => p.id === gym.owner_id);
      return {
        gym_id: gym.id,
        gym_name: gym.name,
        city: gym.city,
        country: gym.country,
        owner_id: gym.owner_id,
        owner_email: ownerProfile?.email || null,
        owner_name: ownerProfile?.full_name || null,
        is_suspended: gym.is_suspended || false,
        subscription_type: gym.subscription_type || 'Basic',
        active_machines: machinesData.filter(m => m.gym_id === gym.id).length || 0,
      };
    }) || [];

    return { success: true, data: transformed };
  } catch (error: any) {
    return { success: false, error: error.message, data: [] };
  }
}

/**
 * Get network overview stats for a gym owner
 */
export async function getNetworkOverviewStats(ownerId: string) {
  try {
    const supabaseAdmin = getAdminClient();
    const { data, error } = await supabaseAdmin.rpc('get_network_overview_stats', {
      p_owner_id: ownerId,
    });

    if (error) throw error;
    return { success: true, data: data?.[0] || null };
  } catch (error: any) {
    return { success: false, error: error.message, data: null };
  }
}

/**
 * Get all potential gym owners (users with gym_admin role)
 */
export async function getPotentialGymOwners() {
  try {
    const supabaseAdmin = getAdminClient();
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id, email, username, full_name, role')
      .eq('role', 'gym_owner')
      .order('username');

    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (error: any) {
    return { success: false, error: error.message, data: [] };
  }
}

/**
 * Delete a gym (SuperAdmin only)
 * WARNING: This will cascade delete all related data (sessions, challenges, rewards, machines, etc.)
 */
export async function deleteGym(gymId: string) {
  try {
    const supabase = createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Check if user is superadmin (this should be done via RLS, but double-check)
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'superadmin') {
      throw new Error('Only superadmin can delete gyms');
    }

    // Delete gym (CASCADE will handle related data)
    const supabaseAdmin = getAdminClient();
    const { error } = await supabaseAdmin
      .from('gyms')
      .delete()
      .eq('id', gymId);

    if (error) throw error;

    revalidatePath('/dashboard/gyms');
    revalidatePath('/dashboard/super');
    return { success: true };
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
    logger.info('Owner Invitation Created', {
      email: invitation.email,
      gymName: gymName || 'New Gym',
      acceptUrl,
      note: 'Email service not configured. Share this URL manually with the owner.',
    });

    // Option 1: Use Supabase Edge Function (if configured)
    // Option 2: Use Resend API (recommended for production)
    // See staff-actions.ts for example implementation
  } catch (error) {
    logger.error('Error sending owner invitation email', { error, invitationId: invitation.id });
    // Don't throw - email failure shouldn't block invitation creation
  }
}
