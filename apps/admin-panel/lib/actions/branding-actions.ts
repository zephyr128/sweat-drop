'use server';

import { getAdminClient } from '@/lib/utils/supabase-admin';
import { revalidatePath } from 'next/cache';

interface UpdateBrandingInput {
  ownerId: string; // Now uses owner_id instead of gym_id for global branding
  primaryColor?: string;
  logoUrl?: string;
  /** Pass `''` or `null` to clear the background image. */
  backgroundUrl?: string | null;
  backgroundOverlay?: number; // 0..1 — darken-layer strength over background
  /** Hex #RRGGBB — top of the fallback gradient when no background image is set. */
  backgroundGradientStart?: string;
  /** Hex #RRGGBB — bottom of the fallback gradient when no background image is set. */
  backgroundGradientEnd?: string;
}

function sanitizeHex(input: string | undefined | null): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  const raw = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toUpperCase()}`;
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    return `#${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`.toUpperCase();
  }
  return null;
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
    if (input.backgroundOverlay !== undefined) {
      const clamped = Math.max(0, Math.min(1, input.backgroundOverlay));
      updateData.background_overlay = Math.round(clamped * 100) / 100;
    }
    if (input.backgroundGradientStart !== undefined) {
      const hex = sanitizeHex(input.backgroundGradientStart);
      if (hex) updateData.background_gradient_start = hex;
    }
    if (input.backgroundGradientEnd !== undefined) {
      const hex = sanitizeHex(input.backgroundGradientEnd);
      if (hex) updateData.background_gradient_end = hex;
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
