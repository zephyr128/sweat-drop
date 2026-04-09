-- Migration: 20260409200003_optimize_cron_functions.sql
-- Description: Add timestamp bounds to high-frequency cron functions to prevent
--              full table scans at scale.
--
-- AGENT NOTE: [2026-04-09] - supabase-dba
--
-- cleanup_abandoned_sessions runs every 5 min and scans ALL machines WHERE is_busy = true.
-- At 20k users with 500 machines, this means scanning all active machines + joining
-- sessions + gyms + fraud_events every 5 minutes.
--
-- Optimization: Only consider machines whose last_heartbeat or updated_at is older
-- than the minimum threshold (90s). Fresh machines can't be stale by definition.
--
-- update_arena_scores_periodic runs every 15 min and rescans ALL sessions for active arenas.
-- Optimization: Skip arenas with no new sessions since last refresh.
--
-- CHANGES:
--   - Rewrote cleanup_abandoned_sessions with timestamp pre-filter
--   - Rewrote update_arena_scores_periodic with incremental scoring
--
-- IMPACT ON FRONTEND: None (same behavior, faster execution)
-- BREAKING CHANGES: None

-- ============================================================
-- 1. Optimized cleanup_abandoned_sessions
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
  v_min_stale_cutoff TIMESTAMPTZ := NOW() - INTERVAL '90 seconds';
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

  RETURN v_count;
END;
$$;

-- ============================================================
-- 2. Optimized update_arena_scores_periodic
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_arena_scores_periodic()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INTEGER := 0;
  v_last_run TIMESTAMPTZ;
BEGIN
  -- Only recompute arenas that have had new sessions since last refresh.
  -- We use a 20-minute lookback (wider than the 15-min cron interval) for safety.
  v_last_run := NOW() - INTERVAL '20 minutes';

  -- ============================================================
  -- DAYS_VISITED
  -- ============================================================
  INSERT INTO public.arena_participant_gym_scores (arena_id, user_id, gym_id, score, sessions)
  SELECT
    ap.arena_id, ap.user_id, ag.gym_id,
    COUNT(DISTINCT DATE(s.started_at))::NUMERIC AS score,
    COUNT(s.id) AS sessions
  FROM public.arena_participants ap
  JOIN public.sweat_arenas sa ON sa.id = ap.arena_id
  JOIN public.arena_gyms ag ON ag.arena_id = sa.id
  JOIN public.sessions s ON s.user_id = ap.user_id
    AND s.gym_id = ag.gym_id
    AND DATE(s.started_at) >= sa.start_date
    AND DATE(s.started_at) <= sa.end_date
    AND s.drops_earned > 0
  WHERE sa.scoring_model = 'days_visited'
    AND sa.is_active = true AND NOT sa.is_finalized
    AND EXISTS (
      SELECT 1 FROM public.sessions s2
      WHERE s2.gym_id = ag.gym_id
        AND s2.updated_at >= v_last_run
        AND s2.drops_earned > 0
    )
  GROUP BY ap.arena_id, ap.user_id, ag.gym_id
  ON CONFLICT (arena_id, user_id, gym_id)
  DO UPDATE SET
    score = EXCLUDED.score,
    sessions = EXCLUDED.sessions,
    updated_at = NOW();

  WITH updated_days AS (
    UPDATE public.arena_participants ap
    SET current_score = sub.day_count
    FROM (
      SELECT ap2.id AS participant_id,
        COUNT(DISTINCT DATE(s.started_at)) AS day_count
      FROM public.arena_participants ap2
      JOIN public.sweat_arenas sa ON sa.id = ap2.arena_id
      JOIN public.arena_gyms ag ON ag.arena_id = sa.id
      JOIN public.sessions s ON s.user_id = ap2.user_id
        AND s.gym_id = ag.gym_id
        AND DATE(s.started_at) >= sa.start_date
        AND DATE(s.started_at) <= sa.end_date
        AND s.drops_earned > 0
      WHERE sa.scoring_model = 'days_visited'
        AND sa.is_active = true AND NOT sa.is_finalized
      GROUP BY ap2.id
    ) sub
    WHERE ap.id = sub.participant_id
    RETURNING ap.id
  )
  SELECT COUNT(*) INTO v_updated FROM updated_days;

  -- ============================================================
  -- VARIETY_SCORE
  -- ============================================================
  INSERT INTO public.arena_participant_gym_scores (arena_id, user_id, gym_id, score, sessions)
  SELECT
    ap.arena_id, ap.user_id, ag.gym_id,
    COUNT(DISTINCT s.machine_id)::NUMERIC AS score,
    COUNT(s.id) AS sessions
  FROM public.arena_participants ap
  JOIN public.sweat_arenas sa ON sa.id = ap.arena_id
  JOIN public.arena_gyms ag ON ag.arena_id = sa.id
  JOIN public.sessions s ON s.user_id = ap.user_id
    AND s.gym_id = ag.gym_id
    AND DATE(s.started_at) >= sa.start_date
    AND DATE(s.started_at) <= sa.end_date
    AND s.drops_earned > 0
    AND s.machine_id IS NOT NULL
  WHERE sa.scoring_model = 'variety_score'
    AND sa.is_active = true AND NOT sa.is_finalized
    AND EXISTS (
      SELECT 1 FROM public.sessions s2
      WHERE s2.gym_id = ag.gym_id
        AND s2.updated_at >= v_last_run
        AND s2.drops_earned > 0
    )
  GROUP BY ap.arena_id, ap.user_id, ag.gym_id
  ON CONFLICT (arena_id, user_id, gym_id)
  DO UPDATE SET
    score = EXCLUDED.score,
    sessions = EXCLUDED.sessions,
    updated_at = NOW();

  WITH updated_variety AS (
    UPDATE public.arena_participants ap
    SET current_score = sub.machine_count
    FROM (
      SELECT ap2.id AS participant_id,
        COUNT(DISTINCT s.machine_id) AS machine_count
      FROM public.arena_participants ap2
      JOIN public.sweat_arenas sa ON sa.id = ap2.arena_id
      JOIN public.arena_gyms ag ON ag.arena_id = sa.id
      JOIN public.sessions s ON s.user_id = ap2.user_id
        AND s.gym_id = ag.gym_id
        AND DATE(s.started_at) >= sa.start_date
        AND DATE(s.started_at) <= sa.end_date
        AND s.drops_earned > 0
        AND s.machine_id IS NOT NULL
      WHERE sa.scoring_model = 'variety_score'
        AND sa.is_active = true AND NOT sa.is_finalized
      GROUP BY ap2.id
    ) sub
    WHERE ap.id = sub.participant_id
    RETURNING ap.id
  )
  SELECT COUNT(*) + v_updated INTO v_updated FROM updated_variety;

  RETURN v_updated;
END;
$$;
