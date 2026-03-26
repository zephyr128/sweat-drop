-- ============================================================
-- VALIDATION: Leaderboard Earned Score + 90-Day Expiry + Transparency RPCs
-- ============================================================

-- ============================================================
-- GROUP 1: Leaderboard bug fix validation
-- ============================================================
-- Scenario: user earns 2000 drops via sessions, spends 1200 on reward
-- Expected: wallet = 800, leaderboard all_time score = 2000 (earned-only)

-- Find a real user with both earning and spending transactions
SELECT
  'GROUP 1: Leaderboard earned vs wallet' AS test_group,
  dt.user_id,
  dt.gym_id,
  SUM(dt.amount) FILTER (WHERE dt.amount > 0 AND dt.transaction_type IN ('session','checkin','workout','challenge')) AS total_earned,
  SUM(ABS(dt.amount)) FILTER (WHERE dt.amount < 0) AS total_spent,
  SUM(dt.amount) AS net_balance
FROM public.drops_transactions dt
WHERE dt.gym_id IS NOT NULL
GROUP BY dt.user_id, dt.gym_id
HAVING SUM(dt.amount) FILTER (WHERE dt.amount > 0) > 0
   AND SUM(dt.amount) FILTER (WHERE dt.amount < 0) < 0
LIMIT 3;

-- Validate get_user_earned_drops_gym helper
SELECT
  'GROUP 1: get_user_earned_drops_gym helper' AS test,
  public.get_user_earned_drops_gym(dt.user_id, dt.gym_id, 'all_time') AS earned_all_time,
  public.get_user_earned_drops_gym(dt.user_id, dt.gym_id, 'weekly') AS earned_weekly,
  public.get_user_earned_drops_gym(dt.user_id, dt.gym_id, 'monthly') AS earned_monthly,
  gm.local_drops_balance AS wallet_balance,
  dt.user_id,
  dt.gym_id
FROM public.drops_transactions dt
JOIN public.gym_memberships gm ON gm.user_id = dt.user_id AND gm.gym_id = dt.gym_id
WHERE dt.gym_id IS NOT NULL AND dt.amount > 0
GROUP BY dt.user_id, dt.gym_id, gm.local_drops_balance
HAVING SUM(dt.amount) FILTER (WHERE dt.amount > 0) > 0
LIMIT 3;

-- Validate leaderboard uses earned score, not wallet
-- Compare earned_score vs leaderboard score for all_time
SELECT
  'GROUP 1: leaderboard all_time vs earned' AS test,
  lb.user_id,
  lb.score AS leaderboard_score,
  public.get_user_earned_drops_gym(lb.user_id, gm.gym_id, 'all_time') AS earned_score,
  gm.local_drops_balance AS wallet_balance,
  CASE
    WHEN lb.score = public.get_user_earned_drops_gym(lb.user_id, gm.gym_id, 'all_time') THEN 'PASS'
    ELSE 'FAIL'
  END AS verdict
FROM (
  SELECT DISTINCT gym_id FROM public.gym_memberships LIMIT 1
) gg
CROSS JOIN LATERAL (
  SELECT * FROM public.get_leaderboard('gym', gg.gym_id, 'all_time', 5, false)
) lb
JOIN public.gym_memberships gm ON gm.user_id = lb.user_id AND gm.gym_id = gg.gym_id
LIMIT 5;

-- ============================================================
-- GROUP 2: Expiry enforcement validation
-- ============================================================

-- Check backfill: all positive session/checkin/workout should have expires_at
SELECT
  'GROUP 2: Expiry backfill coverage' AS test,
  dt.transaction_type,
  COUNT(*) AS total_positive,
  COUNT(dt.expires_at) AS has_expires_at,
  COUNT(*) - COUNT(dt.expires_at) AS missing_expires_at,
  CASE
    WHEN COUNT(*) = COUNT(dt.expires_at) THEN 'PASS'
    ELSE 'PARTIAL'
  END AS verdict
FROM public.drops_transactions dt
WHERE dt.amount > 0
  AND dt.transaction_type IN ('session', 'checkin', 'workout')
GROUP BY dt.transaction_type
ORDER BY dt.transaction_type;

-- Check expire_stale_drops function exists and covers all types
SELECT
  'GROUP 2: expire_stale_drops function exists' AS test,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM pg_proc p
      WHERE p.proname = 'expire_stale_drops'
        AND p.pronamespace = 'public'::regnamespace
    ) THEN 'PASS'
    ELSE 'FAIL'
  END AS verdict;

-- Check 90-day interval correctness
SELECT
  'GROUP 2: 90-day interval check' AS test,
  dt.transaction_type,
  dt.created_at,
  dt.expires_at,
  EXTRACT(DAY FROM dt.expires_at - dt.created_at) AS days_until_expiry,
  CASE
    WHEN EXTRACT(DAY FROM dt.expires_at - dt.created_at) BETWEEN 89 AND 91 THEN 'PASS'
    ELSE 'FAIL'
  END AS verdict
FROM public.drops_transactions dt
WHERE dt.amount > 0
  AND dt.expires_at IS NOT NULL
  AND dt.transaction_type IN ('session', 'checkin', 'workout')
ORDER BY dt.created_at DESC
LIMIT 5;

-- ============================================================
-- GROUP 3: RPC correctness validation
-- ============================================================

-- Validate get_user_expiring_drops function exists
SELECT
  'GROUP 3: get_user_expiring_drops exists' AS test,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM pg_proc p
      WHERE p.proname = 'get_user_expiring_drops'
        AND p.pronamespace = 'public'::regnamespace
    ) THEN 'PASS'
    ELSE 'FAIL'
  END AS verdict;

-- Validate get_user_drops_ledger_summary function exists
SELECT
  'GROUP 3: get_user_drops_ledger_summary exists' AS test,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM pg_proc p
      WHERE p.proname = 'get_user_drops_ledger_summary'
        AND p.pronamespace = 'public'::regnamespace
    ) THEN 'PASS'
    ELSE 'FAIL'
  END AS verdict;

-- Check upcoming expiry data shape (using a real user)
SELECT
  'GROUP 3: expiry bucket check' AS test,
  dt.user_id,
  SUM(dt.amount) FILTER (WHERE dt.expires_at > NOW() AND dt.expires_at <= NOW() + INTERVAL '7 days') AS manual_7d,
  SUM(dt.amount) FILTER (WHERE dt.expires_at > NOW() AND dt.expires_at <= NOW() + INTERVAL '30 days') AS manual_30d,
  MIN(dt.expires_at) FILTER (WHERE dt.expires_at > NOW()) AS manual_next_expiry
FROM public.drops_transactions dt
WHERE dt.amount > 0
  AND dt.expires_at IS NOT NULL
  AND dt.transaction_type IN ('session', 'checkin', 'workout')
GROUP BY dt.user_id
HAVING SUM(dt.amount) FILTER (WHERE dt.expires_at > NOW()) > 0
LIMIT 3;
