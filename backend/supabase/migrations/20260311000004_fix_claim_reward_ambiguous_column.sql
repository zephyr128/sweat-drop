-- Fix: "column reference 'redemption_code' is ambiguous" in claim_reward()
--
-- The RETURNS TABLE declares 'redemption_code TEXT', which collides with
-- the 'redemption_code' column on public.redemptions inside the function body.
-- PostgreSQL cannot resolve the ambiguity. Fix: table-qualify the column.

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

  -- 5. ONE-TIME CHECK
  IF v_reward.is_one_time AND EXISTS (
    SELECT 1 FROM public.redemptions r
    WHERE r.user_id = p_user_id AND r.reward_id = p_reward_id
  ) THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'One-time reward already claimed'::TEXT;
    RETURN;
  END IF;

  -- 6. DUPLICATE PENDING CHECK
  IF EXISTS (
    SELECT 1 FROM public.redemptions r
    WHERE r.user_id = p_user_id
      AND r.reward_id = p_reward_id
      AND r.status = 'pending'
  ) THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'You already have a pending claim for this reward'::TEXT;
    RETURN;
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
