-- Verification queries for Cross-gym scoring architecture
-- Run these in Supabase SQL Editor after migration 20260306000007

-- 1. Verify arena_participant_gym_scores table exists
SELECT 
  'arena_participant_gym_scores table' as check_type,
  COUNT(*) as table_exists
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'arena_participant_gym_scores';

-- 2. Verify indexes on arena_participant_gym_scores
SELECT 
  'Indexes on arena_participant_gym_scores' as check_type,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'arena_participant_gym_scores'
ORDER BY indexname;

-- 3. Verify RLS policies on arena_participant_gym_scores
SELECT 
  'RLS Policies on arena_participant_gym_scores' as check_type,
  policyname,
  cmd,
  permissive
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'arena_participant_gym_scores'
ORDER BY policyname;

-- 4. Verify update_arena_scores() was updated (check for arena_participant_gym_scores in function body)
SELECT 
  'update_arena_scores() update' as check_type,
  proname,
  pg_get_functiondef(oid) LIKE '%arena_participant_gym_scores%' as has_gym_scores_table,
  pg_get_functiondef(oid) LIKE '%UPSERT%' as has_upsert_logic,
  pg_get_functiondef(oid) LIKE '%SUM%' as has_sum_calculation
FROM pg_proc
WHERE proname = 'update_arena_scores'
  AND pronamespace = 'public'::regnamespace;

-- 5. Verify update_arena_scores_periodic() was updated
SELECT 
  'update_arena_scores_periodic() update' as check_type,
  proname,
  pg_get_functiondef(oid) LIKE '%arena_participant_gym_scores%' as has_gym_scores_table
FROM pg_proc
WHERE proname = 'update_arena_scores_periodic'
  AND pronamespace = 'public'::regnamespace;

-- 6. Verify get_available_arenas() returns gym_score_breakdown
SELECT 
  'get_available_arenas() return type' as check_type,
  proname,
  pg_get_function_result(oid) LIKE '%gym_score_breakdown%' as has_gym_score_breakdown
FROM pg_proc
WHERE proname = 'get_available_arenas'
  AND pronamespace = 'public'::regnamespace;

-- 7. Verify get_arena_results() returns gym_breakdown
SELECT 
  'get_arena_results() return type' as check_type,
  proname,
  pg_get_function_result(oid) LIKE '%gym_breakdown%' as has_gym_breakdown
FROM pg_proc
WHERE proname = 'get_arena_results'
  AND pronamespace = 'public'::regnamespace;

-- 8. Test: Check if per-gym scores are being tracked (after a workout session)
-- Replace 'ARENA_ID' and 'USER_ID' with actual values
SELECT 
  'Per-gym scores for user' as check_type,
  apgs.arena_id,
  apgs.user_id,
  apgs.gym_id,
  g.name as gym_name,
  apgs.score,
  apgs.sessions,
  ap.current_score as total_score
FROM public.arena_participant_gym_scores apgs
JOIN public.gyms g ON g.id = apgs.gym_id
JOIN public.arena_participants ap ON ap.arena_id = apgs.arena_id AND ap.user_id = apgs.user_id
WHERE apgs.arena_id = 'ARENA_ID'::UUID  -- Replace with arena ID
  AND apgs.user_id = 'USER_ID'::UUID    -- Replace with user ID
ORDER BY apgs.score DESC;

-- 9. Test: Verify total_score = SUM of per-gym scores (for total_drops arenas)
SELECT 
  'Total vs sum check' as check_type,
  ap.arena_id,
  ap.user_id,
  ap.current_score as total_score,
  COALESCE(SUM(apgs.score), 0) as sum_of_gym_scores,
  CASE 
    WHEN ap.current_score = COALESCE(SUM(apgs.score), 0) THEN '✓ Match'
    ELSE '✗ Mismatch'
  END as match_status
FROM public.arena_participants ap
LEFT JOIN public.arena_participant_gym_scores apgs ON apgs.arena_id = ap.arena_id AND apgs.user_id = ap.user_id
JOIN public.sweat_arenas sa ON sa.id = ap.arena_id
WHERE sa.scoring_model = 'total_drops'
  AND sa.is_active = true
  AND NOT sa.is_finalized
GROUP BY ap.arena_id, ap.user_id, ap.current_score
HAVING ap.current_score != COALESCE(SUM(apgs.score), 0)
LIMIT 10;  -- Show mismatches if any
