-- Migration: 20250128000009_update_indexes_after_rename.sql
-- Description: Updates index name after challenges table rename to gym_challenges
-- 
-- AGENT NOTE: [2025-01-28] - supabase-dba
-- 
-- CHANGES:
-- - Drops old index: idx_challenges_gym_id (if exists)
-- - Creates new index: idx_gym_challenges_gym_id (if not exists)
-- 
-- IMPACT ON FRONTEND:
-- - None (performance optimization only)
-- 
-- BREAKING CHANGES:
-- - None
-- 
-- NEXT STEPS:
-- 1. Run: supabase db reset (or apply migration)
-- 2. Verify: Index exists and is being used

-- Drop old index if it exists (from 20240101000005_enhanced_rbac_routing.sql)
DROP INDEX IF EXISTS public.idx_challenges_gym_id;

-- Create index with new name (should already exist from 20250128000002, but ensure it exists)
CREATE INDEX IF NOT EXISTS idx_gym_challenges_gym_id ON public.gym_challenges(gym_id);

-- Comments
COMMENT ON INDEX public.idx_gym_challenges_gym_id IS 'Index on gym_id for gym_challenges table. Used for filtering challenges by gym.';
