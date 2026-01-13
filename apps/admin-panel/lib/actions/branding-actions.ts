'use server';

import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

interface UpdateBrandingInput {
  gymId: string;
  primaryColor?: string;
  logoUrl?: string;
  backgroundUrl?: string;
}

export async function updateBranding(input: UpdateBrandingInput) {
  try {
    const updateData: any = {};
    
    if (input.primaryColor !== undefined) {
      updateData.primary_color = input.primaryColor;
    }
    if (input.logoUrl !== undefined) {
      updateData.logo_url = input.logoUrl;
    }
    if (input.backgroundUrl !== undefined) {
      updateData.background_url = input.backgroundUrl;
    }

    const { data, error } = await supabaseAdmin
      .from('gyms')
      .update(updateData)
      .eq('id', input.gymId)
      .select()
      .single();

    if (error) throw error;

    revalidatePath(`/dashboard/gym/${input.gymId}/branding`);
    return { success: true, data };
  } catch (error: any) {
    // Error updating branding
    return { success: false, error: error.message };
  }
}
