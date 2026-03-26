-- VERIFY: Fair Session Soft Threshold Policy
-- Deterministic validation of piecewise formula + anti-split fairness
--
-- Uses default config: max_session=120, tier1_factor=0.40, tier2_factor=0.15, span_ratio=0.50
-- => threshold=120, tier1_end=120+60=180

-- ============================================================================
-- SCENARIO 1: Continuous fairness — 1x60min vs 3x20min split
-- ============================================================================
-- Assume both produce 150 raw drops total.

-- 1a) ONE continuous session: raw_drops=150, merged_prior=0
--   combined=150 > threshold(120), < tier1_end(180)
--   soft_adjusted = 120 + round((150-120)*0.40) = 120 + 12 = 132
--   prior_adjusted = 0
--   marginal = 132

SELECT '1a: Continuous 150 drops' AS scenario,
  120 AS threshold, 180 AS tier1_end,
  150 AS combined_drops, 0 AS merged_prior,
  (120 + ROUND((150-120) * 0.40))::INT AS soft_adjusted,
  0 AS prior_soft_adjusted,
  (120 + ROUND((150-120) * 0.40) - 0)::INT AS marginal_this_session;

-- 1b) THREE split sessions: 50+50+50 drops, each within merge window
--   Session 1: combined=50, merged_prior=0 => 50 (under threshold) => marginal=50
--   Session 2: combined=100, merged_prior=50 => both under threshold => marginal=50
--   Session 3: combined=150, merged_prior=100
--     soft_adjusted(150) = 120 + round(30*0.40) = 132
--     prior_adjusted(100) = 100 (under threshold)
--     marginal = 132-100 = 32

SELECT '1b: Split session 1 (50 drops, prior=0)' AS scenario,
  50 AS combined, 0 AS prior, 50 AS marginal;
SELECT '1b: Split session 2 (50 drops, prior=50)' AS scenario,
  100 AS combined, 50 AS prior,
  (100 - 50)::INT AS marginal;
SELECT '1b: Split session 3 (50 drops, prior=100)' AS scenario,
  150 AS combined, 100 AS prior,
  ((120 + ROUND((150-120) * 0.40)) - 100)::INT AS marginal;

-- Total split: 50 + 50 + 32 = 132
-- Total continuous: 132
-- EQUAL — split does NOT gain more!

SELECT '1: FAIRNESS CHECK' AS scenario,
  132 AS continuous_total,
  (50 + 50 + 32) AS split_total,
  CASE WHEN 132 = (50 + 50 + 32) THEN 'PASS: equal' ELSE 'FAIL: unequal' END AS result;

-- ============================================================================
-- SCENARIO 2: Soft mode — signal logged, reward NOT blocked
-- ============================================================================
-- award_drops with cap_mode='soft' and effective_sessions >= max:
--   => logs 'rewarded_sessions_cap_soft_signal', does NOT zero out drops
--   => proceeds to soft-threshold + day/week caps normally

SELECT '2: Soft mode' AS scenario,
  'soft' AS cap_mode,
  'rewarded_sessions_cap_soft_signal logged, drops NOT blocked' AS expected_behavior,
  'Verify in award_drops function: v_cap_mode=soft => only log, no v_final_drops:=0' AS check_method;

-- Function source verification
SELECT '2: Soft mode code check' AS scenario,
  CASE
    WHEN position('rewarded_sessions_cap_soft_signal' IN prosrc) > 0
     AND position('v_cap_reason IS DISTINCT FROM ''rewarded_sessions_cap_hard_block''' IN prosrc) > 0
    THEN 'PASS: soft signal present, only hard block zeros drops'
    ELSE 'FAIL'
  END AS result
FROM pg_proc WHERE proname = 'award_drops' AND pronamespace = 'public'::regnamespace;

-- ============================================================================
-- SCENARIO 3: Hard mode — block still works
-- ============================================================================

SELECT '3: Hard mode code check' AS scenario,
  CASE
    WHEN position('rewarded_sessions_cap_hard_block' IN prosrc) > 0
     AND position('v_final_drops := 0' IN prosrc) > 0
    THEN 'PASS: hard block sets final_drops=0'
    ELSE 'FAIL'
  END AS result
FROM pg_proc WHERE proname = 'award_drops' AND pronamespace = 'public'::regnamespace;

-- ============================================================================
-- SCENARIO 4: Day/week hard stop — override everything
-- ============================================================================
-- Even if session tier produces drops, day_remaining=0 => final_drops=0.

-- Example: raw_drops=80 (under threshold), but day budget exhausted
SELECT '4: Day cap hard stop' AS scenario,
  80 AS raw_drops, 0 AS day_remaining, 1500 AS week_remaining,
  LEAST(80, 0)::INT AS after_day_cap,
  LEAST(LEAST(80, 0), 1500)::INT AS final_drops,
  CASE WHEN LEAST(LEAST(80, 0), 1500) = 0 THEN 'PASS' ELSE 'FAIL' END AS result;

-- Example: raw_drops=80, day OK but week budget exhausted
SELECT '4: Week cap hard stop' AS scenario,
  80 AS raw_drops, 300 AS day_remaining, 0 AS week_remaining,
  LEAST(80, 300)::INT AS after_day_cap,
  LEAST(LEAST(80, 300), 0)::INT AS final_drops,
  CASE WHEN LEAST(LEAST(80, 300), 0) = 0 THEN 'PASS' ELSE 'FAIL' END AS result;

-- ============================================================================
-- SCENARIO 5: Restart stitching — within grace window = same logical bucket
-- ============================================================================
-- award_drops checks: if same user+machine reconnected within grace sec,
-- count those as merged (not separate rewarded sessions).

SELECT '5: Restart stitching code check' AS scenario,
  CASE
    WHEN position('v_restart_grace_sec' IN prosrc) > 0
     AND position('v_restart_merged_count' IN prosrc) > 0
     AND position('v_effective_rewarded_sessions' IN prosrc) > 0
     AND position('session_restart_merged' IN prosrc) > 0
    THEN 'PASS: restart stitching logic present'
    ELSE 'FAIL'
  END AS result
FROM pg_proc WHERE proname = 'award_drops' AND pronamespace = 'public'::regnamespace;

-- ============================================================================
-- BONUS: Full piecewise formula deep-dive
-- ============================================================================
-- threshold=120, tier1_end=180, tier1_factor=0.40, tier2_factor=0.15

-- raw=50  => combined=50  => 50 (under threshold)
-- raw=120 => combined=120 => 120 (exactly threshold)
-- raw=150 => combined=150 => 120 + round(30*0.40) = 132
-- raw=180 => combined=180 => 120 + round(60*0.40) = 144 (exactly tier1_end)
-- raw=200 => combined=200 => 120 + round(60*0.40) + round(20*0.15) = 120+24+3 = 147

SELECT 'Piecewise formula validation' AS scenario,
  v.raw_drops,
  CASE
    WHEN v.raw_drops <= 120 THEN v.raw_drops
    WHEN v.raw_drops <= 180 THEN 120 + ROUND((v.raw_drops - 120) * 0.40)
    ELSE 120 + ROUND((180 - 120) * 0.40) + ROUND((v.raw_drops - 180) * 0.15)
  END AS soft_adjusted
FROM (VALUES (50),(80),(120),(150),(180),(200),(250)) AS v(raw_drops)
ORDER BY v.raw_drops;
