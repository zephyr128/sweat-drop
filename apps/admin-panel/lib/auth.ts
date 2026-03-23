import { createClient } from './supabase-server';
import { User } from '@supabase/supabase-js';

export type UserRole = 'superadmin' | 'gym_owner' | 'gym_admin' | 'receptionist' | 'user';

export interface UserProfile {
  id: string;
  email: string;
  username: string;
  role: UserRole;
  assigned_gym_id: string | null; // For gym_admin and receptionist
  owner_id: string | null; // For gym_owner (primary gym)
  home_gym_id: string | null;
}

export async function getCurrentUser(): Promise<User | null> {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;
    return user;
  } catch {
    return null;
  }
}

export async function getCurrentProfile(): Promise<UserProfile | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  try {
    const supabase = await createClient();
    
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, username, role, assigned_gym_id, owner_id, home_gym_id')
      .eq('id', user.id)
      .single();

    if (error) {
      console.error('[getCurrentProfile] Error:', error.message);
      return null;
    }

    if (!data) return null;

    return {
      id: data.id,
      email: data.email || user.email || '',
      username: data.username,
      role: (data.role as UserRole) || 'user',
      assigned_gym_id: data.assigned_gym_id,
      owner_id: data.owner_id,
      home_gym_id: data.home_gym_id,
    };
  } catch (error) {
    console.error('Unexpected error in getCurrentProfile:', error);
    return null;
  }
}

export async function isSuperadmin(): Promise<boolean> {
  const profile = await getCurrentProfile();
  return profile?.role === 'superadmin';
}

export async function isGymOwner(): Promise<boolean> {
  const profile = await getCurrentProfile();
  return profile?.role === 'gym_owner';
}

export async function isGymAdmin(): Promise<boolean> {
  const profile = await getCurrentProfile();
  return profile?.role === 'gym_admin';
}

export async function isReceptionist(): Promise<boolean> {
  const profile = await getCurrentProfile();
  return profile?.role === 'receptionist';
}

export async function getAssignedGymId(): Promise<string | null> {
  const profile = await getCurrentProfile();
  return profile?.assigned_gym_id || null;
}
