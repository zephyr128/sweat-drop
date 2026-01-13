'use server';

import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const createChallengeSchema = z.object({
  gymId: z.string().uuid(),
  name: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  // Cardio Challenge fields
  frequency: z.enum(['daily', 'weekly', 'one-time', 'streak']),
  requiredMinutes: z.number().int().positive().optional(),
  machineType: z.enum(['treadmill', 'bike', 'any']),
  dropsBounty: z.number().int().min(0),
  streakDays: z.number().int().positive().optional(),
});

export async function createChallenge(input: z.infer<typeof createChallengeSchema>) {
  try {
    const validated = createChallengeSchema.parse(input);

    // Set default dates based on frequency
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
    } else if (validated.frequency === 'daily') {
      endDate = new Date(now);
      endDate.setHours(23, 59, 59, 999);
    } else if (validated.frequency === 'weekly') {
      endDate = new Date(now);
      // Set to end of current week (Sunday)
      const dayOfWeek = endDate.getDay();
      const daysUntilSunday = 7 - dayOfWeek;
      endDate.setDate(endDate.getDate() + daysUntilSunday);
      endDate.setHours(23, 59, 59, 999);
    } else if (validated.frequency === 'streak') {
      // Streak challenge: end date is based on streak_days
      endDate = new Date(now);
      const streakDays = validated.streakDays || 3;
      endDate.setDate(endDate.getDate() + streakDays);
      endDate.setHours(23, 59, 59, 999);
    } else {
      // One-time challenge: default 30 days
      endDate = new Date(now);
      endDate.setDate(endDate.getDate() + 30);
    }

    // Build insert object for cardio challenge
    const insertData: any = {
      gym_id: validated.gymId,
      name: validated.name,
      description: validated.description || null,
      start_date: startDate.toISOString().split('T')[0], // DATE format
      end_date: endDate.toISOString().split('T')[0], // DATE format
      is_active: true,
      frequency: validated.frequency,
      required_minutes: validated.requiredMinutes || null,
      machine_type: validated.machineType,
      drops_bounty: validated.dropsBounty,
      streak_days: validated.frequency === 'streak' ? validated.streakDays : null,
      // For backward compatibility with old schema
      challenge_type: validated.frequency,
      target_drops: 0, // Not used for cardio challenges
      reward_drops: validated.dropsBounty,
    };

    const { data, error } = await supabaseAdmin
      .from('challenges')
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
    const { error } = await supabaseAdmin
      .from('challenges')
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
    const { error } = await supabaseAdmin
      .from('challenges')
      .update({ is_active: isActive })
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
export async function getChallengeCompletionStats(challengeId: string, gymId: string) {
  try {
    const { data, error } = await supabaseAdmin.rpc('get_challenge_completion_stats', {
      p_challenge_id: challengeId,
    });

    if (error) throw error;

    return { success: true, data: data?.[0] || { total_users: 0, completed_users: 0, completion_percentage: 0 } };
  } catch (error: any) {
    // Error fetching challenge stats
    return { success: false, error: error.message };
  }
}
