-- Migration: 20260303100005_schedule_arena_finalization.sql
-- Description: Schedule cron job for arena finalization
-- 
-- AGENT NOTE: [2026-03-03] - supabase-dba (Phase 3.2)
-- Reference: docs/plans/phase3_audit_and_arenas_plan.md — Phase 3.2, Section 4.6
-- 
-- CHANGES:
-- - Schedule daily cron job at 00:30 UTC to finalize ended arenas
-- 
-- NOTE: This cron job calls the finalize-arena edge function via HTTP request.

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'finalize-arena-check',
      '30 0 * * *',  -- Daily at 00:30 UTC
      $$
      SELECT
        net.http_post(
          url := current_setting('app.settings.supabase_url') || '/functions/v1/finalize-arena',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key')
          ),
          body := '{}'::jsonb
        ) AS request_id;
      $$
    );

    RAISE NOTICE 'pg_cron: Arena finalization cron job scheduled (daily at 00:30 UTC).';
  ELSE
    RAISE WARNING
      'pg_cron extension not found. Cron job NOT scheduled. '
      'Enable pg_cron in Supabase Dashboard → Database → Extensions, '
      'then run this migration again or schedule manually via Supabase Dashboard → Database → Cron Jobs.';
  END IF;
END $do$;

-- Alternative: If pg_cron is not available, use Supabase Dashboard → Database → Cron Jobs
-- to schedule HTTP request to: POST /functions/v1/finalize-arena
-- with body: {}

COMMENT ON SCHEMA public IS
  'Arena finalization cron job: Daily at 00:30 UTC. '
  'Finds arenas where end_date < CURRENT_DATE AND is_finalized = false, '
  'calls finalize_arena() RPC, and sends push notifications to winners.';
