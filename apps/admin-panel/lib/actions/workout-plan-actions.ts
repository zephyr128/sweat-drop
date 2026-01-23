'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getAdminClient } from '@/lib/utils/supabase-admin';

const createWorkoutPlanSchema = z.object({
  gymId: z.string().uuid(),
  name: z.string().min(1, 'Plan name is required'),
  description: z.string().optional(),
  access_level: z.enum(['public', 'private', 'gym_members_only']).default('gym_members_only'),
  access_type: z.enum(['free', 'membership_required', 'paid_one_time']).default('free'),
  price: z.number().min(0).optional(),
  currency: z.string().default('USD'),
  difficulty_level: z.enum(['beginner', 'intermediate', 'advanced', 'expert']).optional(),
  estimated_duration_minutes: z.number().int().positive().optional(),
  category: z.string().optional(),
  thumbnail_url: z.string().url().optional().or(z.literal('')),
  stripe_price_id: z.string().optional(),
  stripe_product_id: z.string().optional(),
  stripe_one_time_price_id: z.string().optional(),
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
  instruction_video_url: z.string().url().optional().or(z.literal('')),
});

export async function createWorkoutPlan(input: z.infer<typeof createWorkoutPlanSchema>) {
  try {
    const validated = createWorkoutPlanSchema.parse(input);

    const insertData: any = {
      gym_id: validated.gymId,
      name: validated.name,
      description: validated.description || null,
      access_level: validated.access_level,
      access_type: validated.access_type,
      price: validated.price || 0,
      currency: validated.currency || 'USD',
      difficulty_level: validated.difficulty_level || null,
      estimated_duration_minutes: validated.estimated_duration_minutes || null,
      category: validated.category || null,
      thumbnail_url: validated.thumbnail_url || null,
      stripe_price_id: validated.stripe_price_id || null,
      stripe_product_id: validated.stripe_product_id || null,
      stripe_one_time_price_id: validated.stripe_one_time_price_id || null,
      is_active: true,
      is_featured: false,
    };
    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available. Check server environment variables.' };
    }

    const { data, error } = await (supabaseAdmin
      .from('workout_plans')
      .insert(insertData as any) as any)
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
      instruction_video_url: validated.instruction_video_url || null,
    };
    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available. Check server environment variables.' };
    }

    const { data, error } = await (supabaseAdmin
      .from('workout_plan_items')
      .insert(insertData as any) as any)
      .select()
      .single();

    if (error) throw error;

    // Get gym_id from plan to revalidate correct path
    const { data: plan } = await supabaseAdmin
      .from('workout_plans')
      .select('gym_id')
      .eq('id', validated.plan_id)
      .single();

    const planData = plan as { gym_id: string } | null;
    if (planData?.gym_id) {
      revalidatePath(`/dashboard/gym/${planData.gym_id}/workout-plans`);
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
    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available. Check server environment variables.' };
    }
    const { error } = await supabaseAdmin
      .from('workout_plans')
      // @ts-expect-error - Supabase type inference issue
      .update({ is_active: false } as any)
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
    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available. Check server environment variables.' };
    }
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
    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available. Check server environment variables.' };
    }
    const { error } = await supabaseAdmin
      .from('workout_plans')
      // @ts-expect-error - Supabase type inference issue
      .update({ is_active: isActive } as any)
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
  instruction_video_url: z.string().url().optional().or(z.literal('')),
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
      instruction_video_url: validated.instruction_video_url || null,
    };
    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available. Check server environment variables.' };
    }

    const { data, error } = await supabaseAdmin
      .from('workout_plan_items')
      // @ts-expect-error - Supabase type inference issue
      .update(updateData as any)
      .eq('id', validated.id)
      .select()
      .single();

    if (error) throw error;

    // Get gym_id from plan to revalidate correct path
    const itemData = data as { plan_id: string; [key: string]: any };
    const { data: plan } = await supabaseAdmin
      .from('workout_plans')
      .select('gym_id')
      .eq('id', itemData.plan_id)
      .single();

    const planData = plan as { gym_id: string } | null;
    if (planData?.gym_id) {
      revalidatePath(`/dashboard/gym/${planData.gym_id}/workout-plans`);
    }

    return { success: true, data };
  } catch (error: any) {
    console.error('Error updating workout plan item:', error);
    return { success: false, error: error.message || 'Failed to update workout plan item' };
  }
}

interface SaveWorkoutPlanInput {
  id?: string;
  gymId: string;
  name: string;
  description?: string;
  access_type: 'free' | 'membership_required' | 'paid_one_time';
  price: number;
  currency: string;
  items: Array<{
    order_index: number;
    exercise_name: string;
    exercise_description?: string;
      target_machine_type: 'treadmill' | 'bike' | 'Smart';
    target_metric: string;
    target_value: number;
    target_unit?: string;
    rest_seconds?: number;
    sets?: number;
    instruction_video_url?: string;
      target_machine_id?: string | null;
      smart_progression_enabled?: boolean;
    }>;
  }

type SaveWorkoutPlanResult = 
  | { success: true; data: any }
  | { success: false; error: string };

export async function saveWorkoutPlan(input: SaveWorkoutPlanInput): Promise<SaveWorkoutPlanResult> {
  try {
    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available. Check server environment variables.' };
    }

    // Validation
    if (!input.name.trim()) {
      return { success: false, error: 'Plan name is required' };
    }

    if (input.access_type === 'paid_one_time' && input.price <= 0) {
      return { success: false, error: 'Price must be greater than 0 for paid plans' };
    }

    if (input.items.length === 0) {
      return { success: false, error: 'At least one exercise is required' };
    }

    // Validate items
    for (let i = 0; i < input.items.length; i++) {
      const item = input.items[i];
      if (!item.exercise_name.trim()) {
        return { success: false, error: `Exercise name is required for item ${i + 1}` };
      }
      if (item.target_value <= 0) {
        return { success: false, error: `Target value must be greater than 0 for item ${i + 1}` };
      }
    }

    // 1. Upsert workout_plans
    const planData: any = {
      gym_id: input.gymId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      access_type: input.access_type,
      access_level: 'gym_members_only', // Default
      price: input.access_type === 'paid_one_time' ? input.price : 0,
      currency: input.access_type === 'paid_one_time' ? input.currency : 'USD',
      is_active: true,
    };

    let planId: string;

    if (input.id) {
      // Update existing plan
      const updateResult = await supabaseAdmin
        .from('workout_plans')
        // @ts-expect-error - Supabase TypeScript types issue with update method
        .update(planData)
        .eq('id', input.id)
        .select('id')
        .single();
      
      const { data: updatedPlan, error: planError } = updateResult as { data: { id: string } | null; error: any };

      if (planError) throw planError;
      if (!updatedPlan) throw new Error('Failed to update plan');

      planId = updatedPlan.id;

      // 2. Delete old items
      const { error: deleteError } = await supabaseAdmin
        .from('workout_plan_items')
        .delete()
        .eq('plan_id', planId);

      if (deleteError) throw deleteError;
    } else {
      // Create new plan
      const insertResult = await supabaseAdmin
        .from('workout_plans')
        .insert(planData as any)
        .select('id')
        .single();
      
      const { data: newPlan, error: planError } = insertResult as { data: { id: string } | null; error: any };

      if (planError) throw planError;
      if (!newPlan) throw new Error('Failed to create plan');

      planId = newPlan.id;
    }

    // 3. Insert new items with correct order_index
    const itemsToInsert = input.items.map((item, index) => ({
      plan_id: planId,
      order_index: index,
      exercise_name: item.exercise_name.trim(),
      exercise_description: item.exercise_description?.trim() || null,
      target_machine_type: item.target_machine_type,
      target_metric: item.target_metric,
      target_value: item.target_value,
      target_unit: item.target_unit?.trim() || null,
      rest_seconds: item.rest_seconds || 0,
      sets: item.sets || 1,
      instruction_video_url: item.instruction_video_url?.trim() || null,
      target_machine_id: item.target_machine_id || null,
      smart_progression_enabled: item.smart_progression_enabled || false,
      base_target_value: item.target_value, // Store original for progression
    }));

    if (itemsToInsert.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from('workout_plan_items')
        // @ts-expect-error - Supabase TypeScript types issue with insert method
        .insert(itemsToInsert);

      if (insertError) throw insertError;
    }

    // 4. Fetch updated plan with items
    const { data: refreshedPlan, error: refreshError } = await supabaseAdmin
      .from('workout_plans')
      .select(`
        *,
        items:workout_plan_items(*)
      `)
      .eq('id', planId)
      .single();

    if (refreshError) throw refreshError;

    revalidatePath(`/dashboard/gym/${input.gymId}/workout-plans`);

    return { success: true, data: refreshedPlan };
  } catch (error: any) {
    console.error('[saveWorkoutPlan] Error:', error);
    return { success: false, error: error.message || 'Failed to save workout plan' };
  }
}

/**
 * Apply a workout template to a gym
 * Creates a new workout plan based on a template
 */
type ApplyWorkoutTemplateResult = 
  | { success: true; data: any }
  | { success: false; error: string };

export async function applyWorkoutTemplate(
  gymId: string,
  templateId: string,
  templateData: {
    name: string;
    description: string;
    goal: string;
    structure: string;
    equipment: string;
    difficulty_level: string;
    estimated_duration_minutes: number;
    items: Array<{
      order_index: number;
      exercise_name: string;
      exercise_description?: string;
      target_machine_type: 'treadmill' | 'bike' | 'Smart';
      target_metric: string;
      target_value: number;
      target_unit?: string;
      rest_seconds: number;
      sets: number;
      smart_progression_enabled?: boolean;
      target_machine_id?: string | null;
      instruction_video_url?: string;
    }>;
  }
): Promise<ApplyWorkoutTemplateResult> {
  try {
    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available. Check server environment variables.' };
    }

    // 1. Create the workout plan from template
    const planData: any = {
      gym_id: gymId,
      name: templateData.name,
      description: templateData.description || null,
      access_type: 'free', // Templates default to free
      access_level: 'gym_members_only',
      price: 0,
      currency: 'USD',
      difficulty_level: templateData.difficulty_level || null,
      estimated_duration_minutes: templateData.estimated_duration_minutes || null,
      category: templateData.goal || null,
      template_goal: templateData.goal || null,
      template_structure: templateData.structure || null,
      template_equipment: templateData.equipment || null,
      is_template: false, // This is an instance, not a template
      is_active: true,
    };

    const insertResult = await supabaseAdmin
      .from('workout_plans')
      .insert(planData as any)
      .select('id')
      .single();
    
    const { data: newPlan, error: planError } = insertResult as { data: { id: string } | null; error: any };

    if (planError) throw planError;
    if (!newPlan) throw new Error('Failed to create plan from template');

    const planId = newPlan.id;

    // 2. Create plan items
    const itemsToInsert = templateData.items.map((item) => ({
      plan_id: planId,
      order_index: item.order_index,
      exercise_name: item.exercise_name,
      exercise_description: item.exercise_description || null,
      target_machine_type: item.target_machine_type,
      target_metric: item.target_metric,
      target_value: item.target_value,
      target_unit: item.target_unit || null,
      rest_seconds: item.rest_seconds || 0,
      sets: item.sets || 1,
      target_machine_id: item.target_machine_id || null, // Will be set by admin if Smart type
      instruction_video_url: item.instruction_video_url || null,
      smart_progression_enabled: item.smart_progression_enabled || false,
      base_target_value: item.target_value, // Store original target for progression
    }));

    if (itemsToInsert.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from('workout_plan_items')
        .insert(itemsToInsert as any);

      if (insertError) throw insertError;
    }

    // 3. Fetch the complete plan with items
    const { data: refreshedPlan, error: refreshError } = await supabaseAdmin
      .from('workout_plans')
      .select(`
        *,
        items:workout_plan_items(*)
      `)
      .eq('id', planId)
      .single();

    if (refreshError) throw refreshError;
    if (!refreshedPlan) throw new Error('Failed to fetch created plan');

    revalidatePath(`/dashboard/gym/${gymId}/workout-plans`);

    return { success: true, data: refreshedPlan };
  } catch (error: any) {
    console.error('[applyWorkoutTemplate] Error:', error);
    return { success: false, error: error.message || 'Failed to apply workout template' };
  }
}

export interface WorkoutPlanMetrics {
  plan_id: string;
  active_sessions: number; // Sessions created in last 7 days
  active_users: number; // Unique users with active subscriptions
  completion_rate: number; // Percentage of completed sessions
  revenue: number; // Total revenue from paid subscriptions
  performance_trend: number[]; // Daily session counts for last 7 days (for sparkline)
  avg_duration_minutes: number; // Average workout duration
}

export async function getWorkoutPlansMetrics(planIds: string[]): Promise<{ success: boolean; data: Record<string, WorkoutPlanMetrics>; error?: string }> {
  try {
    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, data: {}, error: 'Admin client not available. Check server environment variables.' };
    }

    if (planIds.length === 0) {
      return { success: true, data: {} };
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoISO = sevenDaysAgo.toISOString();

    // Calculate metrics for each plan
    const metricsPromises = planIds.map(async (planId) => {
      // First, get all users with active subscriptions to this plan
      const { data: subscriptions } = await supabaseAdmin
        .from('active_subscriptions')
        .select('user_id, status')
        .eq('plan_id', planId)
        .eq('status', 'active');

      type Subscription = { user_id: string; status: string };
      const typedSubscriptions = (subscriptions || []) as Subscription[];

      const uniqueUserIds = Array.from(new Set(typedSubscriptions.map((s) => s.user_id)));
      const activeUsers = uniqueUserIds.length;

      // If no active subscriptions, return zero metrics
      if (uniqueUserIds.length === 0) {
        return {
          plan_id: planId,
          active_sessions: 0,
          active_users: 0,
          completion_rate: 0,
          revenue: 0,
          performance_trend: [0, 0, 0, 0, 0, 0, 0],
          avg_duration_minutes: 0,
        };
      }

      // 1. Get all sessions for subscribed users in last 7 days
      const { data: allSessions } = await supabaseAdmin
        .from('sessions')
        .select('id, user_id, created_at, started_at, ended_at, duration_seconds, is_active')
        .in('user_id', uniqueUserIds)
        .gte('created_at', sevenDaysAgoISO)
        .order('created_at', { ascending: true });

      type Session = { 
        id: string;
        user_id: string;
        created_at: string;
        started_at: string;
        ended_at: string | null;
        duration_seconds: number | null;
        is_active: boolean;
      };
      const typedSessions = (allSessions || []) as Session[];

      // 2. Active sessions (sessions created in last 7 days)
      const activeSessionsCount = typedSessions.length;

      // 3. Performance trend (daily session counts for last 7 days)
      const performanceTrend: number[] = [];
      const days = 7;
      for (let i = 0; i < days; i++) {
        const dayStart = new Date(sevenDaysAgo);
        dayStart.setDate(dayStart.getDate() + i);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(dayStart);
        dayEnd.setHours(23, 59, 59, 999);

        const dayCount = typedSessions.filter((s) => {
          const createdAt = new Date(s.created_at);
          return createdAt >= dayStart && createdAt <= dayEnd;
        }).length;
        performanceTrend.push(dayCount);
      }

      // 4. Completion rate (completed sessions / total sessions)
      // A session is completed if it has ended_at and is_active = false
      const totalSessions = typedSessions.length;
      const completedSessions = typedSessions.filter((s) => !s.is_active && s.ended_at !== null).length;
      const completionRate = totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 0;

      // 5. Average duration (from completed sessions)
      const completedSessionsData = typedSessions.filter((s) => !s.is_active && s.ended_at !== null && s.duration_seconds !== null);
      
      let avgDurationMinutes = 0;
      if (completedSessionsData.length > 0) {
        const durations = completedSessionsData
          .map((s) => (s.duration_seconds || 0) / 60) // Convert seconds to minutes
          .filter((d) => d > 0);
        
        if (durations.length > 0) {
          avgDurationMinutes = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
        }
      }

      // 6. Revenue (sum of payment_amount from paid subscriptions)
      const { data: paidSubscriptions } = await supabaseAdmin
        .from('active_subscriptions')
        .select('payment_amount')
        .eq('plan_id', planId)
        .eq('payment_status', 'paid');

      const revenue = (paidSubscriptions || []).reduce((sum: number, sub: any) => {
        return sum + (parseFloat(sub.payment_amount?.toString() || '0') || 0);
      }, 0);

      return {
        plan_id: planId,
        active_sessions: activeSessionsCount || 0,
        active_users: activeUsers,
        completion_rate: completionRate,
        revenue: revenue,
        performance_trend: performanceTrend,
        avg_duration_minutes: avgDurationMinutes,
      };
    });

    const metrics = await Promise.all(metricsPromises);
    const metricsMap: Record<string, WorkoutPlanMetrics> = {};
    metrics.forEach((m) => {
      metricsMap[m.plan_id] = m;
    });

    return { success: true, data: metricsMap };
  } catch (error: any) {
    console.error('[getWorkoutPlansMetrics] Error:', error);
    return { success: false, data: {}, error: error.message || 'Failed to fetch workout plans metrics' };
  }
}
