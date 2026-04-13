-- Wallet summary: exclude refunds from "earned", subtract refunds from "spent",
-- and use SUM(amount) for "net" so it matches the ledger (incl. cancellations).
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
      p.day_start,
      p.week_start,
      p.month_start
    FROM public.drops_transactions dt
    CROSS JOIN periods p
    WHERE dt.user_id = auth.uid()
      AND (p_gym_id IS NULL OR dt.gym_id = p_gym_id)
  ),
  agg AS (
    SELECT
      -- Today
      COALESCE(SUM(amount) FILTER (
        WHERE amount > 0 AND transaction_type IS DISTINCT FROM 'refund' AND created_at >= day_start
      ), 0) AS earned_today,
      GREATEST(0,
        COALESCE(SUM(ABS(amount)) FILTER (WHERE amount < 0 AND created_at >= day_start), 0)
        - COALESCE(SUM(amount) FILTER (
            WHERE transaction_type = 'refund' AND amount > 0 AND created_at >= day_start
          ), 0)
      ) AS spent_today,
      COALESCE(SUM(amount) FILTER (WHERE created_at >= day_start), 0) AS net_today,

      COALESCE(SUM(amount) FILTER (
        WHERE amount > 0 AND transaction_type IS DISTINCT FROM 'refund' AND created_at >= week_start
      ), 0) AS earned_week,
      GREATEST(0,
        COALESCE(SUM(ABS(amount)) FILTER (WHERE amount < 0 AND created_at >= week_start), 0)
        - COALESCE(SUM(amount) FILTER (
            WHERE transaction_type = 'refund' AND amount > 0 AND created_at >= week_start
          ), 0)
      ) AS spent_week,
      COALESCE(SUM(amount) FILTER (WHERE created_at >= week_start), 0) AS net_week,

      COALESCE(SUM(amount) FILTER (
        WHERE amount > 0 AND transaction_type IS DISTINCT FROM 'refund' AND created_at >= month_start
      ), 0) AS earned_month,
      GREATEST(0,
        COALESCE(SUM(ABS(amount)) FILTER (WHERE amount < 0 AND created_at >= month_start), 0)
        - COALESCE(SUM(amount) FILTER (
            WHERE transaction_type = 'refund' AND amount > 0 AND created_at >= month_start
          ), 0)
      ) AS spent_month,
      COALESCE(SUM(amount) FILTER (WHERE created_at >= month_start), 0) AS net_month,

      COALESCE(SUM(amount) FILTER (
        WHERE amount > 0 AND transaction_type IS DISTINCT FROM 'refund'
      ), 0) AS earned_all,
      GREATEST(0,
        COALESCE(SUM(ABS(amount)) FILTER (WHERE amount < 0), 0)
        - COALESCE(SUM(amount) FILTER (
            WHERE transaction_type = 'refund' AND amount > 0
          ), 0)
      ) AS spent_all,
      COALESCE(SUM(amount), 0) AS net_all
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
