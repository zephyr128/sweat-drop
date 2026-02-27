-- Fix Challenge Progress RLS Issue - Definitive Solution
-- SECURITY DEFINER functions still need to bypass RLS for challenge_progress operations
-- This migration fixes RLS policies to allow SECURITY DEFINER functions to work properly

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can insert own challenge progress" ON public.challenge_progress;
DROP POLICY IF EXISTS "Users can update own challenge progress" ON public.challenge_progress;
DROP POLICY IF EXISTS "allow_function_challenge_progress_management" ON public.challenge_progress;

-- Create new INSERT policy that allows:
-- 1. Users to insert their own progress (normal case)
-- 2. SECURITY DEFINER functions to insert (when current_user is postgres/service_role)
CREATE POLICY "Users can insert own challenge progress"
  ON public.challenge_progress FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    OR current_user = 'postgres'
    OR current_user = 'service_role'
    OR current_setting('role') = 'postgres'
    OR current_setting('role') = 'service_role'
  );

-- Create new UPDATE policy that allows:
-- 1. Users to update their own progress (normal case)
-- 2. SECURITY DEFINER functions to update (when current_user is postgres/service_role)
CREATE POLICY "Users can update own challenge progress"
  ON public.challenge_progress FOR UPDATE
  USING (
    auth.uid() = user_id
    OR current_user = 'postgres'
    OR current_user = 'service_role'
    OR current_setting('role') = 'postgres'
    OR current_setting('role') = 'service_role'
  )
  WITH CHECK (
    auth.uid() = user_id
    OR current_user = 'postgres'
    OR current_user = 'service_role'
    OR current_setting('role') = 'postgres'
    OR current_setting('role') = 'service_role'
  );

-- Keep SELECT policy as is (users can view their own progress)
-- This should already exist, but ensure it's correct
DROP POLICY IF EXISTS "Users can view own challenge progress" ON public.challenge_progress;
CREATE POLICY "Users can view own challenge progress"
  ON public.challenge_progress FOR SELECT
  USING (
    auth.uid() = user_id
    OR current_user = 'postgres'
    OR current_user = 'service_role'
  );

-- Add comment explaining the fix
COMMENT ON POLICY "Users can insert own challenge progress" ON public.challenge_progress IS 'Allows users to insert their own challenge progress, and allows SECURITY DEFINER functions (update_challenge_progress) to insert progress records.';
COMMENT ON POLICY "Users can update own challenge progress" ON public.challenge_progress IS 'Allows users to update their own challenge progress, and allows SECURITY DEFINER functions (update_challenge_progress) to update progress records.';
