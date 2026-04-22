-- Migration: 20260422170000_claim_reward_optimize_and_redemptions_dedup.sql
-- Description: Drop 2 duplicate indexes on redemptions, optimize claim_reward
--              function to eliminate 2 unnecessary DB round-trips.
--
-- AGENT NOTE: [2026-04-22] - supabase-dba
--
-- FINDINGS (from get_slow_queries() export on dev):
--   claim_reward — 37 calls, mean 201ms, max 2394ms
--   Root causes identified:
--
--   1. DUPLICATE INDEXES on redemptions (write overhead on every INSERT/UPDATE):
--      idx_redemptions_gym_created     == idx_redemptions_gym_created_at
--        both: USING btree (gym_id, created_at DESC) — identical, planner uses one, other is dead weight
--      idx_redemptions_code            == redemptions_redemption_code_key (UNIQUE constraint)
--        both index redemption_code — UNIQUE constraint already serves as index, plain btree is redundant
--
--   2. TWO SEQUENTIAL EXISTS on redemptions inside claim_reward() (steps 5 + 6):
--      Step 5: EXISTS WHERE user_id = $1 AND reward_id = $2           (any status)
--      Step 6: EXISTS WHERE user_id = $1 AND reward_id = $2 AND status = 'pending'
--      These two queries hit the same index (idx_redemptions_user_reward_status) twice.
--      Combined into ONE query that returns both flags simultaneously.
--
--   3. UPDATE profiles + SELECT available_drops (steps 8 + 12):
--      Step 8:  UPDATE profiles SET available_drops = ... WHERE id = p_user_id
--      Step 12: SELECT available_drops INTO v_balance_after FROM profiles WHERE id = p_user_id
--      Two round-trips for what can be a single UPDATE ... RETURNING available_drops.
--
-- NET EFFECT: claim_reward reduced from 5 redemptions/profiles round-trips to 3.
--   Before: lock_reward → exists_any → exists_pending → lock_membership →
--           update_membership → update_profiles → decrement_stock →
--           code_loop → insert_redemption → select_profiles → insert_tx
--   After:  lock_reward → exists_combined → lock_membership →
--           update_membership → update_profiles_returning → decrement_stock →
--           code_loop → insert_redemption → insert_tx
--
-- CHANGES:
--   DROP: idx_redemptions_gym_created_at (duplicate of idx_redemptions_gym_created)
--   DROP: idx_redemptions_code (redundant; UNIQUE constraint already indexes redemption_code)
--   REPLACE: claim_reward() — 2 fewer DB round-trips in hot path
--
-- IMPACT ON FRONTEND:
--   Mobile App: Faster reward claiming. Return type IDENTICAL — no mobile changes needed.
--   Admin Panel: No changes needed.
--
-- BREAKING CHANGES: None. Function signature and return type unchanged.
--
-- ═══════════════════════════════════════════════════════════════════

-- ============================================================
-- 1. DROP DUPLICATE INDEXES
-- ============================================================

-- redemptions: keep idx_redemptions_gym_created, drop the alias
DROP INDEX IF EXISTS public.idx_redemptions_gym_created_at;

-- redemptions: unique constraint already provides a btree index on redemption_code
-- the standalone idx_redemptions_code is pure overhead (extra write on every INSERT/UPDATE)
DROP INDEX IF EXISTS public.idx_redemptions_code;

-- ============================================================
-- 2. OPTIMIZED claim_reward()
--    Changes vs 20260302000009_phase1_claim_reward.sql:
--    a. Steps 5+6 combined into one query → saves one index scan on redemptions
--    b. UPDATE profiles + SELECT available_drops → UPDATE ... RETURNING → saves one SELECT
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
  -- Combined redemption existence flags (replaces two separate EXISTS queries)
  v_has_any_claim   BOOLEAN := false;
  v_has_pending     BOOLEAN := false;
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

  -- 5+6. COMBINED: one-time check + duplicate pending check in a single index scan
  --      Previously: two separate EXISTS queries on idx_redemptions_user_reward_status
  --      Now: one aggregation that returns both flags at once
  SELECT
    COUNT(*) > 0,
    COUNT(*) FILTER (WHERE status = 'pending') > 0
  INTO v_has_any_claim, v_has_pending
  FROM public.redemptions
  WHERE user_id = p_user_id AND reward_id = p_reward_id;

  IF v_reward.is_one_time AND v_has_any_claim THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'One-time reward already claimed'::TEXT;
    RETURN;
  END IF;

  IF v_has_pending THEN
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

  -- 8. DEDUCT FROM LOCAL BALANCE (gym-scoped spending)
  UPDATE public.gym_memberships
  SET local_drops_balance = local_drops_balance - v_reward.price_drops,
      updated_at = NOW()
  WHERE user_id = p_user_id AND gym_id = p_gym_id;

  -- 9. UPDATE profiles display balance + capture balance_after in one round-trip
  --    Previously: UPDATE then separate SELECT available_drops (step 12 was after INSERT)
  UPDATE public.profiles
  SET available_drops = GREATEST(0, available_drops - v_reward.price_drops),
      updated_at = NOW()
  WHERE id = p_user_id
  RETURNING available_drops INTO v_balance_after;

  -- 10. DECREMENT STOCK
  IF v_reward.stock IS NOT NULL THEN
    UPDATE public.rewards
    SET stock = stock - 1,
        updated_at = NOW()
    WHERE id = p_reward_id;
  END IF;

  -- 11. GENERATE UNIQUE 4-CHAR CODE
  --     UNIQUE constraint on redemption_code ensures loop exits on first unused code
  LOOP
    v_code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 4));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.redemptions
      WHERE redemption_code = v_code AND status = 'pending'
    );
  END LOOP;

  -- 12. CREATE REDEMPTION RECORD
  INSERT INTO public.redemptions
    (user_id, reward_id, gym_id, drops_spent, status, redemption_code)
  VALUES
    (p_user_id, p_reward_id, p_gym_id, v_reward.price_drops, 'pending', v_code)
  RETURNING id INTO v_redemption_id;

  -- 13. LEDGER ENTRY
  INSERT INTO public.drops_transactions
    (user_id, gym_id, amount, transaction_type, reference_id, balance_after, description)
  VALUES
    (p_user_id, p_gym_id, -v_reward.price_drops, 'reward_claim',
     v_redemption_id, v_balance_after, 'Reward: ' || v_reward.name);

  -- 14. RETURN SUCCESS
  RETURN QUERY SELECT true, v_redemption_id, v_code, NULL::TEXT;
END;
$$;

COMMENT ON FUNCTION public.claim_reward(UUID, UUID, UUID) IS
  'Claims a reward with full validation, FOR UPDATE locks, balance deduction, and 4-char code generation. '
  'Supports: is_one_time rewards, stock limits, availability windows, duplicate-pending prevention. '
  'Spends from gym_memberships.local_drops_balance (gym-scoped). '
  'Optimized: combined one-time+pending check (1 scan), UPDATE...RETURNING profiles (saves SELECT).';

ANALYZE public.redemptions;
