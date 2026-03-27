-- Migration: 20260327120000_perform_checkin_lenient_full_drops_hotfix.sql
-- Description: Hotfix perform_checkin — lenient mode awards full checkin_drops when GPS is
--   unverified (remove LEAST(v_drops,1) cap). Strict mode unchanged. RPC returns diagnostics.
--
-- AGENT NOTE: 2026-03-27 - supabase-dba
-- Replaces definition last set in 20260324000014_fraud_events_and_logging.sql
--
-- CHANGES:
-- - Lenient + GPS not verified: award full configured checkin_drops (no cap to 1)
-- - Strict: unchanged early exits / GPS enforcement
-- - Response JSONB: configured_checkin_drops, awarded_checkin_drops, drops_earned,
--   gps_verified, verification_mode, cap_reason (nullable)
--
-- IMPACT ON FRONTEND:
-- - Mobile/admin may read new keys for UX copy; drops_earned unchanged for success path

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
  v_cap_reason   TEXT := NULL;
  v_today        DATE := (NOW() AT TIME ZONE 'Europe/Belgrade')::DATE;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    PERFORM public.log_fraud_event(NULL, p_gym_id, 'checkin_not_authenticated', 'medium', '{}'::jsonb);
    RETURN jsonb_build_object(
      'success', false,
      'error', 'not_authenticated',
      'configured_checkin_drops', NULL,
      'awarded_checkin_drops', 0,
      'drops_earned', 0,
      'gps_verified', false,
      'verification_mode', NULL,
      'cap_reason', NULL
    );
  END IF;

  SELECT name, is_suspended, checkin_drops, lat, lng, gps_radius_m, checkin_verification_mode
  INTO v_gym_name, v_suspended, v_drops, v_gym_lat, v_gym_lng, v_radius_m, v_mode
  FROM public.gyms WHERE id = p_gym_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'gym_not_found',
      'configured_checkin_drops', NULL,
      'awarded_checkin_drops', 0,
      'drops_earned', 0,
      'gps_verified', false,
      'verification_mode', NULL,
      'cap_reason', NULL
    );
  END IF;
  IF v_suspended THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'gym_suspended',
      'configured_checkin_drops', v_drops,
      'awarded_checkin_drops', 0,
      'drops_earned', 0,
      'gps_verified', false,
      'verification_mode', COALESCE(v_mode, 'lenient'),
      'cap_reason', NULL
    );
  END IF;
  IF COALESCE(v_drops, 0) = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'checkin_disabled',
      'configured_checkin_drops', v_drops,
      'awarded_checkin_drops', 0,
      'drops_earned', 0,
      'gps_verified', false,
      'verification_mode', COALESCE(v_mode, 'lenient'),
      'cap_reason', NULL
    );
  END IF;

  IF v_mode = 'strict' THEN
    IF p_lat IS NULL OR p_lng IS NULL THEN
      PERFORM public.log_fraud_event(v_user_id, p_gym_id, 'strict_checkin_missing_gps', 'medium', '{}'::jsonb);
      RETURN jsonb_build_object(
        'success', false,
        'error', 'gps_required',
        'configured_checkin_drops', v_drops,
        'awarded_checkin_drops', 0,
        'drops_earned', 0,
        'gps_verified', false,
        'verification_mode', COALESCE(v_mode, 'lenient'),
        'cap_reason', 'gps_required_strict'
      );
    END IF;
    IF v_gym_lat IS NULL OR v_gym_lng IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'gym_location_not_configured',
        'configured_checkin_drops', v_drops,
        'awarded_checkin_drops', 0,
        'drops_earned', 0,
        'gps_verified', false,
        'verification_mode', COALESCE(v_mode, 'lenient'),
        'cap_reason', 'gps_required_strict'
      );
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
        RETURN jsonb_build_object(
          'success', false,
          'error', 'too_far',
          'distance_m', v_distance_m,
          'radius_m', v_radius_m,
          'configured_checkin_drops', v_drops,
          'awarded_checkin_drops', 0,
          'drops_earned', 0,
          'gps_verified', false,
          'verification_mode', COALESCE(v_mode, 'lenient'),
          'cap_reason', 'too_far_strict'
        );
      END IF;
    END IF;
  ELSIF v_mode = 'strict' THEN
    PERFORM public.log_fraud_event(v_user_id, p_gym_id, 'strict_checkin_missing_gps', 'medium', '{}'::jsonb);
    RETURN jsonb_build_object(
      'success', false,
      'error', 'gps_required',
      'configured_checkin_drops', v_drops,
      'awarded_checkin_drops', 0,
      'drops_earned', 0,
      'gps_verified', false,
      'verification_mode', COALESCE(v_mode, 'lenient'),
      'cap_reason', 'gps_required_strict'
    );
  END IF;

  IF v_mode = 'strict' AND NOT v_gps_verified THEN
    PERFORM public.log_fraud_event(v_user_id, p_gym_id, 'strict_checkin_verification_failed', 'medium', '{}'::jsonb);
    RETURN jsonb_build_object(
      'success', false,
      'error', 'gps_verification_failed',
      'configured_checkin_drops', v_drops,
      'awarded_checkin_drops', 0,
      'drops_earned', 0,
      'gps_verified', false,
      'verification_mode', COALESCE(v_mode, 'lenient'),
      'cap_reason', 'gps_verification_failed'
    );
  END IF;

  -- Lenient + unverified: full configured drops (no cap). Strict path only reaches here when verified.
  v_effective_drops := v_drops;
  IF COALESCE(v_mode, 'lenient') = 'lenient' AND NOT v_gps_verified THEN
    v_cap_reason := 'gps_unverified_lenient';
  ELSE
    v_cap_reason := NULL;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.gym_checkins
    WHERE user_id = v_user_id AND gym_id = p_gym_id
      AND DATE(checked_in_at AT TIME ZONE 'Europe/Belgrade') = v_today
  ) INTO v_already;

  IF v_already THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'already_checked_in',
      'gym_name', v_gym_name,
      'checkin_drops', v_effective_drops,
      'configured_checkin_drops', v_drops,
      'awarded_checkin_drops', 0,
      'drops_earned', 0,
      'gps_verified', v_gps_verified,
      'verification_mode', COALESCE(v_mode, 'lenient'),
      'cap_reason', 'daily_cap_reached'
    );
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
          ELSE 'Reception check-in (lenient mode, GPS not verified)'
     END);

  PERFORM public.update_checkin_challenge_progress(v_user_id, p_gym_id);

  RETURN jsonb_build_object(
    'success', true,
    'drops_earned', v_effective_drops,
    'awarded_checkin_drops', v_effective_drops,
    'configured_checkin_drops', v_drops,
    'gym_name', v_gym_name,
    'checkin_id', v_checkin_id,
    'streak_days', v_streak,
    'gps_verified', v_gps_verified,
    'distance_m', v_distance_m,
    'verification_mode', COALESCE(v_mode, 'lenient'),
    'cap_reason', v_cap_reason
  );

EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', 'already_checked_in',
    'gym_name', v_gym_name,
    'configured_checkin_drops', v_drops,
    'awarded_checkin_drops', 0,
    'drops_earned', 0,
    'gps_verified', v_gps_verified,
    'verification_mode', COALESCE(v_mode, 'lenient'),
    'cap_reason', 'daily_cap_reached'
  );
END;
$$;
