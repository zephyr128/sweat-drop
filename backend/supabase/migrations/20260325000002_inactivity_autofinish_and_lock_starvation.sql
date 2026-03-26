-- Migration: 20260325000002_inactivity_autofinish_and_lock_starvation.sql
-- Description: Add inactivity policy fields, finalize_inactive_session RPC, and lock starvation detection fallback.

-- ============================================================
-- 1) Gym policy fields for inactivity and lock takeover behavior
-- ============================================================
ALTER TABLE public.gyms
  ADD COLUMN IF NOT EXISTS session_warning_after_sec INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS session_inactivity_autofinish_sec INTEGER NOT NULL DEFAULT 180,
  ADD COLUMN IF NOT EXISTS session_takeover_stale_sec INTEGER NOT NULL DEFAULT 90;

UPDATE public.gyms
SET session_warning_after_sec = COALESCE(session_warning_after_sec, 60),
    session_inactivity_autofinish_sec = COALESCE(session_inactivity_autofinish_sec, 180),
    session_takeover_stale_sec = COALESCE(session_takeover_stale_sec, 90)
WHERE session_warning_after_sec IS NULL
   OR session_inactivity_autofinish_sec IS NULL
   OR session_takeover_stale_sec IS NULL;

ALTER TABLE public.gyms
  DROP CONSTRAINT IF EXISTS gyms_session_warning_after_sec_bounds,
  DROP CONSTRAINT IF EXISTS gyms_session_inactivity_autofinish_sec_bounds,
  DROP CONSTRAINT IF EXISTS gyms_session_takeover_stale_sec_bounds,
  DROP CONSTRAINT IF EXISTS gyms_session_warning_before_autofinish;

ALTER TABLE public.gyms
  ADD CONSTRAINT gyms_session_warning_after_sec_bounds
    CHECK (session_warning_after_sec BETWEEN 15 AND 600),
  ADD CONSTRAINT gyms_session_inactivity_autofinish_sec_bounds
    CHECK (session_inactivity_autofinish_sec BETWEEN 30 AND 3600),
  ADD CONSTRAINT gyms_session_takeover_stale_sec_bounds
    CHECK (session_takeover_stale_sec BETWEEN 15 AND 1800),
  ADD CONSTRAINT gyms_session_warning_before_autofinish
    CHECK (session_warning_after_sec < session_inactivity_autofinish_sec);

-- ============================================================
-- 2) finalize_inactive_session RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.finalize_inactive_session(
  p_session_id UUID,
  p_reason TEXT DEFAULT 'inactivity_autofinish'
)
RETURNS TABLE(
  success BOOLEAN,
  already_finalized BOOLEAN,
  drops_earned INTEGER,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session RECORD;
  v_actor UUID := auth.uid();
  v_actor_role TEXT := COALESCE(current_setting('request.jwt.claim.role', true), '');
  v_is_service_role BOOLEAN := (COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role');
  v_is_superadmin BOOLEAN := false;
  v_reason TEXT := COALESCE(NULLIF(trim(p_reason), ''), 'inactivity_autofinish');
  v_drops INTEGER := 0;
  v_already BOOLEAN := false;
  v_security JSONB;
BEGIN
  SELECT s.*
  INTO v_session
  FROM public.sessions s
  WHERE s.id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, false, 0, 'session_not_found'::TEXT;
    RETURN;
  END IF;

  IF NOT v_is_service_role THEN
    IF v_actor IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = v_actor
          AND p.role = 'superadmin'
      ) INTO v_is_superadmin;
    END IF;

    IF v_actor IS NULL OR (v_actor <> v_session.user_id AND NOT v_is_superadmin) THEN
      PERFORM public.log_fraud_event(
        v_actor,
        v_session.gym_id,
        'finalize_inactive_unauthorized',
        'high',
        jsonb_build_object(
          'session_id', p_session_id,
          'reason', v_reason,
          'session_user_id', v_session.user_id
        )
      );
      RAISE EXCEPTION 'Unauthorized';
    END IF;
  END IF;

  v_already := (COALESCE(v_session.is_active, false) = false AND v_session.ended_at IS NOT NULL);

  -- Persist security/audit metadata on session.
  v_security := COALESCE(v_session.raw_metrics->'security', '{}'::jsonb)
    || jsonb_build_object(
      'finalize_reason', v_reason,
      'finalized_by_user_id', v_actor,
      'finalized_by_role', v_actor_role,
      'finalized_at', NOW()
    );

  UPDATE public.sessions s
  SET raw_metrics = jsonb_set(COALESCE(s.raw_metrics, '{}'::jsonb), '{security}', v_security, true),
      updated_at = NOW()
  WHERE s.id = p_session_id;

  IF v_already THEN
    v_drops := COALESCE(v_session.drops_earned, 0);
  ELSE
    BEGIN
      -- award_drops enforces idempotency and finalization; impersonate only within transaction scope.
      IF v_actor IS DISTINCT FROM v_session.user_id THEN
        PERFORM set_config('request.jwt.claim.sub', v_session.user_id::TEXT, true);
      END IF;

      SELECT ad.drops_earned
      INTO v_drops
      FROM public.award_drops(p_session_id) ad
      LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      -- Fallback: never leave a stale active lock/session if award path errors.
      PERFORM public.log_fraud_event(
        v_session.user_id,
        v_session.gym_id,
        'inactivity_finalize_award_failed',
        'medium',
        jsonb_build_object(
          'session_id', p_session_id,
          'reason', v_reason,
          'error', SQLERRM
        )
      );

      UPDATE public.sessions s
      SET ended_at = COALESCE(s.ended_at, NOW()),
          is_active = false,
          drops_earned = COALESCE(s.drops_earned, 0),
          multiplier = COALESCE(s.multiplier, 1.0),
          updated_at = NOW()
      WHERE s.id = p_session_id;

      SELECT COALESCE(s.drops_earned, 0)
      INTO v_drops
      FROM public.sessions s
      WHERE s.id = p_session_id;
    END;
  END IF;

  -- Reliable unlock path (do not depend on unlock_machine caller identity checks).
  IF v_session.machine_id IS NOT NULL THEN
    UPDATE public.machines m
    SET is_busy = false,
        current_user_id = NULL,
        last_heartbeat = NULL,
        updated_at = NOW()
    WHERE m.id = v_session.machine_id
      AND (m.current_user_id = v_session.user_id OR m.current_user_id IS NULL);
  END IF;

  PERFORM public.log_fraud_event(
    v_session.user_id,
    v_session.gym_id,
    'inactivity_autofinish',
    'low',
    jsonb_build_object(
      'session_id', p_session_id,
      'machine_id', v_session.machine_id,
      'already_finalized', v_already,
      'reason', v_reason,
      'drops_earned', COALESCE(v_drops, 0)
    )
  );

  RETURN QUERY SELECT true, v_already, COALESCE(v_drops, 0),
    CASE WHEN v_already THEN 'already_finalized'::TEXT ELSE 'finalized'::TEXT END;
END;
$$;

-- ============================================================
-- 3) Lock-starvation detection + fallback cleanup
-- ============================================================
CREATE OR REPLACE FUNCTION public.cleanup_abandoned_sessions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stale RECORD;
  v_count INTEGER := 0;
  v_inactive_threshold_sec INTEGER;
  v_starvation_threshold_sec INTEGER;
BEGIN
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
    FOR UPDATE OF m SKIP LOCKED
  LOOP
    v_inactive_threshold_sec := COALESCE(v_stale.session_inactivity_autofinish_sec, 180);
    v_starvation_threshold_sec := COALESCE(v_stale.session_takeover_stale_sec, 90);

    -- Detect lock starvation before fallback finalize/unlock.
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

    -- Fallback cleanup only after longer inactivity threshold.
    IF v_stale.last_activity_at <= NOW() - make_interval(secs => v_inactive_threshold_sec) THEN
      IF v_stale.session_id IS NOT NULL THEN
        BEGIN
          IF v_stale.session_user_id IS NOT NULL THEN
            PERFORM set_config('request.jwt.claim.sub', v_stale.session_user_id::TEXT, true);
          END IF;
          PERFORM public.finalize_inactive_session(v_stale.session_id, 'cleanup_abandoned_sessions_fallback');
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'Failed to finalize stale session %: %', v_stale.session_id, SQLERRM;
          UPDATE public.machines m
          SET is_busy = false,
              current_user_id = NULL,
              last_heartbeat = NULL,
              updated_at = NOW()
          WHERE m.id = v_stale.machine_id;
        END;
      ELSE
        UPDATE public.machines m
        SET is_busy = false,
            current_user_id = NULL,
            last_heartbeat = NULL,
            updated_at = NOW()
        WHERE m.id = v_stale.machine_id;
      END IF;

      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;
