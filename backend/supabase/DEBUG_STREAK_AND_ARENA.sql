-- Debug streak and arena issues
-- Run this in Supabase SQL Editor

-- 1. Check your profile streak
SELECT 
  id,
  username,
  streak_days,
  last_visit_date,
  total_drops
FROM public.profiles
WHERE id = auth.uid();

-- 2. Check your challenge progress for streak challenges
SELECT 
  cp.challenge_id,
  c.name,
  c.challenge_type,
  c.scoring_model,
  c.target_drops,
  cp.current_value,
  cp.current_streak_days,
  cp.current_drops,
  cp.is_completed
FROM public.challenge_progress cp
JOIN public.gym_challenges c ON cp.challenge_id = c.id
WHERE cp.user_id = auth.uid()
  AND (c.challenge_type = 'streak' OR c.scoring_model = 'streak_days')
ORDER BY c.created_at DESC;

-- 3. Check your arena participation and scores
SELECT 
  ap.arena_id,
  sa.name as arena_name,
  sa.scoring_model,
  ap.current_score,
  ap.opted_in_at,
  p.streak_days as profile_streak,
  p.total_drops as profile_total_drops
FROM public.arena_participants ap
JOIN public.sweat_arenas sa ON ap.arena_id = sa.id
JOIN public.profiles p ON p.id = ap.user_id
WHERE ap.user_id = auth.uid()
  AND sa.is_active = true
  AND sa.is_finalized = false
ORDER BY ap.opted_in_at DESC;

-- 4. Check if update_arena_scores is being called
-- (This requires checking logs, but we can verify the function exists)
SELECT 
  proname,
  pg_get_function_arguments(oid) AS arguments
FROM pg_proc
WHERE proname = 'update_arena_scores'
  AND pronamespace = 'public'::regnamespace;

-- 5. Check recent sessions and drops earned
SELECT 
  id,
  gym_id,
  drops_earned,
  started_at,
  ended_at,
  is_active
FROM public.sessions
WHERE user_id = auth.uid()
ORDER BY started_at DESC
LIMIT 10;
