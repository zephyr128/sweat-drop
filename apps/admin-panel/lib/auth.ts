import { createClient } from './supabase-server';
import { User } from '@supabase/supabase-js';

export type UserRole = 'superadmin' | 'gym_admin' | 'receptionist' | 'user';

export interface UserProfile {
  id: string;
  email: string;
  username: string;
  role: UserRole;
  admin_gym_id: string | null;
  home_gym_id: string | null;
}

export async function getCurrentUser(): Promise<User | null> {
  try {
    const supabase = createClient();
    
    // VAŽNO: getUser() je jedini siguran način za Server Komponente
    // On automatski verifikuje JWT i osvežava sesiju ako je potrebno
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error) {
      // Ako dobiješ AuthSessionMissingError, to je normalno ako korisnik nije ulogovan
            // Auth error - will fallback to session
      return null;
    }
    
    if (!user) {
            // No user found
      return null;
    }
    
      // User authenticated successfully
    return user;
  } catch (error) {
            // Exception during auth check
    return null;
  }
}

export async function getCurrentProfile(): Promise<UserProfile | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, username, role, admin_gym_id, home_gym_id')
      .eq('id', user.id)
      .single();

    if (error) {
      console.error('Error fetching profile:', error);
      return null;
    }

    if (!data) {
      console.warn('Profile not found for user:', user.id);
      return null;
    }

    return {
      id: data.id,
      email: data.email || user.email || '',
      username: data.username,
      role: (data.role as UserRole) || 'user',
      admin_gym_id: data.admin_gym_id,
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

export async function isGymAdmin(): Promise<boolean> {
  const profile = await getCurrentProfile();
  return profile?.role === 'gym_admin';
}

export async function isReceptionist(): Promise<boolean> {
  const profile = await getCurrentProfile();
  return profile?.role === 'receptionist';
}

export async function getAdminGymId(): Promise<string | null> {
  const profile = await getCurrentProfile();
  return profile?.admin_gym_id || null;
}
