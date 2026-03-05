-- Migration: 20260304100013_fix_incorrect_challenge_completions.sql
-- Description: Fixes incorrectly marked challenge completions
-- 
-- AGENT NOTE: [2026-03-04] - supabase-dba
-- 
-- Problem: Some challenges are marked as completed when current_drops < target_drops
--          because completion check used current_value instead of current_drops
-- Solution: Reset is_completed for challenges where current_drops < target_drops
--           and scoring_model is total_drops
-- 
-- CHANGES:
-- - Resets is_completed for incorrectly completed challenges
-- - Removes badge entries for incorrectly completed challenges
-- - Reverses drops transactions for incorrectly awarded rewards
-- 
-- IMPACT ON FRONTEND:
-- - Mobile App: Challenges will show correct completion status
-- 
-- BREAKING CHANGES:
-- - Users may lose incorrectly awarded drops and badges (this is intentional)

-- ============================================================================
-- 1. Find and fix incorrectly completed challenges
-- ============================================================================
-- Reset is_completed for challenges where current_drops < target_drops
-- and scoring_model is total_drops (or NULL, which defaults to total_drops)
UPDATE public.challenge_progress cp
SET 
  is_completed = false,
  completed_at = NULL,
  drops_awarded = false
FROM public.gym_challenges c
WHERE cp.challenge_id = c.id
  AND cp.is_completed = true
  AND COALESCE(c.scoring_model, 'total_drops') = 'total_drops'
  AND cp.current_drops < c.target_drops;

-- ============================================================================
-- 2. Remove badge entries for incorrectly completed challenges
-- ============================================================================
DELETE FROM public.user_badges ub
WHERE EXISTS (
  SELECT 1
  FROM public.challenge_progress cp
  JOIN public.gym_challenges c ON cp.challenge_id = c.id
  WHERE ub.gym_challenge_id = c.id
    AND ub.user_id = cp.user_id
    AND cp.is_completed = false  -- Now marked as not completed
    AND COALESCE(c.scoring_model, 'total_drops') = 'total_drops'
    AND cp.current_drops < c.target_drops
);

-- ============================================================================
-- 3. Reverse drops transactions for incorrectly awarded rewards
-- ============================================================================
-- Note: We can't easily reverse these automatically without complex logic
-- Instead, we'll create a report query that admins can use to manually review
-- For now, we'll just log which transactions should be reviewed

-- Create a view for admins to review incorrect rewards
CREATE OR REPLACE VIEW public.incorrect_challenge_rewards AS
SELECT 
  dt.id as transaction_id,
  dt.user_id,
  dt.amount as reward_amount,
  dt.created_at as reward_date,
  c.id as challenge_id,
  c.name as challenge_name,
  cp.current_drops,
  c.target_drops,
  cp.is_completed,
  p.email as user_email
FROM public.drops_transactions dt
JOIN public.gym_challenges c ON dt.reference_id = c.id
JOIN public.challenge_progress cp ON cp.challenge_id = c.id AND cp.user_id = dt.user_id
JOIN public.profiles p ON p.id = dt.user_id
WHERE dt.transaction_type = 'challenge'
  AND COALESCE(c.scoring_model, 'total_drops') = 'total_drops'
  AND cp.current_drops < c.target_drops
  AND dt.created_at >= NOW() - INTERVAL '30 days'  -- Only recent transactions
ORDER BY dt.created_at DESC;

COMMENT ON VIEW public.incorrect_challenge_rewards IS
  'View showing challenge reward transactions that were incorrectly awarded. '
  'These are challenges where current_drops < target_drops but rewards were given. '
  'Admins should review these and manually reverse if needed.';

-- ============================================================================
-- COMMENTS
-- ============================================================================
-- Note: Function comment was updated in previous migration (20260304100012)
