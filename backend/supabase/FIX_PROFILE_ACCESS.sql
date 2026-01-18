-- Fix Profile Access Issues
-- This script helps diagnose and fix profile access problems

-- 1. Check if RLS is blocking access
-- First, let's see what policies exist
SELECT 
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY policyname;

-- 2. Check if RLS is enabled (it should be)
SELECT 
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public' 
AND tablename = 'profiles';

-- 3. For testing: Temporarily disable RLS to see if that's the issue
-- (Only for debugging - re-enable after testing!)
-- ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;

-- 4. Re-enable RLS after testing
-- ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 5. Check if users have profiles
-- Replace 'YOUR_USER_ID' with actual user IDs
SELECT 
  u.id as user_id,
  u.email as auth_email,
  p.id as profile_id,
  p.email as profile_email,
  p.role,
  p.assigned_gym_id,
  p.owner_id
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id
ORDER BY u.created_at DESC
LIMIT 10;

-- 6. Create missing profiles for users who don't have them
-- This will create a profile for any auth user that doesn't have one
INSERT INTO public.profiles (id, email, username, role, total_drops)
SELECT 
  u.id,
  u.email,
  COALESCE(
    u.raw_user_meta_data->>'username',
    split_part(u.email, '@', 1),
    'user_' || substr(u.id::text, 1, 8)
  ) as username,
  'user'::user_role as role,
  0 as total_drops
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = u.id
)
ON CONFLICT (id) DO NOTHING;

-- 7. Verify the fix worked
SELECT 
  COUNT(*) as total_users,
  COUNT(p.id) as users_with_profiles,
  COUNT(*) - COUNT(p.id) as users_without_profiles
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id;
