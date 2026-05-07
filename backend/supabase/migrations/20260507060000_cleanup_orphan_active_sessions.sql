-- Migration: 20260507060000_cleanup_orphan_active_sessions.sql
-- Description: Extend cleanup_abandoned_sessions() to also sweep "orphan" active
--              sessions whose machine has already been unlocked (machines.is_busy = false)
--              or whose machine_id is NULL.
--
-- AGENT NOTE: [2026-05-07] - supabase-dba
--
-- ROOT CAUSE (production incident, Vortex gym):
--   start_session_safely() refuses a new scan whenever it finds ANY row in
--   public.sessions with (machine_id = X, is_active = true) — regardless of
--   the value of machines.is_busy. It returns:
--     - 'machine_busy'                   when the orphan is owned by another user
--     - 'user_active_session_conflict'   when the orphan is owned by the same user
--   Both error codes are surfaced to mobile users as the "Machine busy" modal
--   (apps/mobile-app/components/ScannerScreen.tsx & lib/qr/handleQrDeepLink.ts).
--
--   The previous cleanup_abandoned_sessions() implementations
--   (20260302000011 → 20260325000002 → 20260325000003 → 20260409200003) all
--   iterate ONLY over machines WHERE m.is_busy = true. When unlock_machine()
--   succeeds but the corresponding session row never gets is_active = false
--   (e.g. award_drops() failed earlier, app crashed mid-finalize, network
--   timeout on the final sync, or the simulator-bypass insert path that
--   intentionally writes machine_id = NULL), the session becomes a permanent
--   orphan that no cron path will ever close. Every future scan against that
--   machine — or every future scan attempted by that user — fails with
--   "Machine busy".
--
--   Production symptom: 9 Vortex treadmills paired via FTMS, mobile reports
--   "machine busy" on NFC scan and a stuck "scanner loading" overlay on QR
--   scan, while machines.is_busy = false for every treadmill.
--
-- CHANGES:
--   - cleanup_abandoned_sessions() rewritten with TWO sweeps:
--       Sweep 1 (UNCHANGED): machines WHERE is_busy = true → existing
--                            inactivity / lock-starvation logic. Preserves
--                            current behaviour for normal stale workouts.
--       Sweep 2 (NEW):       sessions WHERE is_active = true AND the machine
--                            is no longer locked by this user. Closes orphans
--                            via finalize_inactive_session() with reason
--                            'orphan_session_cleanup' so any earned drops are
--                            still awarded and a fraud_event row is logged.
--
-- IMPACT ON FRONTEND:
--   - Mobile App: stale sessions self-heal within the next 5-min cron tick;
--                 the "Machine busy" deadlock no longer requires manual SQL
--                 intervention. No client changes required.
--   - Admin Panel: no change.
--
-- BREAKING CHANGES: None. Sweep 1 logic is byte-identical to 20260409200003.
--                   Sweep 2 only touches sessions that are by definition
--                   already detached from any active machine lock.
--
-- SAFETY:
--   - Sweep 2 uses a 10-minute hard floor in addition to the gym policy
--     threshold. A session that is mid-finalize (final sync + award_drops
--     round-trip) cannot be older than ~60s, so the 10-min floor guarantees
--     we never close a session that is actually still resolving.
--   - finalize_inactive_session() is idempotent and SECURITY DEFINER; it
--     impersonates the session owner to call award_drops, so legitimate
--     orphans that earned drops still credit the user before closing.
--   - SKIP LOCKED is used so two cron ticks running close together cannot
--     fight over the same row.

-- ============================================================
-- 1. cleanup_abandoned_sessions — extended with orphan sweep
-- ============================================================

CREATE OR REPLACE FUNCTION public.cleanup_abandoned_sessions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stale RECORD;
  v_orphan RECORD;
  v_count INTEGER := 0;
  v_inactive_threshold_sec INTEGER;
  v_starvation_threshold_sec INTEGER;
  v_min_stale_cutoff TIMESTAMPTZ := NOW() - INTERVAL '90 seconds';
  v_orphan_floor_sec CONSTANT INTEGER := 600; -- 10 min hard safety floor
BEGIN
  -- ============================================================
  -- Sweep 1: machines flagged is_busy with stale heartbeat
  -- (UNCHANGED — byte-identical to 20260409200003 logic)
  -- ============================================================
  FOR v_stale IN
    SELECT
      m.id AS machine_id,
      m.gym_id,
      m.current_user_id,
      s.id AS session_id,
      s.user_id AS session_user_id,
      COALESCE(m.last_heartbeat, s.updated_at, s.started_at, m.updated_at, m.created_at) AS last_activity_at,
      g.session_inactivity_autofinish_sec,
      g.session_takeover_stale_sec
    FROM public.machines m
    JOIN public.gyms g
      ON g.id = m.gym_id
    LEFT JOIN public.sessions s
      ON s.machine_id = m.id
     AND s.is_active = true
    WHERE m.is_busy = true
      AND COALESCE(m.last_heartbeat, m.updated_at, m.created_at) < v_min_stale_cutoff
    FOR UPDATE OF m SKIP LOCKED
  LOOP
    v_inactive_threshold_sec := COALESCE(v_stale.session_inactivity_autofinish_sec, 180);
    v_starvation_threshold_sec := COALESCE(v_stale.session_takeover_stale_sec, 90);

    IF v_stale.last_activity_at <= NOW() - make_interval(secs => v_starvation_threshold_sec) THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.fraud_events fe
        WHERE fe.event_type = 'machine_lock_starvation'
          AND fe.created_at >= NOW() - INTERVAL '10 minutes'
          AND fe.metadata ->> 'machine_id' = v_stale.machine_id::TEXT
      ) THEN
        PERFORM public.log_fraud_event(
          COALESCE(v_stale.session_user_id, v_stale.current_user_id),
          v_stale.gym_id,
          'machine_lock_starvation',
          'medium',
          jsonb_build_object(
            'machine_id', v_stale.machine_id,
            'session_id', v_stale.session_id,
            'last_activity_at', v_stale.last_activity_at,
            'starvation_threshold_sec', v_starvation_threshold_sec
          )
        );
      END IF;
    END IF;

    IF v_stale.last_activity_at <= NOW() - make_interval(secs => v_inactive_threshold_sec) THEN
      IF v_stale.session_id IS NOT NULL THEN
        BEGIN
          IF v_stale.session_user_id IS NOT NULL THEN
            PERFORM set_config('request.jwt.claim.sub', v_stale.session_user_id::TEXT, true);
          END IF;
          PERFORM public.finalize_inactive_session(v_stale.session_id, 'cleanup_abandoned_sessions_fallback');
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'Failed to finalize stale session %: %', v_stale.session_id, SQLERRM;
          UPDATE public.machines m2
          SET is_busy = false,
              current_user_id = NULL,
              last_heartbeat = NULL,
              updated_at = NOW()
          WHERE m2.id = v_stale.machine_id;
        END;
      ELSE
        UPDATE public.machines m2
        SET is_busy = false,
            current_user_id = NULL,
            last_heartbeat = NULL,
            updated_at = NOW()
        WHERE m2.id = v_stale.machine_id;
      END IF;

      v_count := v_count + 1;
    END IF;
  END LOOP;

  -- ============================================================
  -- Sweep 2: orphan active sessions whose machine is already unlocked
  -- (or whose machine_id is NULL). Sweep 1 cannot reach these because
  -- it iterates over machines.is_busy = true.
  -- ============================================================
  FOR v_orphan IN
    SELECT
      s.id           AS session_id,
      s.user_id      AS session_user_id,
      s.gym_id       AS session_gym_id,
      s.machine_id   AS session_machine_id,
      COALESCE(s.updated_at, s.started_at, s.created_at) AS last_activity_at,
      COALESCE(g.session_inactivity_autofinish_sec, 180) AS gym_inactive_sec
    FROM public.sessions s
    LEFT JOIN public.gyms g
      ON g.id = s.gym_id
    LEFT JOIN public.machines m
      ON m.id = s.machine_id
    WHERE s.is_active = true
      AND COALESCE(s.updated_at, s.started_at, s.created_at)
            < NOW() - make_interval(secs => GREATEST(
                COALESCE(g.session_inactivity_autofinish_sec, 180),
                v_orphan_floor_sec
              ))
      -- Orphan condition: machine is no longer locked by this session's owner.
      -- A live, healthy session has machines.is_busy = true AND
      -- machines.current_user_id = sessions.user_id.
      AND (
            s.machine_id IS NULL
         OR m.id IS NULL
         OR COALESCE(m.is_busy, false) = false
         OR m.current_user_id IS DISTINCT FROM s.user_id
      )
    ORDER BY COALESCE(s.updated_at, s.started_at, s.created_at) ASC
    LIMIT 500
    FOR UPDATE OF s SKIP LOCKED
  LOOP
    BEGIN
      IF v_orphan.session_user_id IS NOT NULL THEN
        PERFORM set_config('request.jwt.claim.sub', v_orphan.session_user_id::TEXT, true);
      END IF;
      PERFORM public.finalize_inactive_session(v_orphan.session_id, 'orphan_session_cleanup');
    EXCEPTION WHEN OTHERS THEN
      -- Last-resort: never leave the orphan in place. Close raw and log.
      RAISE WARNING 'Failed to finalize orphan session %: %', v_orphan.session_id, SQLERRM;

      UPDATE public.sessions s2
      SET is_active = false,
          ended_at  = COALESCE(s2.ended_at, NOW()),
          updated_at = NOW(),
          raw_metrics = jsonb_set(
            COALESCE(s2.raw_metrics, '{}'::jsonb),
            '{security}',
            COALESCE(s2.raw_metrics -> 'security', '{}'::jsonb)
              || jsonb_build_object(
                   'finalize_reason', 'orphan_session_cleanup_fallback',
                   'finalized_at', NOW(),
                   'finalize_error', SQLERRM
                 ),
            true
          )
      WHERE s2.id = v_orphan.session_id;

      -- Defensive machine reset (only touches the matching ownership row).
      IF v_orphan.session_machine_id IS NOT NULL THEN
        UPDATE public.machines m2
        SET is_busy = false,
            current_user_id = NULL,
            last_heartbeat = NULL,
            updated_at = NOW()
        WHERE m2.id = v_orphan.session_machine_id
          AND (m2.current_user_id = v_orphan.session_user_id OR m2.current_user_id IS NULL);
      END IF;

      BEGIN
        PERFORM public.log_fraud_event(
          v_orphan.session_user_id,
          v_orphan.session_gym_id,
          'orphan_session_cleanup_failed',
          'low',
          jsonb_build_object(
            'session_id', v_orphan.session_id,
            'machine_id', v_orphan.session_machine_id,
            'last_activity_at', v_orphan.last_activity_at,
            'error', SQLERRM
          )
        );
      EXCEPTION WHEN OTHERS THEN
        -- Audit logging is best-effort; never block cleanup on it.
        NULL;
      END;
    END;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.cleanup_abandoned_sessions() IS
  'Cron-driven cleanup (every 5 min). Sweep 1 closes stale sessions on machines '
  'whose lock heartbeat is past the gym inactivity threshold. Sweep 2 closes '
  'orphan sessions whose machine has already been unlocked but whose '
  'sessions.is_active was never reset (e.g. award_drops failure, app crash '
  'mid-finalize, simulator-bypass with machine_id = NULL). Sweep 2 prevents '
  'the "Machine busy" / "user_active_session_conflict" deadlock observed in '
  'production (Vortex gym, 2026-05-07).';

GRANT EXECUTE ON FUNCTION public.cleanup_abandoned_sessions() TO service_role;

-- ============================================================
-- 2. Immediate one-shot run — heal existing orphans on deploy
-- ============================================================
-- Safe to run inline: SKIP LOCKED + 10-min hard floor + per-row sub-transactions.
-- Without this, callers would have to wait up to 5 minutes for the next pg_cron
-- tick before the production incident self-heals.
DO $do$
DECLARE
  v_closed INTEGER;
BEGIN
  SELECT public.cleanup_abandoned_sessions() INTO v_closed;
  RAISE NOTICE 'cleanup_abandoned_sessions() closed % stale/orphan session(s) at deploy time.', v_closed;
END
$do$;
