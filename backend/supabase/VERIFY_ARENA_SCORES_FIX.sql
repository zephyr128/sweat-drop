-- Verification queries for arena scores fix
-- Run these in Supabase SQL Editor after migration 20260305000003

-- 1. Check your arena participation
SELECT 
  ap.arena_id,
  sa.name as arena_name,
  sa.scoring_model,
  ap.user_id,
  ap.gym_id as participant_gym_id,
  ap.current_score,
  ap.opted_in_at,
  ap.updated_at,
  CASE 
    WHEN ap.updated_at > ap.opted_in_at THEN '✓ Recently updated'
    WHEN ap.updated_at = ap.opted_in_at THEN '⚠ Never updated (only on opt-in)'
    ELSE '?'
  END as update_status
FROM public.arena_participants ap
JOIN public.sweat_arenas sa ON ap.arena_id = sa.id
WHERE ap.user_id = auth.uid()
  AND sa.is_active = true
  AND sa.is_finalized = false
ORDER BY ap.opted_in_at DESC;

-- 2. Check recent sessions and gym_id
SELECT 
  id,
  gym_id,
  drops_earned,
  started_at,
  ended_at
FROM public.sessions
WHERE user_id = auth.uid()
ORDER BY started_at DESC
LIMIT 5;

-- 3. Test update_arena_scores function manually
-- This will show if the function can find and update rows
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
  ORDER BY started_at DESC
  LIMIT 1;
  
  IF v_gym_id IS NULL THEN
    RAISE NOTICE 'No gym_id found from sessions';
    RETURN;
  END IF;
  
  RAISE NOTICE 'Testing update_arena_scores with user_id=%, gym_id=%, drops=%', v_user_id, v_gym_id, v_drops;
  
  -- For total_drops (should update ALL arenas user is in)
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
  
  -- For streak_days (should update ALL arenas user is in)
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
    RAISE WARNING 'No rows updated! Check if user is opted into any active arenas.';
  END IF;
END $$;

-- 4. Check if you have any active arenas you're opted into
SELECT 
  COUNT(*) as active_arenas_count
FROM public.arena_participants ap
JOIN public.sweat_arenas sa ON ap.arena_id = sa.id
WHERE ap.user_id = auth.uid()
  AND sa.is_active = true
  AND sa.is_finalized = false
  AND sa.start_date <= CURRENT_DATE
  AND sa.end_date >= CURRENT_DATE;

-- 4b. Check ALL active arenas (regardless of participation)
-- This shows arenas you could opt into
SELECT 
  sa.id,
  sa.name,
  sa.scoring_model,
  sa.arena_scope,
  sa.start_date,
  sa.end_date,
  CURRENT_DATE as today,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM public.arena_participants ap2 
      WHERE ap2.arena_id = sa.id AND ap2.user_id = auth.uid()
    ) THEN '✓ Opted in'
    ELSE '⚠ Not opted in - use opt_into_arena() RPC'
  END as participation_status
FROM public.sweat_arenas sa
WHERE sa.is_active = true
  AND sa.is_finalized = false
  AND sa.start_date <= CURRENT_DATE
  AND sa.end_date >= CURRENT_DATE
ORDER BY sa.created_at DESC;

-- 5. Check arena_gyms mapping (for reference - not used in WHERE clause anymore)
SELECT 
  ag.arena_id,
  sa.name as arena_name,
  ag.gym_id,
  g.name as gym_name
FROM public.arena_gyms ag
JOIN public.sweat_arenas sa ON ag.arena_id = sa.id
JOIN public.gyms g ON g.id = ag.gym_id
WHERE ag.arena_id IN (
  SELECT arena_id FROM public.arena_participants WHERE user_id = auth.uid()
);
