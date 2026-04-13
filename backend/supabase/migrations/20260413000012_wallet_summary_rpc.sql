-- Server-side wallet summary: aggregates earned/spent/net per time period.
-- Replaces client-side summing over limited transaction rows.
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
      -- Monday-based week start
      (date_trunc('day', now()) - ((EXTRACT(ISODOW FROM now())::int - 1) || ' days')::interval)::timestamptz AS week_start,
      date_trunc('month', now())::timestamptz AS month_start
  ),
  earn_types AS (
    SELECT unnest(ARRAY['session','checkin','challenge','bonus','arena','referral_reward','streak']) AS t
  ),
  spend_types AS (
    SELECT unnest(ARRAY['redemption','reward_claim','expired','arena_entry']) AS t
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
        WHERE transaction_type IN (SELECT t FROM earn_types)
          AND amount > 0
          AND created_at >= day_start
      ), 0) AS earned_today,
      COALESCE(SUM(ABS(amount)) FILTER (
        WHERE transaction_type IN (SELECT t FROM spend_types)
          AND amount < 0
          AND created_at >= day_start
      ), 0) - COALESCE(SUM(ABS(amount)) FILTER (
        WHERE transaction_type = 'refund'
          AND amount > 0
          AND created_at >= day_start
      ), 0) AS spent_today,
      -- Week
      COALESCE(SUM(amount) FILTER (
        WHERE transaction_type IN (SELECT t FROM earn_types)
          AND amount > 0
          AND created_at >= week_start
      ), 0) AS earned_week,
      COALESCE(SUM(ABS(amount)) FILTER (
        WHERE transaction_type IN (SELECT t FROM spend_types)
          AND amount < 0
          AND created_at >= week_start
      ), 0) - COALESCE(SUM(ABS(amount)) FILTER (
        WHERE transaction_type = 'refund'
          AND amount > 0
          AND created_at >= week_start
      ), 0) AS spent_week,
      -- Month
      COALESCE(SUM(amount) FILTER (
        WHERE transaction_type IN (SELECT t FROM earn_types)
          AND amount > 0
          AND created_at >= month_start
      ), 0) AS earned_month,
      COALESCE(SUM(ABS(amount)) FILTER (
        WHERE transaction_type IN (SELECT t FROM spend_types)
          AND amount < 0
          AND created_at >= month_start
      ), 0) - COALESCE(SUM(ABS(amount)) FILTER (
        WHERE transaction_type = 'refund'
          AND amount > 0
          AND created_at >= month_start
      ), 0) AS spent_month,
      -- All time
      COALESCE(SUM(amount) FILTER (
        WHERE transaction_type IN (SELECT t FROM earn_types)
          AND amount > 0
      ), 0) AS earned_all,
      COALESCE(SUM(ABS(amount)) FILTER (
        WHERE transaction_type IN (SELECT t FROM spend_types)
          AND amount < 0
      ), 0) - COALESCE(SUM(ABS(amount)) FILTER (
        WHERE transaction_type = 'refund'
          AND amount > 0
      ), 0) AS spent_all
    FROM txns
  )
  SELECT 'today'::TEXT,   earned_today, GREATEST(spent_today, 0), earned_today - GREATEST(spent_today, 0) FROM agg
  UNION ALL
  SELECT 'week'::TEXT,    earned_week,  GREATEST(spent_week, 0),  earned_week  - GREATEST(spent_week, 0)  FROM agg
  UNION ALL
  SELECT 'month'::TEXT,   earned_month, GREATEST(spent_month, 0), earned_month - GREATEST(spent_month, 0) FROM agg
  UNION ALL
  SELECT 'allTime'::TEXT, earned_all,   GREATEST(spent_all, 0),   earned_all   - GREATEST(spent_all, 0)   FROM agg;
$$;

GRANT EXECUTE ON FUNCTION public.get_wallet_summary(UUID) TO authenticated;
