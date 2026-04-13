-- Fix wallet summary: use ALL positive amounts as earned, ALL negative as spent.
-- This ensures the totals match local_drops_balance exactly (earned - spent = balance).
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
      COALESCE(SUM(amount) FILTER (WHERE amount > 0 AND created_at >= day_start), 0) AS earned_today,
      COALESCE(SUM(ABS(amount)) FILTER (WHERE amount < 0 AND created_at >= day_start), 0) AS spent_today,
      -- Week
      COALESCE(SUM(amount) FILTER (WHERE amount > 0 AND created_at >= week_start), 0) AS earned_week,
      COALESCE(SUM(ABS(amount)) FILTER (WHERE amount < 0 AND created_at >= week_start), 0) AS spent_week,
      -- Month
      COALESCE(SUM(amount) FILTER (WHERE amount > 0 AND created_at >= month_start), 0) AS earned_month,
      COALESCE(SUM(ABS(amount)) FILTER (WHERE amount < 0 AND created_at >= month_start), 0) AS spent_month,
      -- All time
      COALESCE(SUM(amount) FILTER (WHERE amount > 0), 0) AS earned_all,
      COALESCE(SUM(ABS(amount)) FILTER (WHERE amount < 0), 0) AS spent_all
    FROM txns
  )
  SELECT 'today'::TEXT,   earned_today, spent_today, earned_today - spent_today FROM agg
  UNION ALL
  SELECT 'week'::TEXT,    earned_week,  spent_week,  earned_week  - spent_week  FROM agg
  UNION ALL
  SELECT 'month'::TEXT,   earned_month, spent_month, earned_month - spent_month FROM agg
  UNION ALL
  SELECT 'allTime'::TEXT, earned_all,   spent_all,   earned_all   - spent_all   FROM agg;
$$;
