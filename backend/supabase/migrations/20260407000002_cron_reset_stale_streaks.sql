-- Migration: 20260407000002_cron_reset_stale_streaks.sql
-- Description: Nightly cron job to reset profiles.streak_days when
--   last_visit_date is stale (> 1 day old). Defense-in-depth for Item #11:
--   the mobile app also validates client-side, but this keeps the DB truthful.
--
-- AGENT NOTE: [2026-04-07] - supabase-dba
-- Reference: docs/plans/mobile_fixes_and_improvements_april_2026.md — Item #11 (Option B)
--
-- CHANGES:
--   - New function: reset_stale_streaks()
--   - New pg_cron job: 'reset-stale-streaks' at 23:05 UTC (≈ 00:05 Belgrade)
--
-- IMPACT ON FRONTEND:
--   - Mobile: streak_days in profiles will be 0 after a gap day (matches
--     the client-side validation the mobile-coder will add)
--   - Admin: no changes needed
--
-- BREAKING CHANGES: None

-- ============================================================
-- 1. Helper function
-- ============================================================

CREATE OR REPLACE FUNCTION public.reset_stale_streaks()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
  v_belgrade_today DATE := (NOW() AT TIME ZONE 'Europe/Belgrade')::DATE;
BEGIN
  WITH updated AS (
    UPDATE public.profiles
    SET streak_days = 0
    WHERE streak_days > 0
      AND last_visit_date < v_belgrade_today - INTERVAL '1 day'
    RETURNING id
  )
  SELECT COUNT(*) INTO v_count FROM updated;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_stale_streaks() TO service_role;

COMMENT ON FUNCTION public.reset_stale_streaks() IS
  'Resets streak_days to 0 for profiles whose last_visit_date is more than '
  '1 day behind the current Belgrade date. Runs nightly via pg_cron.';

-- ============================================================
-- 2. Schedule cron job (safe — skips if pg_cron unavailable)
-- ============================================================

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN

    PERFORM cron.schedule(
      'reset-stale-streaks',
      '5 23 * * *',
      'SELECT public.reset_stale_streaks()'
    );

    RAISE NOTICE 'pg_cron: reset-stale-streaks scheduled at 23:05 UTC daily.';
  ELSE
    RAISE WARNING
      'pg_cron extension not found. reset-stale-streaks NOT scheduled. '
      'Enable pg_cron via Supabase Dashboard, then re-run this migration.';
  END IF;
END $do$;
