-- Fix RLS Infinite Recursion Issue
-- The problem: policies on profiles table were calling functions that query profiles
-- Solution: Use simple, direct policies that don't cause recursion

-- 1. Drop ALL existing policies on profiles to avoid conflicts
-- This includes policies from all previous migrations
-- IMPORTANT: This migration MUST run AFTER 20240101000017
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Superadmins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Gym owners can view their gym profiles" ON public.profiles;
DROP POLICY IF EXISTS "Gym admins can view their gym profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Superadmins can update any profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view other profiles (for leaderboards)" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "superadmin_all_profiles" ON public.profiles;
DROP POLICY IF EXISTS "gym_admin_gym_profiles" ON public.profiles;
DROP POLICY IF EXISTS "receptionist_gym_profiles" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_gym_owner" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_superadmin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_superadmin" ON public.profiles;

-- Also drop any policies that might have been created by migration 17
-- These policies call functions that query profiles, causing recursion
DROP POLICY IF EXISTS "Gym admins can view their gym profiles" ON public.profiles;

-- 2. Create NEW, simple policies that avoid recursion
-- Key insight: We CAN'T call functions that query profiles from profiles policies
-- We also CAN'T query other tables that might have policies querying profiles
-- The safest approach is to ONLY allow users to see their own profile
-- Admin access will be handled through service role or by disabling RLS for specific queries

-- Users can ALWAYS view their own profile (no function calls, no table queries)
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- Users can ALWAYS update their own profile
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Users can insert their own profile during signup
CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- IMPORTANT: We cannot check role from JWT because role is stored in profiles table
-- JWT doesn't automatically include role from profiles
-- Drop the superadmin policies that use JWT (they won't work)
DROP POLICY IF EXISTS "profiles_select_superadmin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_superadmin" ON public.profiles;

-- For admin/superadmin access, use service role queries in application code
-- These policies only allow users to see their own profile
-- Admin panel will use service role client to fetch profiles when needed

-- IMPORTANT: We CANNOT query gyms table from profiles policies
-- because gyms policies might query profiles, causing recursion
-- Gym owners/admins will access profiles through service role queries
-- For now, we only allow:
-- 1. Users to see their own profile (via auth.uid() = id)
-- 2. Admin/superadmin access via service role queries in application code

-- 3. Keep helper functions as they are
-- These functions are fine to use in policies on OTHER tables (gyms, challenges, etc.)
-- The problem was ONLY when they were called from policies on the profiles table itself
-- So we don't need to drop or recreate them - they work fine for other tables
