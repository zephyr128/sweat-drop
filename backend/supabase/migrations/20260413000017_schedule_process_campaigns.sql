-- Migration: 20260413000017_schedule_process_campaigns.sql
-- Description: Schedule process-campaigns edge function as a fallback sweep
--              every 2 minutes for queued engagement campaigns.
--
-- The primary path is immediate invocation from the admin panel after queueCampaign.
-- This cron is a safety net for campaigns that get stuck in 'queued' status.

SELECT cron.unschedule('process-campaigns-sweep')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'process-campaigns-sweep'
);

SELECT cron.schedule(
  'process-campaigns-sweep',
  '*/2 * * * *',
  $$SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/process-campaigns',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := '{}'::jsonb
  )$$
);
