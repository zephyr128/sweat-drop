-- Migration: 20260325000017_discount_aware_band_compliance.sql
-- Description: Add discount-aware band compliance helper functions for admin panel.
--   Normalized price accounts for discount so discounted rewards aren't
--   falsely flagged as "out of band".
--
-- CHANGES:
--   - New function: compute_reward_band_compliance(uuid, uuid)
--   - New function: get_gym_reward_compliance_discount_aware(uuid)
--
-- IMPACT ON FRONTEND:
--   - Admin Panel: use new RPC for compliance table instead of client-side check
--   - Mobile App: none
--
-- BREAKING CHANGES: None

-- ============================================================================
-- 1. Single-reward compliance check
-- ============================================================================

CREATE OR REPLACE FUNCTION public.compute_reward_band_compliance(
  p_reward_id UUID,
  p_gym_id UUID
)
RETURNS TABLE (
  reward_id UUID,
  reward_name TEXT,
  reward_type TEXT,
  final_price_drops INTEGER,
  discount_percent NUMERIC,
  price_calc_mode TEXT,
  normalized_price_drops NUMERIC,
  band_min NUMERIC,
  band_max NUMERIC,
  in_band BOOLEAN,
  compliance_reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_reward RECORD;
  v_actor RECORD;
  v_effective_gym_id UUID;
  v_bands JSONB;
  v_band JSONB;
  v_norm NUMERIC;
  v_band_min NUMERIC;
  v_band_max NUMERIC;
  v_in_band BOOLEAN;
  v_reason TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT r.id, r.name, r.reward_type, r.price_drops, r.discount_percent,
         r.price_calc_mode, r.gym_id
  INTO v_reward
  FROM public.rewards r
  WHERE r.id = p_reward_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reward not found: %', p_reward_id;
  END IF;

  v_effective_gym_id := COALESCE(p_gym_id, v_reward.gym_id);

  IF p_gym_id IS NOT NULL AND v_reward.gym_id IS DISTINCT FROM p_gym_id THEN
    RAISE EXCEPTION 'Reward % does not belong to gym %', p_reward_id, p_gym_id;
  END IF;

  SELECT p.id, p.role, p.admin_gym_id
  INTO v_actor
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT (
    v_actor.role = 'superadmin'
    OR (v_actor.role = 'gym_admin' AND v_actor.admin_gym_id = v_effective_gym_id)
    OR (
      v_actor.role = 'gym_owner'
      AND EXISTS (
        SELECT 1
        FROM public.gyms g
        WHERE g.id = v_effective_gym_id
          AND g.owner_id = auth.uid()
      )
    )
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT tc.price_band_json INTO v_bands
  FROM public.tokenomics_config tc
  WHERE (tc.gym_id = v_effective_gym_id OR tc.gym_id IS NULL)
  ORDER BY CASE WHEN tc.gym_id = v_effective_gym_id THEN 0 ELSE 1 END
  LIMIT 1;

  v_bands := COALESCE(v_bands, '{}'::jsonb);

  -- Normalize: undo discount to get base-equivalent price in drops
  IF v_reward.price_calc_mode = 'discount_from_rsd'
     AND COALESCE(v_reward.discount_percent, 0) > 0
     AND v_reward.discount_percent < 100
  THEN
    v_norm := ROUND(v_reward.price_drops / (1.0 - v_reward.discount_percent / 100.0), 2);
  ELSE
    v_norm := v_reward.price_drops;
  END IF;

  -- Look up band for this reward_type
  v_band := v_bands -> v_reward.reward_type;

  IF v_band IS NULL OR v_band->'min' IS NULL OR v_band->'max' IS NULL THEN
    v_band_min := NULL;
    v_band_max := NULL;
    v_in_band := true;
    v_reason := 'no_band_defined';
  ELSE
    v_band_min := (v_band->>'min')::NUMERIC;
    v_band_max := (v_band->>'max')::NUMERIC;

    IF v_norm >= v_band_min AND v_norm <= v_band_max THEN
      v_in_band := true;
      v_reason := 'in_band';
    ELSIF v_norm < v_band_min THEN
      v_in_band := false;
      v_reason := 'below_band_min';
    ELSE
      v_in_band := false;
      v_reason := 'above_band_max';
    END IF;

    -- If discounted, note that normalization was applied
    IF v_reward.price_calc_mode = 'discount_from_rsd'
       AND COALESCE(v_reward.discount_percent, 0) > 0 THEN
      v_reason := v_reason || '_discount_normalized';
    END IF;
  END IF;

  RETURN QUERY SELECT
    v_reward.id,
    v_reward.name,
    v_reward.reward_type,
    v_reward.price_drops,
    COALESCE(v_reward.discount_percent, 0::NUMERIC),
    v_reward.price_calc_mode,
    v_norm,
    v_band_min,
    v_band_max,
    v_in_band,
    v_reason;
END;
$function$;

-- ============================================================================
-- 2. Batch: all active rewards for a gym
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_gym_reward_compliance_discount_aware(
  p_gym_id UUID
)
RETURNS TABLE (
  reward_id UUID,
  reward_name TEXT,
  reward_type TEXT,
  final_price_drops INTEGER,
  discount_percent NUMERIC,
  price_calc_mode TEXT,
  normalized_price_drops NUMERIC,
  band_min NUMERIC,
  band_max NUMERIC,
  in_band BOOLEAN,
  compliance_reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor RECORD;
  v_rid UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT p.id, p.role, p.admin_gym_id
  INTO v_actor
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT (
    v_actor.role = 'superadmin'
    OR (v_actor.role = 'gym_admin' AND v_actor.admin_gym_id = p_gym_id)
    OR (
      v_actor.role = 'gym_owner'
      AND EXISTS (
        SELECT 1
        FROM public.gyms g
        WHERE g.id = p_gym_id
          AND g.owner_id = auth.uid()
      )
    )
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  FOR v_rid IN
    SELECT r.id FROM public.rewards r
    WHERE r.gym_id = p_gym_id AND r.is_active = true
    ORDER BY r.reward_type, r.name
  LOOP
    RETURN QUERY
    SELECT c.*
    FROM public.compute_reward_band_compliance(v_rid, p_gym_id) c;
  END LOOP;
END;
$function$;

-- ============================================================================
-- 3. Grants
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.compute_reward_band_compliance(UUID, UUID)
  TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_gym_reward_compliance_discount_aware(UUID)
  TO authenticated;
