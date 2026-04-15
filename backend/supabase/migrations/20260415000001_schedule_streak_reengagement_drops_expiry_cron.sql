-- Migration: 20260415000001_schedule_streak_reengagement_drops_expiry_cron.sql
-- Description: Schedule cron jobs for three push-notification Edge Functions
--              that were implemented but never had pg_cron entries.
--
-- Functions & schedules (times in UTC, Belgrade = UTC+1/+2):
--   1. streak-reminder        — daily at 18:00 UTC  (19:00 Belgrade evening)
--   2. re-engagement          — daily at 10:00 UTC  (11:00 Belgrade morning)
--   3. drops-expiry-warning   — daily at 11:00 UTC  (12:00 Belgrade noon)
--
-- Uses the existing public._invoke_edge_function helper (from 20260330000004).

-- ═══════════════════════════════════════════════════════════════
-- 1. streak-reminder — evening nudge for at-risk streaks
-- ═══════════════════════════════════════════════════════════════
SELECT cron.unschedule('streak-reminder')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'streak-reminder'
);

SELECT cron.schedule(
  'streak-reminder',
  '0 18 * * *',
  $$SELECT public._invoke_edge_function('streak-reminder');$$
);

-- ═══════════════════════════════════════════════════════════════
-- 2. re-engagement — morning nudge for 7d / 14d inactive users
-- ═══════════════════════════════════════════════════════════════
SELECT cron.unschedule('re-engagement')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 're-engagement'
);

SELECT cron.schedule(
  're-engagement',
  '0 10 * * *',
  $$SELECT public._invoke_edge_function('re-engagement');$$
);

-- ═══════════════════════════════════════════════════════════════
-- 3. drops-expiry-warning — midday check for 30d / 7d expiry
-- ═══════════════════════════════════════════════════════════════
SELECT cron.unschedule('drops-expiry-warning')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'drops-expiry-warning'
);

SELECT cron.schedule(
  'drops-expiry-warning',
  '0 11 * * *',
  $$SELECT public._invoke_edge_function('drops-expiry-warning');$$
);
