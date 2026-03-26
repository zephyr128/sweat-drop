-- Migration: 20260324000013_drop_caps_enforcement.sql
-- Description: Add DB-level drop cap controls and enforce them in award_drops().

CREATE TABLE IF NOT EXISTS public.drop_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  max_drops_per_session INTEGER NOT NULL DEFAULT 120 CHECK (max_drops_per_session >= 0),
  max_rewarded_sessions_per_day INTEGER NOT NULL DEFAULT 4 CHECK (max_rewarded_sessions_per_day >= 0),
  max_drops_per_day INTEGER NOT NULL DEFAULT 300 CHECK (max_drops_per_day >= 0),
  max_drops_per_week INTEGER NOT NULL DEFAULT 1500 CHECK (max_drops_per_week >= 0),
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_drop_limits_gym UNIQUE (gym_id)
);

COMMENT ON TABLE public.drop_limits IS
  'Anti-abuse issuance caps. gym_id NULL row is global default; gym-specific row overrides defaults.';

INSERT INTO public.drop_limits (gym_id, max_drops_per_session, max_rewarded_sessions_per_day, max_drops_per_day, max_drops_per_week, enabled)
SELECT NULL, 120, 4, 300, 1500, true
WHERE NOT EXISTS (SELECT 1 FROM public.drop_limits WHERE gym_id IS NULL);

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
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_session.is_active = false AND v_session.ended_at IS NOT NULL THEN
    RETURN QUERY SELECT
      COALESCE(v_session.drops_earned, 0)::INTEGER,
      COALESCE(v_session.multiplier, 1.0)::NUMERIC,
      ARRAY[]::TEXT[];
    RETURN;
  END IF;

  -- Must own machine lock when machine_id exists (anti-piggyback / anti-spoof)
  IF v_session.machine_id IS NOT NULL THEN
    SELECT current_user_id, is_busy
    INTO v_machine_owner, v_machine_busy
    FROM public.machines
    WHERE id = v_session.machine_id
    FOR UPDATE;

    IF NOT FOUND OR v_machine_owner IS DISTINCT FROM v_session.user_id OR COALESCE(v_machine_busy, false) = false THEN
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

  -- Session integrity guards: minimum 2m to be reward-eligible, cap at 2h
  v_duration_sec := COALESCE(v_session.duration_seconds, 0);
  v_capped_sec := LEAST(GREATEST(v_duration_sec, 0), 7200);

  IF v_duration_sec < 120 THEN
    v_raw_drops := 0;
    v_multiplier := 1.0;
  ELSE
    -- calories plausibility cap (anti-spoof): 25 cal/min upper bound
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

  -- Resolve effective caps (gym-specific override > global default)
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

  -- Historical mint totals for caps (exclude current session)
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
    v_final_drops := 0;
  ELSE
    v_day_remaining := GREATEST(v_max_daily - v_minted_today, 0);
    v_week_remaining := GREATEST(v_max_weekly - v_minted_week, 0);
    v_final_drops := LEAST(v_raw_drops, v_max_session, v_day_remaining, v_week_remaining);
  END IF;

  IF v_final_drops < 0 THEN
    v_final_drops := 0;
  END IF;

  -- refresh streak (even if drops are capped to zero)
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
