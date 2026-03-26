-- Migration: 20260324000010_harden_auth_identity_checks.sql
-- Description: Hard-bind critical SECURITY DEFINER RPCs to auth.uid()

-- 1) lock_machine: caller must match p_user_id
CREATE OR REPLACE FUNCTION public.lock_machine(p_machine_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_current_user_id UUID;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT current_user_id INTO v_current_user_id
  FROM public.machines
  WHERE id = p_machine_id AND is_busy = true;

  IF v_current_user_id IS NOT NULL AND v_current_user_id != p_user_id THEN
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

-- 2) unlock_machine: caller must match p_user_id
CREATE OR REPLACE FUNCTION public.unlock_machine(p_machine_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.machines
  SET is_busy = false,
      current_user_id = NULL,
      last_heartbeat = NULL
  WHERE id = p_machine_id
    AND current_user_id = p_user_id;

  RETURN FOUND;
END;
$function$;

-- 3) update_machine_heartbeat: caller must match p_user_id
CREATE OR REPLACE FUNCTION public.update_machine_heartbeat(p_machine_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.machines
  SET last_heartbeat = NOW()
  WHERE id = p_machine_id
    AND current_user_id = p_user_id
    AND is_busy = true;

  RETURN FOUND;
END;
$function$;

-- 4) update_machine_rpm: caller must match p_user_id
CREATE OR REPLACE FUNCTION public.update_machine_rpm(p_machine_id uuid, p_user_id uuid, p_rpm integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.machines
  SET last_rpm = p_rpm
  WHERE id = p_machine_id
    AND current_user_id = p_user_id
    AND is_busy = true;

  RETURN FOUND;
END;
$function$;

-- 5) award_drops: enforce session owner = caller
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
  v_session      RECORD;
  v_profile      RECORD;
  v_base_drops   INTEGER;
  v_multiplier   NUMERIC := 1.0;
  v_final_drops  INTEGER;
  v_balance_after INTEGER;
  v_new_streak   INTEGER;
  v_badges       TEXT[] := ARRAY[]::TEXT[];
  v_today        DATE := (NOW() AT TIME ZONE 'Europe/Belgrade')::DATE;
BEGIN
  SELECT * INTO v_session
  FROM public.sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found: %', p_session_id;
  END IF;

  IF auth.uid() IS NULL OR auth.uid() <> v_session.user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- idempotency even when drops=0 but session already finalized
  IF v_session.is_active = false AND v_session.ended_at IS NOT NULL THEN
    RETURN QUERY SELECT
      COALESCE(v_session.drops_earned, 0)::INTEGER,
      COALESCE(v_session.multiplier, 1.0)::NUMERIC,
      ARRAY[]::TEXT[];
    RETURN;
  END IF;

  IF v_session.drops_earned > 0 THEN
    RETURN QUERY SELECT
      v_session.drops_earned::INTEGER,
      COALESCE(v_session.multiplier, 1.0)::NUMERIC,
      ARRAY[]::TEXT[];
    RETURN;
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = v_session.user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for user: %', v_session.user_id;
  END IF;

  v_base_drops := GREATEST(1, ROUND(
    COALESCE(v_session.calories, (v_session.duration_seconds / 60.0) * 7.0) * 2.5
  ));

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

  v_final_drops := GREATEST(1, ROUND(v_base_drops * v_multiplier));

  UPDATE public.sessions
  SET drops_earned    = v_final_drops,
      multiplier      = v_multiplier,
      ended_at        = COALESCE(ended_at, NOW()),
      is_active       = false,
      updated_at      = NOW()
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

  INSERT INTO public.gym_checkins
    (user_id, gym_id, drops_earned, gps_verified, gps_distance_m, gps_lat, gps_lng)
  VALUES
    (v_session.user_id, v_session.gym_id, 0, false, NULL, NULL, NULL)
  ON CONFLICT DO NOTHING;

  PERFORM public.update_checkin_challenge_progress(v_session.user_id, v_session.gym_id);

  RETURN QUERY SELECT v_final_drops, v_multiplier, v_badges;
END;
$$;
