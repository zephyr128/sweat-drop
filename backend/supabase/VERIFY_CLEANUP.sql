-- Verification queries for cleanup migration
-- Run these in Supabase SQL Editor to confirm success

-- 1. Verify add_drops is gone
SELECT proname, pg_get_function_arguments(oid) AS arguments
FROM pg_proc
WHERE proname = 'add_drops'
  AND pronamespace = 'public'::regnamespace;
-- Expected: 0 rows

-- 2. Verify challenge_id column is gone
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'user_badges'
  AND column_name = 'challenge_id';
-- Expected: 0 rows

-- 3. Verify view is gone
SELECT viewname 
FROM pg_views
WHERE schemaname = 'public'
  AND viewname = 'incorrect_challenge_rewards';
-- Expected: 0 rows

-- 4. Verify user_badges data intact
SELECT 
  COUNT(*) AS total_badges,
  COUNT(gym_challenge_id) AS has_gym_challenge_id,
  COUNT(global_achievement_id) AS has_global_achievement_id
FROM user_badges;
-- Expected: 6 rows total, with gym_challenge_id or global_achievement_id populated

-- 5. Verify award_drops still exists (should not be touched)
SELECT proname, pg_get_function_arguments(oid) AS arguments
FROM pg_proc
WHERE proname = 'award_drops'
  AND pronamespace = 'public'::regnamespace;
-- Expected: 1+ rows (function should exist)

-- 6. Verify gym_challenge_id column still exists (should not be touched)
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'user_badges'
  AND column_name = 'gym_challenge_id';
-- Expected: 1 row
