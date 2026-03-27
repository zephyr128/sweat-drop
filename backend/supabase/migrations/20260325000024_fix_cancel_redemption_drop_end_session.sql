-- Migration: 20260325000024_fix_cancel_redemption_drop_end_session.sql
-- Description: Fix cancel_redemption() broken by removal of add_drops().
--              Also drop dead end_session() which references add_drops().
--
-- Root cause: Migration 20260305000001_cleanup_unused_objects.sql dropped
-- add_drops(), but cancel_redemption() and end_session() still called it.
--
-- cancel_redemption: inline the refund logic (reverse of claim_reward).
-- end_session: not called by any app code — drop it.

-- ============================================================
-- 1) Fix cancel_redemption: inline refund logic
-- ============================================================

CREATE OR REPLACE FUNCTION public.cancel_redemption(
  p_redemption_id UUID,
  p_cancelled_by UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS TABLE(success BOOLEAN, error_message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_redemption   RECORD;
  v_balance_after INTEGER;
BEGIN
  SELECT * INTO v_redemption
  FROM public.redemptions
  WHERE id = p_redemption_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Redemption not found'::TEXT;
    RETURN;
  END IF;

  IF v_redemption.status = 'confirmed' THEN
    RETURN QUERY SELECT false, 'Cannot cancel confirmed redemption'::TEXT;
    RETURN;
  END IF;

  IF v_redemption.status = 'cancelled' THEN
    RETURN QUERY SELECT false, 'Redemption is already cancelled'::TEXT;
    RETURN;
  END IF;

  -- Refund available_drops (mirrors claim_reward deduction)
  UPDATE public.profiles
  SET available_drops = available_drops + v_redemption.drops_spent,
      updated_at = NOW()
  WHERE id = v_redemption.user_id;

  -- Refund local gym balance
  UPDATE public.gym_memberships
  SET local_drops_balance = local_drops_balance + v_redemption.drops_spent,
      updated_at = NOW()
  WHERE user_id = v_redemption.user_id
    AND gym_id = v_redemption.gym_id;

  -- Get balance for audit trail
  SELECT available_drops INTO v_balance_after
  FROM public.profiles WHERE id = v_redemption.user_id;

  -- Record refund transaction
  INSERT INTO public.drops_transactions
    (user_id, gym_id, amount, transaction_type, reference_id, balance_after, description)
  VALUES (
    v_redemption.user_id,
    v_redemption.gym_id,
    v_redemption.drops_spent,
    'refund',
    v_redemption.reward_id,
    v_balance_after,
    format('Refund: %s', COALESCE(p_reason, 'Redemption cancelled'))
  );

  -- Restore stock if limited
  UPDATE public.rewards
  SET stock = COALESCE(stock, 0) + 1,
      updated_at = NOW()
  WHERE id = v_redemption.reward_id
    AND stock IS NOT NULL;

  -- Cancel redemption
  UPDATE public.redemptions
  SET status = 'cancelled',
      cancelled_by = p_cancelled_by,
      cancellation_reason = p_reason,
      updated_at = NOW()
  WHERE id = p_redemption_id;

  RETURN QUERY SELECT true, NULL::TEXT;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.cancel_redemption(UUID, UUID, TEXT) TO authenticated;

-- ============================================================
-- 2) Drop dead end_session (no app code calls it; award_drops is canonical)
-- ============================================================

DROP FUNCTION IF EXISTS public.end_session(UUID, INTEGER);
