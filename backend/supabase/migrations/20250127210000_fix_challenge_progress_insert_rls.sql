-- Fix Challenge Progress INSERT RLS Policy
-- The 400 error on POST to challenge_progress suggests RLS policy is blocking INSERT
-- This migration ensures INSERT works correctly when gym_id is provided

-- Drop existing INSERT policy
DROP POLICY IF EXISTS "Users can insert own challenge progress" ON public.challenge_progress;

-- Create new INSERT policy that:
-- 1. Allows users to insert their own progress with valid gym_id
-- 2. Allows SECURITY DEFINER functions to insert
-- 3. Validates that gym_id exists and matches challenge's gym_id
CREATE POLICY "Users can insert own challenge progress"
  ON public.challenge_progress FOR INSERT
  WITH CHECK (
    (
      -- User must match
      auth.uid() = user_id
      -- AND gym_id must be provided and valid
      AND gym_id IS NOT NULL
      -- AND gym_id must match the challenge's gym_id (validate referential integrity)
      AND EXISTS (
        SELECT 1 FROM public.challenges c
        WHERE c.id = challenge_progress.challenge_id
          AND c.gym_id = challenge_progress.gym_id
      )
    )
    -- OR allow SECURITY DEFINER functions
    OR current_user = 'postgres'
    OR current_user = 'service_role'
  );

-- Add comment explaining the policy
COMMENT ON POLICY "Users can insert own challenge progress" ON public.challenge_progress IS 'Allows users to insert their own challenge progress. Requires gym_id to be provided and must match the challenge''s gym_id. Also allows SECURITY DEFINER functions (update_challenge_progress) to insert progress records.';

-- Important Notes:
-- 1. Frontend should NOT insert directly into challenge_progress table
-- 2. Challenge progress should be managed automatically by update_challenge_progress() function
-- 3. update_challenge_progress() is called from add_drops() when drops are earned
-- 4. If frontend needs to create initial progress records, it should use update_challenge_progress() RPC function instead
-- 5. Direct INSERT will fail if gym_id is not provided (NOT NULL constraint)
-- 6. Direct INSERT will fail if gym_id doesn't match challenge's gym_id (RLS policy validation)

-- Common causes of 400 error on POST to challenge_progress:
-- - Missing gym_id field (NOT NULL constraint violation)
-- - gym_id doesn't match challenge's gym_id (RLS policy violation)
-- - Duplicate user_id + challenge_id (UNIQUE constraint violation)
-- - Invalid challenge_id (Foreign key constraint violation)
