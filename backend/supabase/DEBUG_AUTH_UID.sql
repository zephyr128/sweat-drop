-- Debug auth.uid() and arena_participants visibility
-- Run this in Supabase SQL Editor

-- 1. Check your current user ID
SELECT 
  auth.uid() as your_user_id,
  auth.email() as your_email,
  auth.role() as your_role;

-- 2. Check your profile
SELECT 
  id,
  username,
  email,
  role
FROM public.profiles
WHERE id = auth.uid();

-- 3. Check ALL arena_participants (if you're superadmin, you might see all)
SELECT 
  ap.arena_id,
  sa.name as arena_name,
  ap.user_id,
  p.username,
  p.email,
  ap.gym_id,
  ap.current_score,
  ap.opted_in_at,
  CASE 
    WHEN ap.user_id = auth.uid() THEN '✓ This is YOU'
    ELSE 'Other user'
  END as is_you
FROM public.arena_participants ap
JOIN public.sweat_arenas sa ON ap.arena_id = sa.id
LEFT JOIN public.profiles p ON p.id = ap.user_id
ORDER BY ap.opted_in_at DESC
LIMIT 20;

-- 4. Check specifically YOUR participation
SELECT 
  ap.arena_id,
  sa.name as arena_name,
  sa.scoring_model,
  ap.user_id,
  ap.gym_id,
  ap.current_score,
  ap.opted_in_at,
  ap.updated_at
FROM public.arena_participants ap
JOIN public.sweat_arenas sa ON ap.arena_id = sa.id
WHERE ap.user_id = auth.uid()
ORDER BY ap.opted_in_at DESC;

-- 5. Check if you're seeing other users due to RLS policies
-- This shows what RLS policies allow you to see
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
  AND tablename = 'arena_participants';

-- 6. Try to opt into an arena and see what happens
-- Replace with actual arena ID
-- SELECT * FROM public.opt_into_arena('a0000000-0000-0000-0000-000000000001'::UUID);
