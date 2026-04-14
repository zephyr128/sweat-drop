-- Migration: 20260414100000_eager_session_side_effects.sql
-- Description: Allow the mobile client to eagerly process side effects for a
--              specific session instead of waiting up to 60s for the cron job.
--
-- AGENT NOTE: [2026-04-14] - mobile-coder + supabase-dba
--
-- PROBLEM:
--   award_drops() enqueues side effects (badges, challenges, arena scores) into
--   pending_session_side_effects for async cron processing (every 1 min).
--   This means the session-summary screen cannot show newly earned badges or
--   challenge completions because they haven't been evaluated yet.
--
-- SOLUTION:
--   New RPC process_session_side_effects_eager(p_session_id) that processes
--   the queue row for a specific session immediately. The client calls this
--   after award_drops returns, before loading badges/challenges.
--   Uses SKIP LOCKED to avoid conflicts with the cron job.
--
-- IMPACT ON FRONTEND:
--   - Mobile App: session-summary calls this RPC before loading badges/challenges
--   - Admin Panel: No change
--
-- BREAKING CHANGES: None

CREATE OR REPLACE FUNCTION public.process_session_side_effects_eager(p_session_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item RECORD;
  v_badges TEXT[];
  v_today DATE := (NOW() AT TIME ZONE 'Europe/Belgrade')::DATE;
BEGIN
  -- Grab the pending row for this session (SKIP LOCKED avoids conflict with cron)
  SELECT *
  INTO v_item
  FROM public.pending_session_side_effects
  WHERE session_id = p_session_id
    AND processed_at IS NULL
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF NOT FOUND THEN
    -- Already processed by cron, or doesn't exist
    RETURN TRUE;
  END IF;

  -- Verify caller owns this session
  IF auth.uid() IS NULL OR auth.uid() <> v_item.user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Run the same side effects as process_pending_side_effects()
  IF v_item.drops_earned > 0 THEN
    PERFORM public.update_challenge_progress(
      v_item.user_id, v_item.gym_id, v_item.drops_earned, v_item.session_id
    );

    PERFORM public.update_arena_scores(
      v_item.user_id, v_item.gym_id, v_item.drops_earned
    );

    SELECT COALESCE(array_agg(bn.badge_name), ARRAY[]::TEXT[])
    INTO v_badges
    FROM public.evaluate_badges(v_item.user_id, v_item.session_id) AS bn(badge_name);
  END IF;

  PERFORM public.refresh_economy_snapshot_daily(v_item.gym_id, v_today);

  INSERT INTO public.gym_checkins
    (user_id, gym_id, drops_earned, gps_verified, gps_distance_m, gps_lat, gps_lng)
  VALUES (v_item.user_id, v_item.gym_id, 0, false, NULL, NULL, NULL)
  ON CONFLICT DO NOTHING;

  PERFORM public.update_checkin_challenge_progress(v_item.user_id, v_item.gym_id);

  UPDATE public.pending_session_side_effects
  SET processed_at = NOW()
  WHERE id = v_item.id;

  RETURN TRUE;

EXCEPTION WHEN OTHERS THEN
  UPDATE public.pending_session_side_effects
  SET error_message = SQLERRM
  WHERE id = v_item.id;

  RAISE WARNING 'Eager side effect processing failed for session %: %', p_session_id, SQLERRM;
  RETURN FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_session_side_effects_eager(UUID) TO authenticated;
