-- Test script to check if RLS policies allow profile access
-- Run this in Supabase SQL Editor to test

-- 1. Check current user (replace with your user ID)
-- SELECT auth.uid() as current_user_id;

-- 2. Test if you can see your own profile
-- This should work with profiles_select_own policy
SELECT 
  id,
  email,
  username,
  role,
  assigned_gym_id,
  owner_id
FROM public.profiles
WHERE id = auth.uid();

-- 3. Check all RLS policies on profiles table
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
WHERE tablename = 'profiles'
ORDER BY policyname;

-- 4. Check if RLS is enabled
SELECT 
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public' 
AND tablename = 'profiles';

-- 5. If profile doesn't exist, check if user exists in auth.users
SELECT 
  id,
  email,
  created_at,
  raw_user_meta_data
FROM auth.users
WHERE id = auth.uid();
