-- Migration: 20260420000001_cancel_own_redemption_allow_pending_verification.sql
-- Description: Broadens cancel_own_redemption to also accept pending_verification status,
--              and fixes the refund ledger row's reference_id to point at the redemption
--              (not the reward) so downstream joins in get_wallet_summary / get_user_transactions
--              work correctly.
--
-- AGENT NOTE: [2026-04-20] - supabase-dba
--
-- CHANGES:
-- - Modified function: public.cancel_own_redemption(p_redemption_id UUID)
--   - Status guard now accepts both 'pending' AND 'pending_verification'
--   - Refund drops_transactions row: reference_id changed from v_redemption.reward_id
--     to p_redemption_id (the redemption itself), fixing the polymorphic join bug
--
-- IMPACT ON FRONTEND:
-- - Mobile App: redemptions.tsx — Cancel button now succeeds for leaderboard/arena prize
--   rows that surface as pending_verification; no UI change needed (canCancel logic
--   already rendered Cancel for pending_verification display states)
-- - Admin Panel: No changes needed
--
-- BREAKING CHANGES:
-- - None — this is a pure relaxation of the status guard; confirmed/cancelled guards
--   and all refund/stock-restore logic are byte-identical to 20260402000001
--
-- NEXT STEPS (after this migration):
-- - Step 2: 20260420000002_wallet_summary_exclude_pending_reward_claims.sql
-- - The reference_id fix enables the LEFT JOIN in Step 2 and Step 3 to be reliable

CREATE OR REPLACE FUNCTION public.cancel_own_redemption(
  p_redemption_id UUID
)
RETURNS TABLE(
  success       BOOLEAN,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_redemption    RECORD;
  v_balance_after INTEGER;
BEGIN
  -- ── 1. Fetch redemption and verify caller owns it ──────────────────────────
  SELECT * INTO v_redemption
  FROM public.redemptions
  WHERE id = p_redemption_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Redemption not found'::TEXT;
    RETURN;
  END IF;

  -- Ownership check: only the user who made the redemption can cancel it
  IF v_redemption.user_id != auth.uid() THEN
    RETURN QUERY SELECT false, 'Redemption not found'::TEXT;  -- don't leak existence
    RETURN;
  END IF;

  -- ── 2. Status checks ───────────────────────────────────────────────────────
  IF v_redemption.status = 'confirmed' THEN
    RETURN QUERY SELECT false, 'Cannot cancel a confirmed redemption'::TEXT;
    RETURN;
  END IF;

  IF v_redemption.status = 'cancelled' THEN
    RETURN QUERY SELECT false, 'Redemption is already cancelled'::TEXT;
    RETURN;
  END IF;

  -- Accept both 'pending' and 'pending_verification'; reject everything else
  -- (e.g. 'expired', any future statuses)
  IF v_redemption.status NOT IN ('pending', 'pending_verification') THEN
    RETURN QUERY SELECT false, 'Only pending redemptions can be cancelled'::TEXT;
    RETURN;
  END IF;

  -- ── 3. Refund drops to profile (global balance) ────────────────────────────
  UPDATE public.profiles
  SET available_drops = available_drops + v_redemption.drops_spent,
      updated_at      = NOW()
  WHERE id = v_redemption.user_id;

  -- ── 4. Refund drops to gym membership (local balance) ─────────────────────
  UPDATE public.gym_memberships
  SET local_drops_balance = local_drops_balance + v_redemption.drops_spent,
      updated_at          = NOW()
  WHERE user_id = v_redemption.user_id
    AND gym_id  = v_redemption.gym_id;

  -- ── 5. Audit trail ─────────────────────────────────────────────────────────
  SELECT available_drops INTO v_balance_after
  FROM public.profiles WHERE id = v_redemption.user_id;

  -- reference_id points at the redemption (not the reward) so the
  -- LEFT JOIN in get_wallet_summary / get_user_transactions can link this
  -- refund back to its redemption and inspect redemption_status.
  INSERT INTO public.drops_transactions
    (user_id, gym_id, amount, transaction_type, reference_id, balance_after, description)
  VALUES (
    v_redemption.user_id,
    v_redemption.gym_id,
    v_redemption.drops_spent,
    'refund',
    p_redemption_id,
    v_balance_after,
    'Refund: User cancelled redemption'
  );

  -- ── 6. Restore reward stock if limited ─────────────────────────────────────
  UPDATE public.rewards
  SET stock      = COALESCE(stock, 0) + 1,
      updated_at = NOW()
  WHERE id = v_redemption.reward_id
    AND stock IS NOT NULL;

  -- ── 7. Mark as cancelled ───────────────────────────────────────────────────
  UPDATE public.redemptions
  SET status              = 'cancelled',
      cancelled_by        = auth.uid(),
      cancellation_reason = 'User cancelled',
      updated_at          = NOW()
  WHERE id = p_redemption_id;

  RETURN QUERY SELECT true, NULL::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_own_redemption(UUID) TO authenticated;
