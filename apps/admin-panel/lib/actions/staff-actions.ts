'use server';

import { createClient } from '@/lib/supabase-server';
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
    const supabase = createClient();

    // Check if user already has a profile with this email
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id, email, role, admin_gym_id')
      .eq('email', email)
      .single();

    if (existingProfile) {
      // Check if already staff member
      if (existingProfile.admin_gym_id === gymId && (existingProfile.role === 'gym_admin' || existingProfile.role === 'receptionist')) {
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

    revalidatePath(`/dashboard/gym/${gymId}/team`);
    return { success: true, data };
  } catch (error: any) {
    logger.error('Error creating staff invitation', { error, gymId, email, role });
    return { success: false, error: error.message || 'Failed to create invitation' };
  }
}

export async function getStaffInvitations(gymId: string) {
  try {
    const supabase = createClient();

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
    const supabase = createClient();

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
    const supabase = createClient();

    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, email, role, created_at')
      .eq('admin_gym_id', gymId)
      .in('role', ['gym_admin', 'receptionist'])
      .order('created_at', { ascending: false });

    if (error) throw error;

    return { success: true, data: data || [] };
  } catch (error: any) {
    logger.error('Error fetching staff members', { error, gymId });
    return { success: false, error: error.message, data: [] };
  }
}
