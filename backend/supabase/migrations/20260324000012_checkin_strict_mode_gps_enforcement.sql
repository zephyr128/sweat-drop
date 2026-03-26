-- Migration: 20260324000012_checkin_strict_mode_gps_enforcement.sql
-- Description: Add gym check-in verification mode (lenient/strict) and enforce GPS in strict mode.

ALTER TABLE public.gyms
  ADD COLUMN IF NOT EXISTS checkin_verification_mode TEXT NOT NULL DEFAULT 'lenient';

DO $$
BEGIN
  ALTER TABLE public.gyms
    ADD CONSTRAINT chk_gyms_checkin_verification_mode
    CHECK (checkin_verification_mode IN ('lenient', 'strict'));
EXCEPTION WHEN duplicate_object THEN
  NULL;
END;
$$;

COMMENT ON COLUMN public.gyms.checkin_verification_mode IS
  'Check-in verification mode: lenient allows fallback without GPS (capped drops), strict requires verified GPS inside gym radius.';

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
      IF v_mode = 'strict' THEN
        RETURN jsonb_build_object(
          'success', false, 'error', 'too_far',
          'distance_m', v_distance_m, 'radius_m', v_radius_m
        );
      END IF;
    END IF;
  ELSIF v_mode = 'strict' THEN
    RETURN jsonb_build_object('success', false, 'error', 'gps_required');
  END IF;

  IF v_mode = 'strict' AND NOT v_gps_verified THEN
    RETURN jsonb_build_object('success', false, 'error', 'gps_verification_failed');
  END IF;

  -- lenient fallback: unverified check-ins are capped to 1 drop
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
    RETURN jsonb_build_object('success', false, 'error', 'already_checked_in',
      'gym_name', v_gym_name, 'checkin_drops', v_effective_drops);
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

  -- strict mode only allows verified check-ins by this point; lenient may still progress
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
