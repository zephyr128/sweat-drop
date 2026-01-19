'use server';

import { getAdminClient } from '@/lib/utils/supabase-admin';
import { revalidatePath } from 'next/cache';

interface UpdateBrandingInput {
  ownerId: string; // Now uses owner_id instead of gym_id for global branding
  primaryColor?: string;
  logoUrl?: string;
  backgroundUrl?: string;
}

export async function updateBranding(input: UpdateBrandingInput) {
  try {
    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available. Check server environment variables.' };
    }
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };
    
    if (input.primaryColor !== undefined) {
      updateData.primary_color = input.primaryColor;
    }
    if (input.logoUrl !== undefined) {
      updateData.logo_url = input.logoUrl || null;
    }
    if (input.backgroundUrl !== undefined) {
      updateData.background_url = input.backgroundUrl || null;
    }

    // Upsert into owner_branding table (global branding per owner)
    const { data, error } = await supabaseAdmin
      .from('owner_branding')
      .upsert({
        owner_id: input.ownerId,
        ...updateData,
      }, {
        onConflict: 'owner_id',
      })
      .select()
      .single();

    if (error) throw error;

    // Revalidate all gym pages for this owner (since branding is global)
    revalidatePath('/dashboard/gym', 'layout');
    return { success: true, data };
  } catch (error: any) {
    // Error updating branding
    return { success: false, error: error.message };
  }
}

export async function getOwnerBranding(ownerId: string) {
  try {
    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available. Check server environment variables.', data: null };
    }
    const { data, error } = await supabaseAdmin
      .from('owner_branding')
      .select('*')
      .eq('owner_id', ownerId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      throw error;
    }

    return { success: true, data: data || null };
  } catch (error: any) {
    return { success: false, error: error.message, data: null };
  }
}
