-- Migration: 20260325000008_preview_drop_calculation_rpc.sql
-- Description: Add admin economy RPC preview_drop_calculation backed by drop_model_config.

CREATE OR REPLACE FUNCTION public.preview_drop_calculation(
  p_gym_id UUID,
  p_machine_type TEXT,
  p_duration_min INTEGER,
  p_avg_rpm NUMERIC DEFAULT NULL,
  p_avg_speed_kmh NUMERIC DEFAULT NULL,
  p_incline_pct NUMERIC DEFAULT NULL,
  p_cadence_per_min NUMERIC DEFAULT NULL,
  p_calories_fallback NUMERIC DEFAULT NULL,
  p_simulate_spikes BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_role TEXT;
  v_admin_gym UUID;
  v_is_authorized BOOLEAN := false;

  v_cfg RECORD;
  v_machine_type TEXT := COALESCE(NULLIF(TRIM(LOWER(p_machine_type)), ''), 'generic');
  v_machine_cfg JSONB := '{}'::jsonb;

  v_duration NUMERIC := GREATEST(COALESCE(p_duration_min, 0), 0);
  v_base_rate NUMERIC := 1.0;
  v_max_multiplier NUMERIC := 1.8;
  v_max_drops_per_minute NUMERIC := 3.0;
  v_spike_ratio_threshold NUMERIC := 1.8;
  v_sustained_ratio NUMERIC := 0.55;

  v_multiplier NUMERIC := 1.0;
  v_spike_penalty NUMERIC := 1.0;
  v_raw NUMERIC := 0;
  v_adjusted NUMERIC := 0;
  v_final NUMERIC := 0;
  v_session_cap INTEGER := 120;
  v_applied_cap TEXT := 'none';

  v_seg1 NUMERIC := 0;
  v_seg2 NUMERIC := 0;
  v_seg3 NUMERIC := 0;
  v_seg4 NUMERIC := 0;
  v_weighted_min NUMERIC := 0;

  v_explanation TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT p.role, p.admin_gym_id
  INTO v_role, v_admin_gym
  FROM public.profiles p
  WHERE p.id = v_actor;

  IF v_role = 'superadmin' THEN
    v_is_authorized := true;
  ELSIF v_role = 'gym_owner' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.gyms g
      WHERE g.id = p_gym_id AND g.owner_id = v_actor
    ) INTO v_is_authorized;
  ELSIF v_role = 'gym_admin' THEN
    v_is_authorized := (v_admin_gym = p_gym_id);
  END IF;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_duration <= 0 THEN
    RETURN jsonb_build_object(
      'expectedRawDrops', 0,
      'adjustedDrops', 0,
      'reducedByDiminishing', 0,
      'appliedCap', 'none',
      'finalDrops', 0,
      'explanation', to_jsonb(ARRAY['invalid_duration']::TEXT[])
    );
  END IF;

  SELECT *
  INTO v_cfg
  FROM public.drop_model_config dmc
  WHERE dmc.gym_id = p_gym_id OR dmc.gym_id IS NULL
  ORDER BY CASE WHEN dmc.gym_id = p_gym_id THEN 0 ELSE 1 END, dmc.updated_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'expectedRawDrops', 0,
      'adjustedDrops', 0,
      'reducedByDiminishing', 0,
      'appliedCap', 'none',
      'finalDrops', 0,
      'explanation', to_jsonb(ARRAY['drop_model_config_missing']::TEXT[])
    );
  END IF;

  v_machine_cfg := COALESCE(v_cfg.machine_base_json -> v_machine_type, v_cfg.machine_base_json -> 'generic', '{}'::jsonb);

  v_base_rate := COALESCE((v_machine_cfg ->> 'baseRatePerMin')::NUMERIC, 1.0);
  v_max_multiplier := COALESCE((v_machine_cfg ->> 'maxMultiplier')::NUMERIC, 1.8);
  v_max_drops_per_minute := COALESCE((v_machine_cfg ->> 'maxDropsPerMinute')::NUMERIC, 3.0);
  v_spike_ratio_threshold := COALESCE((v_machine_cfg ->> 'spikeRatioThreshold')::NUMERIC, 1.8);
  v_sustained_ratio := COALESCE((v_machine_cfg ->> 'sustainedHighEffortRatio')::NUMERIC, 0.55);

  IF v_machine_type = 'bike' THEN
    v_multiplier := CASE
      WHEN COALESCE(p_avg_rpm, 0) >= 95 THEN 1.65
      WHEN COALESCE(p_avg_rpm, 0) >= 85 THEN 1.50
      WHEN COALESCE(p_avg_rpm, 0) >= 75 THEN 1.35
      WHEN COALESCE(p_avg_rpm, 0) >= 60 THEN 1.15
      WHEN COALESCE(p_avg_rpm, 0) >= 45 THEN 1.00
      ELSE 0.85
    END;
    v_explanation := v_explanation || ARRAY['bike_rpm_intensity_applied'];
  ELSIF v_machine_type = 'treadmill' THEN
    v_multiplier := CASE
      WHEN COALESCE(p_avg_speed_kmh, 0) >= 12 THEN 1.70
      WHEN COALESCE(p_avg_speed_kmh, 0) >= 10 THEN 1.50
      WHEN COALESCE(p_avg_speed_kmh, 0) >= 8 THEN 1.30
      WHEN COALESCE(p_avg_speed_kmh, 0) >= 6 THEN 1.10
      ELSE 0.90
    END;
    v_multiplier := v_multiplier + LEAST(GREATEST(COALESCE(p_incline_pct, 0), 0) * 0.03, 0.35);
    v_explanation := v_explanation || ARRAY['treadmill_speed_incline_intensity_applied'];
  ELSIF v_machine_type IN ('elliptical', 'stepper') THEN
    v_multiplier := CASE
      WHEN COALESCE(p_cadence_per_min, 0) >= 90 THEN 1.55
      WHEN COALESCE(p_cadence_per_min, 0) >= 75 THEN 1.35
      WHEN COALESCE(p_cadence_per_min, 0) >= 60 THEN 1.18
      WHEN COALESCE(p_cadence_per_min, 0) >= 45 THEN 1.00
      ELSE 0.85
    END;
    v_explanation := v_explanation || ARRAY['cadence_intensity_applied'];
  ELSE
    v_multiplier := LEAST(v_max_multiplier, 0.9 + (COALESCE(p_calories_fallback, 0) / GREATEST(v_duration * 10.0, 1.0)));
    v_explanation := v_explanation || ARRAY['generic_fallback_intensity_applied'];
  END IF;

  IF p_simulate_spikes THEN
    v_spike_penalty := 0.75;
    v_explanation := v_explanation || ARRAY['spike_simulation_penalty_applied'];
  END IF;

  IF v_multiplier < v_sustained_ratio + 0.2 THEN
    v_multiplier := v_multiplier * 0.9;
    v_explanation := v_explanation || ARRAY['sustained_effort_guard_applied'];
  END IF;

  v_multiplier := LEAST(GREATEST(v_multiplier, 0.5), v_max_multiplier);

  v_raw := v_duration * v_base_rate * v_multiplier * v_spike_penalty;
  v_raw := LEAST(v_raw, v_duration * v_max_drops_per_minute);

  v_seg1 := LEAST(v_duration, v_cfg.full_rate_until_min);
  v_seg2 := LEAST(GREATEST(v_duration - v_cfg.full_rate_until_min, 0), v_cfg.reduced_rate_until_min - v_cfg.full_rate_until_min);
  v_seg3 := LEAST(GREATEST(v_duration - v_cfg.reduced_rate_until_min, 0), v_cfg.low_rate_until_min - v_cfg.reduced_rate_until_min);
  v_seg4 := GREATEST(v_duration - v_cfg.low_rate_until_min, 0);

  v_weighted_min := v_seg1 + (v_seg2 * 0.80) + (v_seg3 * 0.60) + (v_seg4 * v_cfg.post_limit_factor);
  v_adjusted := v_raw * COALESCE(v_weighted_min / NULLIF(v_duration, 0), 1);

  IF v_duration > v_cfg.full_rate_until_min THEN
    v_explanation := v_explanation || ARRAY['diminishing_returns_applied'];
  END IF;

  SELECT tc.max_drops_per_session
  INTO v_session_cap
  FROM public.tokenomics_config tc
  WHERE tc.gym_id = p_gym_id OR tc.gym_id IS NULL
  ORDER BY CASE WHEN tc.gym_id = p_gym_id THEN 0 ELSE 1 END
  LIMIT 1;

  v_session_cap := COALESCE(v_session_cap, 120);
  v_final := v_adjusted;

  IF v_final > v_session_cap THEN
    v_final := v_session_cap;
    v_applied_cap := 'session_cap';
    v_explanation := v_explanation || ARRAY['session_cap_applied'];
  END IF;

  IF v_final < 0 THEN
    v_final := 0;
  END IF;

  RETURN jsonb_build_object(
    'expectedRawDrops', ROUND(v_raw)::INT,
    'adjustedDrops', ROUND(v_adjusted)::INT,
    'reducedByDiminishing', GREATEST(ROUND(v_raw - v_adjusted)::INT, 0),
    'appliedCap', v_applied_cap,
    'finalDrops', ROUND(v_final)::INT,
    'explanation', to_jsonb(v_explanation)
  );
EXCEPTION
  WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RETURN jsonb_build_object(
      'expectedRawDrops', 0,
      'adjustedDrops', 0,
      'reducedByDiminishing', 0,
      'appliedCap', 'none',
      'finalDrops', 0,
      'explanation', to_jsonb(ARRAY['invalid_numeric_input']::TEXT[])
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.preview_drop_calculation(UUID, TEXT, INTEGER, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, BOOLEAN) TO authenticated;
