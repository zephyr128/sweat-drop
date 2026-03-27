-- Verification: perform_checkin() lenient full award + diagnostics (migration 20260327120000)
-- Run after applying migrations (local: supabase db reset / remote: push).

-- 1) Lenient hotfix: no LEAST(v_drops, 1) cap on unverified GPS; full award path sets v_effective_drops := v_drops
SELECT
  'perform_checkin definition' AS check_type,
  proname,
  pg_get_functiondef(oid) NOT LIKE '%LEAST(v_drops, 1)%' AS no_least_cap_on_v_drops,
  pg_get_functiondef(oid) LIKE '%gps_unverified_lenient%' AS has_lenient_cap_reason,
  pg_get_functiondef(oid) LIKE '%configured_checkin_drops%' AS has_configured_key,
  pg_get_functiondef(oid) LIKE '%awarded_checkin_drops%' AS has_awarded_key,
  pg_get_functiondef(oid) LIKE '%daily_cap_reached%' AS has_daily_cap_reason,
  CASE
    WHEN pg_get_functiondef(oid) NOT LIKE '%LEAST(v_drops, 1)%'
      AND pg_get_functiondef(oid) LIKE '%v_effective_drops := v_drops%'
      AND pg_get_functiondef(oid) LIKE '%gps_unverified_lenient%'
    THEN 'OK — lenient full award + diagnostics present'
    ELSE 'FAIL — review perform_checkin migration'
  END AS status
FROM pg_proc
WHERE proname = 'perform_checkin'
  AND pronamespace = 'public'::regnamespace;

-- 2) Manual RPC test cases (run as authenticated test user; adjust gym UUID + state)
--
-- Lenient + unverified GPS (no lat/lng or gym has no coords so GPS cannot verify):
--   Expect: success true, drops_earned = gyms.checkin_drops (e.g. 5), cap_reason = 'gps_unverified_lenient'
--
-- Strict + unverified (null lat/lng):
--   Expect: success false, error = 'gps_required', cap_reason = 'gps_required_strict', awarded_checkin_drops = 0
--
-- Strict + verified (lat/lng within gps_radius_m):
--   Expect: success true, drops_earned = checkin_drops, gps_verified true, cap_reason null
--
-- Second check-in same gym same Belgrade day:
--   Expect: success false, error = 'already_checked_in', cap_reason = 'daily_cap_reached'
