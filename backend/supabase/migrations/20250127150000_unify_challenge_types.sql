-- Unify Challenge Types Migration
-- Replaces both challenge_type ENUM and frequency TEXT with a single unified enum
-- Maps existing data from frequency field to new challenge_type enum

-- Step 1: Drop old enum (will be recreated with new values)
-- Note: We need to drop the column first, then recreate the enum
ALTER TABLE public.challenges
  DROP COLUMN IF EXISTS challenge_type CASCADE;

-- Drop old enum type
DROP TYPE IF EXISTS challenge_type CASCADE;

-- Step 2: Create new unified enum with all 5 types
CREATE TYPE challenge_type AS ENUM (
  'daily',      -- Sum of drops in a single day
  'weekly',     -- Cumulative drops in a week (fixed date range)
  'monthly',    -- Cumulative drops in a month (fixed date range)
  'streak',     -- Consecutive days of training (min 1 drop per day)
  'milestone'   -- All-time drops in a specific gym
);

-- Step 3: Add new unified column
ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS challenge_type_new challenge_type;

-- Step 4: Migrate data from old fields
-- Priority: Use frequency field if it exists, otherwise use old challenge_type
UPDATE public.challenges
SET challenge_type_new = CASE
  -- Map from frequency field (if exists)
  WHEN frequency = 'daily' THEN 'daily'::challenge_type
  WHEN frequency = 'weekly' THEN 'weekly'::challenge_type
  WHEN frequency = 'streak' THEN 'streak'::challenge_type
  WHEN frequency = 'one-time' THEN 'monthly'::challenge_type  -- Map one-time to monthly
  -- Fallback: if frequency doesn't exist, use old challenge_type (if it was preserved)
  ELSE 'daily'::challenge_type  -- Default fallback
END
WHERE challenge_type_new IS NULL;

-- Step 5: Drop old frequency column
ALTER TABLE public.challenges
  DROP COLUMN IF EXISTS frequency;

-- Step 6: Rename new column to challenge_type
ALTER TABLE public.challenges
  RENAME COLUMN challenge_type_new TO challenge_type;

-- Step 7: Add NOT NULL constraint
ALTER TABLE public.challenges
  ALTER COLUMN challenge_type SET NOT NULL;

-- Step 8: Add comment for documentation
COMMENT ON TYPE challenge_type IS 'Unified challenge type enum. daily: sum of drops in a single day. weekly: cumulative drops in a week. monthly: cumulative drops in a month. streak: consecutive days of training (min 1 drop per day). milestone: all-time drops in a specific gym.';

COMMENT ON COLUMN public.challenges.challenge_type IS 'Unified challenge type. Replaces old challenge_type ENUM and frequency TEXT fields.';
