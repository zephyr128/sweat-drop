-- Migration: 20260302000009_phase1_claim_reward.sql
-- Description: Phase 1 — claim_reward() with FOR UPDATE locks, is_one_time support
--
-- AGENT NOTE: [2026-03-02] - supabase-dba (Phase 1, Task 1.4)
-- Reference: docs/plans/mvp_full_audit_and_build_plan.md
--
-- INTERFACE CONTRACT:
-- claim_reward(p_user_id UUID, p_reward_id UUID, p_gym_id UUID)
-- → RETURNS TABLE(success BOOLEAN, redemption_id UUID, redemption_code TEXT, error_message TEXT)
--
-- KEY DIFFERENCES FROM OLD create_redemption():
-- - Uses FOR UPDATE on reward row (prevents race conditions on stock)
-- - Uses FOR UPDATE on gym_membership row (prevents race conditions on balance)
-- - Supports is_one_time flag (Q4 answer)
-- - Generates shorter 4-char redemption code (easier for staff to type)
-- - Deducts from gym_memberships.local_drops_balance (Blocker 4: gym-scoped spending)
-- - Updates available_drops on profiles for display (but NOT authoritative for spending)
-- - Records balance_after in drops_transactions
--
-- NOTE: Old create_redemption() is kept for backward compatibility.
-- Mobile agent will switch to calling claim_reward() RPC.

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
AS $$
DECLARE
  v_reward        RECORD;
  v_membership    RECORD;
  v_code          TEXT;
  v_redemption_id UUID;
  v_balance_after INTEGER;
BEGIN
  -- 1. LOCK REWARD ROW — prevents race condition on stock
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

  -- 5. ONE-TIME CHECK (Q4: is_one_time = true → only once ever)
  IF v_reward.is_one_time AND EXISTS (
    SELECT 1 FROM public.redemptions
    WHERE user_id = p_user_id AND reward_id = p_reward_id
  ) THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'One-time reward already claimed'::TEXT;
    RETURN;
  END IF;

  -- 6. DUPLICATE PENDING CHECK (block two pending claims for same reward)
  IF EXISTS (
    SELECT 1 FROM public.redemptions
    WHERE user_id = p_user_id
      AND reward_id = p_reward_id
      AND status = 'pending'
  ) THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'You already have a pending claim for this reward'::TEXT;
    RETURN;
  END IF;

  -- 7. LOCK MEMBERSHIP ROW — prevents race condition on balance
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

  -- 8. DEDUCT FROM LOCAL BALANCE (gym-scoped spending, Blocker 4)
  UPDATE public.gym_memberships
  SET local_drops_balance = local_drops_balance - v_reward.price_drops,
      updated_at = NOW()
  WHERE user_id = p_user_id AND gym_id = p_gym_id;

  -- Update available_drops for display consistency (NOT authoritative for spending in MVP)
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

  -- 10. GENERATE UNIQUE 4-CHAR CODE (shorter than old RED-XXXXXXXX)
  LOOP
    v_code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 4));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.redemptions
      WHERE redemption_code = v_code AND status = 'pending'
    );
  END LOOP;

  -- 11. CREATE REDEMPTION RECORD
  INSERT INTO public.redemptions
    (user_id, reward_id, gym_id, drops_spent, status, redemption_code)
  VALUES
    (p_user_id, p_reward_id, p_gym_id, v_reward.price_drops, 'pending', v_code)
  RETURNING id INTO v_redemption_id;

  -- 12. LEDGER ENTRY (negative amount for spending)
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

COMMENT ON FUNCTION public.claim_reward(UUID, UUID, UUID) IS
  'Claims a reward with full validation, FOR UPDATE locks, balance deduction, and 4-char code generation. '
  'Supports: is_one_time rewards, stock limits, availability windows, duplicate-pending prevention. '
  'Spends from gym_memberships.local_drops_balance (gym-scoped, Blocker 4).';

GRANT EXECUTE ON FUNCTION public.claim_reward(UUID, UUID, UUID) TO authenticated;
