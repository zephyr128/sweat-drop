'use server';

import { createClient } from '@supabase/supabase-js';
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

export async function confirmRedemption(redemptionId: string, gymId: string) {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return { success: false, error: 'Not authenticated' };
    }

    // Verify access: user must own the gym (owner_id) or have it assigned (assigned_gym_id)
    if (profile.role === 'gym_owner' || profile.role === 'gym_admin' || profile.role === 'receptionist') {
      const { data: gym } = await supabaseAdmin
        .from('gyms')
        .select('owner_id')
        .eq('id', gymId)
        .single();
      
      if (!gym) {
        return { success: false, error: 'Gym not found' };
      }
      
      const ownsGym = gym.owner_id === profile.id;
      const isAssignedGym = profile.assigned_gym_id === gymId;
      
      if (!ownsGym && !isAssignedGym) {
        return { success: false, error: 'Unauthorized' };
      }
    }

    if (profile.role !== 'gym_owner' && profile.role !== 'gym_admin' && profile.role !== 'receptionist' && profile.role !== 'superadmin') {
      return { success: false, error: 'Unauthorized' };
    }

    const { data, error } = await supabaseAdmin.rpc('confirm_redemption', {
      p_redemption_id: redemptionId,
      p_confirmed_by: profile.id,
    });

    if (error) throw error;

    if (!data || data.length === 0 || !data[0].success) {
      return { success: false, error: data?.[0]?.error_message || 'Failed to confirm redemption' };
    }

    revalidatePath(`/dashboard/gym/${gymId}/redemptions`);
    return { success: true };
  } catch (error: any) {
    // Error confirming redemption
    return { success: false, error: error.message };
  }
}

export async function cancelRedemption(redemptionId: string, gymId: string, reason?: string) {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return { success: false, error: 'Not authenticated' };
    }

    // Verify access: user must own the gym (owner_id) or have it assigned (assigned_gym_id)
    if (profile.role === 'gym_owner' || profile.role === 'gym_admin' || profile.role === 'receptionist') {
      const { data: gym } = await supabaseAdmin
        .from('gyms')
        .select('owner_id')
        .eq('id', gymId)
        .single();
      
      if (!gym) {
        return { success: false, error: 'Gym not found' };
      }
      
      const ownsGym = gym.owner_id === profile.id;
      const isAssignedGym = profile.assigned_gym_id === gymId;
      
      if (!ownsGym && !isAssignedGym) {
        return { success: false, error: 'Unauthorized' };
      }
    }

    if (profile.role !== 'gym_owner' && profile.role !== 'gym_admin' && profile.role !== 'receptionist' && profile.role !== 'superadmin') {
      return { success: false, error: 'Unauthorized' };
    }

    const { data, error } = await supabaseAdmin.rpc('cancel_redemption', {
      p_redemption_id: redemptionId,
      p_cancelled_by: profile.id,
      p_reason: reason || null,
    });

    if (error) throw error;

    if (!data || data.length === 0 || !data[0].success) {
      return { success: false, error: data?.[0]?.error_message || 'Failed to cancel redemption' };
    }

    revalidatePath(`/dashboard/gym/${gymId}/redemptions`);
    return { success: true };
  } catch (error: any) {
    // Error cancelling redemption
    return { success: false, error: error.message };
  }
}

export async function validateRedemptionCode(code: string, gymId: string) {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return { success: false, error: 'Not authenticated' };
    }

    // Verify access: user must own the gym (owner_id) or have it assigned (assigned_gym_id)
    if (profile.role === 'gym_owner' || profile.role === 'gym_admin' || profile.role === 'receptionist') {
      const { data: gym } = await supabaseAdmin
        .from('gyms')
        .select('owner_id')
        .eq('id', gymId)
        .single();
      
      if (!gym) {
        return { success: false, error: 'Gym not found' };
      }
      
      const ownsGym = gym.owner_id === profile.id;
      const isAssignedGym = profile.assigned_gym_id === gymId;
      
      if (!ownsGym && !isAssignedGym) {
        return { success: false, error: 'Unauthorized' };
      }
    }

    if (profile.role !== 'gym_owner' && profile.role !== 'gym_admin' && profile.role !== 'receptionist' && profile.role !== 'superadmin') {
      return { success: false, error: 'Unauthorized' };
    }

    const { data, error } = await supabaseAdmin.rpc('find_redemption_by_code', {
      p_code: code,
    });

    if (error) throw error;

    if (!data || data.length === 0) {
      return { success: false, error: 'Redemption not found' };
    }

    const redemption = data[0];

    // Verify it belongs to this gym
    if (redemption.gym_id !== gymId) {
      return { success: false, error: 'Redemption belongs to a different gym' };
    }

    // Fetch full redemption details
    const { data: fullRedemption, error: fetchError } = await supabaseAdmin
      .from('redemptions')
      .select(`
        *,
        profiles:user_id (id, username, email),
        rewards:reward_id (id, name, reward_type, price_drops, image_url)
      `)
      .eq('id', redemption.redemption_id)
      .single();

    if (fetchError) throw fetchError;

    return { success: true, redemption: fullRedemption };
  } catch (error: any) {
    // Error validating redemption code
    return { success: false, error: error.message };
  }
}
