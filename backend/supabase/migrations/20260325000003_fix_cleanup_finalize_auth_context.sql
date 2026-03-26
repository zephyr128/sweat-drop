-- Migration: 20260325000003_fix_cleanup_finalize_auth_context.sql
-- Description: Ensure cleanup_abandoned_sessions can finalize stale sessions under system/cron context.

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
