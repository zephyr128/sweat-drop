-- Migration: 20260325000010_wire_award_drops_to_new_drop_model_config.sql
-- Description: Wire calculate_session_drops_v2 and award_drops to new drop_model_config contract (machine_base_json + thresholds).

CREATE OR REPLACE FUNCTION public.calculate_session_drops_v2(
  p_gym_id UUID,
  p_machine_type TEXT,
  p_duration_seconds INTEGER,
  p_avg_rpm NUMERIC DEFAULT NULL,
  p_speed_avg_kmh NUMERIC DEFAULT NULL,
  p_incline_avg_pct NUMERIC DEFAULT NULL,
  p_cadence_avg NUMERIC DEFAULT NULL,
  p_calories NUMERIC DEFAULT NULL,
  p_quality_flags JSONB DEFAULT '{}'::jsonb,
  p_rpm_peak NUMERIC DEFAULT NULL,
  p_steps_per_min_avg NUMERIC DEFAULT NULL,
  p_resistance_avg NUMERIC DEFAULT NULL
)
RETURNS TABLE(
  raw_drops INTEGER,
  adjusted_drops INTEGER,
  applied_multiplier NUMERIC,
  applied_caps JSONB,
  reasons JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cfg RECORD;
  v_machine_cfg JSONB := '{}'::jsonb;

  v_machine_type TEXT := COALESCE(NULLIF(TRIM(LOWER(p_machine_type)), ''), 'generic');
  v_duration_min NUMERIC := GREATEST(COALESCE(p_duration_seconds, 0), 0)::NUMERIC / 60.0;
  v_duration_for_calc NUMERIC := 0;

  v_base_rate NUMERIC := 1.0;
  v_max_multiplier NUMERIC := 1.8;
  v_max_drops_per_minute NUMERIC := 3.0;
  v_spike_ratio_threshold NUMERIC := 1.8;
  v_spike_window_seconds INTEGER := 20;
  v_sustained_window_seconds INTEGER := 60;
  v_sustained_ratio NUMERIC := 0.55;

  v_multiplier NUMERIC := 1.0;
  v_spike_penalty NUMERIC := 1.0;

  v_high_effort_ratio NUMERIC := COALESCE((p_quality_flags ->> 'high_effort_ratio')::NUMERIC, 0.5);
  v_high_effort_seconds NUMERIC := COALESCE((p_quality_flags ->> 'high_effort_seconds')::NUMERIC, 0);
  v_spike_count INTEGER := COALESCE((p_quality_flags ->> 'spike_count')::INTEGER, 0);

  v_generation_cap_hit BOOLEAN := false;
  v_spike_filtered BOOLEAN := false;

  v_raw NUMERIC := 0;
  v_adjusted NUMERIC := 0;

  v_seg1 NUMERIC := 0;
  v_seg2 NUMERIC := 0;
  v_seg3 NUMERIC := 0;
  v_seg4 NUMERIC := 0;
  v_weighted_min NUMERIC := 0;

  v_reason_list JSONB := '[]'::jsonb;
BEGIN
  SELECT *
  INTO v_cfg
  FROM public.drop_model_config dmc
  WHERE dmc.gym_id = p_gym_id OR dmc.gym_id IS NULL
  ORDER BY CASE WHEN dmc.gym_id = p_gym_id THEN 0 ELSE 1 END, dmc.updated_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      0,
      0,
      1.0,
      jsonb_build_object('generation_cap_hit', false, 'spike_filtered', false),
      jsonb_build_array('drop_model_config_missing');
    RETURN;
  END IF;

  v_machine_cfg := COALESCE(v_cfg.machine_base_json -> v_machine_type, v_cfg.machine_base_json -> 'generic', '{}'::jsonb);

  v_base_rate := COALESCE((v_machine_cfg ->> 'baseRatePerMin')::NUMERIC, 1.0);
  v_max_multiplier := COALESCE((v_machine_cfg ->> 'maxMultiplier')::NUMERIC, 1.8);
  v_max_drops_per_minute := COALESCE((v_machine_cfg ->> 'maxDropsPerMinute')::NUMERIC, 3.0);
  v_spike_ratio_threshold := COALESCE((v_machine_cfg ->> 'spikeRatioThreshold')::NUMERIC, 1.8);
  v_spike_window_seconds := COALESCE((v_machine_cfg ->> 'spikeWindowSec')::INTEGER, 20);
  v_sustained_window_seconds := COALESCE((v_machine_cfg ->> 'sustainedWindowSec')::INTEGER, 60);
  v_sustained_ratio := COALESCE((v_machine_cfg ->> 'sustainedHighEffortRatio')::NUMERIC, 0.55);

  IF v_duration_min <= 0 THEN
    RETURN QUERY SELECT
      0,
      0,
      1.0,
      jsonb_build_object('generation_cap_hit', false, 'spike_filtered', false),
      jsonb_build_array('zero_duration');
    RETURN;
  END IF;

  v_duration_for_calc := LEAST(v_duration_min, 240);

  IF v_machine_type = 'bike' THEN
    v_multiplier := CASE
      WHEN COALESCE(p_avg_rpm, 0) >= 95 THEN 1.65
      WHEN COALESCE(p_avg_rpm, 0) >= 85 THEN 1.50
      WHEN COALESCE(p_avg_rpm, 0) >= 75 THEN 1.35
      WHEN COALESCE(p_avg_rpm, 0) >= 60 THEN 1.15
      WHEN COALESCE(p_avg_rpm, 0) >= 45 THEN 1.00
      ELSE 0.85
    END;
  ELSIF v_machine_type = 'treadmill' THEN
    v_multiplier := CASE
      WHEN COALESCE(p_speed_avg_kmh, 0) >= 12 THEN 1.70
      WHEN COALESCE(p_speed_avg_kmh, 0) >= 10 THEN 1.50
      WHEN COALESCE(p_speed_avg_kmh, 0) >= 8 THEN 1.30
      WHEN COALESCE(p_speed_avg_kmh, 0) >= 6 THEN 1.10
      ELSE 0.90
    END;
    v_multiplier := v_multiplier + LEAST(GREATEST(COALESCE(p_incline_avg_pct, 0), 0) * 0.03, 0.35);
  ELSIF v_machine_type IN ('elliptical', 'stepper') THEN
    v_multiplier := CASE
      WHEN COALESCE(COALESCE(p_cadence_avg, p_steps_per_min_avg), 0) >= 90 THEN 1.55
      WHEN COALESCE(COALESCE(p_cadence_avg, p_steps_per_min_avg), 0) >= 75 THEN 1.35
      WHEN COALESCE(COALESCE(p_cadence_avg, p_steps_per_min_avg), 0) >= 60 THEN 1.18
      WHEN COALESCE(COALESCE(p_cadence_avg, p_steps_per_min_avg), 0) >= 45 THEN 1.00
      ELSE 0.85
    END;
    v_multiplier := v_multiplier + LEAST(GREATEST(COALESCE(p_resistance_avg, 0), 0) * 0.02, 0.20);
  ELSE
    v_multiplier := LEAST(v_max_multiplier, 0.9 + (COALESCE(p_calories, 0) / GREATEST(v_duration_for_calc * 20.0, 1.0)));
  END IF;

  IF v_high_effort_ratio < v_sustained_ratio OR v_high_effort_seconds < v_sustained_window_seconds THEN
    v_multiplier := v_multiplier * 0.88;
    v_reason_list := v_reason_list || jsonb_build_array('high_effort_not_sustained');
  END IF;

  IF COALESCE(p_rpm_peak, 0) > COALESCE(p_avg_rpm, 0) * v_spike_ratio_threshold
     AND v_high_effort_seconds < v_sustained_window_seconds THEN
    v_spike_penalty := LEAST(v_spike_penalty, 0.75);
    v_spike_filtered := true;
  END IF;

  IF v_spike_count > 0
     AND v_high_effort_seconds < v_sustained_window_seconds
     AND COALESCE((p_quality_flags ->> 'max_spike_window_seconds')::INTEGER, 0) <= v_spike_window_seconds THEN
    v_spike_penalty := LEAST(v_spike_penalty, 0.82);
    v_spike_filtered := true;
  END IF;

  IF v_spike_filtered THEN
    v_reason_list := v_reason_list || jsonb_build_array('drop_spike_filtered');
  END IF;

  v_multiplier := LEAST(GREATEST(v_multiplier, 0.50), v_max_multiplier);

  v_raw := v_duration_for_calc * v_base_rate * v_multiplier * v_spike_penalty;

  IF v_raw > (v_duration_for_calc * v_max_drops_per_minute) THEN
    v_raw := v_duration_for_calc * v_max_drops_per_minute;
    v_generation_cap_hit := true;
    v_reason_list := v_reason_list || jsonb_build_array('max_drops_per_minute_cap');
  END IF;

  v_seg1 := LEAST(v_duration_for_calc, v_cfg.full_rate_until_min);
  v_seg2 := LEAST(GREATEST(v_duration_for_calc - v_cfg.full_rate_until_min, 0), v_cfg.reduced_rate_until_min - v_cfg.full_rate_until_min);
  v_seg3 := LEAST(GREATEST(v_duration_for_calc - v_cfg.reduced_rate_until_min, 0), v_cfg.low_rate_until_min - v_cfg.reduced_rate_until_min);
  v_seg4 := GREATEST(v_duration_for_calc - v_cfg.low_rate_until_min, 0);

  v_weighted_min := v_seg1 + (v_seg2 * 0.80) + (v_seg3 * 0.60) + (v_seg4 * v_cfg.post_limit_factor);
  v_adjusted := v_raw * COALESCE(v_weighted_min / NULLIF(v_duration_for_calc, 0), 1);

  IF v_duration_for_calc > v_cfg.full_rate_until_min THEN
    v_reason_list := v_reason_list || jsonb_build_array('diminishing_returns_applied');
  END IF;

  RETURN QUERY SELECT
    GREATEST(ROUND(v_raw)::INTEGER, 0),
    GREATEST(ROUND(v_adjusted)::INTEGER, 0),
    ROUND(v_multiplier, 4),
    jsonb_build_object(
      'generation_cap_hit', v_generation_cap_hit,
      'spike_filtered', v_spike_filtered,
      'max_drops_per_minute', v_max_drops_per_minute,
      'duration_minutes_for_calc', ROUND(v_duration_for_calc, 3),
      'weighted_minutes', ROUND(v_weighted_min, 3),
      'segments', jsonb_build_object(
        'full_rate_minutes', ROUND(v_seg1, 3),
        'reduced_rate_minutes', ROUND(v_seg2, 3),
        'low_rate_minutes', ROUND(v_seg3, 3),
        'post_limit_minutes', ROUND(v_seg4, 3)
      )
    ),
    v_reason_list;
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
    SELECT current_user_id, is_busy, LOWER(type)
    INTO v_machine_owner, v_machine_busy, v_machine_type
    FROM public.machines
    WHERE id = v_session.machine_id
    FOR UPDATE;

    IF NOT FOUND OR v_machine_owner IS DISTINCT FROM v_session.user_id OR COALESCE(v_machine_busy, false) = false THEN
      PERFORM public.log_fraud_event(v_session.user_id, v_session.gym_id, 'award_drops_without_valid_lock', 'high',
        jsonb_build_object('session_id', p_session_id, 'machine_id', v_session.machine_id, 'machine_owner', v_machine_owner, 'machine_busy', v_machine_busy));
      RAISE EXCEPTION 'Machine lock ownership invalid for rewarding';
    END IF;
  END IF;

  v_machine_type := COALESCE(v_machine_type, 'generic');

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = v_session.user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for user: %', v_session.user_id;
  END IF;

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

  v_max_session := COALESCE(v_max_session, 120);
  v_max_daily := COALESCE(v_max_daily, 300);
  v_max_weekly := COALESCE(v_max_weekly, 1500);
  v_max_sessions_day := COALESCE(v_max_sessions_day, 4);

  v_duration_sec := COALESCE(v_session.duration_seconds, 0);
  v_capped_sec := LEAST(GREATEST(v_duration_sec, 0), 10800);

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
