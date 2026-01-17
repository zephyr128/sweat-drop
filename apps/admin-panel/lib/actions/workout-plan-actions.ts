'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const createWorkoutPlanSchema = z.object({
  gymId: z.string().uuid(),
  name: z.string().min(1, 'Plan name is required'),
  description: z.string().optional(),
  access_level: z.enum(['public', 'private', 'gym_members_only']).default('gym_members_only'),
  price: z.number().min(0).optional(),
  difficulty_level: z.enum(['beginner', 'intermediate', 'advanced', 'expert']).optional(),
  estimated_duration_minutes: z.number().int().positive().optional(),
  category: z.string().optional(),
  thumbnail_url: z.string().url().optional().or(z.literal('')),
});

const createWorkoutPlanItemSchema = z.object({
  plan_id: z.string().uuid(),
  order_index: z.number().int().min(0),
  exercise_name: z.string().min(1, 'Exercise name is required'),
  exercise_description: z.string().optional(),
  target_machine_type: z.enum(['treadmill', 'bike']),
  target_metric: z.enum(['time', 'reps', 'distance', 'rpm', 'custom']),
  target_value: z.number().positive(),
  target_unit: z.string().optional(),
  rest_seconds: z.number().int().min(0).optional(),
  sets: z.number().int().positive().optional(),
  target_machine_id: z.string().uuid().optional().or(z.literal('')),
});

export async function createWorkoutPlan(input: z.infer<typeof createWorkoutPlanSchema>) {
  try {
    const validated = createWorkoutPlanSchema.parse(input);

    const insertData: any = {
      gym_id: validated.gymId,
      name: validated.name,
      description: validated.description || null,
      access_level: validated.access_level,
      price: validated.price || 0,
      difficulty_level: validated.difficulty_level || null,
      estimated_duration_minutes: validated.estimated_duration_minutes || null,
      category: validated.category || null,
      thumbnail_url: validated.thumbnail_url || null,
      is_active: true,
      is_featured: false,
    };

    const { data, error } = await supabaseAdmin
      .from('workout_plans')
      .insert(insertData)
      .select()
      .single();

    if (error) throw error;

    revalidatePath(`/dashboard/gym/${validated.gymId}/workout-plans`);
    return { success: true, data };
  } catch (error: any) {
    console.error('Error creating workout plan:', error);
    return { success: false, error: error.message || 'Failed to create workout plan' };
  }
}

export async function createWorkoutPlanItem(input: z.infer<typeof createWorkoutPlanItemSchema>) {
  try {
    const validated = createWorkoutPlanItemSchema.parse(input);

    const insertData: any = {
      plan_id: validated.plan_id,
      order_index: validated.order_index,
      exercise_name: validated.exercise_name,
      exercise_description: validated.exercise_description || null,
      target_machine_type: validated.target_machine_type,
      target_metric: validated.target_metric,
      target_value: validated.target_value,
      target_unit: validated.target_unit || null,
      rest_seconds: validated.rest_seconds || 0,
      sets: validated.sets || 1,
      target_machine_id: validated.target_machine_id || null,
    };

    const { data, error } = await supabaseAdmin
      .from('workout_plan_items')
      .insert(insertData)
      .select()
      .single();

    if (error) throw error;

    // Get gym_id from plan to revalidate correct path
    const { data: plan } = await supabaseAdmin
      .from('workout_plans')
      .select('gym_id')
      .eq('id', validated.plan_id)
      .single();

    if (plan?.gym_id) {
      revalidatePath(`/dashboard/gym/${plan.gym_id}/workout-plans`);
    }

    return { success: true, data };
  } catch (error: any) {
    console.error('Error creating workout plan item:', error);
    return { success: false, error: error.message || 'Failed to create workout plan item' };
  }
}

export async function deleteWorkoutPlan(planId: string, gymId: string) {
  try {
    // Soft delete by setting is_active to false
    const { error } = await supabaseAdmin
      .from('workout_plans')
      .update({ is_active: false })
      .eq('id', planId);

    if (error) throw error;

    revalidatePath(`/dashboard/gym/${gymId}/workout-plans`);
    return { success: true };
  } catch (error: any) {
    console.error('Error deleting workout plan:', error);
    return { success: false, error: error.message || 'Failed to delete workout plan' };
  }
}

export async function deleteWorkoutPlanItem(itemId: string, gymId: string) {
  try {
    const { error } = await supabaseAdmin
      .from('workout_plan_items')
      .delete()
      .eq('id', itemId);

    if (error) throw error;

    revalidatePath(`/dashboard/gym/${gymId}/workout-plans`);
    return { success: true };
  } catch (error: any) {
    console.error('Error deleting workout plan item:', error);
    return { success: false, error: error.message || 'Failed to delete workout plan item' };
  }
}

export async function toggleWorkoutPlanStatus(planId: string, gymId: string, isActive: boolean) {
  try {
    const { error } = await supabaseAdmin
      .from('workout_plans')
      .update({ is_active: isActive })
      .eq('id', planId);

    if (error) throw error;

    revalidatePath(`/dashboard/gym/${gymId}/workout-plans`);
    return { success: true };
  } catch (error: any) {
    console.error('Error toggling workout plan status:', error);
    return { success: false, error: error.message || 'Failed to toggle workout plan status' };
  }
}

const updateWorkoutPlanItemSchema = z.object({
  id: z.string().uuid(),
  exercise_name: z.string().min(1, 'Exercise name is required'),
  exercise_description: z.string().optional(),
  target_machine_type: z.enum(['treadmill', 'bike']),
  target_metric: z.enum(['time', 'reps', 'distance', 'rpm', 'custom']),
  target_value: z.number().positive(),
  target_unit: z.string().optional(),
  rest_seconds: z.number().int().min(0).optional(),
  sets: z.number().int().positive().optional(),
  target_machine_id: z.string().uuid().optional().or(z.literal('')),
});

export async function updateWorkoutPlanItem(input: z.infer<typeof updateWorkoutPlanItemSchema>) {
  try {
    const validated = updateWorkoutPlanItemSchema.parse(input);

    const updateData: any = {
      exercise_name: validated.exercise_name,
      exercise_description: validated.exercise_description || null,
      target_machine_type: validated.target_machine_type,
      target_metric: validated.target_metric,
      target_value: validated.target_value,
      target_unit: validated.target_unit || null,
      rest_seconds: validated.rest_seconds || 0,
      sets: validated.sets || 1,
      target_machine_id: validated.target_machine_id || null,
    };

    const { data, error } = await supabaseAdmin
      .from('workout_plan_items')
      .update(updateData)
      .eq('id', validated.id)
      .select()
      .single();

    if (error) throw error;

    // Get gym_id from plan to revalidate correct path
    const { data: plan } = await supabaseAdmin
      .from('workout_plans')
      .select('gym_id')
      .eq('id', data.plan_id)
      .single();

    if (plan?.gym_id) {
      revalidatePath(`/dashboard/gym/${plan.gym_id}/workout-plans`);
    }

    return { success: true, data };
  } catch (error: any) {
    console.error('Error updating workout plan item:', error);
    return { success: false, error: error.message || 'Failed to update workout plan item' };
  }
}
