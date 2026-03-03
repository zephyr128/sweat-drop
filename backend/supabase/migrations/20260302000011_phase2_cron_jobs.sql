-- Migration: 20260302000011_phase2_cron_jobs.sql
-- Description: Phase 2 — Cron jobs for weekly/monthly resets, newcomer status,
--              drop expiry, and session abandonment cleanup.
--
-- AGENT NOTE: [2026-03-02] - supabase-dba (Phase 2, Tasks 2.1–2.5)
-- Reference: docs/plans/mvp_full_audit_and_build_plan.md
--
-- PREREQUISITE: pg_cron extension must be enabled.
--   On Supabase hosted: enable via Dashboard → Database → Extensions → pg_cron
--   On local dev: may not be available — use Edge Functions as fallback.
--
-- IMPORTANT: If pg_cron is not available, these crons must be triggered via
--   external scheduler (e.g., Supabase cron webhook, GitHub Actions, or the
--   existing reset-challenges Edge Function pattern).

-- ============================================================
-- 0. Enable pg_cron extension (requires superuser)
-- ============================================================
-- NOTE: On Supabase hosted this is enabled via the Dashboard UI.
-- This statement may fail on local dev — that is expected.
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ============================================================
-- 1. HELPER: cleanup_abandoned_sessions()
--    Called by the 5-minute cron. Finds stale machines, ends their
--    sessions (awarding partial drops), and unlocks the machines.
-- ============================================================

CREATE OR REPLACE FUNCTION public.cleanup_abandoned_sessions()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_stale   RECORD;
  v_count   INTEGER := 0;
BEGIN
  FOR v_stale IN
    SELECT
      m.id           AS machine_id,
      m.current_user_id,
      s.id           AS session_id
    FROM public.machines m
    LEFT JOIN public.sessions s
      ON s.user_id = m.current_user_id
      AND s.is_active = true
      AND s.gym_id = m.gym_id
    WHERE m.is_busy = true
      AND m.last_heartbeat < NOW() - INTERVAL '5 minutes'
    FOR UPDATE OF m SKIP LOCKED
  LOOP
    -- 1. Award drops for partial session (if session exists)
    IF v_stale.session_id IS NOT NULL THEN
      BEGIN
        PERFORM public.award_drops(v_stale.session_id);
      EXCEPTION WHEN OTHERS THEN
        -- Log but don't fail the whole cleanup
        RAISE WARNING 'Failed to award drops for session %: %',
          v_stale.session_id, SQLERRM;
      END;
    END IF;

    -- 2. Unlock the machine
    UPDATE public.machines
    SET is_busy = false,
        current_user_id = NULL,
        last_heartbeat = NULL
    WHERE id = v_stale.machine_id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.cleanup_abandoned_sessions() IS
  'Finds machines with stale heartbeats (>5min), awards partial drops '
  'for their active sessions, and unlocks the machines. Blocker 5 resolution.';

-- ============================================================
-- 2. HELPER: expire_stale_drops()
--    Deducts expired drops from available_drops.
-- ============================================================

CREATE OR REPLACE FUNCTION public.expire_stale_drops()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH expired_by_user AS (
    SELECT
      user_id,
      SUM(amount) AS total_expiring
    FROM public.drops_transactions
    WHERE expires_at IS NOT NULL
      AND expires_at < NOW()
      AND expires_at > NOW() - INTERVAL '25 hours'  -- only process recent expirations
      AND amount > 0
      AND transaction_type = 'session'
    GROUP BY user_id
  ),
  updated AS (
    UPDATE public.profiles p
    SET available_drops = GREATEST(0, p.available_drops - e.total_expiring)
    FROM expired_by_user e
    WHERE p.id = e.user_id
    RETURNING p.id
  )
  SELECT COUNT(*) INTO v_count FROM updated;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.expire_stale_drops() IS
  'Deducts drops that have passed their 90-day expiry from available_drops. '
  'Runs daily. Does NOT touch total_drops (leaderboard score is permanent).';

-- ============================================================
-- 3. HELPER: update_newcomer_status()
--    Marks profiles as no longer newcomers after 30 days.
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_newcomer_status()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH updated AS (
    UPDATE public.profiles
    SET is_newcomer = false
    WHERE is_newcomer = true
      AND created_at < NOW() - INTERVAL '30 days'
    RETURNING id
  )
  SELECT COUNT(*) INTO v_count FROM updated;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.update_newcomer_status() IS
  'Transitions members out of newcomer status after 30 days (Q5).';

-- ============================================================
-- 4. SCHEDULE CRON JOBS
--    Wrapped in a DO block with exception handling so the migration
--    doesn't fail if pg_cron is not yet enabled.
-- ============================================================

DO $do$
BEGIN
  -- Check if pg_cron is available
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN

    -- 2.1 — Weekly Drops Reset
    -- Sunday 23:00 UTC = Monday 00:00 Belgrade (UTC+1)
    PERFORM cron.schedule(
      'weekly-drops-reset',
      '0 23 * * 0',
      'UPDATE public.profiles SET weekly_drops = 0'
    );

    -- 2.2 — Monthly Drops Reset
    -- Last day of month 23:00 UTC = 1st of next month 00:00 Belgrade
    -- Runs daily at 23:00 but only executes on the last day of the month
    PERFORM cron.schedule(
      'monthly-drops-reset',
      '0 23 28-31 * *',
      $cron$
      UPDATE public.profiles
      SET monthly_drops = 0
      WHERE EXTRACT(DAY FROM (NOW() AT TIME ZONE 'Europe/Belgrade')
            + INTERVAL '1 hour') = 1
      $cron$
    );

    -- 2.3 — Newcomer Status Update (Daily 03:00 UTC)
    PERFORM cron.schedule(
      'update-newcomer-status',
      '0 3 * * *',
      'SELECT public.update_newcomer_status()'
    );

    -- 2.4 — Drop Expiry (Daily 04:00 UTC)
    PERFORM cron.schedule(
      'expire-drops',
      '0 4 * * *',
      'SELECT public.expire_stale_drops()'
    );

    -- 2.5 — Session Abandonment Cleanup (Every 5 minutes)
    PERFORM cron.schedule(
      'cleanup-abandoned-sessions',
      '*/5 * * * *',
      'SELECT public.cleanup_abandoned_sessions()'
    );

    RAISE NOTICE 'pg_cron: All 5 cron jobs scheduled successfully.';

  ELSE
    RAISE WARNING
      'pg_cron extension not found. Cron jobs NOT scheduled. '
      'Enable pg_cron in Supabase Dashboard → Database → Extensions, '
      'then run this migration again or schedule manually.';
  END IF;
END $do$;

-- ============================================================
-- GRANT execute on helper functions
-- ============================================================
GRANT EXECUTE ON FUNCTION public.cleanup_abandoned_sessions() TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_stale_drops() TO service_role;
GRANT EXECUTE ON FUNCTION public.update_newcomer_status() TO service_role;
