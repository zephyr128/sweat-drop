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
    const ownerId = input.owner_id;

    // If no owner_id provided, we'll create the gym first, then send invitation
    // The owner will be assigned when they accept the invitation
    
    if (!ownerId) {
      if (!input.owner_email || !input.owner_username) {
        throw new Error('Owner email and username are required when creating new owner');
      }
      // We'll create the gym first, then create invitation
      // Don't create auth user yet - owner will create account via invitation
    }

    // Create gym (owner_id will be null if creating new owner - will be set when invitation is accepted)
    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available. Check server environment variables.' };
    }
    const { data, error } = await (supabaseAdmin
      .from('gyms')
      .insert({
        name: input.name,
        city: input.city || null,
        country: input.country || null,
        address: input.address || null,
        owner_id: ownerId || null, // Will be null for new owners, set when invitation accepted
        subscription_type: input.subscription_type || 'Basic',
        is_suspended: false,
      } as any) as any)
      .select()
      .single();

    if (error) {
      throw error;
    }

    // If creating new owner, create invitation
    if (!ownerId && input.owner_email && data) {
      const gymData = data as { id: string; name: string; [key: string]: any };
      const { data: invitation, error: invitationError } = await ((supabaseAdmin
        .from('staff_invitations')
        .insert({
          email: input.owner_email.toLowerCase().trim(),
          role: 'gym_owner',
          invited_by: (await getCurrentProfile())?.id,
          gym_id: gymData.id, // Link invitation to this gym
        } as any) as any)
        .select()
        .single() as any);

      if (invitationError) {
        console.error('Failed to create owner invitation:', invitationError);
        // Don't fail gym creation if invitation fails
      } else {
        // Avoid logging PII or tokenized links in production logs.
        console.log('[createGym] Owner invitation created', {
          invitationId: invitation.id,
          gymId: gymData.id,
          hasEmail: Boolean(invitation.email),
        });

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
    
    // 1. Create auth user
    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available. Check server environment variables.' };
    }
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
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available. Check server environment variables.' };
    }
    const { data, error } = await supabaseAdmin
      .from('profiles')
      // @ts-expect-error - Supabase type inference issue
      .update({
        role: 'gym_admin',
        assigned_gym_id: gymId,
      } as any)
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
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available. Check server environment variables.' };
    }
    const { data, error } = await supabaseAdmin
      .from('gyms')
      // @ts-expect-error - Supabase type inference issue
      .update({
        name: input.name,
        city: input.city || null,
        country: input.country || null,
        address: input.address || null,
        updated_at: new Date().toISOString(),
      } as any)
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
 * Update gym check-in settings (checkin_drops, GPS coords, radius)
 * and keep tokenomics check-in cap in sync.
 */
export type CheckinVerificationMode = 'lenient' | 'strict';

export async function updateGymCheckinSettings(
  gymId: string,
  input: {
    checkin_drops?: number;
    lat?: number | null;
    lng?: number | null;
    gps_radius_m?: number;
    checkin_verification_mode?: CheckinVerificationMode;
  }
): Promise<{ success: boolean; error?: string }> {
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

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.checkin_drops !== undefined) updateData.checkin_drops = input.checkin_drops;
    if (input.lat !== undefined) updateData.lat = input.lat;
    if (input.lng !== undefined) updateData.lng = input.lng;
    if (input.gps_radius_m !== undefined) updateData.gps_radius_m = input.gps_radius_m;
    if (input.checkin_verification_mode !== undefined) {
      updateData.checkin_verification_mode = input.checkin_verification_mode;
    }

    const { error } = await (supabaseAdmin as any)
      .from('gyms')
      .update(updateData)
      .eq('id', gymId);

    if (error) throw error;

    if (input.checkin_drops !== undefined) {
      const { error: tokenomicsError } = await (supabaseAdmin as any)
        .from('tokenomics_config')
        .upsert(
          {
            gym_id: gymId,
            max_checkin_drops_per_day: input.checkin_drops,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'gym_id' },
        );
      if (tokenomicsError) throw tokenomicsError;
    }

    revalidatePath(`/dashboard/gym/${gymId}/settings`);
    revalidatePath(`/dashboard/gym/${gymId}/dashboard`);
    revalidatePath(`/dashboard/gym/${gymId}/economy`);
    revalidatePath(`/dashboard/gym/${gymId}/checkin`);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Get gym check-in stats (today, this week, total)
 */
export async function getGymCheckinStats(gymId: string): Promise<{
  success: boolean;
  data?: { today: number; week: number; total: number };
  error?: string;
}> {
  try {
    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available.' };
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() + 1).toISOString();

    const [todayRes, weekRes, totalRes] = await Promise.all([
      supabaseAdmin.from('gym_checkins').select('id', { count: 'exact', head: true })
        .eq('gym_id', gymId).gte('checked_in_at', todayStart),
      supabaseAdmin.from('gym_checkins').select('id', { count: 'exact', head: true })
        .eq('gym_id', gymId).gte('checked_in_at', weekStart),
      supabaseAdmin.from('gym_checkins').select('id', { count: 'exact', head: true })
        .eq('gym_id', gymId),
    ]);

    return {
      success: true,
      data: {
        today: todayRes.count || 0,
        week: weekRes.count || 0,
        total: totalRes.count || 0,
      },
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Get recent check-ins for a gym (last 50)
 */
export async function getGymCheckins(gymId: string): Promise<{
  success: boolean;
  data?: Array<{
    id: string;
    user_id: string;
    username: string;
    avatar_url: string | null;
    checked_in_at: string;
    drops_earned: number;
    gps_verified: boolean;
    gps_distance_m: number | null;
  }>;
  error?: string;
}> {
  try {
    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available.' };
    }

    const { data, error } = await supabaseAdmin
      .from('gym_checkins')
      .select(`
        id,
        user_id,
        checked_in_at,
        drops_earned,
        gps_verified,
        gps_distance_m,
        profiles:user_id (username, avatar_url)
      `)
      .eq('gym_id', gymId)
      .order('checked_in_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    const checkins = ((data || []) as any[]).map((c) => ({
      id: c.id,
      user_id: c.user_id,
      username: c.profiles?.username || 'Unknown',
      avatar_url:
        typeof c.profiles?.avatar_url === 'string' && c.profiles.avatar_url.trim()
          ? c.profiles.avatar_url.trim()
          : null,
      checked_in_at: c.checked_in_at,
      drops_earned: c.drops_earned,
      gps_verified: c.gps_verified,
      gps_distance_m: c.gps_distance_m,
    }));

    return { success: true, data: checkins };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getGymCheckinsPaginated(
  gymId: string,
  opts?: { page?: number; limit?: number; q?: string; gpsFilter?: 'all' | 'verified' | 'unverified' },
): Promise<{
  success: boolean;
  data?: {
    items: Array<{
      id: string;
      user_id: string;
      username: string;
      avatar_url: string | null;
      checked_in_at: string;
      drops_earned: number;
      gps_verified: boolean;
      gps_distance_m: number | null;
      identity_verified: boolean;
    }>;
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  error?: string;
}> {
  try {
    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) return { success: false, error: 'Admin client not available.' };

    const page = Math.max(1, opts?.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts?.limit ?? 25));
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let countQuery = supabaseAdmin
      .from('gym_checkins')
      .select('id', { count: 'exact', head: true })
      .eq('gym_id', gymId);

    let dataQuery = supabaseAdmin
      .from('gym_checkins')
      .select(`id, user_id, checked_in_at, drops_earned, gps_verified, gps_distance_m, profiles:user_id (username, avatar_url)`)
      .eq('gym_id', gymId)
      .order('checked_in_at', { ascending: false })
      .range(from, to);

    if (opts?.gpsFilter === 'verified') {
      countQuery = countQuery.eq('gps_verified', true);
      dataQuery = dataQuery.eq('gps_verified', true);
    } else if (opts?.gpsFilter === 'unverified') {
      countQuery = countQuery.eq('gps_verified', false);
      dataQuery = dataQuery.eq('gps_verified', false);
    }

    const [{ count }, { data, error }] = await Promise.all([countQuery, dataQuery]);
    if (error) throw error;

    // Batch-fetch identity status for all user_ids in the page
    const userIds = [...new Set(((data || []) as any[]).map((c) => c.user_id))];
    const identityMap: Record<string, boolean> = {};
    if (userIds.length > 0) {
      const { data: identities } = await supabaseAdmin
        .from('gym_member_identities')
        .select('user_id, is_verified')
        .eq('gym_id', gymId)
        .in('user_id', userIds);
      if (identities) {
        for (const row of identities as any[]) {
          identityMap[row.user_id] = row.is_verified === true;
        }
      }
    }

    const total = count ?? 0;
    const items = ((data || []) as any[]).map((c) => ({
      id: c.id,
      user_id: c.user_id,
      username: c.profiles?.username || 'Unknown',
      avatar_url:
        typeof c.profiles?.avatar_url === 'string' && c.profiles.avatar_url.trim()
          ? c.profiles.avatar_url.trim()
          : null,
      checked_in_at: c.checked_in_at,
      drops_earned: c.drops_earned,
      gps_verified: c.gps_verified,
      gps_distance_m: c.gps_distance_m,
      identity_verified: identityMap[c.user_id] ?? false,
    }));

    return {
      success: true,
      data: { items, total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Update SmartCoach enabled status for a gym (SuperAdmin only)
 */
export async function updateGymSmartCoach(gymId: string, enabled: boolean) {
  try {
    const profile = await getCurrentProfile();
    if (!profile || profile.role !== 'superadmin') {
      return { success: false, error: 'Only superadmins can update SmartCoach status' };
    }

    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available. Check server environment variables.' };
    }

    const { data, error } = await supabaseAdmin
      .from('gyms')
      // @ts-expect-error - Supabase type inference issue
      .update({
        smartcoach_enabled: enabled,
        updated_at: new Date().toISOString(),
      } as any)
      .eq('id', gymId)
      .select()
      .single();

    if (error) throw error;

    revalidatePath('/dashboard/gyms');
    revalidatePath(`/dashboard/gyms/${gymId}`);
    revalidatePath(`/dashboard/gym/${gymId}/dashboard`);
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * @deprecated Use updateGymMobileListing instead.
 */
export async function updateGymPilotVisibility(gymId: string, enabled: boolean) {
  return updateGymMobileListing(gymId, enabled);
}

/**
 * Toggle mobile app visibility for a gym (SuperAdmin only).
 * Writes to `is_mobile_listed`.
 */
export async function updateGymMobileListing(gymId: string, listed: boolean) {
  try {
    const profile = await getCurrentProfile();
    if (!profile || profile.role !== 'superadmin') {
      return { success: false, error: 'Only superadmins can update mobile listing' };
    }

    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available. Check server environment variables.' };
    }

    const payload = {
      is_mobile_listed: listed,
      updated_at: new Date().toISOString(),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const query = (supabaseAdmin.from('gyms') as any).update(payload);
    const { data, error } = await query.eq('id', gymId).select().single();

    if (error) throw error;

    revalidatePath('/dashboard/gyms');
    revalidatePath('/dashboard/super');
    revalidatePath(`/dashboard/gym/${gymId}/dashboard`);
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Suspend a gym (SuperAdmin only)
 */
export async function suspendGym(gymId: string) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available. Check server environment variables.' };
    }
    const { error } = await supabaseAdmin.rpc('suspend_gym', {
      p_gym_id: gymId,
      p_suspended_by: user.id,
    } as any);

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
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available. Check server environment variables.' };
    }
    const { error } = await supabaseAdmin.rpc('activate_gym', {
      p_gym_id: gymId,
      p_activated_by: user.id,
    } as any);

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
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available. Check server environment variables.', data: [] };
    }
    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('get_gyms_with_owner_info');

    if (!rpcError && rpcData && Array.isArray(rpcData)) {
      const rows = rpcData as Array<{ gym_id: string }>;
      if (rows.length === 0) {
        return { success: true, data: [] };
      }
      const ids = rows.map((r) => r.gym_id);
      const { data: listingRows } = await supabaseAdmin
        .from('gyms')
        .select('id, is_mobile_listed')
        .in('id', ids);
      const listingMap = new Map(
        ((listingRows || []) as Array<{ id: string; is_mobile_listed?: boolean | null }>).map((r) => [
          r.id,
          r.is_mobile_listed ?? true,
        ]),
      );
      const merged = rows.map((row) => ({
        ...row,
        is_mobile_listed: listingMap.get(row.gym_id) ?? true,
      }));
      return { success: true, data: merged };
    }

    // Fallback: Direct query if RPC function doesn't exist
    const { data: gyms, error: gymsError } = await supabaseAdmin
      .from('gyms')
      .select('id, name, city, country, owner_id, is_suspended, subscription_type, is_mobile_listed')
      .order('name');

    if (gymsError) throw gymsError;

    const gymsData = (gyms || []) as Array<{
      id: string;
      name: string;
      city: string | null;
      country: string | null;
      owner_id: string | null;
      is_suspended: boolean;
      subscription_type: string;
      is_mobile_listed?: boolean | null;
    }>;

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
        is_mobile_listed: gym.is_mobile_listed ?? true,
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
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available. Check server environment variables.', data: null };
    }
    const { data, error } = await supabaseAdmin.rpc('get_network_overview_stats', {
      p_owner_id: ownerId,
    } as any);

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
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available. Check server environment variables.', data: [] };
    }
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
    const supabase = await createServerClient();
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
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available. Check server environment variables.' };
    }
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
 * Send owner invitation email.
 * Uses Resend API when RESEND_API_KEY is set, otherwise logs URL for manual sharing.
 */
async function sendOwnerInvitationEmail(invitation: Record<string, unknown>, gymName?: string) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const acceptUrl = `${baseUrl}/accept-invitation/${invitation.token}`;
    const name = gymName || 'New Gym';
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
          subject: `You've been invited to manage ${name} on SweatDrop`,
          html: [
            '<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0A0A0A;color:#ffffff;border-radius:12px">',
            `<h2 style="margin:0 0 16px;color:#00E5FF">Gym Owner Invitation</h2>`,
            `<p style="color:#d4d4d8">You've been invited to manage <strong style="color:#fff">${name}</strong> on SweatDrop.</p>`,
            `<a href="${acceptUrl}" style="display:inline-block;margin:20px 0;padding:12px 28px;background:#00E5FF;color:#000;font-weight:bold;text-decoration:none;border-radius:8px">Accept Invitation</a>`,
            `<p style="font-size:12px;color:#71717a;margin-top:24px">Or copy this link:<br/><a href="${acceptUrl}" style="color:#00E5FF;word-break:break-all">${acceptUrl}</a></p>`,
            '</div>',
          ].join(''),
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        logger.error('Resend API error (owner)', { status: response.status, body, email: invitation.email });
      } else {
        logger.info('Owner invitation email sent via Resend', { email: invitation.email, gymName: name });
      }
    } else {
      logger.info('Owner Invitation Created (no email provider)', {
        email: invitation.email,
        gymName: name,
        acceptUrl,
        note: 'Set RESEND_API_KEY to enable email delivery. Share the URL manually for now.',
      });
    }
  } catch (error) {
    logger.error('Error sending owner invitation email', { error, invitationId: invitation.id });
  }
}
