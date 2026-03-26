-- Verification queries for streak and arena fixes
-- Run these in Supabase SQL Editor after migration 20260305000002

-- 1. Check your profile streak (should match what you see in app)
SELECT 
  id,
  username,
  streak_days,
  last_visit_date,
  total_drops
FROM public.profiles
WHERE id = auth.uid();

-- 2. Check your streak challenge progress
-- Should show current_streak_days matching your profile streak_days
SELECT 
  cp.challenge_id,
  c.name,
  c.scoring_model,
  c.target_drops,
  cp.current_value,
  cp.current_streak_days,
  cp.current_drops,
  cp.is_completed,
  p.streak_days as profile_streak,
  CASE 
    WHEN cp.current_streak_days = p.streak_days THEN '✓ Match'
    ELSE '✗ Mismatch'
  END as sync_status
FROM public.challenge_progress cp
JOIN public.gym_challenges c ON cp.challenge_id = c.id
JOIN public.profiles p ON p.id = cp.user_id
WHERE cp.user_id = auth.uid()
  AND c.scoring_model = 'streak_days'
ORDER BY c.created_at DESC;

-- 3. Check your arena participation and scores
-- Should show current_score > 0 for total_drops arenas
-- Should show current_score matching profile streak_days for streak_days arenas
SELECT 
  ap.arena_id,
  sa.name as arena_name,
  sa.scoring_model,
  ap.current_score,
  ap.opted_in_at,
  p.streak_days as profile_streak,
  p.total_drops as profile_total_drops,
  CASE 
    WHEN sa.scoring_model = 'total_drops' AND ap.current_score > 0 THEN '✓ Has score'
    WHEN sa.scoring_model = 'total_drops' AND ap.current_score = 0 THEN '✗ Zero score'
    WHEN sa.scoring_model = 'streak_days' AND ap.current_score = p.streak_days THEN '✓ Match'
    WHEN sa.scoring_model = 'streak_days' AND ap.current_score != p.streak_days THEN '✗ Mismatch'
    ELSE '?'
  END as score_status
FROM public.arena_participants ap
JOIN public.sweat_arenas sa ON ap.arena_id = sa.id
JOIN public.profiles p ON p.id = ap.user_id
WHERE ap.user_id = auth.uid()
  AND sa.is_active = true
  AND sa.is_finalized = false
ORDER BY ap.opted_in_at DESC;

-- 4. Check recent sessions (should have drops_earned > 0)
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

-- 5. Test update_arena_scores function signature
SELECT 
  proname,
  pg_get_function_arguments(oid) AS arguments,
  pg_get_functiondef(oid) LIKE '%COALESCE%' as has_null_handling
FROM pg_proc
WHERE proname = 'update_arena_scores'
  AND pronamespace = 'public'::regnamespace;

-- 6. Test update_challenge_progress function signature
SELECT 
  proname,
  pg_get_function_arguments(oid) AS arguments,
  pg_get_functiondef(oid) LIKE '%current_streak_days%' as updates_streak_days
FROM pg_proc
WHERE proname = 'update_challenge_progress'
  AND pronamespace = 'public'::regnamespace;
