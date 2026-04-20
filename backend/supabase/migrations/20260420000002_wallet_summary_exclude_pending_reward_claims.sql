-- Migration: 20260420000002_wallet_summary_exclude_pending_reward_claims.sql
-- Description: Patches get_wallet_summary so that a reward_claim / redemption row is
--              only counted as "Spent" once the paired redemption is confirmed.
--              Pending claims (status = 'pending' or 'pending_verification') are excluded
--              from Spent, fixing Bug #2 (reward shows as Spent immediately after claiming).
--
-- AGENT NOTE: [2026-04-20] - supabase-dba
--
-- CHANGES:
-- - Modified function: public.get_wallet_summary(p_gym_id UUID)
--   - txns CTE gains a LEFT JOIN to public.redemptions on reference_id
--     (for rows of type reward_claim / redemption / refund)
--   - spent_* expressions now require redemption_status IS NULL (non-redemption spend)
--     OR redemption_status = 'confirmed' before counting the row as Spent
--   - refund subtraction in spent_* now excludes refunds whose paired redemption is
--     'cancelled' — those refunds were never counted as Spent so subtracting them
--     would produce a negative/clamped-to-0 result
--   - earned_* and net_* are unchanged
--
-- IMPACT ON FRONTEND:
-- - Mobile App: wallet.tsx Spent totals now correctly reflect only confirmed redemptions
-- - Admin Panel: No changes needed
--
-- BREAKING CHANGES:
-- - None — shape (period, earned, spent, net) is identical; values become more correct
--
-- DEPENDS ON:
-- - 20260420000001 fix: refund rows now have reference_id = redemption_id, making the
--   LEFT JOIN reliable for new refund rows. Pre-existing rows (reference_id = reward_id)
--   produce NULL from the join and are handled as today (treated as unpaired refunds).
--
-- NEXT STEPS:
-- - Step 3: 20260420000003_get_user_transactions_rpc.sql

CREATE OR REPLACE FUNCTION public.get_wallet_summary(p_gym_id UUID DEFAULT NULL)
RETURNS TABLE(
  period TEXT,
  earned BIGINT,
  spent  BIGINT,
  net    BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH periods AS (
    SELECT
      date_trunc('day', now())::timestamptz   AS day_start,
      (date_trunc('day', now()) - ((EXTRACT(ISODOW FROM now())::int - 1) || ' days')::interval)::timestamptz AS week_start,
      date_trunc('month', now())::timestamptz AS month_start
  ),
  txns AS (
    SELECT
      dt.amount,
      dt.transaction_type,
      dt.created_at,
      -- NULL for non-redemption rows; confirmed/pending/cancelled/etc for reward_claim
      -- and redemption rows. Also populated for refund rows (via Step 1 fix).
      r.status::TEXT AS redemption_status,
      p.day_start,
      p.week_start,
      p.month_start
    FROM public.drops_transactions dt
    CROSS JOIN periods p
    -- Link reward_claim / redemption / refund rows back to their redemption so we can
    -- gate "Spent" on confirmed status. Non-matching rows get NULL (safe — no change).
    LEFT JOIN public.redemptions r
      ON r.id = dt.reference_id
     AND dt.transaction_type IN ('reward_claim', 'redemption', 'refund')
    WHERE dt.user_id = auth.uid()
      AND (p_gym_id IS NULL OR dt.gym_id = p_gym_id)
  ),
  agg AS (
    SELECT
      -- ── Earned (unchanged: positive, non-refund) ────────────────────────────
      COALESCE(SUM(amount) FILTER (
        WHERE amount > 0
          AND transaction_type IS DISTINCT FROM 'refund'
          AND created_at >= day_start
      ), 0) AS earned_today,

      COALESCE(SUM(amount) FILTER (
        WHERE amount > 0
          AND transaction_type IS DISTINCT FROM 'refund'
          AND created_at >= week_start
      ), 0) AS earned_week,

      COALESCE(SUM(amount) FILTER (
        WHERE amount > 0
          AND transaction_type IS DISTINCT FROM 'refund'
          AND created_at >= month_start
      ), 0) AS earned_month,

      COALESCE(SUM(amount) FILTER (
        WHERE amount > 0
          AND transaction_type IS DISTINCT FROM 'refund'
      ), 0) AS earned_all,

      -- ── Spent (negative rows, only count redemption rows when confirmed) ────
      -- A negative row is counted as Spent only when:
      --   a) it is NOT a reward_claim/redemption type (e.g. arena_entry), OR
      --   b) it IS a reward_claim/redemption AND redemption_status = 'confirmed'
      --
      -- Refund subtraction skips refunds tied to a cancelled redemption because
      -- the original claim was never counted as Spent; subtracting it would
      -- produce a false negative that clamps to 0 and loses signal.
      GREATEST(0,
        COALESCE(SUM(ABS(amount)) FILTER (
          WHERE amount < 0
            AND created_at >= day_start
            AND (
              transaction_type NOT IN ('reward_claim', 'redemption')
              OR redemption_status = 'confirmed'
            )
        ), 0)
        - COALESCE(SUM(amount) FILTER (
            WHERE transaction_type = 'refund'
              AND amount > 0
              AND created_at >= day_start
              AND redemption_status IS DISTINCT FROM 'cancelled'
          ), 0)
      ) AS spent_today,

      GREATEST(0,
        COALESCE(SUM(ABS(amount)) FILTER (
          WHERE amount < 0
            AND created_at >= week_start
            AND (
              transaction_type NOT IN ('reward_claim', 'redemption')
              OR redemption_status = 'confirmed'
            )
        ), 0)
        - COALESCE(SUM(amount) FILTER (
            WHERE transaction_type = 'refund'
              AND amount > 0
              AND created_at >= week_start
              AND redemption_status IS DISTINCT FROM 'cancelled'
          ), 0)
      ) AS spent_week,

      GREATEST(0,
        COALESCE(SUM(ABS(amount)) FILTER (
          WHERE amount < 0
            AND created_at >= month_start
            AND (
              transaction_type NOT IN ('reward_claim', 'redemption')
              OR redemption_status = 'confirmed'
            )
        ), 0)
        - COALESCE(SUM(amount) FILTER (
            WHERE transaction_type = 'refund'
              AND amount > 0
              AND created_at >= month_start
              AND redemption_status IS DISTINCT FROM 'cancelled'
          ), 0)
      ) AS spent_month,

      GREATEST(0,
        COALESCE(SUM(ABS(amount)) FILTER (
          WHERE amount < 0
            AND (
              transaction_type NOT IN ('reward_claim', 'redemption')
              OR redemption_status = 'confirmed'
            )
        ), 0)
        - COALESCE(SUM(amount) FILTER (
            WHERE transaction_type = 'refund'
              AND amount > 0
              AND redemption_status IS DISTINCT FROM 'cancelled'
          ), 0)
      ) AS spent_all,

      -- ── Net (unchanged: ledger-authoritative balance delta) ─────────────────
      COALESCE(SUM(amount) FILTER (WHERE created_at >= day_start), 0)  AS net_today,
      COALESCE(SUM(amount) FILTER (WHERE created_at >= week_start), 0) AS net_week,
      COALESCE(SUM(amount) FILTER (WHERE created_at >= month_start), 0) AS net_month,
      COALESCE(SUM(amount), 0)                                          AS net_all

    FROM txns
  )
  SELECT 'today'::TEXT,   earned_today, spent_today, net_today FROM agg
  UNION ALL
  SELECT 'week'::TEXT,    earned_week,  spent_week,  net_week  FROM agg
  UNION ALL
  SELECT 'month'::TEXT,   earned_month, spent_month, net_month FROM agg
  UNION ALL
  SELECT 'allTime'::TEXT, earned_all,   spent_all,   net_all   FROM agg;
$$;
