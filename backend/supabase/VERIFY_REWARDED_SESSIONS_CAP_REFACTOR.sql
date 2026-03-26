-- VERIFY: Rewarded Sessions Cap Refactor
-- Checks schema, function signatures, and default data

-- 1. Verify new columns exist with correct defaults
SELECT
  column_name,
  data_type,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'tokenomics_config'
  AND column_name IN ('enforce_rewarded_sessions_cap', 'rewarded_sessions_cap_mode', 'session_restart_grace_sec')
ORDER BY column_name;

-- 2. Verify constraints exist
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.tokenomics_config'::regclass
  AND conname IN ('chk_rewarded_sessions_cap_mode', 'chk_session_restart_grace_sec');

-- 3. Verify all rows default to soft mode
SELECT
  gym_id,
  rewarded_sessions_cap_mode,
  enforce_rewarded_sessions_cap,
  session_restart_grace_sec
FROM public.tokenomics_config;

-- 4. Verify get_user_drop_limits returns new columns
SELECT
  p.proname,
  pg_get_function_result(p.oid) AS return_columns
FROM pg_proc p
WHERE p.proname = 'get_user_drop_limits'
  AND p.pronamespace = 'public'::regnamespace;

-- 5. Verify award_drops function contains new cap_mode logic
SELECT
  CASE
    WHEN position('rewarded_sessions_cap_mode' IN prosrc) > 0 THEN 'OK: cap_mode logic present'
    ELSE 'FAIL: cap_mode logic missing'
  END AS award_drops_cap_mode_check,
  CASE
    WHEN position('session_restart_grace_sec' IN prosrc) > 0 THEN 'OK: restart grace logic present'
    ELSE 'FAIL: restart grace logic missing'
  END AS award_drops_restart_grace_check,
  CASE
    WHEN position('rewarded_sessions_cap_soft_signal' IN prosrc) > 0 THEN 'OK: soft signal event present'
    ELSE 'FAIL: soft signal event missing'
  END AS award_drops_soft_signal_check,
  CASE
    WHEN position('rewarded_sessions_cap_hard_block' IN prosrc) > 0 THEN 'OK: hard block event present'
    ELSE 'FAIL: hard block event missing'
  END AS award_drops_hard_block_check
FROM pg_proc
WHERE proname = 'award_drops'
  AND pronamespace = 'public'::regnamespace;
