-- Explanation: Why you see other users but not yourself
-- Run this in Supabase SQL Editor

-- RLS Policy Explanation:
-- Policy "Users can view all participants for leaderboard" uses USING (true)
-- This means ALL authenticated users can see ALL rows in arena_participants
-- This is intentional - for leaderboard display

-- 1. Check your current user ID
SELECT 
  auth.uid() as your_user_id,
  'This is the user ID used in WHERE clauses' as note;

-- 2. See ALL participants (RLS allows this for leaderboard)
SELECT 
  ap.arena_id,
  sa.name as arena_name,
  ap.user_id,
  p.username,
  ap.current_score,
  CASE 
    WHEN ap.user_id = auth.uid() THEN '✓ YOU'
    ELSE 'Other user'
  END as is_you
FROM public.arena_participants ap
JOIN public.sweat_arenas sa ON ap.arena_id = sa.id
LEFT JOIN public.profiles p ON p.id = ap.user_id
ORDER BY ap.opted_in_at DESC;

-- 3. See ONLY your participation (filtered by auth.uid())
SELECT 
  ap.arena_id,
  sa.name as arena_name,
  sa.scoring_model,
  ap.current_score,
  ap.opted_in_at
FROM public.arena_participants ap
JOIN public.sweat_arenas sa ON ap.arena_id = sa.id
WHERE ap.user_id = auth.uid()  -- This filters to only YOUR rows
ORDER BY ap.opted_in_at DESC;

-- 4. If query 3 returns 0 rows, you haven't opted in yet
-- Use this to opt into arenas:
-- SELECT * FROM public.opt_into_arena('a0000000-0000-0000-0000-000000000001'::UUID);

-- 5. Check RLS policies (explains why you see all users)
SELECT 
  policyname,
  cmd,
  qual as using_clause,
  CASE 
    WHEN qual = 'true' THEN '✓ Allows ALL rows (for leaderboard)'
    WHEN qual LIKE '%auth.uid()%' THEN '✓ Filters to your rows only'
    ELSE '?'
  END as explanation
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'arena_participants'
  AND cmd = 'SELECT';
