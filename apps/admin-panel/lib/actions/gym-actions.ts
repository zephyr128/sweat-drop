'use server';

import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Service role client for admin operations
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

interface CreateGymInput {
  name: string;
  city?: string;
  country?: string;
  address?: string;
}

interface CreateGymAdminInput {
  email: string;
  password: string;
  username: string;
  gymId: string;
}

/**
 * Create a new gym (superadmin only)
 */
export async function createGym(input: CreateGymInput) {
  try {
    const { data, error } = await supabaseAdmin
      .from('gyms')
      .insert({
        name: input.name,
        city: input.city || null,
        country: input.country || null,
        address: input.address || null,
      })
      .select()
      .single();

    if (error) throw error;

    revalidatePath('/dashboard/gyms');
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
    // Validate environment variables
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase environment variables. SUPABASE_SERVICE_ROLE_KEY is required.');
    }

    console.log('[createGymAdmin] Creating auth user for:', input.email);
    
    // 1. Create auth user
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
        admin_gym_id: input.gymId,
      }, {
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
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update({
        role: 'gym_admin',
        admin_gym_id: gymId,
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
