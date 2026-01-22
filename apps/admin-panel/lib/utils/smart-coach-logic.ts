// SmartCoach AI Engine Logic
// Analyzes workout session data and calculates next target values

export interface SessionData {
  actual_reps: number;
  actual_weight?: number; // kg
  actual_value?: number; // Generic value (time, distance, etc.)
  tempo_consistency: number; // 0-100, consistency score
  target_reps: number;
  target_weight?: number; // kg
  target_value?: number; // Generic value
  target_metric: 'reps' | 'time' | 'distance' | 'rpm' | 'custom';
}

export interface CurrentPlanItem {
  id: string;
  target_machine_type: string;
  target_metric: string;
  target_value: number;
  target_unit?: string | null;
  base_target_value?: number; // Original target before progression
  progression_increment?: number; // Default 2.5kg
  rest_seconds: number;
  exercise_description?: string | null;
  smart_progression_enabled: boolean;
}

export interface NextTargetResult {
  new_target_value: number;
  new_rest_seconds: number;
  updated_description?: string;
  progression_type: 'increase' | 'maintain' | 'decrease' | 'rest_increase';
  message: string;
}

/**
 * Calculate next target value based on session performance
 * Implements SmartCoach AI progression logic
 */
export function calculateNextTarget(
  sessionData: SessionData,
  currentPlanItem: CurrentPlanItem
): NextTargetResult {
  // If SmartCoach progression is not enabled, return current values
  if (!currentPlanItem.smart_progression_enabled) {
    return {
      new_target_value: currentPlanItem.target_value,
      new_rest_seconds: currentPlanItem.rest_seconds,
      progression_type: 'maintain',
      message: 'SmartCoach progression is disabled for this exercise',
    };
  }

  const baseTarget = currentPlanItem.base_target_value || currentPlanItem.target_value;
  const increment = currentPlanItem.progression_increment || 2.5; // Default 2.5kg
  const currentDescription = currentPlanItem.exercise_description || '';

  // Calculate performance ratio
  let performanceRatio = 100;
  if (sessionData.target_metric === 'reps' && sessionData.target_reps > 0) {
    performanceRatio = (sessionData.actual_reps / sessionData.target_reps) * 100;
  } else if (sessionData.target_value && sessionData.actual_value) {
    performanceRatio = (sessionData.actual_value / sessionData.target_value) * 100;
  }

  // Case 1: Goal achieved (100% reps) with consistent tempo (>= 80%) -> Increase weight by 2.5kg
  if (
    sessionData.actual_reps >= sessionData.target_reps &&
    sessionData.tempo_consistency >= 80
  ) {
    let newTargetValue: number;

    if (sessionData.target_metric === 'reps' && sessionData.target_weight) {
      // Weight-based exercise: increase weight
      newTargetValue = sessionData.target_weight + increment;
    } else {
      // Non-weight exercise: increase target value by 5%
      newTargetValue = baseTarget * 1.05;
    }

    return {
      new_target_value: Math.round(newTargetValue * 100) / 100, // Round to 2 decimals
      new_rest_seconds: currentPlanItem.rest_seconds, // Keep rest the same
      progression_type: 'increase',
      message: `Great work! Target achieved with consistent tempo. Increasing target by ${increment}kg.`,
    };
  }

  // Case 2: Performance < 80% of target -> Maintain or decrease weight, increase rest
  if (performanceRatio < 80) {
    let newTargetValue: number;
    let updatedDescription = currentDescription;

    if (sessionData.target_metric === 'reps' && sessionData.target_weight) {
      // If already at or below base, maintain; otherwise decrease by 5%
      if (sessionData.target_weight <= baseTarget) {
        newTargetValue = baseTarget;
      } else {
        newTargetValue = sessionData.target_weight * 0.95;
      }
    } else {
      // For non-weight exercises, maintain base target
      newTargetValue = baseTarget;
    }

    // Add Time Under Tension instruction if tempo was too fast
    if (sessionData.tempo_consistency < 70) {
      const tutInstruction = 'Focus on Time Under Tension: Control the weight on both the concentric and eccentric phases. Aim for 2-3 seconds up, 2-3 seconds down.';
      
      if (!currentDescription.includes('Time Under Tension')) {
        updatedDescription = currentDescription
          ? `${currentDescription}\n\n${tutInstruction}`
          : tutInstruction;
      }
    }

    return {
      new_target_value: Math.round(newTargetValue * 100) / 100,
      new_rest_seconds: currentPlanItem.rest_seconds + 30, // Add 30 seconds rest
      updated_description: updatedDescription,
      progression_type: 'rest_increase',
      message: `Performance below target. Adjusting rest time and maintaining current target. Focus on form and tempo.`,
    };
  }

  // Case 3: Performance between 80-100% -> Maintain current level
  return {
    new_target_value: currentPlanItem.target_value,
    new_rest_seconds: currentPlanItem.rest_seconds,
    progression_type: 'maintain',
    message: 'Good progress! Maintain current target and focus on consistency.',
  };
}

/**
 * Prepare updated plan item for Supabase upsert
 */
export function prepareUpdatedPlanItem(
  currentItem: CurrentPlanItem,
  nextTarget: NextTargetResult
): Partial<CurrentPlanItem> {
  return {
    target_value: nextTarget.new_target_value,
    rest_seconds: nextTarget.new_rest_seconds,
    exercise_description: nextTarget.updated_description || currentItem.exercise_description || null,
  };
}

/**
 * Example usage:
 * 
 * const sessionData: SessionData = {
 *   actual_reps: 12,
 *   actual_weight: 50.0,
 *   tempo_consistency: 85,
 *   target_reps: 12,
 *   target_weight: 50.0,
 *   target_metric: 'reps',
 * };
 * 
 * const currentItem: CurrentPlanItem = {
 *   id: 'item-uuid',
 *   target_machine_type: 'Smart',
 *   target_metric: 'reps',
 *   target_value: 50.0,
 *   base_target_value: 45.0,
 *   progression_increment: 2.5,
 *   rest_seconds: 60,
 *   smart_progression_enabled: true,
 * };
 * 
 * const result = calculateNextTarget(sessionData, currentItem);
 * // result.new_target_value = 52.5 (50.0 + 2.5)
 * // result.progression_type = 'increase'
 * 
 * const updatedItem = prepareUpdatedPlanItem(currentItem, result);
 * // Use updatedItem to update workout_plan_items in Supabase
 */
