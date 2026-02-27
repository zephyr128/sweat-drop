-- Fix Challenge Progress RLS Issue
-- The update_challenge_progress function uses SECURITY DEFINER but RLS policies
-- may still block operations. This migration adds a policy that allows SECURITY DEFINER
-- functions to manage challenge_progress when called from authenticated context.

-- In Supabase, SECURITY DEFINER functions run as the function owner (postgres/service_role),
-- but RLS policies still apply. We need a policy that allows these functions to work.

-- Drop existing policy if it exists (to allow re-running migration)
DROP POLICY IF EXISTS "allow_function_challenge_progress_management" ON public.challenge_progress;

-- Add policy to allow SECURITY DEFINER functions to insert/update challenge_progress
-- This policy allows operations when:
-- 1. Normal user context: auth.uid() matches user_id
-- 2. Function context: current_user is postgres or service_role (SECURITY DEFINER functions)
CREATE POLICY "allow_function_challenge_progress_management"
  ON public.challenge_progress
  FOR ALL
  USING (
    -- Normal user context: auth.uid() matches user_id
    auth.uid() = user_id
    -- OR function context: SECURITY DEFINER functions run as postgres/service_role
    OR current_user = 'postgres'
    OR current_user = 'service_role'
  )
  WITH CHECK (
    auth.uid() = user_id
    OR current_user = 'postgres'
    OR current_user = 'service_role'
  );

-- Add helpful comment for debugging
COMMENT ON FUNCTION public.update_challenge_progress IS 'Unified function that handles all 5 challenge types. Uses SECURITY DEFINER to bypass RLS. If challenge progress is not updating, check Supabase logs for RAISE NOTICE messages to debug.';
