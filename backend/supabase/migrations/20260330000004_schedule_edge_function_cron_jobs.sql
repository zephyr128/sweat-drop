-- Migration: 20260330000003_schedule_edge_function_cron_jobs.sql
-- Description: Create cron jobs for all Edge Functions that need scheduled execution.
--   Uses vault.secrets for URL/key storage instead of app.settings (which requires superuser).
--
-- PREREQUISITES (must be set in Supabase Dashboard BEFORE running this):
--   Dashboard → SQL Editor → run:
--     SELECT vault.create_secret('https://jzyoyxabcdzvqcfnfzrz.supabase.co', 'project_url');
--     SELECT vault.create_secret('<SERVICE_ROLE_KEY>', 'service_role_key');
--
-- CRON JOBS CREATED:
--   1. send-happy-hour-reminders  — every 5 minutes
--   2. finalize-arena-check       — daily at 00:30 UTC
--   3. leaderboard-prize-dist     — daily at 01:00 UTC

-- ═══════════════════════════════════════════════════════════════
-- Helper: wrapper function that reads secrets and calls edge fn
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._invoke_edge_function(p_function_slug TEXT, p_body JSONB DEFAULT '{}'::JSONB)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_url  TEXT;
  v_key  TEXT;
  v_req  BIGINT;
BEGIN
  SELECT decrypted_secret INTO v_url
  FROM vault.decrypted_secrets
  WHERE name = 'project_url'
  LIMIT 1;

  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key'
  LIMIT 1;

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE WARNING '_invoke_edge_function: vault secrets not set (project_url / service_role_key)';
    RETURN -1;
  END IF;

  SELECT net.http_post(
    url     := v_url || '/functions/v1/' || p_function_slug,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := p_body
  ) INTO v_req;

  RETURN v_req;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- Remove old broken cron jobs (if they exist from earlier migrations)
-- ═══════════════════════════════════════════════════════════════
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobname)
    FROM cron.job
    WHERE jobname IN (
      'finalize-arena-check',
      'leaderboard-prize-distribution',
      'send-happy-hour-reminders'
    );
  END IF;
END $do$;

-- ═══════════════════════════════════════════════════════════════
-- Schedule cron jobs
-- ═══════════════════════════════════════════════════════════════

-- 1. Happy Hour reminders — every 5 minutes
SELECT cron.schedule(
  'send-happy-hour-reminders',
  '*/5 * * * *',
  $$SELECT public._invoke_edge_function('send-happy-hour-reminders');$$
);

-- 2. Arena finalization — daily at 00:30 UTC
SELECT cron.schedule(
  'finalize-arena-check',
  '30 0 * * *',
  $$SELECT public._invoke_edge_function('finalize-arena');$$
);

-- 3. Leaderboard prize distribution — daily at 01:00 UTC
SELECT cron.schedule(
  'leaderboard-prize-distribution',
  '0 1 * * *',
  $$SELECT public._invoke_edge_function('distribute-leaderboard-prizes');$$
);
