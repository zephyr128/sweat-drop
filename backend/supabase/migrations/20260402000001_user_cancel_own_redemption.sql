-- Migration: 20260402000001_user_cancel_own_redemption.sql
-- Description: Adds cancel_own_redemption() RPC so mobile users can self-cancel
--              pending redemptions without requiring a staff user ID.
--
-- AGENT NOTE: [2026-04-02] - supabase-dba
--
-- CHANGES:
-- - Added function: public.cancel_own_redemption(p_redemption_id UUID)
--
-- IMPACT ON FRONTEND:
-- - Mobile App: redemptions.tsx — call cancel_own_redemption RPC on "Cancel" tap
--   (Bug #2 Step 3 from bugfix_transaction_list_cancel_redemption_push_notifications.md)
-- - Admin Panel: No changes needed
--
-- BREAKING CHANGES:
-- - None — existing cancel_redemption(p_redemption_id, p_cancelled_by, p_reason)
--   is unchanged and still used by admin panel
--
-- DIAGNOSTIC FINDINGS (Bug #2 Step 1):
-- - Zero redemptions currently have status = 'expired' in the database
-- - No function or trigger sets redemptions to 'expired'
-- - The 'expired' appearance was a mobile UI styling gap (claimed/expired fall-through)
-- - Recommendation: mobile-coder should add 'claimed' and 'expired' to STATUS_CONFIG
--   in redemptions.tsx; no expiry job is needed at this time

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

  IF v_redemption.status != 'pending' THEN
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

  INSERT INTO public.drops_transactions
    (user_id, gym_id, amount, transaction_type, reference_id, balance_after, description)
  VALUES (
    v_redemption.user_id,
    v_redemption.gym_id,
    v_redemption.drops_spent,
    'refund',
    v_redemption.reward_id,
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

-- Grant execute to authenticated users (SECURITY DEFINER handles the actual data access)
GRANT EXECUTE ON FUNCTION public.cancel_own_redemption(UUID) TO authenticated;
