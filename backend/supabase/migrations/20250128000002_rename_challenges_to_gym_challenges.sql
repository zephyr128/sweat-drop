-- Migration: 20250128000002_rename_challenges_to_gym_challenges.sql
-- Description: Renames challenges table to gym_challenges for clear separation from global achievements
-- 
-- AGENT NOTE: [2025-01-28] - supabase-dba
-- 
-- CHANGES:
-- - Renamed table: public.challenges → public.gym_challenges
-- - Renamed indexes: idx_challenges_* → idx_gym_challenges_*
-- - PostgreSQL automatically updates foreign key references
-- 
-- IMPACT ON FRONTEND:
-- - Mobile App: All queries to challenges table must be updated to gym_challenges
-- - Admin Panel: All queries to challenges table must be updated to gym_challenges
-- - Backend Functions: All references to challenges table must be updated
-- 
-- BREAKING CHANGES:
-- - Table name changed: challenges → gym_challenges
-- - All code referencing challenges table must be updated
-- 
-- NEXT STEPS:
-- 1. Run: supabase gen types typescript --local > backend/types/database.types.ts
-- 2. Update MIGRATION_NOTES.md
-- 3. Update all code references (mobile-app, admin-panel, backend functions)
-- 4. Proceed to Korak 1.3: Add criteria JSONB to gym_challenges

-- Step 1: Rename table
ALTER TABLE public.challenges RENAME TO gym_challenges;

-- Step 2: Update indexes
-- Note: PostgreSQL automatically updates foreign key references when table is renamed
ALTER INDEX IF EXISTS idx_challenges_gym_id RENAME TO idx_gym_challenges_gym_id;
ALTER INDEX IF EXISTS idx_challenges_is_active RENAME TO idx_gym_challenges_is_active;

-- Step 3: Update comments
COMMENT ON TABLE public.gym_challenges IS 'Custom challenges created by gym owners. These are gym-specific and can have flexible criteria defined via JSONB.';

-- Note: Foreign key references in challenge_progress and user_badges are automatically updated by PostgreSQL
-- Note: RLS policies that reference challenges table will need to be updated in a separate migration
-- Note: Functions that reference challenges table will need to be updated in a separate migration
