-- Migration: 20260303100002_schedule_leaderboard_prize_distribution.sql
-- Description: Schedule cron jobs for leaderboard prize distribution
-- 
-- AGENT NOTE: [2026-03-03] - supabase-dba (Phase 3.1)
-- Reference: docs/plans/phase3_audit_and_arenas_plan.md — Phase 3.1
-- 
-- CHANGES:
-- - Schedule weekly prize distribution (Sunday 22:55 UTC)
-- - Schedule monthly prize distribution (last day 22:55 UTC)
-- 
-- NOTE: These cron jobs call the distribute-leaderboard-prizes edge function
-- via HTTP request. The edge function auto-detects period if not provided.

DO $do$
BEGIN
  -- Check if pg_cron extension is available
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN

    -- Weekly prize distribution: Sunday 22:55 UTC (5 min before weekly reset at 23:00)
    PERFORM cron.schedule(
      'distribute-weekly-leaderboard-prizes',
      '55 22 * * 0',  -- Sunday 22:55 UTC
      $$
      SELECT
        net.http_post(
          url := current_setting('app.settings.supabase_url') || '/functions/v1/distribute-leaderboard-prizes',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key')
          ),
          body := jsonb_build_object('period', 'weekly')
        ) AS request_id;
      $$
    );

    -- Monthly prize distribution: Last day of month 22:55 UTC
    -- Note: pg_cron doesn't support "last day of month" directly, so we schedule
    -- for days 28-31 and let the edge function validate if it's actually the last day
    PERFORM cron.schedule(
      'distribute-monthly-leaderboard-prizes',
      '55 22 28-31 * *',  -- Days 28-31 at 22:55 UTC
      $$
      SELECT
        net.http_post(
          url := current_setting('app.settings.supabase_url') || '/functions/v1/distribute-leaderboard-prizes',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key')
          ),
          body := jsonb_build_object('period', 'monthly')
        ) AS request_id;
      $$
    );

    RAISE NOTICE 'pg_cron: Leaderboard prize distribution cron jobs scheduled successfully.';

  ELSE
    RAISE WARNING
      'pg_cron extension not found. Cron jobs NOT scheduled. '
      'Enable pg_cron in Supabase Dashboard → Database → Extensions, '
      'then run this migration again or schedule manually via Supabase Dashboard → Database → Cron Jobs.';
  END IF;
END $do$;

-- Alternative: If pg_cron is not available, use Supabase Dashboard → Database → Cron Jobs
-- to schedule HTTP requests to: POST /functions/v1/distribute-leaderboard-prizes
-- with body: { "period": "weekly" } or { "period": "monthly" }

COMMENT ON SCHEMA public IS
  'Leaderboard prize distribution cron jobs: '
  'Weekly: Sunday 22:55 UTC (before weekly reset at 23:00). '
  'Monthly: Last day 22:55 UTC (before monthly reset at 23:00).';
