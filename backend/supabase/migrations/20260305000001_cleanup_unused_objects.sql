-- Migration: 20260305000001_cleanup_unused_objects.sql
-- Description: Cleanup - Drop confirmed-unused database objects
-- 
-- AGENT NOTE: [2026-03-05] - supabase-dba
-- 
-- VERIFIED FINDINGS:
-- - add_drops() function: Zero callers in codebase (superseded by award_drops())
-- - user_badges.challenge_id: 0/6 rows populated (always NULL, superseded by gym_challenge_id)
-- - incorrect_challenge_rewards view: No app code queries it (debug view)
-- 
-- CHANGES:
-- - Drops all overloaded versions of add_drops() function
-- - Drops legacy challenge_id column from user_badges table
-- - Drops incorrect_challenge_rewards debug view
-- 
-- IMPACT ON FRONTEND:
-- - None (all objects are unused)
-- 
-- BREAKING CHANGES:
-- - None (objects are not referenced by any code)

-- ============================================================================
-- 1. Drop legacy add_drops() function (all overloaded versions)
-- ============================================================================
-- Superseded by award_drops() in migration 20260302000008
-- Verified: No app code, Edge Functions, or active migrations call it
-- Only recursive calls within the function itself (which will be removed)

DO $$
DECLARE
  r RECORD;
  v_dropped_count INTEGER := 0;
BEGIN
  FOR r IN
    SELECT oid, pg_get_function_identity_arguments(oid) AS args
    FROM pg_proc
    WHERE proname = 'add_drops'
      AND pronamespace = 'public'::regnamespace
    ORDER BY pg_get_function_identity_arguments(oid)
  LOOP
    EXECUTE format(
      'DROP FUNCTION IF EXISTS public.add_drops(%s) CASCADE',
      r.args
    );
    v_dropped_count := v_dropped_count + 1;
    RAISE LOG 'Dropped: add_drops(%)', r.args;
  END LOOP;
  
  IF v_dropped_count = 0 THEN
    RAISE LOG 'No add_drops() functions found to drop';
  ELSE
    RAISE LOG 'Dropped % overloaded version(s) of add_drops()', v_dropped_count;
  END IF;
END
$$;

-- ============================================================================
-- 2. Drop legacy challenge_id column from user_badges
-- ============================================================================
-- Superseded by gym_challenge_id in migration 20250128000005
-- Verified: 0 of 6 rows have a value in this column (always NULL)
-- Old constraint user_badges_user_id_challenge_id_key was already dropped
-- Column was marked as DEPRECATED in 20250128000005

ALTER TABLE public.user_badges
  DROP COLUMN IF EXISTS challenge_id;

-- Drop the old index if it exists (created in 20250127140001)
DROP INDEX IF EXISTS public.idx_user_badges_challenge_id;

-- ============================================================================
-- 3. Drop incorrect_challenge_rewards debug view
-- ============================================================================
-- Created in migration 20260304100013 for one-time debugging
-- No app code queries this view
-- Safe to drop (was only for admin review)

DROP VIEW IF EXISTS public.incorrect_challenge_rewards;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public.user_badges IS 
  'Permanent badge storage. Supports both global achievements and gym challenges via polymorphic references. '
  'Uses global_achievement_id for global badges and gym_challenge_id for gym challenge badges. '
  'Legacy challenge_id column has been removed.';
