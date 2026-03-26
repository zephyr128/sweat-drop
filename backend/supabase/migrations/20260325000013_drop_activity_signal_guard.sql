-- Migration: 20260325000013_drop_activity_signal_guard.sql
-- Description: Block drops when movement telemetry indicates idle machine usage.

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

  -- Activity signal guard: if machine telemetry indicates idle usage, mint 0 drops.
  IF v_machine_type = 'bike' AND COALESCE(p_avg_rpm, 0) < 10 THEN
    RETURN QUERY SELECT
      0,
      0,
      0.0,
      jsonb_build_object('generation_cap_hit', false, 'spike_filtered', false, 'activity_guard', true),
      jsonb_build_array('insufficient_activity_signal_bike');
    RETURN;
  END IF;

  IF v_machine_type = 'treadmill' AND COALESCE(p_speed_avg_kmh, 0) < 1 THEN
    RETURN QUERY SELECT
      0,
      0,
      0.0,
      jsonb_build_object('generation_cap_hit', false, 'spike_filtered', false, 'activity_guard', true),
      jsonb_build_array('insufficient_activity_signal_treadmill');
    RETURN;
  END IF;

  IF v_machine_type IN ('elliptical', 'stepper')
     AND COALESCE(COALESCE(p_cadence_avg, p_steps_per_min_avg), 0) < 10 THEN
    RETURN QUERY SELECT
      0,
      0,
      0.0,
      jsonb_build_object('generation_cap_hit', false, 'spike_filtered', false, 'activity_guard', true),
      jsonb_build_array('insufficient_activity_signal_cadence');
    RETURN;
  END IF;

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
