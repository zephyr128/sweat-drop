-- Migration: 20260325000007_admin_drop_model_config_contract.sql
-- Description: Create admin-facing drop_model_config contract table with persistent machine JSON config.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'drop_model_config'
      AND column_name = 'machine_type'
  ) THEN
    ALTER TABLE public.drop_model_config RENAME TO drop_model_config_legacy;
  END IF;
EXCEPTION WHEN duplicate_table THEN
  NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.drop_model_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  full_rate_until_min INTEGER NOT NULL DEFAULT 45,
  reduced_rate_until_min INTEGER NOT NULL DEFAULT 90,
  low_rate_until_min INTEGER NOT NULL DEFAULT 120,
  post_limit_factor NUMERIC(4,3) NOT NULL DEFAULT 0.4,
  machine_base_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT drop_model_config_full_rate_positive CHECK (full_rate_until_min > 0),
  CONSTRAINT drop_model_config_threshold_order CHECK (
    full_rate_until_min <= reduced_rate_until_min
    AND reduced_rate_until_min <= low_rate_until_min
  ),
  CONSTRAINT drop_model_config_post_limit_factor_bounds CHECK (
    post_limit_factor >= 0 AND post_limit_factor <= 1
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_drop_model_config_per_gym
  ON public.drop_model_config(gym_id)
  WHERE gym_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_drop_model_config_global_singleton
  ON public.drop_model_config((1))
  WHERE gym_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_drop_model_config_updated
  ON public.drop_model_config(updated_at DESC);

-- Seed from legacy model if available; otherwise fallback to launch defaults.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'drop_model_config_legacy'
  ) THEN
    INSERT INTO public.drop_model_config (
      gym_id,
      full_rate_until_min,
      reduced_rate_until_min,
      low_rate_until_min,
      post_limit_factor,
      machine_base_json,
      enabled_at,
      updated_at
    )
    SELECT
      l.gym_id,
      COALESCE(MAX(l.full_rate_until_min), 45),
      COALESCE(MAX(l.reduced_rate_until_min), 90),
      COALESCE(MAX(l.low_rate_until_min), 120),
      COALESCE(MAX(l.post_limit_rate), 0.4),
      COALESCE(
        jsonb_object_agg(
          l.machine_type,
          jsonb_build_object(
            'baseRatePerMin', l.base_rate_per_min,
            'maxMultiplier', l.max_multiplier,
            'maxDropsPerMinute', l.max_drops_per_minute,
            'spikeRatioThreshold', l.spike_ratio_threshold,
            'spikeWindowSec', l.spike_window_seconds,
            'sustainedWindowSec', l.sustained_window_seconds,
            'sustainedHighEffortRatio', l.sustained_high_effort_ratio
          )
        ),
        '{}'::jsonb
      ),
      COALESCE(MIN(l.created_at), NOW()),
      NOW()
    FROM public.drop_model_config_legacy l
    WHERE COALESCE(l.is_active, true) = true
    GROUP BY l.gym_id
    ON CONFLICT (gym_id) WHERE gym_id IS NOT NULL
    DO UPDATE SET
      full_rate_until_min = EXCLUDED.full_rate_until_min,
      reduced_rate_until_min = EXCLUDED.reduced_rate_until_min,
      low_rate_until_min = EXCLUDED.low_rate_until_min,
      post_limit_factor = EXCLUDED.post_limit_factor,
      machine_base_json = EXCLUDED.machine_base_json,
      updated_at = NOW();

    INSERT INTO public.drop_model_config (
      gym_id,
      full_rate_until_min,
      reduced_rate_until_min,
      low_rate_until_min,
      post_limit_factor,
      machine_base_json,
      enabled_at,
      updated_at
    )
    SELECT
      NULL,
      45,
      90,
      120,
      0.4,
      jsonb_build_object(
        'treadmill', jsonb_build_object('baseRatePerMin', 1.30, 'maxMultiplier', 2.20, 'maxDropsPerMinute', 4.20, 'spikeRatioThreshold', 1.70, 'spikeWindowSec', 20, 'sustainedWindowSec', 60, 'sustainedHighEffortRatio', 0.55),
        'bike', jsonb_build_object('baseRatePerMin', 1.20, 'maxMultiplier', 2.00, 'maxDropsPerMinute', 3.60, 'spikeRatioThreshold', 1.80, 'spikeWindowSec', 20, 'sustainedWindowSec', 60, 'sustainedHighEffortRatio', 0.55),
        'elliptical', jsonb_build_object('baseRatePerMin', 1.15, 'maxMultiplier', 1.90, 'maxDropsPerMinute', 3.40, 'spikeRatioThreshold', 1.80, 'spikeWindowSec', 20, 'sustainedWindowSec', 60, 'sustainedHighEffortRatio', 0.55),
        'stepper', jsonb_build_object('baseRatePerMin', 1.10, 'maxMultiplier', 1.90, 'maxDropsPerMinute', 3.20, 'spikeRatioThreshold', 1.80, 'spikeWindowSec', 20, 'sustainedWindowSec', 60, 'sustainedHighEffortRatio', 0.55),
        'generic', jsonb_build_object('baseRatePerMin', 1.00, 'maxMultiplier', 1.80, 'maxDropsPerMinute', 3.00, 'spikeRatioThreshold', 1.90, 'spikeWindowSec', 20, 'sustainedWindowSec', 60, 'sustainedHighEffortRatio', 0.55)
      ),
      NOW(),
      NOW()
    WHERE NOT EXISTS (SELECT 1 FROM public.drop_model_config WHERE gym_id IS NULL);
  ELSE
    INSERT INTO public.drop_model_config (
      gym_id,
      full_rate_until_min,
      reduced_rate_until_min,
      low_rate_until_min,
      post_limit_factor,
      machine_base_json,
      enabled_at,
      updated_at
    )
    SELECT
      NULL,
      45,
      90,
      120,
      0.4,
      jsonb_build_object(
        'treadmill', jsonb_build_object('baseRatePerMin', 1.30, 'maxMultiplier', 2.20, 'maxDropsPerMinute', 4.20, 'spikeRatioThreshold', 1.70, 'spikeWindowSec', 20, 'sustainedWindowSec', 60, 'sustainedHighEffortRatio', 0.55),
        'bike', jsonb_build_object('baseRatePerMin', 1.20, 'maxMultiplier', 2.00, 'maxDropsPerMinute', 3.60, 'spikeRatioThreshold', 1.80, 'spikeWindowSec', 20, 'sustainedWindowSec', 60, 'sustainedHighEffortRatio', 0.55),
        'elliptical', jsonb_build_object('baseRatePerMin', 1.15, 'maxMultiplier', 1.90, 'maxDropsPerMinute', 3.40, 'spikeRatioThreshold', 1.80, 'spikeWindowSec', 20, 'sustainedWindowSec', 60, 'sustainedHighEffortRatio', 0.55),
        'stepper', jsonb_build_object('baseRatePerMin', 1.10, 'maxMultiplier', 1.90, 'maxDropsPerMinute', 3.20, 'spikeRatioThreshold', 1.80, 'spikeWindowSec', 20, 'sustainedWindowSec', 60, 'sustainedHighEffortRatio', 0.55),
        'generic', jsonb_build_object('baseRatePerMin', 1.00, 'maxMultiplier', 1.80, 'maxDropsPerMinute', 3.00, 'spikeRatioThreshold', 1.90, 'spikeWindowSec', 20, 'sustainedWindowSec', 60, 'sustainedHighEffortRatio', 0.55)
      ),
      NOW(),
      NOW()
    WHERE NOT EXISTS (SELECT 1 FROM public.drop_model_config WHERE gym_id IS NULL);
  END IF;
END $$;

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
