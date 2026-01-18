-- Diagnose Gym Owner Access Issues
-- Run this to check why gym owner can't see their data

-- 1. Check if gym owner has profile with correct role
-- Replace 'YOUR_GYM_OWNER_USER_ID' with the actual user ID
SELECT 
  id,
  email,
  username,
  role,
  assigned_gym_id,
  owner_id
FROM public.profiles
WHERE role = 'gym_owner'
ORDER BY created_at DESC;

-- 2. Check if gyms have owner_id set correctly
SELECT 
  g.id,
  g.name,
  g.owner_id,
  p.email as owner_email,
  p.username as owner_username,
  g.status
FROM public.gyms g
LEFT JOIN public.profiles p ON g.owner_id = p.id
ORDER BY g.created_at DESC;

-- 3. Check RLS policies on gyms table
SELECT 
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'gyms'
ORDER BY policyname;

-- 4. Test if gym owner can see their gyms (as current user)
-- This will show what the current user can see
SELECT 
  id,
  name,
  owner_id,
  status
FROM public.gyms
WHERE owner_id = auth.uid();

-- 5. Check if is_gym_owner function works
SELECT 
  public.is_gym_owner(auth.uid()) as is_owner,
  auth.uid() as current_user_id;

-- 6. Check challenges, rewards, sessions access
-- These might be blocked by RLS
SELECT 
  COUNT(*) as total_challenges,
  COUNT(CASE WHEN gym_id IN (SELECT id FROM public.gyms WHERE owner_id = auth.uid()) THEN 1 END) as owned_gym_challenges
FROM public.challenges;

SELECT 
  COUNT(*) as total_rewards,
  COUNT(CASE WHEN gym_id IN (SELECT id FROM public.gyms WHERE owner_id = auth.uid()) THEN 1 END) as owned_gym_rewards
FROM public.rewards;

SELECT 
  COUNT(*) as total_sessions,
  COUNT(CASE WHEN gym_id IN (SELECT id FROM public.gyms WHERE owner_id = auth.uid()) THEN 1 END) as owned_gym_sessions
FROM public.sessions;

-- 7. Check RLS policies on other tables
SELECT 
  tablename,
  policyname,
  cmd
FROM pg_policies
WHERE tablename IN ('challenges', 'rewards', 'sessions', 'redemptions', 'gym_memberships')
ORDER BY tablename, policyname;
