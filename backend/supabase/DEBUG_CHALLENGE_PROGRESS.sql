-- Debug challenge progress - Run this in Supabase SQL Editor
-- Replace YOUR_USER_ID and CHALLENGE_ID with actual values

-- 1. Check challenge details
SELECT 
  c.id,
  c.name,
  c.target_drops,
  c.reward_drops,
  c.scoring_model,
  c.tiers
FROM public.gym_challenges c
WHERE c.id = 'CHALLENGE_ID'::uuid;

-- 2. Check your progress
SELECT 
  cp.id,
  cp.challenge_id,
  cp.current_drops,
  cp.current_value,
  cp.is_completed,
  cp.completed_at,
  cp.drops_awarded,
  cp.tier_achieved,
  c.target_drops,
  c.scoring_model,
  CASE 
    WHEN c.scoring_model = 'total_drops' THEN cp.current_drops
    ELSE cp.current_value
  END as effective_progress,
  CASE 
    WHEN c.scoring_model = 'total_drops' THEN cp.current_drops >= c.target_drops
    ELSE cp.current_value >= c.target_drops
  END as should_be_completed
FROM public.challenge_progress cp
JOIN public.gym_challenges c ON cp.challenge_id = c.id
WHERE cp.user_id = auth.uid()
  AND cp.challenge_id = 'CHALLENGE_ID'::uuid;

-- 3. Check if badge was awarded
SELECT 
  ub.id,
  ub.gym_challenge_id,
  ub.earned_at,
  c.name as challenge_name
FROM public.user_badges ub
JOIN public.gym_challenges c ON ub.gym_challenge_id = c.id
WHERE ub.user_id = auth.uid()
  AND ub.gym_challenge_id = 'CHALLENGE_ID'::uuid;

-- 4. Check drops transactions for this challenge
SELECT 
  dt.id,
  dt.amount,
  dt.transaction_type,
  dt.description,
  dt.created_at
FROM public.drops_transactions dt
WHERE dt.user_id = auth.uid()
  AND dt.reference_id = 'CHALLENGE_ID'::uuid
ORDER BY dt.created_at DESC;
