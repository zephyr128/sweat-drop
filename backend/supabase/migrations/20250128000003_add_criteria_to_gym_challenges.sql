-- Migration: 20250128000003_add_criteria_to_gym_challenges.sql
-- Description: Adds criteria JSONB column to gym_challenges for flexible challenge conditions
-- 
-- AGENT NOTE: [2025-01-28] - supabase-dba
-- 
-- CHANGES:
-- - Added column: public.gym_challenges.criteria (JSONB)
-- - Migrated existing data: challenge_type + target_drops → criteria JSONB
-- - Added index: idx_gym_challenges_criteria (GIN index for JSONB queries)
-- 
-- IMPACT ON FRONTEND:
-- - Mobile App: Will need to use criteria JSONB instead of challenge_type/target_drops
-- - Admin Panel: Challenge creation form must use criteria JSONB structure
-- 
-- BREAKING CHANGES:
-- - New column added (backward compatible, but old columns are deprecated)
-- - Existing challenges are migrated to criteria format
-- 
-- NEXT STEPS:
-- 1. Run: supabase gen types typescript --local > backend/types/database.types.ts
-- 2. Update MIGRATION_NOTES.md
-- 3. Update frontend code to use criteria JSONB
-- 4. Proceed to Korak 1.4: Create user_progress table

-- Step 1: Add criteria column
ALTER TABLE public.gym_challenges
  ADD COLUMN IF NOT EXISTS criteria JSONB;

-- Step 2: Migrate existing data to criteria format
-- Convert challenge_type + target_drops to criteria JSONB
UPDATE public.gym_challenges
SET criteria = jsonb_build_object(
  'type', challenge_type::text,
  'target', CASE
    WHEN challenge_type = 'daily' OR challenge_type = 'weekly' OR challenge_type = 'monthly' THEN target_drops
    WHEN challenge_type = 'streak' THEN streak_days
    WHEN challenge_type = 'milestone' THEN milestone_threshold
    ELSE NULL
  END
)
WHERE criteria IS NULL;

-- Step 3: Make criteria NOT NULL after migration
ALTER TABLE public.gym_challenges
  ALTER COLUMN criteria SET NOT NULL;

-- Step 4: Add index for JSONB queries
CREATE INDEX IF NOT EXISTS idx_gym_challenges_criteria ON public.gym_challenges USING GIN (criteria);

-- Step 5: Add comment
COMMENT ON COLUMN public.gym_challenges.criteria IS 'JSONB structure defining challenge conditions. See Criteria System documentation for schema. Replaces rigid challenge_type and target_drops fields.';

-- Note: Old columns (challenge_type, target_drops, streak_days, milestone_threshold) are kept for backward compatibility
-- They will be deprecated in a future migration once all code is updated to use criteria JSONB
