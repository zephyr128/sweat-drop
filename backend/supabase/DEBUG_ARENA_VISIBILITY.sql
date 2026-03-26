-- Debug script to check arena visibility
-- Run this in Supabase SQL Editor

-- 1. Check which gyms have accepted invitations for a specific arena
-- Replace 'ARENA_ID' with your arena ID
SELECT 
  'Arena gyms' as check_type,
  ag.arena_id,
  ag.gym_id,
  g.name as gym_name,
  ai.status as invitation_status
FROM public.arena_gyms ag
JOIN public.gyms g ON g.id = ag.gym_id
LEFT JOIN public.arena_invitations ai ON ai.arena_id = ag.arena_id AND ai.invited_gym_id = ag.gym_id
WHERE ag.arena_id = 'ARENA_ID'::UUID  -- Replace with your arena ID
ORDER BY g.name;

-- 2. Test get_available_arenas() for a specific user
-- Replace 'USER_ID' with a user ID from a gym that DIDN'T accept invitation
SELECT 
  'get_available_arenas() result' as check_type,
  *
FROM public.get_available_arenas('USER_ID'::UUID);  -- Replace with user ID

-- 3. Check RLS policy on sweat_arenas
SELECT 
  'RLS Policies on sweat_arenas' as check_type,
  policyname,
  cmd,
  qual as using_clause
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'sweat_arenas'
  AND cmd = 'SELECT'
ORDER BY policyname;

-- 4. Check if user has gym_membership for a gym that accepted invitation
-- Replace 'USER_ID' and 'ARENA_ID'
SELECT 
  'User gym memberships vs arena gyms' as check_type,
  gm.user_id,
  gm.gym_id,
  g.name as gym_name,
  ag.arena_id,
  CASE WHEN ag.arena_id IS NOT NULL THEN 'YES - in arena_gyms' ELSE 'NO - not in arena_gyms' END as participates_in_arena
FROM public.gym_memberships gm
JOIN public.gyms g ON g.id = gm.gym_id
LEFT JOIN public.arena_gyms ag ON ag.gym_id = gm.gym_id AND ag.arena_id = 'ARENA_ID'::UUID
WHERE gm.user_id = 'USER_ID'::UUID;  -- Replace with user ID
