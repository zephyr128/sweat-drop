-- Update Challenges Schema Migration
-- Marks minutes-based fields as DEPRECATED and adds milestone_threshold field
-- Ensures target_drops is the primary field for challenge targets

-- Step 1: Mark minutes-based fields as DEPRECATED (keep for backward compatibility)
COMMENT ON COLUMN public.challenges.required_minutes IS 'DEPRECATED: Use target_drops instead. Kept for backward compatibility. This field should not be used for new challenges.';
COMMENT ON COLUMN public.challenges.drops_bounty IS 'DEPRECATED: Use reward_drops instead. Kept for backward compatibility. This field should not be used for new challenges.';
COMMENT ON COLUMN public.challenges.machine_type IS 'DEPRECATED: This field is no longer used. Challenges are now drops-based, not machine-type-based.';

-- Step 2: Ensure target_drops and reward_drops are properly documented
COMMENT ON COLUMN public.challenges.target_drops IS 'Required drops to complete challenge. Primary field for challenge targets (except milestone challenges which use milestone_threshold).';
COMMENT ON COLUMN public.challenges.reward_drops IS 'Drops awarded upon challenge completion. Primary field for challenge rewards.';

-- Step 3: Add milestone-specific field
ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS milestone_threshold INTEGER;

COMMENT ON COLUMN public.challenges.milestone_threshold IS 'For milestone challenges only: total drops required (all-time in gym). When challenge_type = milestone, this field must be set instead of target_drops.';

-- Step 4: Add constraint to ensure data integrity
-- Drop existing constraint if it exists
ALTER TABLE public.challenges
  DROP CONSTRAINT IF EXISTS challenges_target_drops_check;

-- Add new constraint: milestone challenges use milestone_threshold, others use target_drops
ALTER TABLE public.challenges
  ADD CONSTRAINT challenges_target_drops_check 
  CHECK (
    (challenge_type = 'milestone' AND milestone_threshold IS NOT NULL) OR
    (challenge_type != 'milestone' AND target_drops IS NOT NULL)
  );

-- Step 5: Add comment explaining the constraint
COMMENT ON CONSTRAINT challenges_target_drops_check ON public.challenges IS 'Ensures milestone challenges use milestone_threshold, while all other challenge types use target_drops.';
