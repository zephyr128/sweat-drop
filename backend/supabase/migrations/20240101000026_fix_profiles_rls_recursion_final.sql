-- Final fix for infinite recursion in profiles RLS policies
-- This migration ensures that profiles table has ONLY minimal policies
-- that don't query the profiles table itself

-- 1. Drop ALL existing policies on profiles table
-- This includes policies from all previous migrations
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
DROP POLICY IF EXISTS "Gym admins can view profiles via redemptions" ON public.profiles;
DROP POLICY IF EXISTS "Gym owners can view profiles via redemptions" ON public.profiles;
DROP POLICY IF EXISTS "Receptionists can view profiles via redemptions" ON public.profiles;

-- 2. Create ONLY minimal policies that don't cause recursion
-- These policies use ONLY auth.uid() and don't query any tables

-- Users can view their own profile (no function calls, no table queries)
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Users can insert their own profile during signup
CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- 3. IMPORTANT NOTES:
-- - Admin/superadmin access to profiles will be handled via service role client in application code
-- - Gym owners/admins will access profiles through service role queries
-- - This ensures no infinite recursion while maintaining security
-- - The application code (redemptions/page.tsx) already uses service role client
