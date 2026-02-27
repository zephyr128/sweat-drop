-- Unify Challenge Progress Tables Migration
-- Consolidates challenge_progress table by adding gym_id and streak tracking columns
-- Deprecates user_challenge_progress table (kept for data preservation, not deleted)

-- Step 1: Add gym_id to challenge_progress (for milestone challenges)
ALTER TABLE public.challenge_progress
  ADD COLUMN IF NOT EXISTS gym_id UUID REFERENCES public.gyms(id) ON DELETE CASCADE;

-- Step 2: Migrate gym_id from challenges table
-- Set gym_id for all existing progress records
UPDATE public.challenge_progress cp
SET gym_id = c.gym_id
FROM public.challenges c
WHERE cp.challenge_id = c.id
  AND cp.gym_id IS NULL;

-- Step 3: Add NOT NULL constraint (after data migration)
ALTER TABLE public.challenge_progress
  ALTER COLUMN gym_id SET NOT NULL;

-- Step 4: Create index for performance
CREATE INDEX IF NOT EXISTS idx_challenge_progress_gym_id 
  ON public.challenge_progress(gym_id);

-- Step 5: Add columns for streak tracking
ALTER TABLE public.challenge_progress
  ADD COLUMN IF NOT EXISTS current_streak_days INTEGER DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS last_activity_date DATE;

-- Step 6: Create index for streak queries
CREATE INDEX IF NOT EXISTS idx_challenge_progress_last_activity_date 
  ON public.challenge_progress(last_activity_date);

-- Step 7: Add comments for documentation
COMMENT ON COLUMN public.challenge_progress.gym_id IS 'Gym where the challenge progress is tracked. Required for milestone challenges and gym-specific filtering.';
COMMENT ON COLUMN public.challenge_progress.current_streak_days IS 'Current consecutive days of training for streak challenges. Increments when user earns drops on consecutive days, resets on gap.';
COMMENT ON COLUMN public.challenge_progress.last_activity_date IS 'Last date when user earned drops for this challenge. Used for streak tracking to determine consecutive days.';

-- Step 8: Deprecate user_challenge_progress table (mark as deprecated but don't delete)
COMMENT ON TABLE public.user_challenge_progress IS 'DEPRECATED: This table is deprecated and should not be used for new challenges. Use challenge_progress instead. Kept for data preservation only.';

-- Note: user_challenge_progress table is NOT deleted to preserve existing data.
-- New challenges will use challenge_progress only.
