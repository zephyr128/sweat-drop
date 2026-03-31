-- Migration: 20260331100000_gate_claim_reward_on_verification.sql
-- Description: Adds identity verification check to claim_reward().
--              Unverified users receive machine-readable 'VERIFICATION_REQUIRED'
--              error before any balance deduction or stock check occurs.
--
-- AGENT NOTE: [2026-03-31] - supabase-dba
--
-- CHANGES:
-- - Modified function: public.claim_reward() — added verification gate after
--   redemption limit checks, before balance deduction
--
-- IMPACT ON FRONTEND:
-- - Mobile App: reward-detail.tsx must handle VERIFICATION_REQUIRED error code
--   and show verification prompt modal (Steps 2 & 3 of the plan)
-- - Admin Panel: No changes needed — staff already have verify_member_identity
--
-- BREAKING CHANGES:
-- - Unverified users can no longer claim rewards (intended behavior)
-- - All existing verified users: no change in behavior
--
-- NEXT STEPS:
-- - mobile-coder: implement verification check in reward-detail.tsx + locale strings

CREATE OR REPLACE FUNCTION public.claim_reward(
  p_user_id   UUID,
  p_reward_id UUID,
  p_gym_id    UUID
)
RETURNS TABLE(
  success         BOOLEAN,
  redemption_id   UUID,
  redemption_code TEXT,
  error_message   TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reward            RECORD;
  v_membership        RECORD;
  v_code              TEXT;
  v_redemption_id     UUID;
  v_balance_after     INTEGER;
  v_existing          INTEGER;
  v_period_start      TIMESTAMPTZ;
  v_price_bands       JSONB;
  v_band              JSONB;
  v_min_price         INTEGER;
  v_max_price         INTEGER;
  v_band_mode         TEXT;
  v_band_ignore_until TIMESTAMPTZ;
  v_is_out_of_band    BOOLEAN := false;
BEGIN
  -- ── 1. Fetch and lock reward ────────────────────────────────────────────────
  SELECT * INTO v_reward
  FROM public.rewards
  WHERE id = p_reward_id AND gym_id = p_gym_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'Reward not found'::TEXT;
    RETURN;
  END IF;

  IF v_reward.price_drops IS NULL OR v_reward.price_drops <= 0 THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'Invalid reward pricing'::TEXT;
    RETURN;
  END IF;

  -- ── 2. Price band / fraud logging ──────────────────────────────────────────
  SELECT tc.price_band_json,
         tc.band_enforcement_mode,
         tc.reward_band_ignore_until
  INTO v_price_bands, v_band_mode, v_band_ignore_until
  FROM public.tokenomics_config tc
  WHERE (tc.gym_id = p_gym_id OR tc.gym_id IS NULL)
  ORDER BY CASE WHEN tc.gym_id = p_gym_id THEN 0 ELSE 1 END
  LIMIT 1;

  v_band_mode := COALESCE(v_band_mode, 'warn');

  IF v_price_bands IS NOT NULL
     AND v_reward.reward_type IS NOT NULL
     AND (v_price_bands ? v_reward.reward_type)
  THEN
    v_band      := v_price_bands -> v_reward.reward_type;
    v_min_price := COALESCE((v_band->>'min')::INT, 0);
    v_max_price := COALESCE((v_band->>'max')::INT, 2147483647);

    IF v_reward.price_drops < v_min_price OR v_reward.price_drops > v_max_price THEN
      v_is_out_of_band := true;
      IF v_band_ignore_until IS NOT NULL AND v_band_ignore_until > NOW() THEN
        v_is_out_of_band := false;
      END IF;
    END IF;
  END IF;

  IF v_is_out_of_band THEN
    IF v_band_mode = 'enforce' THEN
      RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT,
        'This reward is temporarily unavailable.'::TEXT;
      RETURN;
    END IF;

    INSERT INTO public.fraud_events (user_id, gym_id, event_type, severity, metadata)
    VALUES (
      p_user_id,
      p_gym_id,
      'reward_out_of_band_redeemed',
      'low',
      jsonb_build_object(
        'reward_id',        p_reward_id,
        'reward_name',      v_reward.name,
        'reward_type',      v_reward.reward_type,
        'price_drops',      v_reward.price_drops,
        'band_min',         v_min_price,
        'band_max',         v_max_price,
        'enforcement_mode', v_band_mode,
        'price_calc_mode',  v_reward.price_calc_mode,
        'discount_percent', COALESCE(v_reward.discount_percent, 0)
      )
    );
  END IF;

  -- ── 3. Active / availability checks ────────────────────────────────────────
  IF NOT v_reward.is_active THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'Reward is not active'::TEXT;
    RETURN;
  END IF;

  IF v_reward.available_from IS NOT NULL AND v_reward.available_from > NOW() THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'Reward is not yet available'::TEXT;
    RETURN;
  END IF;

  IF v_reward.available_until IS NOT NULL AND v_reward.available_until < NOW() THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'Reward has expired'::TEXT;
    RETURN;
  END IF;

  -- ── 4. Stock check ─────────────────────────────────────────────────────────
  IF v_reward.stock IS NOT NULL AND v_reward.stock <= 0 THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'Out of stock'::TEXT;
    RETURN;
  END IF;

  -- ── 5. Redemption limit check ───────────────────────────────────────────────
  IF v_reward.redemption_limit != 'unlimited' THEN
    CASE v_reward.redemption_limit
      WHEN 'once'          THEN v_period_start := '-infinity'::TIMESTAMPTZ;
      WHEN 'once_per_day'  THEN v_period_start := DATE_TRUNC('day',   NOW() AT TIME ZONE 'Europe/Belgrade') AT TIME ZONE 'Europe/Belgrade';
      WHEN 'once_per_week' THEN v_period_start := DATE_TRUNC('week',  NOW() AT TIME ZONE 'Europe/Belgrade') AT TIME ZONE 'Europe/Belgrade';
      WHEN 'once_per_month'THEN v_period_start := DATE_TRUNC('month', NOW() AT TIME ZONE 'Europe/Belgrade') AT TIME ZONE 'Europe/Belgrade';
    END CASE;

    SELECT COUNT(*) INTO v_existing
    FROM public.redemptions r
    WHERE r.user_id    = p_user_id
      AND r.reward_id  = p_reward_id
      AND r.status     IN ('pending', 'confirmed')
      AND (v_reward.redemption_limit = 'once' OR r.created_at >= v_period_start);

    IF v_existing > 0 THEN
      RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT,
        CASE v_reward.redemption_limit
          WHEN 'once'          THEN 'You can only claim this reward once'
          WHEN 'once_per_day'  THEN 'You already claimed this reward today'
          WHEN 'once_per_week' THEN 'You already claimed this reward this week'
          WHEN 'once_per_month'THEN 'You already claimed this reward this month'
        END::TEXT;
      RETURN;
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.redemptions r
      WHERE r.user_id   = p_user_id
        AND r.reward_id = p_reward_id
        AND r.status    = 'pending'
    ) THEN
      RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT,
        'You already have a pending claim for this reward'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- ── 6. VERIFICATION GATE ───────────────────────────────────────────────────
  -- Inserted after all stock/limit checks (no point gating if reward unavailable)
  -- and before balance deduction (the moment of value extraction).
  -- Returns a machine-readable constant so the mobile app can show the right UI.
  IF NOT EXISTS (
    SELECT 1 FROM public.gym_member_identities
    WHERE user_id    = p_user_id
      AND gym_id     = p_gym_id
      AND is_verified = true
  ) THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT,
      'VERIFICATION_REQUIRED'::TEXT;
    RETURN;
  END IF;

  -- ── 7. Balance check ───────────────────────────────────────────────────────
  SELECT * INTO v_membership
  FROM public.gym_memberships
  WHERE user_id = p_user_id AND gym_id = p_gym_id
  FOR UPDATE;

  IF NOT FOUND OR v_membership.local_drops_balance < v_reward.price_drops THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT,
      format('Insufficient drops. You have %s, need %s',
        COALESCE(v_membership.local_drops_balance, 0), v_reward.price_drops)::TEXT;
    RETURN;
  END IF;

  -- ── 8. Deduct drops from membership + profile ──────────────────────────────
  UPDATE public.gym_memberships
  SET local_drops_balance = local_drops_balance - v_reward.price_drops,
      updated_at          = NOW()
  WHERE user_id = p_user_id AND gym_id = p_gym_id;

  UPDATE public.profiles
  SET available_drops = GREATEST(0, available_drops - v_reward.price_drops),
      updated_at      = NOW()
  WHERE id = p_user_id;

  -- ── 9. Decrement stock ─────────────────────────────────────────────────────
  IF v_reward.stock IS NOT NULL THEN
    UPDATE public.rewards
    SET stock      = stock - 1,
        updated_at = NOW()
    WHERE id = p_reward_id;
  END IF;

  -- ── 10. Generate unique redemption code ────────────────────────────────────
  LOOP
    v_code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 4));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.redemptions r
      WHERE r.redemption_code = v_code AND r.status = 'pending'
    );
  END LOOP;

  -- ── 11. Insert redemption record ───────────────────────────────────────────
  INSERT INTO public.redemptions
    (user_id, reward_id, gym_id, drops_spent, status, redemption_code)
  VALUES
    (p_user_id, p_reward_id, p_gym_id, v_reward.price_drops, 'pending', v_code)
  RETURNING id INTO v_redemption_id;

  SELECT available_drops INTO v_balance_after
  FROM public.profiles WHERE id = p_user_id;

  INSERT INTO public.drops_transactions
    (user_id, gym_id, amount, transaction_type, reference_id, balance_after, description)
  VALUES
    (p_user_id, p_gym_id, -v_reward.price_drops, 'reward_claim',
     v_redemption_id, v_balance_after, 'Reward: ' || v_reward.name);

  PERFORM public.refresh_economy_snapshot_daily(p_gym_id, (NOW() AT TIME ZONE 'Europe/Belgrade')::DATE);

  RETURN QUERY SELECT true, v_redemption_id, v_code, NULL::TEXT;
END;
$$;
