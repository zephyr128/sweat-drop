-- Migration: 20260325000006_fix_award_drops_v2_machine_type_lookup.sql
-- Description: Fix machine type lookup in award_drops v2 integration (use machines.type).


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
  v_use_drop_model_v2 BOOLEAN := true;

  v_rewarded_sessions_today INTEGER := 0;
  v_minted_today   INTEGER := 0;
  v_minted_week    INTEGER := 0;
  v_day_remaining  INTEGER := 0;
  v_week_remaining INTEGER := 0;

  v_calc_raw       INTEGER := 0;
  v_calc_adjusted  INTEGER := 0;
  v_calc_multiplier NUMERIC := 1.0;
  v_calc_caps      JSONB := '{}'::JSONB;
  v_calc_reasons   JSONB := '[]'::JSONB;

  v_rm             JSONB;
  v_quality_flags  JSONB;
  v_machine_type   TEXT;
  v_avg_rpm        NUMERIC;
  v_rpm_peak       NUMERIC;
  v_speed_avg_kmh  NUMERIC;
  v_incline_avg_pct NUMERIC;
  v_cadence_avg    NUMERIC;
  v_steps_avg      NUMERIC;
  v_resistance_avg NUMERIC;

  v_drop_calc_v2   JSONB := '{}'::JSONB;
  v_cap_after_session INTEGER := 0;
  v_cap_after_day INTEGER := 0;
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

  IF v_session.machine_id IS NOT NULL THEN
    SELECT LOWER(m.type)
    INTO v_machine_type
    FROM public.machines m
    WHERE m.id = v_session.machine_id;
  END IF;
  v_machine_type := COALESCE(v_machine_type, 'generic');

  SELECT
    tc.use_drop_model_v2,
    tc.max_drops_per_session,
    tc.max_drops_per_day,
    tc.max_drops_per_week,
    tc.max_rewarded_sessions_per_day
  INTO
    v_use_drop_model_v2,
    v_max_session,
    v_max_daily,
    v_max_weekly,
    v_max_sessions_day
  FROM public.tokenomics_config tc
  WHERE (tc.gym_id = v_session.gym_id OR tc.gym_id IS NULL)
  ORDER BY CASE WHEN tc.gym_id = v_session.gym_id THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_max_session IS NULL OR v_max_daily IS NULL OR v_max_weekly IS NULL OR v_max_sessions_day IS NULL THEN
    SELECT
      dmc.max_drops_per_session,
      dmc.max_drops_per_day,
      dmc.max_drops_per_week,
      dmc.max_rewarded_sessions_per_day
    INTO
      v_max_session,
      v_max_daily,
      v_max_weekly,
      v_max_sessions_day
    FROM public.drop_model_config dmc
    WHERE dmc.is_active = true
      AND (dmc.machine_type = v_machine_type OR dmc.machine_type = 'generic')
      AND (dmc.gym_id = v_session.gym_id OR dmc.gym_id IS NULL)
    ORDER BY
      CASE WHEN dmc.gym_id = v_session.gym_id THEN 0 ELSE 1 END,
      CASE WHEN dmc.machine_type = v_machine_type THEN 0 ELSE 1 END,
      dmc.updated_at DESC
    LIMIT 1;

    v_max_session := COALESCE(v_max_session, 120);
    v_max_daily := COALESCE(v_max_daily, 300);
    v_max_weekly := COALESCE(v_max_weekly, 1500);
    v_max_sessions_day := COALESCE(v_max_sessions_day, 4);
  END IF;

  v_duration_sec := COALESCE(v_session.duration_seconds, 0);
  v_capped_sec := LEAST(GREATEST(v_duration_sec, 0), 10800); -- support long sessions, still bounded

  IF v_duration_sec < 120 THEN
    PERFORM public.log_fraud_event(v_session.user_id, v_session.gym_id, 'session_too_short_for_reward', 'low',
      jsonb_build_object('session_id', p_session_id, 'duration_seconds', v_duration_sec));
    v_raw_drops := 0;
    v_multiplier := 1.0;
    v_drop_calc_v2 := jsonb_build_object(
      'enabled', v_use_drop_model_v2,
      'raw_drops', 0,
      'adjusted_drops', 0,
      'reasons', jsonb_build_array('session_too_short'),
      'inputs', jsonb_build_object('duration_seconds', v_duration_sec)
    );
  ELSE
    v_rm := COALESCE(v_session.raw_metrics, '{}'::jsonb);
    v_quality_flags := COALESCE(v_rm->'quality_flags', '{}'::jsonb);

    v_avg_rpm := CASE WHEN COALESCE(v_rm->>'avg_rpm', '') ~ '^[0-9]+(\.[0-9]+)?$' THEN (v_rm->>'avg_rpm')::NUMERIC END;
    v_rpm_peak := CASE WHEN COALESCE(v_rm->>'rpm_peak', '') ~ '^[0-9]+(\.[0-9]+)?$' THEN (v_rm->>'rpm_peak')::NUMERIC END;
    v_speed_avg_kmh := CASE WHEN COALESCE(v_rm->>'speed_avg_kmh', '') ~ '^[0-9]+(\.[0-9]+)?$' THEN (v_rm->>'speed_avg_kmh')::NUMERIC END;
    v_incline_avg_pct := CASE WHEN COALESCE(v_rm->>'incline_avg_pct', '') ~ '^[0-9]+(\.[0-9]+)?$' THEN (v_rm->>'incline_avg_pct')::NUMERIC END;
    v_cadence_avg := CASE WHEN COALESCE(v_rm->>'cadence_avg', '') ~ '^[0-9]+(\.[0-9]+)?$' THEN (v_rm->>'cadence_avg')::NUMERIC END;
    v_steps_avg := CASE WHEN COALESCE(v_rm->>'steps_per_min_avg', '') ~ '^[0-9]+(\.[0-9]+)?$' THEN (v_rm->>'steps_per_min_avg')::NUMERIC END;
    v_resistance_avg := CASE WHEN COALESCE(v_rm->>'resistance_avg', '') ~ '^[0-9]+(\.[0-9]+)?$' THEN (v_rm->>'resistance_avg')::NUMERIC END;

    IF v_use_drop_model_v2 THEN
      SELECT
        c.raw_drops,
        c.adjusted_drops,
        c.applied_multiplier,
        c.applied_caps,
        c.reasons
      INTO
        v_calc_raw,
        v_calc_adjusted,
        v_calc_multiplier,
        v_calc_caps,
        v_calc_reasons
      FROM public.calculate_session_drops_v2(
        v_session.gym_id,
        v_machine_type,
        v_duration_sec,
        v_avg_rpm,
        v_speed_avg_kmh,
        v_incline_avg_pct,
        v_cadence_avg,
        COALESCE(v_session.calories, NULL),
        v_quality_flags,
        v_rpm_peak,
        v_steps_avg,
        v_resistance_avg
      ) c
      LIMIT 1;

      v_raw_drops := COALESCE(v_calc_adjusted, 0);
      v_multiplier := COALESCE(v_calc_multiplier, 1.0);

      IF (COALESCE(v_calc_caps->>'spike_filtered', 'false'))::BOOLEAN
         OR v_calc_reasons @> '["drop_spike_filtered"]'::JSONB THEN
        PERFORM public.log_fraud_event(v_session.user_id, v_session.gym_id, 'drop_spike_filtered', 'low',
          jsonb_build_object('session_id', p_session_id, 'machine_type', v_machine_type, 'calc_caps', v_calc_caps, 'reasons', v_calc_reasons));
      END IF;

      v_drop_calc_v2 := jsonb_build_object(
        'enabled', true,
        'machine_type', v_machine_type,
        'raw_drops', COALESCE(v_calc_raw, 0),
        'adjusted_drops', COALESCE(v_calc_adjusted, 0),
        'applied_multiplier', COALESCE(v_calc_multiplier, 1.0),
        'applied_caps', COALESCE(v_calc_caps, '{}'::jsonb),
        'reasons', COALESCE(v_calc_reasons, '[]'::jsonb),
        'inputs', jsonb_build_object(
          'duration_seconds', v_duration_sec,
          'avg_rpm', v_avg_rpm,
          'rpm_peak', v_rpm_peak,
          'speed_avg_kmh', v_speed_avg_kmh,
          'incline_avg_pct', v_incline_avg_pct,
          'cadence_avg', v_cadence_avg,
          'steps_per_min_avg', v_steps_avg,
          'resistance_avg', v_resistance_avg,
          'calories', v_session.calories
        )
      );
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
      v_drop_calc_v2 := jsonb_build_object(
        'enabled', false,
        'fallback', 'legacy_formula',
        'raw_drops', v_raw_drops,
        'applied_multiplier', v_multiplier,
        'inputs', jsonb_build_object('duration_seconds', v_duration_sec, 'calories', v_session.calories)
      );
    END IF;
  END IF;

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
    PERFORM public.log_fraud_event(v_session.user_id, v_session.gym_id, 'drop_cap_rewarded_sessions_day_hit', 'medium',
      jsonb_build_object('session_id', p_session_id, 'max_rewarded_sessions_per_day', v_max_sessions_day));
    v_final_drops := 0;
  ELSE
    v_cap_after_session := LEAST(v_raw_drops, v_max_session);
    IF v_cap_after_session < v_raw_drops THEN
      PERFORM public.log_fraud_event(v_session.user_id, v_session.gym_id, 'drop_cap_session_hit', 'low',
        jsonb_build_object('session_id', p_session_id, 'raw_drops', v_raw_drops, 'session_cap', v_max_session, 'after_cap', v_cap_after_session));
    END IF;

    v_day_remaining := GREATEST(v_max_daily - v_minted_today, 0);
    v_cap_after_day := LEAST(v_cap_after_session, v_day_remaining);
    IF v_cap_after_day < v_cap_after_session THEN
      PERFORM public.log_fraud_event(v_session.user_id, v_session.gym_id, 'drop_cap_day_hit', 'low',
        jsonb_build_object('session_id', p_session_id, 'after_session_cap', v_cap_after_session, 'day_remaining', v_day_remaining, 'after_day_cap', v_cap_after_day));
    END IF;

    v_week_remaining := GREATEST(v_max_weekly - v_minted_week, 0);
    v_final_drops := LEAST(v_cap_after_day, v_week_remaining);
    IF v_final_drops < v_cap_after_day THEN
      PERFORM public.log_fraud_event(v_session.user_id, v_session.gym_id, 'drop_cap_week_hit', 'low',
        jsonb_build_object('session_id', p_session_id, 'after_day_cap', v_cap_after_day, 'week_remaining', v_week_remaining, 'after_week_cap', v_final_drops));
    END IF;
  END IF;

  IF v_final_drops < 0 THEN
    v_final_drops := 0;
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
      raw_metrics  = jsonb_set(COALESCE(raw_metrics, '{}'::jsonb), '{drop_calc_v2}', v_drop_calc_v2, true),
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
    DO UPDATE SET local_drops_balance = gym_memberships.local_drops_balance + EXCLUDED.local_drops_balance,
                  updated_at = NOW();
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

    INSERT INTO public.drop_limit_counters (user_id, gym_id, period_type, period_start, minted_drops, rewarded_sessions, updated_at)
    VALUES (v_session.user_id, v_session.gym_id, 'day', v_today, v_final_drops, 1, NOW())
    ON CONFLICT (user_id, gym_id, period_type, period_start)
    DO UPDATE SET minted_drops = public.drop_limit_counters.minted_drops + EXCLUDED.minted_drops,
                  rewarded_sessions = public.drop_limit_counters.rewarded_sessions + EXCLUDED.rewarded_sessions,
                  updated_at = NOW();

    INSERT INTO public.drop_limit_counters (user_id, gym_id, period_type, period_start, minted_drops, rewarded_sessions, updated_at)
    VALUES (v_session.user_id, v_session.gym_id, 'week', v_week_start, v_final_drops, 1, NOW())
    ON CONFLICT (user_id, gym_id, period_type, period_start)
    DO UPDATE SET minted_drops = public.drop_limit_counters.minted_drops + EXCLUDED.minted_drops,
                  rewarded_sessions = public.drop_limit_counters.rewarded_sessions + EXCLUDED.rewarded_sessions,
                  updated_at = NOW();

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

  PERFORM public.refresh_economy_snapshot_daily(v_session.gym_id, v_today);

  INSERT INTO public.gym_checkins
    (user_id, gym_id, drops_earned, gps_verified, gps_distance_m, gps_lat, gps_lng)
  VALUES
    (v_session.user_id, v_session.gym_id, 0, false, NULL, NULL, NULL)
  ON CONFLICT DO NOTHING;

  PERFORM public.update_checkin_challenge_progress(v_session.user_id, v_session.gym_id);

  RETURN QUERY SELECT v_final_drops, v_multiplier, v_badges;
END;
$$;