-- Migration: 20260420000003_get_user_transactions_rpc.sql
-- Description: Adds get_user_transactions() RPC that returns drops_transactions enriched
--              with redemption_status. This lets the mobile transaction ledger distinguish
--              pending / confirmed / cancelled reward claims without a PostgREST join
--              (reference_id is polymorphic so auto-join is not feasible).
--
-- AGENT NOTE: [2026-04-20] - supabase-dba
--
-- CHANGES:
-- - Added function: public.get_user_transactions(p_gym_id, p_types, p_amount_sign, p_limit, p_offset)
--
-- IMPACT ON FRONTEND:
-- - Mobile App: transactions.tsx should replace the direct drops_transactions query with
--   supabase.rpc('get_user_transactions', { ... }). TxRow gains redemption_status field.
--   See Step 5 of bugfix_redemption_cancel_and_pending_spent_transactions.md.
-- - Admin Panel: No changes needed (admin uses its own query path)
--
-- BREAKING CHANGES:
-- - None — additive; existing direct table queries still work
--
-- NEXT STEPS:
-- 1. supabase gen types typescript --linked > backend/types/database.types.ts
-- 2. Steps 4–6 in the plan: mobile-coder updates transactions.tsx, redemptions.tsx, wallet.tsx

CREATE OR REPLACE FUNCTION public.get_user_transactions(
  p_gym_id      UUID    DEFAULT NULL,
  p_types       TEXT[]  DEFAULT NULL,    -- NULL = all types
  p_amount_sign TEXT    DEFAULT NULL,    -- 'negative', 'positive', or NULL = both
  p_limit       INT     DEFAULT 20,
  p_offset      INT     DEFAULT 0
)
RETURNS TABLE(
  id                UUID,
  transaction_type  TEXT,
  amount            INTEGER,
  balance_after     INTEGER,
  description       TEXT,
  created_at        TIMESTAMPTZ,
  gym_id            UUID,
  reference_id      UUID,
  redemption_status TEXT    -- NULL for non-redemption txns
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    dt.id,
    dt.transaction_type,
    dt.amount,
    dt.balance_after,
    dt.description,
    dt.created_at,
    dt.gym_id,
    dt.reference_id,
    r.status::TEXT AS redemption_status
  FROM public.drops_transactions dt
  -- Join reward_claim / redemption / refund rows to their redemption so the mobile
  -- client can show pending badges, filter Spent by confirmed-only, and group refunds.
  -- Non-matching rows produce NULL (no change in behaviour for arena_entry etc.).
  LEFT JOIN public.redemptions r
    ON r.id = dt.reference_id
   AND dt.transaction_type IN ('reward_claim', 'redemption', 'refund')
  WHERE dt.user_id = auth.uid()
    AND (p_gym_id      IS NULL OR dt.gym_id             = p_gym_id)
    AND (p_types       IS NULL OR dt.transaction_type   = ANY(p_types))
    AND (p_amount_sign IS NULL
         OR (p_amount_sign = 'negative' AND dt.amount <  0)
         OR (p_amount_sign = 'positive' AND dt.amount >= 0))
  ORDER BY dt.created_at DESC
  LIMIT  GREATEST(1, p_limit)
  OFFSET GREATEST(0, p_offset);
$$;

GRANT EXECUTE ON FUNCTION public.get_user_transactions(UUID, TEXT[], TEXT, INT, INT) TO authenticated;
