-- Verification: Check if award_drops() now calls update_arena_scores()
-- Run this in Supabase SQL Editor after migration 20260305000005

-- 1. Verify award_drops() now includes update_arena_scores() call
SELECT 
  'Verification: award_drops() Function' as check_type,
  proname,
  pg_get_functiondef(oid) LIKE '%update_arena_scores%' as calls_update_arena_scores,
  pg_get_functiondef(oid) LIKE '%PERFORM public.update_arena_scores%' as has_perform_call,
  CASE 
    WHEN pg_get_functiondef(oid) LIKE '%PERFORM public.update_arena_scores%' THEN '✓ FIXED - update_arena_scores() is called'
    WHEN pg_get_functiondef(oid) LIKE '%update_arena_scores%' THEN '⚠ Partial - reference exists but may not be called'
    ELSE '✗ NOT FIXED - update_arena_scores() is not called'
  END as status
FROM pg_proc
WHERE proname = 'award_drops'
  AND pronamespace = 'public'::regnamespace;

-- 2. Check your arena participation (should have current_score = 0 until next session)
SELECT 
  'Current Arena Scores' as check_type,
  ap.arena_id,
  sa.name as arena_name,
  sa.scoring_model,
  ap.current_score,
  ap.updated_at,
  CASE 
    WHEN ap.current_score = 0 THEN '⚠ Score is 0 (will update on next session)'
    ELSE '✓ Score is set'
  END as status
FROM public.arena_participants ap
JOIN public.sweat_arenas sa ON ap.arena_id = sa.id
WHERE ap.user_id = auth.uid()
  AND sa.is_active = true
  AND sa.is_finalized = false
  AND sa.start_date <= CURRENT_DATE
  AND sa.end_date >= CURRENT_DATE;

-- 3. Test: After your next workout session, run this to verify scores updated
-- SELECT 
--   ap.arena_id,
--   sa.name as arena_name,
--   sa.scoring_model,
--   ap.current_score,
--   ap.updated_at,
--   s.drops_earned as session_drops,
--   s.started_at as session_started
-- FROM public.arena_participants ap
-- JOIN public.sweat_arenas sa ON ap.arena_id = sa.id
-- JOIN public.sessions s ON s.user_id = ap.user_id
-- WHERE ap.user_id = auth.uid()
--   AND sa.is_active = true
--   AND sa.is_finalized = false
--   AND s.drops_earned > 0
--   AND s.started_at >= CURRENT_DATE
-- ORDER BY s.started_at DESC
-- LIMIT 10;
