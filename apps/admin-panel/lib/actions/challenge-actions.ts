'use server';

import { getAdminClient } from '@/lib/utils/supabase-admin';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const createChallengeSchema = z.object({
  gymId: z.string().uuid(),
  name: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  challengeType: z.enum(['daily', 'weekly', 'monthly', 'streak', 'milestone']),
  // Conditional fields based on challengeType
  targetDrops: z.number().int().positive().optional(), // For daily/weekly/monthly
  milestoneThreshold: z.number().int().positive().optional(), // For milestone
  streakDays: z.number().int().positive().optional(), // For streak
  rewardDrops: z.number().int().min(0),
  badgeImageUrl: z.string().url().optional().or(z.literal('')),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
}).superRefine((data, ctx) => {
  // Conditional validation with specific field errors
  if (data.challengeType === 'daily' || data.challengeType === 'weekly' || data.challengeType === 'monthly') {
    if (!data.targetDrops || data.targetDrops <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Target drops is required for this challenge type',
        path: ['targetDrops'],
      });
    }
  }
  if (data.challengeType === 'streak') {
    if (!data.streakDays || data.streakDays <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Streak days is required for streak challenges',
        path: ['streakDays'],
      });
    }
  }
  if (data.challengeType === 'milestone') {
    if (!data.milestoneThreshold || data.milestoneThreshold <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Milestone threshold is required for milestone challenges',
        path: ['milestoneThreshold'],
      });
    }
  }
});

export async function createChallenge(input: z.infer<typeof createChallengeSchema>) {
  try {
    const validated = createChallengeSchema.parse(input);

    // Set default dates based on challenge type
    const now = new Date();
    let startDate: Date;
    let endDate: Date;

    if (validated.startDate) {
      startDate = new Date(validated.startDate);
    } else {
      startDate = new Date(now);
      startDate.setHours(0, 0, 0, 0);
    }

    if (validated.endDate) {
      endDate = new Date(validated.endDate);
    } else if (validated.challengeType === 'daily') {
      endDate = new Date(now);
      endDate.setHours(23, 59, 59, 999);
    } else if (validated.challengeType === 'weekly') {
      endDate = new Date(now);
      // Set to end of current week (Sunday)
      const dayOfWeek = endDate.getDay();
      const daysUntilSunday = 7 - dayOfWeek;
      endDate.setDate(endDate.getDate() + daysUntilSunday);
      endDate.setHours(23, 59, 59, 999);
    } else if (validated.challengeType === 'monthly') {
      endDate = new Date(now);
      // Set to end of current month
      endDate.setMonth(endDate.getMonth() + 1);
      endDate.setDate(0); // Last day of current month
      endDate.setHours(23, 59, 59, 999);
    } else if (validated.challengeType === 'streak') {
      // Streak challenge: end date is based on streak_days
      endDate = new Date(now);
      const streakDays = validated.streakDays || 3;
      endDate.setDate(endDate.getDate() + streakDays);
      endDate.setHours(23, 59, 59, 999);
    } else {
      // Milestone challenge: no end date (all-time)
      endDate = new Date(now);
      endDate.setFullYear(endDate.getFullYear() + 10); // Far future date
    }

    // Build criteria JSONB based on challenge type
    let criteria: any;
    
    if (validated.challengeType === 'streak') {
      criteria = {
        type: 'streak',
        operator: '>=',
        value: validated.streakDays || 3,
        scope: 'gym',
        gym_id: validated.gymId,
      };
    } else if (validated.challengeType === 'milestone') {
      criteria = {
        type: 'drops',
        operator: '>=',
        value: validated.milestoneThreshold || 1000,
        scope: 'gym',
        gym_id: validated.gymId,
        // No date_range for milestone (all-time)
      };
    } else {
      // daily, weekly, monthly
      criteria = {
        type: 'drops',
        operator: '>=',
        value: validated.targetDrops || 100,
        scope: 'gym',
        gym_id: validated.gymId,
        date_range: {
          start: startDate.toISOString().split('T')[0],
          end: endDate.toISOString().split('T')[0],
        },
      };
    }

    // Build insert object for challenge
    const insertData: any = {
      gym_id: validated.gymId,
      name: validated.name,
      description: validated.description || null,
      start_date: startDate.toISOString().split('T')[0], // DATE format
      end_date: endDate.toISOString().split('T')[0], // DATE format
      is_active: true,
      challenge_type: validated.challengeType, // Keep for backward compatibility
      criteria: criteria, // New JSONB field
      // Legacy fields (kept for backward compatibility)
      target_drops: validated.challengeType === 'milestone' 
        ? 0  // Dummy value for milestone (not used, constraint requires it)
        : validated.challengeType === 'streak'
        ? 0  // Dummy value for streak (not used, constraint requires it)
        : validated.targetDrops || 0,
      milestone_threshold: validated.challengeType === 'milestone' 
        ? validated.milestoneThreshold 
        : null,
      streak_days: validated.challengeType === 'streak' 
        ? validated.streakDays 
        : null,
      reward_drops: validated.rewardDrops,
      badge_image_url: validated.badgeImageUrl && validated.badgeImageUrl.trim() !== '' 
        ? validated.badgeImageUrl.trim() 
        : null,
    };

    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available. Check server environment variables.' };
    }
    const { data, error } = await supabaseAdmin
      .from('gym_challenges')
      .insert(insertData)
      .select()
      .single();

    if (error) throw error;

    revalidatePath(`/dashboard/gym/${validated.gymId}/challenges`);
    return { success: true, data };
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors[0].message };
    }
            // Error logged by caller
    return { success: false, error: error.message };
  }
}

export async function deleteChallenge(challengeId: string, gymId: string) {
  try {
    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available. Check server environment variables.' };
    }
    const { error } = await supabaseAdmin
      .from('gym_challenges')
      .delete()
      .eq('id', challengeId)
      .eq('gym_id', gymId); // Security: ensure it belongs to the gym

    if (error) throw error;

    revalidatePath(`/dashboard/gym/${gymId}/challenges`);
    return { success: true };
  } catch (error: any) {
    // Error deleting challenge
    return { success: false, error: error.message };
  }
}

export async function toggleChallengeStatus(challengeId: string, gymId: string, isActive: boolean) {
  try {
    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available. Check server environment variables.' };
    }
    const { error } = await supabaseAdmin
      .from('gym_challenges')
      // @ts-expect-error - Supabase type inference issue
      .update({ is_active: isActive } as any)
      .eq('id', challengeId)
      .eq('gym_id', gymId);

    if (error) throw error;

    revalidatePath(`/dashboard/gym/${gymId}/challenges`);
    return { success: true };
  } catch (error: any) {
    // Error toggling challenge status
    return { success: false, error: error.message };
  }
}

// Get challenge completion stats for admin dashboard
export async function getChallengeCompletionStats(challengeId: string, _gymId: string) {
  try {
    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available. Check server environment variables.', data: { total_users: 0, completed_users: 0, completion_percentage: 0 } };
    }
    const { data, error } = await supabaseAdmin.rpc('get_challenge_completion_stats', {
      p_challenge_id: challengeId,
    } as any);

    if (error) throw error;

    return { success: true, data: data?.[0] || { total_users: 0, completed_users: 0, completion_percentage: 0 } };
  } catch (error: any) {
    // Error fetching challenge stats
    return { success: false, error: error.message };
  }
}
