-- Comprehensive diagnosis: Why current_score is still 0 after workout
-- Run this in Supabase SQL Editor

-- STEP 1: Check if you're opted into arenas
SELECT 
  'STEP 1: Arena Participation' as step,
  COUNT(*) as arenas_opted_into
FROM public.arena_participants ap
JOIN public.sweat_arenas sa ON ap.arena_id = sa.id
WHERE ap.user_id = auth.uid()
  AND sa.is_active = true
  AND sa.is_finalized = false
  AND sa.start_date <= CURRENT_DATE
  AND sa.end_date >= CURRENT_DATE;

-- STEP 2: Check your most recent session
SELECT 
  'STEP 2: Most Recent Session' as step,
  id as session_id,
  gym_id,
  drops_earned,
  started_at,
  ended_at,
  is_active,
  CASE 
    WHEN drops_earned > 0 THEN '✓ Drops awarded (award_drops() was called)'
    WHEN drops_earned = 0 AND is_active = false THEN '⚠ Session ended but no drops (award_drops() may have failed)'
    WHEN is_active = true THEN '⚠ Session still active'
    ELSE '?'
  END as status
FROM public.sessions
WHERE user_id = auth.uid()
ORDER BY started_at DESC
LIMIT 1;

-- STEP 3: Check if award_drops() was called (sessions with drops_earned > 0)
SELECT 
  'STEP 3: award_drops() Calls' as step,
  COUNT(*) as sessions_with_drops,
  SUM(drops_earned) as total_drops_earned,
  MAX(started_at) as last_session_with_drops
FROM public.sessions
WHERE user_id = auth.uid()
  AND drops_earned > 0
  AND started_at >= CURRENT_DATE - INTERVAL '7 days';

-- STEP 4: Check arena scores BEFORE manual update
SELECT 
  'STEP 4: Current Arena Scores (BEFORE)' as step,
  ap.arena_id,
  sa.name as arena_name,
  sa.scoring_model,
  ap.current_score,
  ap.updated_at
FROM public.arena_participants ap
JOIN public.sweat_arenas sa ON ap.arena_id = sa.id
WHERE ap.user_id = auth.uid()
  AND sa.is_active = true
  AND sa.is_finalized = false
  AND sa.start_date <= CURRENT_DATE
  AND sa.end_date >= CURRENT_DATE;

-- STEP 5: Manually trigger update_arena_scores() to see if it works
DO $$
DECLARE
  v_user_id UUID := auth.uid();
  v_gym_id UUID;
  v_drops INTEGER;
  v_updated_total INTEGER := 0;
  v_updated_streak INTEGER := 0;
BEGIN
  -- Get gym_id and drops from most recent session
  SELECT gym_id, drops_earned INTO v_gym_id, v_drops
  FROM public.sessions
  WHERE user_id = v_user_id
    AND drops_earned > 0
  ORDER BY started_at DESC
  LIMIT 1;
  
  IF v_gym_id IS NULL OR v_drops IS NULL THEN
    RAISE NOTICE 'STEP 5: No session found with drops_earned > 0';
    RETURN;
  END IF;
  
  RAISE NOTICE 'STEP 5: Testing update_arena_scores with user_id=%, gym_id=%, drops=%', v_user_id, v_gym_id, v_drops;
  
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
  RAISE NOTICE 'STEP 5: Updated % rows for total_drops arenas', v_updated_total;
  
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
  RAISE NOTICE 'STEP 5: Updated % rows for streak_days arenas', v_updated_streak;
  
  IF v_updated_total = 0 AND v_updated_streak = 0 THEN
    RAISE WARNING 'STEP 5: No rows updated! Possible reasons:';
    RAISE WARNING '  - Not opted into any active arenas';
    RAISE WARNING '  - Arena dates are outside current date range';
    RAISE WARNING '  - Arena is inactive or finalized';
  END IF;
END $$;

-- STEP 6: Check arena scores AFTER manual update
SELECT 
  'STEP 6: Current Arena Scores (AFTER)' as step,
  ap.arena_id,
  sa.name as arena_name,
  sa.scoring_model,
  ap.current_score,
  ap.updated_at
FROM public.arena_participants ap
JOIN public.sweat_arenas sa ON ap.arena_id = sa.id
WHERE ap.user_id = auth.uid()
  AND sa.is_active = true
  AND sa.is_finalized = false
  AND sa.start_date <= CURRENT_DATE
  AND sa.end_date >= CURRENT_DATE;

-- STEP 7: Check if update_arena_scores() is called in award_drops()
SELECT 
  'STEP 7: award_drops() Function Check' as step,
  proname,
  pg_get_functiondef(oid) LIKE '%update_arena_scores%' as calls_update_arena_scores,
  pg_get_functiondef(oid) LIKE '%PERFORM public.update_arena_scores%' as has_perform_call
FROM pg_proc
WHERE proname = 'award_drops'
  AND pronamespace = 'public'::regnamespace;
