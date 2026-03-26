-- Debug superadmin role check
-- Run this in Supabase SQL Editor

-- 1. Check your current user ID and role
SELECT 
  auth.uid() as your_user_id,
  auth.email() as your_email,
  (SELECT role FROM public.profiles WHERE id = auth.uid()) as your_role,
  (SELECT public.is_superadmin(auth.uid())) as is_superadmin_check;

-- 2. Check if profiles table has RLS that might block the query
SELECT 
  schemaname,
  tablename,
  policyname,
  cmd,
  qual as using_clause
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'profiles'
  AND cmd = 'SELECT';

-- 3. Test direct query (might fail due to RLS)
SELECT 
  id,
  email,
  role
FROM public.profiles
WHERE id = auth.uid();

-- 4. Test using is_superadmin() helper (should work - SECURITY DEFINER)
SELECT 
  public.is_superadmin(auth.uid()) as is_superadmin;
