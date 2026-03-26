-- Debug why arena_participants.current_score is not updating
-- Run this in Supabase SQL Editor

-- 1. Check if you have arena participants
SELECT 
  ap.arena_id,
  sa.name as arena_name,
  sa.scoring_model,
  ap.user_id,
  ap.gym_id,
  ap.current_score,
  ap.opted_in_at
FROM public.arena_participants ap
JOIN public.sweat_arenas sa ON ap.arena_id = sa.id
WHERE ap.user_id = auth.uid()
  AND sa.is_active = true
  AND sa.is_finalized = false;

-- 2. Check arena_gyms mapping (critical for WHERE clause)
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

-- 3. Check if your gym_id matches arena_gyms
SELECT 
  ap.arena_id,
  sa.name as arena_name,
  ap.gym_id as participant_gym_id,
  g1.name as participant_gym_name,
  ag.gym_id as arena_gym_id,
  g2.name as arena_gym_name,
  CASE 
    WHEN ap.gym_id = ag.gym_id THEN '✓ Match'
    ELSE '✗ Mismatch'
  END as gym_match
FROM public.arena_participants ap
JOIN public.sweat_arenas sa ON ap.arena_id = sa.id
JOIN public.arena_gyms ag ON ag.arena_id = sa.id
JOIN public.gyms g1 ON g1.id = ap.gym_id
JOIN public.gyms g2 ON g2.id = ag.gym_id
WHERE ap.user_id = auth.uid()
  AND sa.is_active = true
  AND sa.is_finalized = false;

-- 4. Check recent sessions and gym_id
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

-- 5. Test update_arena_scores function manually (replace with your values)
-- This will show if the function can find rows to update
DO $$
DECLARE
  v_user_id UUID := auth.uid();
  v_gym_id UUID;
  v_drops INTEGER := 100;
  v_updated_count INTEGER;
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
  
  -- For total_drops
  UPDATE public.arena_participants ap
  SET current_score = current_score + v_drops,
      updated_at = NOW()
  FROM public.sweat_arenas sa
  JOIN public.arena_gyms ag ON ag.arena_id = sa.id
  WHERE ap.arena_id = sa.id
    AND ap.user_id = v_user_id
    AND ag.gym_id = v_gym_id
    AND sa.is_active = true
    AND sa.is_finalized = false
    AND sa.start_date <= CURRENT_DATE
    AND sa.end_date >= CURRENT_DATE
    AND sa.scoring_model = 'total_drops';
  
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RAISE NOTICE 'Updated % rows for total_drops arenas', v_updated_count;
  
  -- For streak_days
  UPDATE public.arena_participants ap
  SET current_score = GREATEST(
    COALESCE(ap.current_score, 0),
    COALESCE((SELECT streak_days FROM public.profiles WHERE id = v_user_id), 0)
  ),
  updated_at = NOW()
  FROM public.sweat_arenas sa
  JOIN public.arena_gyms ag ON ag.arena_id = sa.id
  WHERE ap.arena_id = sa.id
    AND ap.user_id = v_user_id
    AND ag.gym_id = v_gym_id
    AND sa.is_active = true
    AND sa.is_finalized = false
    AND sa.start_date <= CURRENT_DATE
    AND sa.end_date >= CURRENT_DATE
    AND sa.scoring_model = 'streak_days';
  
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RAISE NOTICE 'Updated % rows for streak_days arenas', v_updated_count;
END $$;

-- 6. Check if RLS is blocking updates
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'arena_participants'
  AND cmd = 'UPDATE';
