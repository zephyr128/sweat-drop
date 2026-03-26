-- Migration: 20260324000014_fraud_events_and_logging.sql
-- Description: Add fraud_events table and log suspicious anti-abuse events.

CREATE TABLE IF NOT EXISTS public.fraud_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  gym_id UUID NULL REFERENCES public.gyms(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ NULL,
  resolved_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_fraud_events_created_at ON public.fraud_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fraud_events_user_id ON public.fraud_events(user_id);
CREATE INDEX IF NOT EXISTS idx_fraud_events_gym_id ON public.fraud_events(gym_id);
CREATE INDEX IF NOT EXISTS idx_fraud_events_event_type ON public.fraud_events(event_type);
CREATE INDEX IF NOT EXISTS idx_fraud_events_unresolved ON public.fraud_events(created_at DESC) WHERE resolved_at IS NULL;

CREATE OR REPLACE FUNCTION public.log_fraud_event(
  p_user_id UUID,
  p_gym_id UUID,
  p_event_type TEXT,
  p_severity TEXT DEFAULT 'medium',
  p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.fraud_events (user_id, gym_id, event_type, severity, metadata)
  VALUES (p_user_id, p_gym_id, p_event_type, p_severity, COALESCE(p_metadata, '{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_fraud_event(UUID, UUID, TEXT, TEXT, JSONB) TO authenticated;

-- Hardened function updates with logging
CREATE OR REPLACE FUNCTION public.lock_machine(p_machine_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_current_user_id UUID;
  v_gym_id UUID;
BEGIN
  SELECT gym_id INTO v_gym_id FROM public.machines WHERE id = p_machine_id;

  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    PERFORM public.log_fraud_event(auth.uid(), v_gym_id, 'lock_machine_unauthorized', 'high',
      jsonb_build_object('machine_id', p_machine_id, 'requested_user_id', p_user_id));
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT current_user_id INTO v_current_user_id
  FROM public.machines
  WHERE id = p_machine_id AND is_busy = true;

  IF v_current_user_id IS NOT NULL AND v_current_user_id != p_user_id THEN
    PERFORM public.log_fraud_event(p_user_id, v_gym_id, 'machine_piggyback_attempt', 'medium',
      jsonb_build_object('machine_id', p_machine_id, 'locked_by', v_current_user_id));
    RETURN false;
  END IF;

  UPDATE public.machines
  SET is_busy = true,
      current_user_id = p_user_id,
      last_heartbeat = NOW()
  WHERE id = p_machine_id;

  RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION public.unlock_machine(p_machine_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_gym_id UUID;
BEGIN
  SELECT gym_id INTO v_gym_id FROM public.machines WHERE id = p_machine_id;

  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    PERFORM public.log_fraud_event(auth.uid(), v_gym_id, 'unlock_machine_unauthorized', 'high',
      jsonb_build_object('machine_id', p_machine_id, 'requested_user_id', p_user_id));
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.machines
  SET is_busy = false,
      current_user_id = NULL,
      last_heartbeat = NULL
  WHERE id = p_machine_id
    AND current_user_id = p_user_id;

  IF NOT FOUND THEN
    PERFORM public.log_fraud_event(p_user_id, v_gym_id, 'unlock_machine_lock_mismatch', 'medium',
      jsonb_build_object('machine_id', p_machine_id));
  END IF;

  RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_machine_heartbeat(p_machine_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_gym_id UUID;
BEGIN
  SELECT gym_id INTO v_gym_id FROM public.machines WHERE id = p_machine_id;

  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    PERFORM public.log_fraud_event(auth.uid(), v_gym_id, 'heartbeat_unauthorized', 'high',
      jsonb_build_object('machine_id', p_machine_id, 'requested_user_id', p_user_id));
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.machines
  SET last_heartbeat = NOW()
  WHERE id = p_machine_id
    AND current_user_id = p_user_id
    AND is_busy = true;

  IF NOT FOUND THEN
    PERFORM public.log_fraud_event(p_user_id, v_gym_id, 'heartbeat_without_lock', 'medium',
      jsonb_build_object('machine_id', p_machine_id));
  END IF;

  RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_machine_rpm(p_machine_id uuid, p_user_id uuid, p_rpm integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_gym_id UUID;
BEGIN
  SELECT gym_id INTO v_gym_id FROM public.machines WHERE id = p_machine_id;

  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    PERFORM public.log_fraud_event(auth.uid(), v_gym_id, 'rpm_unauthorized', 'high',
      jsonb_build_object('machine_id', p_machine_id, 'requested_user_id', p_user_id));
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.machines
  SET last_rpm = p_rpm
  WHERE id = p_machine_id
    AND current_user_id = p_user_id
    AND is_busy = true;

  IF NOT FOUND THEN
    PERFORM public.log_fraud_event(p_user_id, v_gym_id, 'rpm_without_lock', 'medium',
      jsonb_build_object('machine_id', p_machine_id, 'rpm', p_rpm));
  END IF;

  RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION public.perform_checkin(
  p_gym_id UUID,
  p_lat    NUMERIC DEFAULT NULL,
  p_lng    NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id      UUID;
  v_drops        INTEGER;
  v_effective_drops INTEGER;
  v_gym_name     TEXT;
  v_suspended    BOOLEAN;
  v_already      BOOLEAN;
  v_checkin_id   UUID;
  v_streak       INTEGER;
  v_last_visit   DATE;
  v_gym_lat      NUMERIC;
  v_gym_lng      NUMERIC;
  v_radius_m     INTEGER;
  v_distance_m   INTEGER := NULL;
  v_gps_verified BOOLEAN := false;
  v_mode         TEXT := 'lenient';
  v_today        DATE := (NOW() AT TIME ZONE 'Europe/Belgrade')::DATE;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    PERFORM public.log_fraud_event(NULL, p_gym_id, 'checkin_not_authenticated', 'medium', '{}'::jsonb);
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  SELECT name, is_suspended, checkin_drops, lat, lng, gps_radius_m, checkin_verification_mode
  INTO v_gym_name, v_suspended, v_drops, v_gym_lat, v_gym_lng, v_radius_m, v_mode
  FROM public.gyms WHERE id = p_gym_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'gym_not_found');
  END IF;
  IF v_suspended THEN
    RETURN jsonb_build_object('success', false, 'error', 'gym_suspended');
  END IF;
  IF COALESCE(v_drops, 0) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'checkin_disabled');
  END IF;

  IF v_mode = 'strict' THEN
    IF p_lat IS NULL OR p_lng IS NULL THEN
      PERFORM public.log_fraud_event(v_user_id, p_gym_id, 'strict_checkin_missing_gps', 'medium', '{}'::jsonb);
      RETURN jsonb_build_object('success', false, 'error', 'gps_required');
    END IF;
    IF v_gym_lat IS NULL OR v_gym_lng IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'gym_location_not_configured');
    END IF;
  END IF;

  IF p_lat IS NOT NULL AND p_lng IS NOT NULL AND v_gym_lat IS NOT NULL AND v_gym_lng IS NOT NULL THEN
    v_distance_m := haversine_distance_m(p_lat, p_lng, v_gym_lat, v_gym_lng);
    IF v_distance_m <= v_radius_m THEN
      v_gps_verified := true;
    ELSE
      PERFORM public.log_fraud_event(v_user_id, p_gym_id, 'checkin_too_far', 'medium',
        jsonb_build_object('distance_m', v_distance_m, 'radius_m', v_radius_m));
      IF v_mode = 'strict' THEN
        RETURN jsonb_build_object('success', false, 'error', 'too_far', 'distance_m', v_distance_m, 'radius_m', v_radius_m);
      END IF;
    END IF;
  ELSIF v_mode = 'strict' THEN
    PERFORM public.log_fraud_event(v_user_id, p_gym_id, 'strict_checkin_missing_gps', 'medium', '{}'::jsonb);
    RETURN jsonb_build_object('success', false, 'error', 'gps_required');
  END IF;

  IF v_mode = 'strict' AND NOT v_gps_verified THEN
    PERFORM public.log_fraud_event(v_user_id, p_gym_id, 'strict_checkin_verification_failed', 'medium', '{}'::jsonb);
    RETURN jsonb_build_object('success', false, 'error', 'gps_verification_failed');
  END IF;

  IF v_gps_verified THEN
    v_effective_drops := v_drops;
  ELSE
    v_effective_drops := LEAST(v_drops, 1);
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.gym_checkins
    WHERE user_id = v_user_id AND gym_id = p_gym_id
      AND DATE(checked_in_at AT TIME ZONE 'Europe/Belgrade') = v_today
  ) INTO v_already;

  IF v_already THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_checked_in', 'gym_name', v_gym_name, 'checkin_drops', v_effective_drops);
  END IF;

  INSERT INTO public.gym_checkins
    (user_id, gym_id, drops_earned, gps_verified, gps_distance_m, gps_lat, gps_lng)
  VALUES
    (v_user_id, p_gym_id, v_effective_drops, v_gps_verified, v_distance_m, p_lat, p_lng)
  RETURNING id INTO v_checkin_id;

  SELECT streak_days, last_visit_date
  INTO v_streak, v_last_visit
  FROM public.profiles WHERE id = v_user_id FOR UPDATE;

  UPDATE public.profiles
  SET total_drops     = total_drops + v_effective_drops,
      available_drops = available_drops + v_effective_drops,
      weekly_drops    = weekly_drops + v_effective_drops,
      monthly_drops   = monthly_drops + v_effective_drops,
      updated_at      = NOW()
  WHERE id = v_user_id;

  IF v_last_visit IS NULL OR v_last_visit != v_today THEN
    IF v_last_visit = v_today - 1
       OR EXISTS (
         SELECT 1 FROM public.sessions
         WHERE user_id = v_user_id AND is_active = false
           AND DATE(started_at AT TIME ZONE 'Europe/Belgrade') = v_today - 1
       )
    THEN
      v_streak := v_streak + 1;
    ELSE
      v_streak := 1;
    END IF;

    UPDATE public.profiles
    SET streak_days = v_streak,
        last_visit_date = v_today
    WHERE id = v_user_id;
  END IF;

  UPDATE public.gym_memberships
  SET local_drops_balance = local_drops_balance + v_effective_drops,
      updated_at = NOW()
  WHERE user_id = v_user_id AND gym_id = p_gym_id;

  IF NOT FOUND THEN
    INSERT INTO public.gym_memberships (user_id, gym_id, local_drops_balance)
    VALUES (v_user_id, p_gym_id, v_effective_drops)
    ON CONFLICT (user_id, gym_id)
    DO UPDATE SET local_drops_balance = gym_memberships.local_drops_balance + v_effective_drops;
  END IF;

  INSERT INTO public.drops_transactions
    (user_id, gym_id, amount, transaction_type, description)
  VALUES
    (v_user_id, p_gym_id, v_effective_drops, 'checkin',
     CASE WHEN v_gps_verified THEN 'Reception check-in (GPS verified)'
          ELSE 'Reception check-in (unverified, lenient mode cap)'
     END);

  PERFORM public.update_checkin_challenge_progress(v_user_id, p_gym_id);

  RETURN jsonb_build_object(
    'success', true,
    'drops_earned', v_effective_drops,
    'gym_name', v_gym_name,
    'checkin_id', v_checkin_id,
    'streak_days', v_streak,
    'gps_verified', v_gps_verified,
    'distance_m', v_distance_m,
    'verification_mode', v_mode
  );

EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('success', false, 'error', 'already_checked_in', 'gym_name', v_gym_name);
END;
$$;

CREATE OR REPLACE FUNCTION public.award_drops(
  p_session_id UUID
)
RETURNS TABLE(
  drops_earned  INTEGER,
  multiplier    NUMERIC,
  badges_earned TEXT[]
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session       RECORD;
  v_profile       RECORD;
  v_machine_owner UUID;
  v_machine_busy  BOOLEAN;

  v_base_drops    INTEGER;
  v_raw_drops     INTEGER;
  v_final_drops   INTEGER;
  v_multiplier    NUMERIC := 1.0;
  v_balance_after INTEGER;
  v_new_streak    INTEGER;
  v_badges        TEXT[] := ARRAY[]::TEXT[];

  v_today         DATE := (NOW() AT TIME ZONE 'Europe/Belgrade')::DATE;
  v_week_start    DATE := DATE_TRUNC('week', NOW() AT TIME ZONE 'Europe/Belgrade')::DATE;
  v_duration_sec  INTEGER;
  v_capped_sec    INTEGER;
  v_session_cal   NUMERIC;

  v_max_session   INTEGER := 120;
  v_max_daily     INTEGER := 300;
  v_max_weekly    INTEGER := 1500;
  v_max_sessions_day INTEGER := 4;

  v_rewarded_sessions_today INTEGER := 0;
  v_minted_today   INTEGER := 0;
  v_minted_week    INTEGER := 0;
  v_day_remaining  INTEGER := 0;
  v_week_remaining INTEGER := 0;
BEGIN
  SELECT * INTO v_session
  FROM public.sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found: %', p_session_id;
  END IF;

  IF auth.uid() IS NULL OR auth.uid() <> v_session.user_id THEN
    PERFORM public.log_fraud_event(auth.uid(), v_session.gym_id, 'award_drops_unauthorized', 'critical',
      jsonb_build_object('session_id', p_session_id, 'session_user_id', v_session.user_id));
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_session.is_active = false AND v_session.ended_at IS NOT NULL THEN
    RETURN QUERY SELECT
      COALESCE(v_session.drops_earned, 0)::INTEGER,
      COALESCE(v_session.multiplier, 1.0)::NUMERIC,
      ARRAY[]::TEXT[];
    RETURN;
  END IF;

  IF v_session.machine_id IS NOT NULL THEN
    SELECT current_user_id, is_busy
    INTO v_machine_owner, v_machine_busy
    FROM public.machines
    WHERE id = v_session.machine_id
    FOR UPDATE;

    IF NOT FOUND OR v_machine_owner IS DISTINCT FROM v_session.user_id OR COALESCE(v_machine_busy, false) = false THEN
      PERFORM public.log_fraud_event(v_session.user_id, v_session.gym_id, 'award_drops_without_valid_lock', 'high',
        jsonb_build_object('session_id', p_session_id, 'machine_id', v_session.machine_id, 'machine_owner', v_machine_owner, 'machine_busy', v_machine_busy));
      RAISE EXCEPTION 'Machine lock ownership invalid for rewarding';
    END IF;
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = v_session.user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for user: %', v_session.user_id;
  END IF;

  v_duration_sec := COALESCE(v_session.duration_seconds, 0);
  v_capped_sec := LEAST(GREATEST(v_duration_sec, 0), 7200);

  IF v_duration_sec < 120 THEN
    PERFORM public.log_fraud_event(v_session.user_id, v_session.gym_id, 'session_too_short_for_reward', 'low',
      jsonb_build_object('session_id', p_session_id, 'duration_seconds', v_duration_sec));
    v_raw_drops := 0;
    v_multiplier := 1.0;
  ELSE
    v_session_cal := COALESCE(v_session.calories, (v_capped_sec / 60.0) * 7.0);
    v_session_cal := LEAST(v_session_cal, (v_capped_sec / 60.0) * 25.0);

    v_base_drops := GREATEST(1, ROUND(v_session_cal * 2.5));

    v_new_streak := CASE
      WHEN v_profile.last_visit_date IS NULL THEN 1
      WHEN v_profile.last_visit_date = v_today THEN v_profile.streak_days
      WHEN v_profile.last_visit_date = v_today - 1 THEN v_profile.streak_days + 1
      ELSE 1
    END;

    v_multiplier := CASE
      WHEN v_new_streak >= 14 THEN 2.0
      WHEN v_new_streak >= 7  THEN 1.5
      WHEN v_new_streak >= 3  THEN 1.2
      ELSE 1.0
    END;

    v_raw_drops := GREATEST(1, ROUND(v_base_drops * v_multiplier));
  END IF;

  SELECT
    dl.max_drops_per_session,
    dl.max_drops_per_day,
    dl.max_drops_per_week,
    dl.max_rewarded_sessions_per_day
  INTO
    v_max_session,
    v_max_daily,
    v_max_weekly,
    v_max_sessions_day
  FROM public.drop_limits dl
  WHERE dl.enabled = true
    AND (dl.gym_id = v_session.gym_id OR dl.gym_id IS NULL)
  ORDER BY CASE WHEN dl.gym_id = v_session.gym_id THEN 0 ELSE 1 END
  LIMIT 1;

  SELECT COUNT(*)::INT, COALESCE(SUM(s.drops_earned), 0)::INT
  INTO v_rewarded_sessions_today, v_minted_today
  FROM public.sessions s
  WHERE s.user_id = v_session.user_id
    AND s.id <> v_session.id
    AND s.is_active = false
    AND s.drops_earned > 0
    AND DATE(s.started_at AT TIME ZONE 'Europe/Belgrade') = v_today;

  SELECT COALESCE(SUM(s.drops_earned), 0)::INT
  INTO v_minted_week
  FROM public.sessions s
  WHERE s.user_id = v_session.user_id
    AND s.id <> v_session.id
    AND s.is_active = false
    AND s.drops_earned > 0
    AND DATE(s.started_at AT TIME ZONE 'Europe/Belgrade') >= v_week_start;

  IF v_rewarded_sessions_today >= v_max_sessions_day THEN
    PERFORM public.log_fraud_event(v_session.user_id, v_session.gym_id, 'drops_cap_sessions_per_day_reached', 'medium',
      jsonb_build_object('session_id', p_session_id, 'max_rewarded_sessions_per_day', v_max_sessions_day));
    v_final_drops := 0;
  ELSE
    v_day_remaining := GREATEST(v_max_daily - v_minted_today, 0);
    v_week_remaining := GREATEST(v_max_weekly - v_minted_week, 0);
    v_final_drops := LEAST(v_raw_drops, v_max_session, v_day_remaining, v_week_remaining);
  END IF;

  IF v_final_drops < 0 THEN
    v_final_drops := 0;
  END IF;

  IF v_final_drops < v_raw_drops THEN
    PERFORM public.log_fraud_event(v_session.user_id, v_session.gym_id, 'drops_capped', 'low',
      jsonb_build_object('session_id', p_session_id, 'raw_drops', v_raw_drops, 'final_drops', v_final_drops,
                         'daily_remaining', v_day_remaining, 'weekly_remaining', v_week_remaining));
  END IF;

  v_new_streak := CASE
    WHEN v_profile.last_visit_date IS NULL THEN 1
    WHEN v_profile.last_visit_date = v_today THEN v_profile.streak_days
    WHEN v_profile.last_visit_date = v_today - 1 THEN v_profile.streak_days + 1
    ELSE 1
  END;

  UPDATE public.sessions
  SET drops_earned = v_final_drops,
      multiplier   = v_multiplier,
      ended_at     = COALESCE(ended_at, NOW()),
      is_active    = false,
      updated_at   = NOW()
  WHERE id = p_session_id;

  UPDATE public.profiles
  SET total_drops     = total_drops + v_final_drops,
      available_drops = available_drops + v_final_drops,
      weekly_drops    = weekly_drops + v_final_drops,
      monthly_drops   = monthly_drops + v_final_drops,
      last_visit_date = v_today,
      streak_days     = v_new_streak,
      updated_at      = NOW()
  WHERE id = v_session.user_id;

  UPDATE public.gym_memberships
  SET local_drops_balance = local_drops_balance + v_final_drops,
      updated_at          = NOW()
  WHERE user_id = v_session.user_id
    AND gym_id  = v_session.gym_id;

  IF NOT FOUND THEN
    INSERT INTO public.gym_memberships (user_id, gym_id, local_drops_balance)
    VALUES (v_session.user_id, v_session.gym_id, v_final_drops)
    ON CONFLICT (user_id, gym_id)
    DO UPDATE SET local_drops_balance = gym_memberships.local_drops_balance + v_final_drops;
  END IF;

  SELECT available_drops INTO v_balance_after
  FROM public.profiles
  WHERE id = v_session.user_id;

  IF v_final_drops > 0 THEN
    INSERT INTO public.drops_transactions
      (user_id, gym_id, amount, transaction_type,
       reference_id, balance_after, expires_at, description)
    VALUES
      (v_session.user_id, v_session.gym_id,
       v_final_drops, 'session',
       p_session_id, v_balance_after,
       NOW() + INTERVAL '90 days',
       'Workout session — ' || v_final_drops || ' drops (×' || v_multiplier || ')');

    PERFORM public.update_challenge_progress(
      v_session.user_id,
      v_session.gym_id,
      v_final_drops,
      p_session_id
    );

    PERFORM public.update_arena_scores(
      v_session.user_id,
      v_session.gym_id,
      v_final_drops
    );

    SELECT COALESCE(array_agg(bn.badge_name), ARRAY[]::TEXT[])
    INTO v_badges
    FROM public.evaluate_badges(v_session.user_id, p_session_id) AS bn(badge_name);
  END IF;

  INSERT INTO public.gym_checkins
    (user_id, gym_id, drops_earned, gps_verified, gps_distance_m, gps_lat, gps_lng)
  VALUES
    (v_session.user_id, v_session.gym_id, 0, false, NULL, NULL, NULL)
  ON CONFLICT DO NOTHING;

  PERFORM public.update_checkin_challenge_progress(v_session.user_id, v_session.gym_id);

  RETURN QUERY SELECT v_final_drops, v_multiplier, v_badges;
END;
$$;
