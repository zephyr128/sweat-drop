-- Migration: 20260305000004_add_updated_at_to_arena_participants.sql
-- Description: Add updated_at column to arena_participants table
-- 
-- AGENT NOTE: [2026-03-05] - supabase-dba
-- 
-- PROBLEM:
-- update_arena_scores() tries to set updated_at, but arena_participants table doesn't have this column
-- 
-- CHANGES:
-- - Add updated_at column to arena_participants table
-- - Set default value to NOW() for existing rows
-- 
-- IMPACT ON FRONTEND:
-- - None (internal column)
-- 
-- BREAKING CHANGES:
-- - None (additive change)

-- Add updated_at column if it doesn't exist
ALTER TABLE public.arena_participants
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Update existing rows to have updated_at = opted_in_at (if updated_at is NULL)
UPDATE public.arena_participants
SET updated_at = opted_in_at
WHERE updated_at IS NULL;

-- Make updated_at NOT NULL (after setting defaults)
ALTER TABLE public.arena_participants
  ALTER COLUMN updated_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT NOW();

COMMENT ON COLUMN public.arena_participants.updated_at IS
  'Timestamp when the participant''s score was last updated. Used for tracking score refresh frequency.';
