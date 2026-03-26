-- Migration: 20260325000015_add_economy_currency_calibration.sql
-- Description: Add RSD calibration to tokenomics_config, discount pricing model
--   to rewards, and compute_reward_price_drops helper function.
--
-- CHANGES:
--   - tokenomics_config: +drops_per_rsd, +currency_code, +calibration_version, +calibration_meta
--   - rewards: +base_price_rsd, +discount_percent, +price_calc_mode,
--              +final_price_rsd_snapshot, +drops_per_rsd_snapshot
--   - New function: compute_reward_price_drops(uuid, numeric, numeric)
--   - New trigger: trg_rewards_discount_price_sync (auto-recompute on discount mode changes)
--
-- IMPACT ON FRONTEND:
--   - Admin Panel: economy config now persists drops_per_rsd + currency_code.
--     Reward create/edit in discount mode should send base_price_rsd + discount_percent;
--     trigger auto-populates price_drops + snapshots.
--   - Mobile App: no immediate changes needed. price_drops remains the redemption field.
--
-- BREAKING CHANGES: None. Existing rewards stay price_calc_mode='manual_drops'.

-- ============================================================================
-- 1. tokenomics_config — calibration fields
-- ============================================================================

ALTER TABLE public.tokenomics_config
  ADD COLUMN IF NOT EXISTS drops_per_rsd NUMERIC(10,4) NOT NULL DEFAULT 2.0000;

ALTER TABLE public.tokenomics_config
  ADD COLUMN IF NOT EXISTS currency_code TEXT NOT NULL DEFAULT 'RSD';

ALTER TABLE public.tokenomics_config
  ADD COLUMN IF NOT EXISTS calibration_version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.tokenomics_config
  ADD COLUMN IF NOT EXISTS calibration_meta JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'tokenomics_config'
      AND constraint_name = 'chk_drops_per_rsd_range'
  ) THEN
    ALTER TABLE public.tokenomics_config
      ADD CONSTRAINT chk_drops_per_rsd_range
      CHECK (drops_per_rsd > 0.05 AND drops_per_rsd < 1000);
  END IF;
END $$;

-- Backfill: existing rows get safe baseline 2.0
UPDATE public.tokenomics_config
SET drops_per_rsd = 2.0000
WHERE drops_per_rsd IS DISTINCT FROM 2.0000
  AND drops_per_rsd = 2.0000; -- no-op guard; column just added with default

-- ============================================================================
-- 2. rewards — discount pricing model fields
-- ============================================================================

ALTER TABLE public.rewards
  ADD COLUMN IF NOT EXISTS base_price_rsd NUMERIC(10,2) NULL;

ALTER TABLE public.rewards
  ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'rewards'
      AND constraint_name = 'chk_discount_percent_range'
  ) THEN
    ALTER TABLE public.rewards
      ADD CONSTRAINT chk_discount_percent_range
      CHECK (discount_percent >= 0 AND discount_percent <= 95);
  END IF;
END $$;

ALTER TABLE public.rewards
  ADD COLUMN IF NOT EXISTS price_calc_mode TEXT NOT NULL DEFAULT 'manual_drops';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'rewards'
      AND constraint_name = 'chk_price_calc_mode'
  ) THEN
    ALTER TABLE public.rewards
      ADD CONSTRAINT chk_price_calc_mode
      CHECK (price_calc_mode IN ('manual_drops', 'discount_from_rsd'));
  END IF;
END $$;

ALTER TABLE public.rewards
  ADD COLUMN IF NOT EXISTS final_price_rsd_snapshot NUMERIC(10,2) NULL;

ALTER TABLE public.rewards
  ADD COLUMN IF NOT EXISTS drops_per_rsd_snapshot NUMERIC(10,4) NULL;

-- ============================================================================
-- 3. compute_reward_price_drops — helper function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.compute_reward_price_drops(
  p_gym_id UUID,
  p_base_price_rsd NUMERIC,
  p_discount_percent NUMERIC
)
RETURNS TABLE (
  effective_rsd NUMERIC,
  effective_drops INTEGER,
  drops_per_rsd NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_drops_per_rsd NUMERIC;
  v_effective_rsd NUMERIC;
  v_effective_drops INTEGER;
BEGIN
  IF p_base_price_rsd IS NULL OR p_base_price_rsd <= 0 THEN
    RAISE EXCEPTION 'base_price_rsd must be a positive number, got: %', p_base_price_rsd;
  END IF;

  IF p_discount_percent IS NULL OR p_discount_percent < 0 OR p_discount_percent > 95 THEN
    RAISE EXCEPTION 'discount_percent must be between 0 and 95, got: %', p_discount_percent;
  END IF;

  SELECT tc.drops_per_rsd INTO v_drops_per_rsd
  FROM public.tokenomics_config tc
  WHERE (tc.gym_id = p_gym_id OR tc.gym_id IS NULL)
  ORDER BY CASE WHEN tc.gym_id = p_gym_id THEN 0 ELSE 1 END
  LIMIT 1;

  v_drops_per_rsd := COALESCE(v_drops_per_rsd, 2.0);

  v_effective_rsd := ROUND(p_base_price_rsd * (1.0 - p_discount_percent / 100.0), 2);

  v_effective_drops := GREATEST(1, ROUND(v_effective_rsd * v_drops_per_rsd));

  RETURN QUERY SELECT v_effective_rsd, v_effective_drops, v_drops_per_rsd;
END;
$function$;

-- ============================================================================
-- 4. Trigger: auto-recompute price_drops when discount mode changes
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_rewards_discount_price_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $trigger$
DECLARE
  v_result RECORD;
BEGIN
  IF NEW.price_calc_mode = 'discount_from_rsd' THEN
    IF NEW.base_price_rsd IS NULL OR NEW.base_price_rsd <= 0 THEN
      RAISE EXCEPTION 'base_price_rsd is required and must be positive when price_calc_mode = discount_from_rsd';
    END IF;

    SELECT r.effective_rsd, r.effective_drops, r.drops_per_rsd
    INTO v_result
    FROM public.compute_reward_price_drops(NEW.gym_id, NEW.base_price_rsd, NEW.discount_percent) r;

    NEW.price_drops := v_result.effective_drops;
    NEW.final_price_rsd_snapshot := v_result.effective_rsd;
    NEW.drops_per_rsd_snapshot := v_result.drops_per_rsd;
  END IF;

  RETURN NEW;
END;
$trigger$;

DROP TRIGGER IF EXISTS trg_rewards_discount_price_sync ON public.rewards;

CREATE TRIGGER trg_rewards_discount_price_sync
  BEFORE INSERT OR UPDATE ON public.rewards
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_rewards_discount_price_sync();

-- ============================================================================
-- 5. Grants
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.compute_reward_price_drops(UUID, NUMERIC, NUMERIC)
  TO authenticated;
