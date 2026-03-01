-- Migration: 20250128000005_update_user_badges_polymorphic.sql
-- Description: Updates user_badges table to support polymorphic references (global achievements + gym challenges)
-- 
-- AGENT NOTE: [2025-01-28] - supabase-dba
-- 
-- CHANGES:
-- - Added columns: public.user_badges.global_achievement_id, public.user_badges.gym_challenge_id
-- - Migrated existing data: challenge_id → gym_challenge_id
-- - Added constraint: user_badges_exactly_one_reference (exactly one reference must be set)
-- - Updated unique constraint: user_badges_unique_per_user_and_achievement
-- - Added indexes: idx_user_badges_global_achievement_id, idx_user_badges_gym_challenge_id
-- 
-- IMPACT ON FRONTEND:
-- - Mobile App: Will need to handle both global_achievement_id and gym_challenge_id
-- - Admin Panel: Will need to query badges by both types
-- 
-- BREAKING CHANGES:
-- - New columns added (backward compatible)
-- - Old challenge_id column is kept for now (will be dropped in future migration)
-- 
-- NEXT STEPS:
-- 1. Run: supabase gen types typescript --local > backend/types/database.types.ts
-- 2. Update MIGRATION_NOTES.md
-- 3. Update frontend code to use polymorphic references
-- 4. Proceed to Faza 2: Criteria System

-- Step 1: Add new columns for polymorphic references
ALTER TABLE public.user_badges
  ADD COLUMN IF NOT EXISTS global_achievement_id UUID REFERENCES public.global_achievements(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS gym_challenge_id UUID REFERENCES public.gym_challenges(id) ON DELETE CASCADE;

-- Step 2: Migrate existing data (challenge_id -> gym_challenge_id)
UPDATE public.user_badges
SET gym_challenge_id = challenge_id
WHERE gym_challenge_id IS NULL AND challenge_id IS NOT NULL;

-- Step 3: Add constraint: exactly one reference must be set
ALTER TABLE public.user_badges
  ADD CONSTRAINT user_badges_exactly_one_reference CHECK (
    (global_achievement_id IS NOT NULL AND gym_challenge_id IS NULL) OR
    (global_achievement_id IS NULL AND gym_challenge_id IS NOT NULL)
  );

-- Step 4: Update unique constraint
-- Drop old constraint if it exists
ALTER TABLE public.user_badges
  DROP CONSTRAINT IF EXISTS user_badges_user_id_challenge_id_key;

-- Add new unique constraint for polymorphic references
ALTER TABLE public.user_badges
  ADD CONSTRAINT user_badges_unique_per_user_and_achievement UNIQUE (user_id, global_achievement_id, gym_challenge_id);

-- Step 5: Add indexes
CREATE INDEX IF NOT EXISTS idx_user_badges_global_achievement_id ON public.user_badges(global_achievement_id) WHERE global_achievement_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_badges_gym_challenge_id ON public.user_badges(gym_challenge_id) WHERE gym_challenge_id IS NOT NULL;

-- Step 6: Update comments
COMMENT ON TABLE public.user_badges IS 'Permanent badge storage. Supports both global achievements and gym challenges via polymorphic references.';
COMMENT ON COLUMN public.user_badges.global_achievement_id IS 'Reference to global achievement (if this badge is for a global achievement). Exactly one of global_achievement_id or gym_challenge_id must be set.';
COMMENT ON COLUMN public.user_badges.gym_challenge_id IS 'Reference to gym challenge (if this badge is for a gym challenge). Exactly one of global_achievement_id or gym_challenge_id must be set.';
COMMENT ON COLUMN public.user_badges.challenge_id IS 'DEPRECATED: Use gym_challenge_id instead. Kept for backward compatibility. Will be dropped in a future migration.';

-- Note: challenge_id column is kept for backward compatibility
-- It will be dropped in a future migration once all code is updated to use gym_challenge_id
