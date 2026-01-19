'use server';

import { getAdminClient } from '@/lib/utils/supabase-admin';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const createStoreItemSchema = z.object({
  gymId: z.string().uuid(),
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  priceDrops: z.number().int().positive('Price must be greater than 0'),
  stock: z.number().int().min(0).optional(),
  imageUrl: z.string().url().optional(),
  rewardType: z.string().default('physical'),
});

export async function createStoreItem(input: z.infer<typeof createStoreItemSchema>) {
  try {
    const validated = createStoreItemSchema.parse(input);
    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available. Check server environment variables.' };
    }

    const { data, error } = await (supabaseAdmin
      .from('rewards')
      .insert({
        gym_id: validated.gymId,
        name: validated.name,
        description: validated.description || null,
        price_drops: validated.priceDrops,
        stock: validated.stock ?? null,
        image_url: validated.imageUrl || null,
        reward_type: validated.rewardType,
        is_active: true,
      } as any) as any)
      .select()
      .single();

    if (error) throw error;

    revalidatePath(`/dashboard/gym/${validated.gymId}/store`);
    return { success: true, data };
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors[0].message };
    }
    // Error creating store item
    return { success: false, error: error.message };
  }
}

export async function updateStoreItem(
  itemId: string,
  gymId: string,
  input: Partial<z.infer<typeof createStoreItemSchema>>
) {
  try {
    const updateData: any = {};
    
    if (input.name !== undefined) updateData.name = input.name;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.priceDrops !== undefined) updateData.price_drops = input.priceDrops;
    if (input.stock !== undefined) updateData.stock = input.stock;
    if (input.imageUrl !== undefined) updateData.image_url = input.imageUrl;
    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available. Check server environment variables.' };
    }

    const { data, error } = await supabaseAdmin
      .from('rewards')
      // @ts-expect-error - Supabase type inference issue
      .update(updateData as any)
      .eq('id', itemId)
      .eq('gym_id', gymId) // Security: ensure it belongs to the gym
      .select()
      .single();

    if (error) throw error;

    revalidatePath(`/dashboard/gym/${gymId}/store`);
    return { success: true, data };
  } catch (error: any) {
    console.error('Error updating store item:', error);
    return { success: false, error: error.message };
  }
}

export async function deleteStoreItem(itemId: string, gymId: string) {
  try {
    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available. Check server environment variables.' };
    }
    const { error } = await supabaseAdmin
      .from('rewards')
      .delete()
      .eq('id', itemId)
      .eq('gym_id', gymId); // Security: ensure it belongs to the gym

    if (error) throw error;

    revalidatePath(`/dashboard/gym/${gymId}/store`);
    return { success: true };
  } catch (error: any) {
    // Error deleting store item
    return { success: false, error: error.message };
  }
}
