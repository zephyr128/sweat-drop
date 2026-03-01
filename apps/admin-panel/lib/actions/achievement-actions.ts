'use server';

import { getAdminClient } from '@/lib/utils/supabase-admin';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

// Criteria schema matching the JSONB structure from the plan
const criteriaSchema = z.object({
  type: z.enum(['drops', 'streak', 'sessions', 'distance', 'duration', 'custom']),
  operator: z.enum(['>=', '<=', '==', '>', '<']),
  value: z.number().min(0),
  scope: z.enum(['global', 'gym', 'machine_type']).default('global'),
  machine_type: z.string().optional(),
  date_range: z
    .object({
      start: z.string().optional(),
      end: z.string().optional(),
    })
    .optional(),
});

const createAchievementSchema = z.object({
  code: z
    .string()
    .min(1, 'Code is required')
    .regex(/^[a-z0-9_]+$/, 'Code must be lowercase with underscores only'),
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  badgeImageUrl: z.string().min(1, 'Badge image URL is required'),
  criteria: criteriaSchema,
  rewardDrops: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
  displayOrder: z.number().int().min(0).default(0),
});

const updateAchievementSchema = z.object({
  id: z.string().uuid(),
  code: z
    .string()
    .min(1, 'Code is required')
    .regex(/^[a-z0-9_]+$/, 'Code must be lowercase with underscores only'),
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  badgeImageUrl: z.string().min(1, 'Badge image URL is required'),
  criteria: criteriaSchema,
  rewardDrops: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
  displayOrder: z.number().int().min(0).default(0),
});

export async function getGlobalAchievements() {
  try {
    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return {
        success: false,
        error: 'Admin client not available. Check server environment variables.',
        data: [],
      };
    }

    const { data, error } = await (supabaseAdmin
      .from('global_achievements') as any)
      .select('*')
      .order('display_order', { ascending: true });

    if (error) throw error;

    return { success: true, data: data || [] };
  } catch (error: any) {
    return { success: false, error: error.message, data: [] };
  }
}

export async function createAchievement(
  input: z.infer<typeof createAchievementSchema>
) {
  try {
    const validated = createAchievementSchema.parse(input);

    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return {
        success: false,
        error: 'Admin client not available. Check server environment variables.',
      };
    }

    const { data, error } = await (supabaseAdmin
      .from('global_achievements') as any)
      .insert({
        code: validated.code,
        name: validated.name,
        description: validated.description || null,
        badge_image_url: validated.badgeImageUrl,
        criteria: validated.criteria,
        reward_drops: validated.rewardDrops,
        is_active: validated.isActive,
        display_order: validated.displayOrder,
      })
      .select()
      .single();

    if (error) throw error;

    revalidatePath('/dashboard/super/achievements');
    return { success: true, data };
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors[0].message };
    }
    return { success: false, error: error.message };
  }
}

export async function updateAchievement(
  input: z.infer<typeof updateAchievementSchema>
) {
  try {
    const validated = updateAchievementSchema.parse(input);

    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return {
        success: false,
        error: 'Admin client not available. Check server environment variables.',
      };
    }

    const { data, error } = await (supabaseAdmin
      .from('global_achievements') as any)
      .update({
        code: validated.code,
        name: validated.name,
        description: validated.description || null,
        badge_image_url: validated.badgeImageUrl,
        criteria: validated.criteria,
        reward_drops: validated.rewardDrops,
        is_active: validated.isActive,
        display_order: validated.displayOrder,
        updated_at: new Date().toISOString(),
      })
      .eq('id', validated.id)
      .select()
      .single();

    if (error) throw error;

    revalidatePath('/dashboard/super/achievements');
    return { success: true, data };
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors[0].message };
    }
    return { success: false, error: error.message };
  }
}

export async function deleteAchievement(achievementId: string) {
  try {
    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return {
        success: false,
        error: 'Admin client not available. Check server environment variables.',
      };
    }

    const { error } = await (supabaseAdmin
      .from('global_achievements') as any)
      .delete()
      .eq('id', achievementId);

    if (error) throw error;

    revalidatePath('/dashboard/super/achievements');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function toggleAchievementStatus(
  achievementId: string,
  isActive: boolean
) {
  try {
    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return {
        success: false,
        error: 'Admin client not available. Check server environment variables.',
      };
    }

    const { error } = await (supabaseAdmin
      .from('global_achievements') as any)
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', achievementId);

    if (error) throw error;

    revalidatePath('/dashboard/super/achievements');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
