'use server';

import { getAdminClient } from '@/lib/utils/supabase-admin';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const tierSchema = z.object({
  label: z.string().min(1),
  target: z.number().int().positive(),
  drops: z.number().int().min(0),
});

const createChallengeSchema = z.object({
  gymId: z.string().uuid(),
  name: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  challengeType: z.enum(['daily', 'weekly', 'monthly', 'streak', 'milestone']),
  targetDrops: z.number().int().positive().optional(),
  milestoneThreshold: z.number().int().positive().optional(),
  streakDays: z.number().int().positive().optional(),
  rewardDrops: z.number().int().min(0),
  badgeImageUrl: z.string().url().optional().or(z.literal('')),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  // New enhanced fields
  categoryType: z.enum(['individual', 'group', 'streak']).optional(),
  scoringModel: z.enum(['total_drops', 'distance_km', 'days_visited', 'streak_days']).optional(),
  tiers: z.array(tierSchema).optional(),
  sponsorName: z.string().optional(),
  sponsorLogo: z.string().url().optional().or(z.literal('')),
  prizeDescription: z.string().optional(),
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
      // Enhanced fields
      scoring_model: validated.scoringModel || 'total_drops',
      tiers: validated.tiers && validated.tiers.length > 0 ? validated.tiers : null,
      sponsor_name: validated.sponsorName || null,
      sponsor_logo: validated.sponsorLogo && validated.sponsorLogo.trim() !== ''
        ? validated.sponsorLogo.trim()
        : null,
      prize_description: validated.prizeDescription || null,
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

export async function updateChallenge(
  challengeId: string,
  input: z.infer<typeof createChallengeSchema>
) {
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
      const dayOfWeek = endDate.getDay();
      const daysUntilSunday = 7 - dayOfWeek;
      endDate.setDate(endDate.getDate() + daysUntilSunday);
      endDate.setHours(23, 59, 59, 999);
    } else if (validated.challengeType === 'monthly') {
      endDate = new Date(now);
      endDate.setMonth(endDate.getMonth() + 1);
      endDate.setDate(0);
      endDate.setHours(23, 59, 59, 999);
    } else if (validated.challengeType === 'streak') {
      endDate = new Date(now);
      const streakDays = validated.streakDays || 3;
      endDate.setDate(endDate.getDate() + streakDays);
      endDate.setHours(23, 59, 59, 999);
    } else {
      endDate = new Date(now);
      endDate.setFullYear(endDate.getFullYear() + 10);
    }

    // Build criteria JSONB
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
      };
    } else {
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

    const updateData: any = {
      name: validated.name,
      description: validated.description || null,
      start_date: startDate.toISOString().split('T')[0],
      end_date: endDate.toISOString().split('T')[0],
      challenge_type: validated.challengeType,
      criteria: criteria,
      target_drops: validated.challengeType === 'milestone' || validated.challengeType === 'streak'
        ? 0
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
      scoring_model: validated.scoringModel || 'total_drops',
      tiers: validated.tiers && validated.tiers.length > 0 ? validated.tiers : null,
      sponsor_name: validated.sponsorName || null,
      sponsor_logo: validated.sponsorLogo && validated.sponsorLogo.trim() !== ''
        ? validated.sponsorLogo.trim()
        : null,
      prize_description: validated.prizeDescription || null,
    };

    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available. Check server environment variables.' };
    }

    const { data, error } = await supabaseAdmin
      .from('gym_challenges')
      // @ts-expect-error - Supabase type inference issue
      .update(updateData as any)
      .eq('id', challengeId)
      .eq('gym_id', validated.gymId)
      .select()
      .single();

    if (error) throw error;

    revalidatePath(`/dashboard/gym/${validated.gymId}/challenges`);
    return { success: true, data };
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors[0].message };
    }
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

// Get detailed challenge progress with participant list
export async function getChallengeDetailedProgress(challengeId: string, gymId: string) {
  try {
    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available' };
    }

    // Fetch challenge info
    const { data: challenge, error: challengeError } = await supabaseAdmin
      .from('gym_challenges')
      .select('*')
      .eq('id', challengeId)
      .eq('gym_id', gymId)
      .single();

    if (challengeError) throw challengeError;
    if (!challenge) return { success: false, error: 'Challenge not found' };

    // Fetch all progress records for this challenge
    const { data: progressRecords, error: progressError } = await supabaseAdmin
      .from('challenge_progress')
      .select(`
        user_id,
        current_value,
        is_completed,
        completed_at,
        profiles:user_id (
          id,
          username,
          avatar_url
        )
      `)
      .eq('challenge_id', challengeId);

    if (progressError) throw progressError;

    const participants = ((progressRecords || []) as any[]).map((p) => ({
      user_id: p.user_id,
      username: p.profiles?.username || 'Unknown',
      avatar_url: p.profiles?.avatar_url || null,
      current_value: p.current_value || 0,
      is_completed: p.is_completed || false,
      completed_at: p.completed_at,
    }));

    // Determine target for the challenge
    const target = (challenge as any).challenge_type === 'streak'
      ? (challenge as any).streak_days || 0
      : (challenge as any).challenge_type === 'milestone'
      ? (challenge as any).milestone_threshold || 0
      : (challenge as any).target_drops || 0;

    const totalParticipants = participants.length;
    const completedCount = participants.filter((p) => p.is_completed).length;
    const completionPercentage = totalParticipants > 0
      ? Math.round((completedCount / totalParticipants) * 100)
      : 0;
    const avgProgress = totalParticipants > 0 && target > 0
      ? Math.round(
          (participants.reduce((sum, p) => sum + Math.min(p.current_value / target, 1), 0) /
            totalParticipants) *
            100
        )
      : 0;

    // Sort: completed last, then by progress desc
    participants.sort((a, b) => {
      if (a.is_completed && !b.is_completed) return 1;
      if (!a.is_completed && b.is_completed) return -1;
      return b.current_value - a.current_value;
    });

    return {
      success: true,
      data: {
        challenge,
        target,
        totalParticipants,
        completedCount,
        completionPercentage,
        avgProgress,
        participants: participants.slice(0, 50), // Limit
      },
    };
  } catch (error: any) {
    console.error('[getChallengeDetailedProgress] Error:', error);
    return { success: false, error: error.message };
  }
}

// Close challenge early (deactivate and set end_date to now)
export async function closeChallenge(challengeId: string, gymId: string) {
  try {
    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available' };
    }

    const now = new Date().toISOString().split('T')[0];

    const { error } = await supabaseAdmin
      .from('gym_challenges')
      // @ts-expect-error - Supabase type inference issue
      .update({ is_active: false, end_date: now } as any)
      .eq('id', challengeId)
      .eq('gym_id', gymId);

    if (error) throw error;

    revalidatePath(`/dashboard/gym/${gymId}/challenges`);
    return { success: true };
  } catch (error: any) {
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
