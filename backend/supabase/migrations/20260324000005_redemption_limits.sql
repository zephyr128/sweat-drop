-- ═══════════════════════════════════════════════════════════
-- Migration: 20260324000005_redemption_limits.sql
-- Description: Replace binary is_one_time with flexible redemption_limit
--   system (unlimited, once, once_per_day, once_per_week, once_per_month).
--   Updates claim_reward() with time-based limit checks.
--
-- AGENT NOTE: [2026-03-12] - supabase-dba
-- Reference: docs/plans/feature_redemption_limits.md — Phase 1
--
-- CHANGES:
--   - New column: rewards.redemption_limit (TEXT, CHECK constraint)
--   - Migrated is_one_time=true → redemption_limit='once'
--   - Updated claim_reward() with CASE-based limit logic
--   - New partial index on redemptions for efficient limit checks
--
-- IMPACT ON FRONTEND:
--   - Admin: StoreManager needs redemption_limit dropdown
--   - Mobile: Store needs limit info display + new error messages
--
-- BREAKING CHANGES: None (additive, old is_one_time kept for compat)
-- ═══════════════════════════════════════════════════════════


-- ============================================================
-- Task 1A: Add redemption_limit column
-- ============================================================

ALTER TABLE public.rewards
  ADD COLUMN IF NOT EXISTS redemption_limit TEXT DEFAULT 'unlimited' NOT NULL;

DO $$
BEGIN
  ALTER TABLE public.rewards
    ADD CONSTRAINT chk_rewards_redemption_limit
    CHECK (redemption_limit IN ('unlimited', 'once', 'once_per_day', 'once_per_week', 'once_per_month'));
EXCEPTION WHEN duplicate_object THEN
  NULL;
END;
$$;

COMMENT ON COLUMN public.rewards.redemption_limit IS
  'Controls how often each user can claim this reward: '
  'unlimited = no limit, once = one claim ever, '
  'once_per_day/week/month = one claim per calendar period';

UPDATE public.rewards
SET redemption_limit = 'once'
WHERE is_one_time = true
  AND redemption_limit = 'unlimited';

COMMENT ON COLUMN public.rewards.is_one_time IS
  'DEPRECATED: Use redemption_limit instead. Kept for backward compat.';


-- ============================================================
-- Task 1B: Update claim_reward with limit logic
-- ============================================================

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
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reward        RECORD;
  v_membership    RECORD;
  v_code          TEXT;
  v_redemption_id UUID;
  v_balance_after INTEGER;
  v_existing      INTEGER;
  v_period_start  TIMESTAMPTZ;
BEGIN
  -- 1. LOCK REWARD ROW
  SELECT * INTO v_reward
  FROM public.rewards
  WHERE id = p_reward_id AND gym_id = p_gym_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'Reward not found'::TEXT;
    RETURN;
  END IF;

  -- 2. ACTIVE CHECK
  IF NOT v_reward.is_active THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'Reward is not active'::TEXT;
    RETURN;
  END IF;

  -- 3. AVAILABILITY WINDOW CHECK
  IF v_reward.available_from IS NOT NULL AND v_reward.available_from > NOW() THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'Reward is not yet available'::TEXT;
    RETURN;
  END IF;

  IF v_reward.available_until IS NOT NULL AND v_reward.available_until < NOW() THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'Reward has expired'::TEXT;
    RETURN;
  END IF;

  -- 4. STOCK CHECK
  IF v_reward.stock IS NOT NULL AND v_reward.stock <= 0 THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'Out of stock'::TEXT;
    RETURN;
  END IF;

  -- 5. REDEMPTION LIMIT CHECK
  IF v_reward.redemption_limit != 'unlimited' THEN

    CASE v_reward.redemption_limit
      WHEN 'once' THEN
        v_period_start := '-infinity'::TIMESTAMPTZ;
      WHEN 'once_per_day' THEN
        v_period_start := DATE_TRUNC('day', NOW() AT TIME ZONE 'Europe/Belgrade')
                          AT TIME ZONE 'Europe/Belgrade';
      WHEN 'once_per_week' THEN
        v_period_start := DATE_TRUNC('week', NOW() AT TIME ZONE 'Europe/Belgrade')
                          AT TIME ZONE 'Europe/Belgrade';
      WHEN 'once_per_month' THEN
        v_period_start := DATE_TRUNC('month', NOW() AT TIME ZONE 'Europe/Belgrade')
                          AT TIME ZONE 'Europe/Belgrade';
    END CASE;

    SELECT COUNT(*) INTO v_existing
    FROM public.redemptions r
    WHERE r.user_id = p_user_id
      AND r.reward_id = p_reward_id
      AND r.status IN ('pending', 'confirmed')
      AND (v_reward.redemption_limit = 'once' OR r.created_at >= v_period_start);

    IF v_existing > 0 THEN
      RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT,
        CASE v_reward.redemption_limit
          WHEN 'once'           THEN 'You can only claim this reward once'
          WHEN 'once_per_day'   THEN 'You already claimed this reward today'
          WHEN 'once_per_week'  THEN 'You already claimed this reward this week'
          WHEN 'once_per_month' THEN 'You already claimed this reward this month'
        END::TEXT;
      RETURN;
    END IF;
  ELSE
    -- 6. DUPLICATE PENDING CHECK (unlimited rewards — keep existing behavior)
    IF EXISTS (
      SELECT 1 FROM public.redemptions r
      WHERE r.user_id = p_user_id
        AND r.reward_id = p_reward_id
        AND r.status = 'pending'
    ) THEN
      RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT,
        'You already have a pending claim for this reward'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- 7. LOCK MEMBERSHIP ROW
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

  -- 8. DEDUCT FROM LOCAL BALANCE
  UPDATE public.gym_memberships
  SET local_drops_balance = local_drops_balance - v_reward.price_drops,
      updated_at = NOW()
  WHERE user_id = p_user_id AND gym_id = p_gym_id;

  UPDATE public.profiles
  SET available_drops = GREATEST(0, available_drops - v_reward.price_drops),
      updated_at = NOW()
  WHERE id = p_user_id;

  -- 9. DECREMENT STOCK
  IF v_reward.stock IS NOT NULL THEN
    UPDATE public.rewards
    SET stock = stock - 1,
        updated_at = NOW()
    WHERE id = p_reward_id;
  END IF;

  -- 10. GENERATE UNIQUE 4-CHAR CODE
  LOOP
    v_code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 4));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.redemptions r
      WHERE r.redemption_code = v_code AND r.status = 'pending'
    );
  END LOOP;

  -- 11. CREATE REDEMPTION RECORD
  INSERT INTO public.redemptions
    (user_id, reward_id, gym_id, drops_spent, status, redemption_code)
  VALUES
    (p_user_id, p_reward_id, p_gym_id, v_reward.price_drops, 'pending', v_code)
  RETURNING id INTO v_redemption_id;

  -- 12. LEDGER ENTRY
  SELECT available_drops INTO v_balance_after
  FROM public.profiles WHERE id = p_user_id;

  INSERT INTO public.drops_transactions
    (user_id, gym_id, amount, transaction_type, reference_id, balance_after, description)
  VALUES
    (p_user_id, p_gym_id, -v_reward.price_drops, 'reward_claim',
     v_redemption_id, v_balance_after, 'Reward: ' || v_reward.name);

  -- 13. RETURN SUCCESS
  RETURN QUERY SELECT true, v_redemption_id, v_code, NULL::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_reward(UUID, UUID, UUID) TO authenticated;


-- ============================================================
-- Task 1C: Index for efficient limit checks
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_redemptions_user_reward_created
  ON public.redemptions(user_id, reward_id, created_at)
  WHERE status IN ('pending', 'confirmed');

COMMENT ON INDEX idx_redemptions_user_reward_created IS
  'Supports redemption limit checks in claim_reward: '
  'fast count of user claims per reward in time window';
