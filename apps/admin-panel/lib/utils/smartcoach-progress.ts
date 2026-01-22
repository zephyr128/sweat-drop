// SmartCoach Progress Processing
// TypeScript wrapper for the process_smartcoach_progress database function

import { createClient } from '@/lib/supabase-server';

export interface SmartCoachProgressInput {
  userId: string;
  planId: string;
  itemId: string;
  sessionId: string;
  actualReps: number;
  actualWeight?: number;
  actualValue?: number;
  tempoConsistency: number; // 0-100
  targetReps: number;
  targetWeight?: number;
  targetValue?: number;
}

export interface SmartCoachProgressResult {
  progressionType: 'increase' | 'maintain' | 'decrease' | 'rest_increase';
  newTargetValue: number;
  newRestSeconds: number;
}

/**
 * Process SmartCoach progression for a completed exercise
 * This function analyzes the user's performance and returns progression recommendations
 */
export async function processSmartCoachProgress(
  input: SmartCoachProgressInput
): Promise<{ success: true; data: SmartCoachProgressResult } | { success: false; error: string }> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase.rpc('process_smartcoach_progress', {
      p_user_id: input.userId,
      p_plan_id: input.planId,
      p_item_id: input.itemId,
      p_session_id: input.sessionId,
      p_actual_reps: input.actualReps,
      p_actual_weight: input.actualWeight || null,
      p_actual_value: input.actualValue || null,
      p_tempo_consistency: input.tempoConsistency,
      p_target_reps: input.targetReps,
      p_target_weight: input.targetWeight || null,
      p_target_value: input.targetValue || null,
    });

    if (error) {
      console.error('[processSmartCoachProgress] Database error:', error);
      return { success: false, error: error.message };
    }

    if (!data || data.length === 0) {
      return { success: false, error: 'No progression data returned' };
    }

    const result = data[0] as SmartCoachProgressResult;

    return {
      success: true,
      data: {
        progressionType: result.progressionType,
        newTargetValue: parseFloat(result.newTargetValue.toString()),
        newRestSeconds: parseInt(result.newRestSeconds.toString()),
      },
    };
  } catch (error: any) {
    console.error('[processSmartCoachProgress] Error:', error);
    return { success: false, error: error.message || 'Failed to process SmartCoach progress' };
  }
}

/**
 * Example usage:
 * 
 * const result = await processSmartCoachProgress({
 *   userId: 'user-uuid',
 *   planId: 'plan-uuid',
 *   itemId: 'item-uuid',
 *   sessionId: 'session-uuid',
 *   actualReps: 12,
 *   actualWeight: 50.0,
 *   tempoConsistency: 85,
 *   targetReps: 12,
 *   targetWeight: 50.0,
 * });
 * 
 * if (result.success) {
 *   // Apply progression: update workout plan item with new target
 *   console.log('Progression:', result.data.progressionType);
 *   console.log('New target value:', result.data.newTargetValue);
 *   console.log('New rest seconds:', result.data.newRestSeconds);
 * }
 */
