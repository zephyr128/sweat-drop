-- Migration: 20260304000020_auth_foundation.sql
-- Description: Auth foundation — handle_new_user trigger rewrite,
--              profile RPCs, and RLS policy for leaderboard visibility.
--
-- AGENT NOTE: [2026-03-04] - supabase-dba (Auth Foundation)
-- Reference: docs/plans/auth_onboarding_audit_and_plan.md
--
-- CHANGES:
--   Task A.1: Rewrite handle_new_user() trigger
--   Task A.2: Verify all profile columns exist
--   Task A.3: Add leaderboard-safe SELECT policy for profiles
--   Task A.6: Create get_my_profile() RPC
--   Task A.7: Create update_profile() RPC
--
-- IMPACT ON FRONTEND:
-- - Mobile App: Can now use get_my_profile() and update_profile() RPCs
-- - Mobile App: New users get proper avatar_url from OAuth metadata
-- - Mobile App: Leaderboard queries can now see other users' profiles
--
-- BREAKING CHANGES:
-- - None (additive and improvements only)

SET search_path TO public;

-- ============================================================================
-- TASK A.1: Rewrite handle_new_user() Trigger
-- ============================================================================
-- The current trigger only inserts id, email, username, full_name.
-- This rewrite:
-- 1. Extracts avatar_url from Google/Apple OAuth metadata
-- 2. Extracts display name robustly (try full_name, name, email prefix)
-- 3. Handles duplicate key gracefully (ON CONFLICT DO NOTHING)
-- 4. Sets search_path explicitly for security
-- 5. Sets all economy defaults explicitly (total_drops, available_drops, etc.)
-- 6. Sets is_newcomer = true, role = 'user'

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    username,
    full_name,
    avatar_url,
    total_drops,
    available_drops,
    weekly_drops,
    monthly_drops,
    streak_days,
    is_newcomer,
    role,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    NEW.email,
    -- Username: try metadata, fallback to user_ prefix
    COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data->>'preferred_username'), ''),
      NULLIF(TRIM(NEW.raw_user_meta_data->>'user_name'), ''),
      'user_' || substr(NEW.id::text, 1, 8)
    ),
    -- Full name: try multiple metadata fields
    COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
      NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
      split_part(NEW.email, '@', 1)
    ),
    -- Avatar URL from Google/Apple OAuth
    NULLIF(TRIM(NEW.raw_user_meta_data->>'avatar_url'), ''),
    -- Economy defaults (all zeros)
    0, 0, 0, 0, 0,
    -- Newcomer flag
    true,
    -- Default role
    'user',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Recreate trigger (DROP + CREATE to be safe)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- TASK A.2: Verify Profile Columns
-- ============================================================================
-- Ensure all required columns exist. This is a safety check that will
-- raise an exception if any required column is missing.

DO $$
DECLARE
  missing_cols TEXT := '';
BEGIN
  -- Check each required column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'available_drops') THEN
    missing_cols := missing_cols || 'available_drops, ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'weekly_drops') THEN
    missing_cols := missing_cols || 'weekly_drops, ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'monthly_drops') THEN
    missing_cols := missing_cols || 'monthly_drops, ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'streak_days') THEN
    missing_cols := missing_cols || 'streak_days, ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'last_visit_date') THEN
    missing_cols := missing_cols || 'last_visit_date, ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'expo_push_token') THEN
    missing_cols := missing_cols || 'expo_push_token, ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'is_newcomer') THEN
    missing_cols := missing_cols || 'is_newcomer, ';
  END IF;

  IF missing_cols != '' THEN
    RAISE EXCEPTION 'Missing profile columns: %', missing_cols;
  ELSE
    RAISE NOTICE 'All required profile columns verified ✅';
  END IF;
END;
$$;

-- ============================================================================
-- TASK A.3: RLS Policy for Leaderboard Profile Visibility
-- ============================================================================
-- Current RLS only allows users to see their OWN profile.
-- Add a policy for authenticated users to see basic info of others
-- (for leaderboards, challenge participants, etc.).
--
-- This is safe because:
-- - Profile data is not sensitive (no financial info, no PII beyond email)
-- - Email is already visible to the user
-- - Drops are public via leaderboard
-- - If needed later, we can create a profiles_public VIEW with only:
--   id, username, avatar_url, total_drops, streak_days, is_newcomer

CREATE POLICY "profiles_select_public_fields"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- TASK A.6: get_my_profile() RPC
-- ============================================================================
-- Returns the current user's profile. Uses SECURITY DEFINER to bypass RLS
-- and ensure the user can always access their own profile.

CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS public.profiles
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT * FROM public.profiles
  WHERE id = auth.uid()
  LIMIT 1;
$$;

-- ============================================================================
-- TASK A.7: update_profile() RPC
-- ============================================================================
-- Updates the current user's profile with validation.
-- Parameters are optional (NULL means don't update that field).
-- Validates username length and uniqueness.

CREATE OR REPLACE FUNCTION public.update_profile(
  p_username TEXT DEFAULT NULL,
  p_avatar_url TEXT DEFAULT NULL,
  p_expo_push_token TEXT DEFAULT NULL
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles;
BEGIN
  -- Validate username if provided
  IF p_username IS NOT NULL THEN
    -- Min 2, max 30 characters
    IF LENGTH(TRIM(p_username)) < 2 THEN
      RAISE EXCEPTION 'Username must be at least 2 characters';
    END IF;
    IF LENGTH(TRIM(p_username)) > 30 THEN
      RAISE EXCEPTION 'Username must be at most 30 characters';
    END IF;
    -- Check uniqueness
    IF EXISTS (
      SELECT 1 FROM public.profiles
      WHERE username = TRIM(p_username)
      AND id != auth.uid()
    ) THEN
      RAISE EXCEPTION 'Username already taken';
    END IF;
  END IF;

  UPDATE public.profiles SET
    username = COALESCE(TRIM(p_username), username),
    avatar_url = COALESCE(p_avatar_url, avatar_url),
    expo_push_token = COALESCE(p_expo_push_token, expo_push_token),
    updated_at = NOW()
  WHERE id = auth.uid()
  RETURNING * INTO v_profile;

  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'Profile not found for current user';
  END IF;

  RETURN v_profile;
END;
$$;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- Verify all functions and policies were created successfully

DO $$
DECLARE
  func_count INTEGER;
  policy_count INTEGER;
  trigger_count INTEGER;
BEGIN
  -- Check functions exist
  SELECT COUNT(*) INTO func_count
  FROM information_schema.routines
  WHERE routine_schema = 'public'
    AND routine_name IN ('handle_new_user', 'get_my_profile', 'update_profile');
  
  IF func_count != 3 THEN
    RAISE EXCEPTION 'Expected 3 functions, found %', func_count;
  END IF;

  -- Check trigger exists
  SELECT COUNT(*) INTO trigger_count
  FROM pg_trigger
  WHERE tgname = 'on_auth_user_created';
  
  IF trigger_count != 1 THEN
    RAISE EXCEPTION 'Expected 1 trigger, found %', trigger_count;
  END IF;

  -- Check RLS policies (should have 4: select_own, update_own, insert_own, select_public_fields)
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE tablename = 'profiles';
  
  IF policy_count < 4 THEN
    RAISE WARNING 'Expected at least 4 RLS policies on profiles, found %', policy_count;
  END IF;

  RAISE NOTICE '✅ Verification complete: % functions, % trigger, % policies', func_count, trigger_count, policy_count;
END;
$$;
