-- Migration: 20260304200001_schedule_challenge_resets.sql
-- Description: Fixes challenge reset scheduling - adds pg_cron schedules and creates reset_weekly_challenges()
-- 
-- AGENT NOTE: [2026-03-04] - supabase-dba
-- 
-- CHANGES:
-- - Fixed reset_daily_challenges() to use gym_challenges table and reset correct columns
-- - Created reset_weekly_challenges() function
-- - Scheduled both functions via pg_cron (daily at 23:00 UTC, weekly on Sunday at 23:00 UTC)
-- 
-- IMPACT ON FRONTEND:
-- - Mobile App: Daily and weekly challenges will now reset automatically
-- - Admin Panel: No changes required
-- 
-- BREAKING CHANGES:
-- - None (additive only)

-- ============================================================================
-- FIX C1: Update reset_daily_challenges() to use gym_challenges table
-- ============================================================================
-- The existing function uses 'challenges' table but it was renamed to 'gym_challenges'
-- Also need to reset current_value and last_activity_date, not just current_drops

CREATE OR REPLACE FUNCTION public.reset_daily_challenges()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_challenge RECORD;
  v_reset_count INTEGER := 0;
BEGIN
  -- Loop over all active daily challenges
  FOR v_challenge IN
    SELECT id, gym_id, name
    FROM gym_challenges
    WHERE is_active = true
      AND challenge_type = 'daily'
      AND start_date <= CURRENT_DATE
      AND end_date >= CURRENT_DATE
  LOOP
    -- Reset progress for all participants of this challenge
    -- who have not completed it yet
    UPDATE challenge_progress
    SET
      current_value      = 0,
      current_drops      = 0,
      last_activity_date = NULL,
      updated_at         = NOW()
    WHERE
      challenge_id = v_challenge.id
      AND is_completed = false;

    GET DIAGNOSTICS v_reset_count = ROW_COUNT;

    RAISE LOG
      'reset_daily_challenges: reset % rows for challenge % (%)',
      v_reset_count,
      v_challenge.id,
      v_challenge.name;
  END LOOP;
END;
$$;

-- ============================================================================
-- FIX C2: Create reset_weekly_challenges() function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reset_weekly_challenges()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_challenge RECORD;
  v_reset_count INTEGER := 0;
BEGIN
  -- Loop over all active weekly challenges
  FOR v_challenge IN
    SELECT id, gym_id, name
    FROM gym_challenges
    WHERE is_active = true
      AND (
        challenge_type = 'weekly'
        OR scoring_model = 'days_visited'
      )
      AND start_date <= CURRENT_DATE
      AND end_date >= CURRENT_DATE
  LOOP
    -- Reset progress for all participants of this challenge
    -- who have not completed it yet
    UPDATE challenge_progress
    SET
      current_value       = 0,
      current_drops       = 0,
      last_activity_date  = NULL,
      updated_at          = NOW()
    WHERE
      challenge_id = v_challenge.id
      AND is_completed = false;

    GET DIAGNOSTICS v_reset_count = ROW_COUNT;

    RAISE LOG
      'reset_weekly_challenges: reset % rows for challenge % (%)',
      v_reset_count,
      v_challenge.id,
      v_challenge.name;
  END LOOP;
END;
$$;

-- ============================================================================
-- Grant execute permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.reset_daily_challenges() TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_daily_challenges() TO service_role;

GRANT EXECUTE ON FUNCTION public.reset_weekly_challenges() TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_weekly_challenges() TO service_role;

-- ============================================================================
-- Enable pg_cron extension (if available)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ============================================================================
-- Unschedule existing jobs (idempotent)
-- ============================================================================

-- Remove existing daily reset schedule if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'reset-daily-challenges'
  ) THEN
    PERFORM cron.unschedule('reset-daily-challenges');
  END IF;
END $$;

-- Remove existing weekly reset schedule if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'reset-weekly-challenges'
  ) THEN
    PERFORM cron.unschedule('reset-weekly-challenges');
  END IF;
END $$;

-- ============================================================================
-- Schedule daily reset - runs at 23:00 UTC (midnight Belgrade CET/CEST)
-- ============================================================================

SELECT cron.schedule(
  'reset-daily-challenges',
  '0 23 * * *',
  $$SELECT public.reset_daily_challenges()$$
);

-- ============================================================================
-- Schedule weekly reset - runs Sunday at 23:00 UTC
-- ============================================================================

SELECT cron.schedule(
  'reset-weekly-challenges',
  '0 23 * * 0',
  $$SELECT public.reset_weekly_challenges()$$
);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION public.reset_daily_challenges IS
  'Resets daily challenges at midnight Belgrade time (23:00 UTC). '
  'Resets current_value, current_drops, and last_activity_date for all '
  'incomplete daily challenges that are active and within their date range. '
  'Does NOT reset: is_completed, drops_awarded, tier_achieved, current_streak_days. '
  'Scheduled via pg_cron: 0 23 * * *';

COMMENT ON FUNCTION public.reset_weekly_challenges IS
  'Resets weekly challenges on Sunday at midnight Belgrade time (23:00 UTC). '
  'Resets current_value, current_drops, and last_activity_date for all '
  'incomplete weekly challenges (or challenges with scoring_model = days_visited) '
  'that are active and within their date range. '
  'Does NOT reset: is_completed, drops_awarded, tier_achieved, current_streak_days. '
  'Scheduled via pg_cron: 0 23 * * 0';
