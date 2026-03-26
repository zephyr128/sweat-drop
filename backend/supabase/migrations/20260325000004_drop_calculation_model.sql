-- Migration: 20260325000004_drop_calculation_model.sql
-- Description: Drops Calculation v2 model config + calculator function.

-- NOTE:
-- Requested filename 20260324000012_drop_calculation_model.sql is already taken in this repo.
-- This migration uses the next available timestamped filename.

CREATE TABLE IF NOT EXISTS public.drop_model_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  machine_type TEXT NOT NULL CHECK (machine_type IN ('treadmill', 'bike', 'elliptical', 'stepper', 'generic')),
  base_rate_per_min NUMERIC(8,4) NOT NULL DEFAULT 1.2000 CHECK (base_rate_per_min > 0 AND base_rate_per_min <= 20),
  max_multiplier NUMERIC(8,4) NOT NULL DEFAULT 2.0000 CHECK (max_multiplier >= 1 AND max_multiplier <= 5),
  max_drops_per_minute NUMERIC(8,4) NOT NULL DEFAULT 3.5000 CHECK (max_drops_per_minute > 0 AND max_drops_per_minute <= 30),

  spike_ratio_threshold NUMERIC(8,4) NOT NULL DEFAULT 1.8000 CHECK (spike_ratio_threshold >= 1.05 AND spike_ratio_threshold <= 10),
  spike_window_seconds INTEGER NOT NULL DEFAULT 20 CHECK (spike_window_seconds BETWEEN 5 AND 300),
  sustained_window_seconds INTEGER NOT NULL DEFAULT 60 CHECK (sustained_window_seconds BETWEEN 15 AND 1200),
  sustained_high_effort_ratio NUMERIC(8,4) NOT NULL DEFAULT 0.5500 CHECK (sustained_high_effort_ratio > 0 AND sustained_high_effort_ratio <= 1),

  full_rate_until_min INTEGER NOT NULL DEFAULT 45 CHECK (full_rate_until_min BETWEEN 15 AND 180),
  reduced_rate_until_min INTEGER NOT NULL DEFAULT 90 CHECK (reduced_rate_until_min BETWEEN 30 AND 240),
  low_rate_until_min INTEGER NOT NULL DEFAULT 120 CHECK (low_rate_until_min BETWEEN 45 AND 360),
  post_limit_rate NUMERIC(8,4) NOT NULL DEFAULT 0.4000 CHECK (post_limit_rate > 0 AND post_limit_rate <= 1),

  max_drops_per_session INTEGER NOT NULL DEFAULT 120 CHECK (max_drops_per_session >= 0 AND max_drops_per_session <= 5000),
  max_drops_per_day INTEGER NOT NULL DEFAULT 300 CHECK (max_drops_per_day >= 0 AND max_drops_per_day <= 20000),
  max_drops_per_week INTEGER NOT NULL DEFAULT 1500 CHECK (max_drops_per_week >= 0 AND max_drops_per_week <= 100000),
  max_rewarded_sessions_per_day INTEGER NOT NULL DEFAULT 4 CHECK (max_rewarded_sessions_per_day >= 0 AND max_rewarded_sessions_per_day <= 100),

  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT drop_model_config_diminish_order CHECK (
    full_rate_until_min < reduced_rate_until_min
    AND reduced_rate_until_min < low_rate_until_min
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_drop_model_config_gym_machine
  ON public.drop_model_config(gym_id, machine_type);

CREATE UNIQUE INDEX IF NOT EXISTS uq_drop_model_config_global_machine
  ON public.drop_model_config(machine_type)
  WHERE gym_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_drop_model_config_lookup
  ON public.drop_model_config(gym_id, machine_type, is_active);

ALTER TABLE public.drop_model_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "drop_model_config_select_policy" ON public.drop_model_config;
DROP POLICY IF EXISTS "drop_model_config_write_policy" ON public.drop_model_config;

CREATE POLICY "drop_model_config_select_policy"
ON public.drop_model_config
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role = 'superadmin'
        OR (p.role = 'gym_owner' AND (
          drop_model_config.gym_id IS NULL
          OR drop_model_config.gym_id IN (SELECT g.id FROM public.gyms g WHERE g.owner_id = auth.uid())
        ))
        OR (p.role = 'gym_admin' AND (
          drop_model_config.gym_id IS NULL OR p.admin_gym_id = drop_model_config.gym_id
        ))
      )
  )
);

CREATE POLICY "drop_model_config_write_policy"
ON public.drop_model_config
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role = 'superadmin'
        OR (p.role = 'gym_owner' AND drop_model_config.gym_id IN (
          SELECT g.id FROM public.gyms g WHERE g.owner_id = auth.uid()
        ))
        OR (p.role = 'gym_admin' AND p.admin_gym_id = drop_model_config.gym_id)
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role = 'superadmin'
        OR (p.role = 'gym_owner' AND drop_model_config.gym_id IN (
          SELECT g.id FROM public.gyms g WHERE g.owner_id = auth.uid()
        ))
        OR (p.role = 'gym_admin' AND p.admin_gym_id = drop_model_config.gym_id)
      )
  )
);

INSERT INTO public.drop_model_config (
  gym_id,
  machine_type,
  base_rate_per_min,
  max_multiplier,
  max_drops_per_minute,
  spike_ratio_threshold,
  spike_window_seconds,
  sustained_window_seconds,
  sustained_high_effort_ratio,
  full_rate_until_min,
  reduced_rate_until_min,
  low_rate_until_min,
  post_limit_rate,
  max_drops_per_session,
  max_drops_per_day,
  max_drops_per_week,
  max_rewarded_sessions_per_day,
  is_active
)
VALUES
  (NULL, 'bike', 1.20, 2.00, 3.60, 1.80, 20, 60, 0.55, 45, 90, 120, 0.40, 120, 300, 1500, 4, true),
  (NULL, 'treadmill', 1.30, 2.20, 4.20, 1.70, 20, 60, 0.55, 45, 90, 120, 0.40, 130, 320, 1600, 4, true),
  (NULL, 'elliptical', 1.15, 1.90, 3.40, 1.80, 20, 60, 0.55, 45, 90, 120, 0.40, 115, 290, 1450, 4, true),
  (NULL, 'stepper', 1.10, 1.90, 3.20, 1.80, 20, 60, 0.55, 45, 90, 120, 0.40, 110, 280, 1400, 4, true),
  (NULL, 'generic', 1.00, 1.80, 3.00, 1.90, 20, 60, 0.55, 45, 90, 120, 0.40, 100, 260, 1300, 4, true)
ON CONFLICT (machine_type) WHERE gym_id IS NULL
DO UPDATE SET
  base_rate_per_min = EXCLUDED.base_rate_per_min,
  max_multiplier = EXCLUDED.max_multiplier,
  max_drops_per_minute = EXCLUDED.max_drops_per_minute,
  spike_ratio_threshold = EXCLUDED.spike_ratio_threshold,
  spike_window_seconds = EXCLUDED.spike_window_seconds,
  sustained_window_seconds = EXCLUDED.sustained_window_seconds,
  sustained_high_effort_ratio = EXCLUDED.sustained_high_effort_ratio,
  full_rate_until_min = EXCLUDED.full_rate_until_min,
  reduced_rate_until_min = EXCLUDED.reduced_rate_until_min,
  low_rate_until_min = EXCLUDED.low_rate_until_min,
  post_limit_rate = EXCLUDED.post_limit_rate,
  max_drops_per_session = EXCLUDED.max_drops_per_session,
  max_drops_per_day = EXCLUDED.max_drops_per_day,
  max_drops_per_week = EXCLUDED.max_drops_per_week,
  max_rewarded_sessions_per_day = EXCLUDED.max_rewarded_sessions_per_day,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

ALTER TABLE public.tokenomics_config
  ADD COLUMN IF NOT EXISTS use_drop_model_v2 BOOLEAN NOT NULL DEFAULT true;

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
  v_machine_type TEXT := COALESCE(NULLIF(TRIM(LOWER(p_machine_type)), ''), 'generic');
  v_duration_min NUMERIC := GREATEST(COALESCE(p_duration_seconds, 0), 0)::NUMERIC / 60.0;
  v_duration_for_calc NUMERIC := 0;
  v_multiplier NUMERIC := 1.0;
  v_spike_penalty NUMERIC := 1.0;
  v_high_effort_ratio NUMERIC := COALESCE((p_quality_flags ->> 'high_effort_ratio')::NUMERIC, 0.5);
  v_high_effort_seconds NUMERIC := COALESCE((p_quality_flags ->> 'high_effort_seconds')::NUMERIC, 0);
  v_spike_count INTEGER := COALESCE((p_quality_flags ->> 'spike_count')::INTEGER, 0);
  v_generation_cap_hit BOOLEAN := false;
  v_spike_filtered BOOLEAN := false;
  v_raw NUMERIC := 0;
  v_adjusted NUMERIC := 0;
  v_weighted_min NUMERIC := 0;
  v_seg1 NUMERIC := 0;
  v_seg2 NUMERIC := 0;
  v_seg3 NUMERIC := 0;
  v_seg4 NUMERIC := 0;
  v_base_from_cal NUMERIC := 0;
  v_reason_list JSONB := '[]'::jsonb;
BEGIN
  SELECT *
  INTO v_cfg
  FROM public.drop_model_config dmc
  WHERE dmc.is_active = true
    AND (dmc.machine_type = v_machine_type OR dmc.machine_type = 'generic')
    AND (dmc.gym_id = p_gym_id OR dmc.gym_id IS NULL)
  ORDER BY
    CASE WHEN dmc.gym_id = p_gym_id THEN 0 ELSE 1 END,
    CASE WHEN dmc.machine_type = v_machine_type THEN 0 ELSE 1 END,
    dmc.updated_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT *
    INTO v_cfg
    FROM public.drop_model_config dmc
    WHERE dmc.gym_id IS NULL
      AND dmc.machine_type = 'generic'
      AND dmc.is_active = true
    ORDER BY dmc.updated_at DESC
    LIMIT 1;
  END IF;

  IF v_duration_min <= 0 THEN
    RETURN QUERY SELECT 0, 0, 1.0,
      jsonb_build_object('generation_cap_hit', false, 'spike_filtered', false),
      jsonb_build_array('zero_duration');
    RETURN;
  END IF;

  v_duration_for_calc := LEAST(v_duration_min, 240); -- hard upper bound for anti-abuse

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
    v_base_from_cal := GREATEST(COALESCE(p_calories, 0), v_duration_for_calc * 5.5);
    v_multiplier := LEAST(1.20, 0.90 + (v_base_from_cal / NULLIF(v_duration_for_calc * 20.0, 0)));
  END IF;

  -- Sustained effort requirement.
  IF v_high_effort_ratio < v_cfg.sustained_high_effort_ratio
     OR v_high_effort_seconds < v_cfg.sustained_window_seconds THEN
    v_multiplier := v_multiplier * 0.88;
    v_reason_list := v_reason_list || jsonb_build_array('high_effort_not_sustained');
  END IF;

  -- Anti-spike filtering.
  IF COALESCE(p_rpm_peak, 0) > COALESCE(p_avg_rpm, 0) * v_cfg.spike_ratio_threshold
     AND v_high_effort_seconds < v_cfg.sustained_window_seconds THEN
    v_spike_penalty := LEAST(v_spike_penalty, 0.75);
    v_spike_filtered := true;
  END IF;

  IF v_spike_count > 0
     AND v_high_effort_seconds < v_cfg.sustained_window_seconds
     AND COALESCE((p_quality_flags ->> 'max_spike_window_seconds')::INTEGER, 0) <= v_cfg.spike_window_seconds THEN
    v_spike_penalty := LEAST(v_spike_penalty, 0.82);
    v_spike_filtered := true;
  END IF;

  IF v_spike_filtered THEN
    v_reason_list := v_reason_list || jsonb_build_array('drop_spike_filtered');
  END IF;

  v_multiplier := LEAST(GREATEST(v_multiplier, 0.50), v_cfg.max_multiplier);

  v_raw := v_duration_for_calc * v_cfg.base_rate_per_min * v_multiplier * v_spike_penalty;

  IF v_raw > (v_duration_for_calc * v_cfg.max_drops_per_minute) THEN
    v_raw := v_duration_for_calc * v_cfg.max_drops_per_minute;
    v_generation_cap_hit := true;
    v_reason_list := v_reason_list || jsonb_build_array('max_drops_per_minute_cap');
  END IF;

  -- Diminishing returns for long sessions.
  v_seg1 := LEAST(v_duration_for_calc, v_cfg.full_rate_until_min);
  v_seg2 := LEAST(GREATEST(v_duration_for_calc - v_cfg.full_rate_until_min, 0), v_cfg.reduced_rate_until_min - v_cfg.full_rate_until_min);
  v_seg3 := LEAST(GREATEST(v_duration_for_calc - v_cfg.reduced_rate_until_min, 0), v_cfg.low_rate_until_min - v_cfg.reduced_rate_until_min);
  v_seg4 := GREATEST(v_duration_for_calc - v_cfg.low_rate_until_min, 0);

  v_weighted_min := v_seg1 + (v_seg2 * 0.80) + (v_seg3 * 0.60) + (v_seg4 * v_cfg.post_limit_rate);
  v_adjusted := v_raw * COALESCE(v_weighted_min / NULLIF(v_duration_for_calc, 0), 1);

  IF v_duration_for_calc > v_cfg.full_rate_until_min THEN
    v_reason_list := v_reason_list || jsonb_build_array('diminishing_returns_applied');
  END IF;

  RETURN QUERY
  SELECT
    GREATEST(ROUND(v_raw)::INTEGER, 0),
    GREATEST(ROUND(v_adjusted)::INTEGER, 0),
    ROUND(v_multiplier, 4),
    jsonb_build_object(
      'generation_cap_hit', v_generation_cap_hit,
      'spike_filtered', v_spike_filtered,
      'max_drops_per_minute', v_cfg.max_drops_per_minute,
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
