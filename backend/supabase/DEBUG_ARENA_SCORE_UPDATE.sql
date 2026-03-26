-- Debug why current_score is not updating after workout session
-- Run this in Supabase SQL Editor

-- 1. Check your arena participation
SELECT 
  ap.arena_id,
  sa.name as arena_name,
  sa.scoring_model,
  sa.is_active,
  sa.is_finalized,
  sa.start_date,
  sa.end_date,
  CURRENT_DATE as today,
  ap.current_score,
  ap.opted_in_at,
  ap.updated_at,
  CASE 
    WHEN sa.is_active = true 
      AND sa.is_finalized = false 
      AND sa.start_date <= CURRENT_DATE 
      AND sa.end_date >= CURRENT_DATE 
    THEN '✓ Should update'
    ELSE '✗ Won''t update (check reason above)'
  END as update_status
FROM public.arena_participants ap
JOIN public.sweat_arenas sa ON ap.arena_id = sa.id
WHERE ap.user_id = auth.uid()
ORDER BY ap.opted_in_at DESC;

-- 2. Check your recent sessions
SELECT 
  id,
  gym_id,
  drops_earned,
  started_at,
  ended_at,
  is_active,
  CASE 
    WHEN drops_earned > 0 THEN '✓ Drops awarded'
    WHEN drops_earned = 0 AND is_active = false THEN '⚠ Session ended but no drops'
    WHEN is_active = true THEN '⚠ Session still active'
    ELSE '?'
  END as session_status
FROM public.sessions
WHERE user_id = auth.uid()
ORDER BY started_at DESC
LIMIT 10;

-- 3. Check if award_drops() was called for recent sessions
-- This checks if sessions have drops_earned > 0 (indicates award_drops was called)
SELECT 
  COUNT(*) as sessions_with_drops,
  SUM(drops_earned) as total_drops_earned
FROM public.sessions
WHERE user_id = auth.uid()
  AND drops_earned > 0
  AND started_at >= CURRENT_DATE - INTERVAL '7 days';

-- 4. Manually test update_arena_scores() function
-- Replace with your actual values from query 1 and 2
DO $$
DECLARE
  v_user_id UUID := auth.uid();
  v_gym_id UUID;
  v_drops INTEGER := 100;
  v_updated_total INTEGER := 0;
  v_updated_streak INTEGER := 0;
BEGIN
  -- Get gym_id from most recent session
  SELECT gym_id INTO v_gym_id
  FROM public.sessions
  WHERE user_id = v_user_id
    AND drops_earned > 0
  ORDER BY started_at DESC
  LIMIT 1;
  
  IF v_gym_id IS NULL THEN
    RAISE NOTICE 'No gym_id found from sessions with drops_earned > 0';
    RETURN;
  END IF;
  
  RAISE NOTICE 'Testing update_arena_scores with user_id=%, gym_id=%, drops=%', v_user_id, v_gym_id, v_drops;
  
  -- For total_drops
  UPDATE public.arena_participants ap
  SET current_score = current_score + v_drops,
      updated_at = NOW()
  FROM public.sweat_arenas sa
  WHERE ap.arena_id = sa.id
    AND ap.user_id = v_user_id
    AND sa.is_active = true
    AND sa.is_finalized = false
    AND sa.start_date <= CURRENT_DATE
    AND sa.end_date >= CURRENT_DATE
    AND sa.scoring_model = 'total_drops';
  
  GET DIAGNOSTICS v_updated_total = ROW_COUNT;
  RAISE NOTICE 'Updated % rows for total_drops arenas', v_updated_total;
  
  -- For streak_days
  UPDATE public.arena_participants ap
  SET current_score = GREATEST(
    COALESCE(ap.current_score, 0),
    COALESCE((SELECT streak_days FROM public.profiles WHERE id = v_user_id), 0)
  ),
  updated_at = NOW()
  FROM public.sweat_arenas sa
  WHERE ap.arena_id = sa.id
    AND ap.user_id = v_user_id
    AND sa.is_active = true
    AND sa.is_finalized = false
    AND sa.start_date <= CURRENT_DATE
    AND sa.end_date >= CURRENT_DATE
    AND sa.scoring_model = 'streak_days';
  
  GET DIAGNOSTICS v_updated_streak = ROW_COUNT;
  RAISE NOTICE 'Updated % rows for streak_days arenas', v_updated_streak;
  
  IF v_updated_total = 0 AND v_updated_streak = 0 THEN
    RAISE WARNING 'No rows updated! Possible reasons:';
    RAISE WARNING '  1. Not opted into any active arenas';
    RAISE WARNING '  2. Arena dates are outside current date range';
    RAISE WARNING '  3. Arena is inactive or finalized';
  END IF;
END $$;

-- 5. Check if award_drops() function exists and is callable
SELECT 
  proname,
  pg_get_function_arguments(oid) AS arguments,
  prokind,
  prosecdef as is_security_definer
FROM pg_proc
WHERE proname = 'award_drops'
  AND pronamespace = 'public'::regnamespace;

-- 6. Check if update_arena_scores() function exists
SELECT 
  proname,
  pg_get_function_arguments(oid) AS arguments,
  prokind,
  prosecdef as is_security_definer
FROM pg_proc
WHERE proname = 'update_arena_scores'
  AND pronamespace = 'public'::regnamespace;

-- 7. Check RLS policies for arena_participants UPDATE
SELECT 
  policyname,
  cmd,
  qual as using_clause,
  with_check as with_check_clause
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'arena_participants'
  AND cmd = 'UPDATE';
