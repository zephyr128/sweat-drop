-- ============================================================
-- VERIFY: Mobile Listing + Verified Check-in Referral
-- Migration: 20260328000002
-- Run: cd backend && npx supabase db query --linked < supabase/VERIFY_MOBILE_LISTING_AND_VERIFIED_REFERRAL.sql
-- ============================================================

-- ==================== A: Mobile Listing ====================

-- A1: is_mobile_listed column exists and backfilled from is_pilot_enabled
SELECT 'A1: column+backfill' AS test,
  COUNT(*) AS total_gyms,
  COUNT(*) FILTER (WHERE is_mobile_listed = is_pilot_enabled) AS matching_pilot
FROM public.gyms;
-- Expected: total = matching (all synced)

-- A2: Listing RPC returns only mobile-listed gyms (default)
SELECT 'A2: listed-only' AS test,
  COUNT(*) AS count,
  bool_and(is_mobile_listed) AS all_listed
FROM public.get_public_gyms_for_mobile();
-- Expected: all_listed = true

-- A3: Backward-compat p_pilot_only still works
SELECT 'A3: pilot-compat' AS test, COUNT(*) AS count
FROM public.get_public_gyms_for_mobile(p_pilot_only := true);

-- A4: p_listed_only=false shows all active gyms
SELECT 'A4: all-active' AS test, COUNT(*) AS count
FROM public.get_public_gyms_for_mobile(p_listed_only := false);

-- ==================== B: Referral Verified-Checkin ==========

-- B1: qualified_verified_at column exists
SELECT 'B1: column' AS test, column_name
FROM information_schema.columns
WHERE table_schema='public' AND table_name='referrals'
  AND column_name='qualified_verified_at';
-- Expected: 1 row

-- B2: All referral RPCs exist
SELECT 'B2: RPCs' AS test, proname, pg_get_function_identity_arguments(oid) AS args
FROM pg_proc
WHERE proname IN (
  'evaluate_referral_qualification','get_referral_timeline',
  'get_my_referrals','get_referral_stats',
  'create_referral_invite','apply_referral_code'
) AND pronamespace='public'::regnamespace
ORDER BY proname;
-- Expected: 6 rows

-- B3: Self-referral produces error (test manually with set_config)
-- SELECT set_config('request.jwt.claim.sub', '<referrer_id>', true);
-- SELECT * FROM public.apply_referral_code('<own_code>', '<gym_id>');
-- Expected: error = 'self_referral_blocked'

-- B4: Non-verified checkin does NOT trigger reward
-- 1. Create invite (set_config as referrer)
-- 2. Apply code (set_config as invitee)
-- 3. Ensure invitee has checkin at gym but NO verified identity
-- 4. Call evaluate_referral_qualification
-- Expected: status='active', qualified_verified_at=null, rewarded=false

-- B5: Verified checkin DOES trigger reward
-- 1. Insert gym_member_identities(is_verified=true) for invitee
-- 2. Call evaluate_referral_qualification again
-- Expected: status='rewarded', invitee_bonus_drops=100, referrer_reward_drops=150

-- B6: Idempotency
-- Call evaluate_referral_qualification again after B5
-- Expected: same rewarded_at/tx_id, no balance change

-- B7: Monthly cap boundary
-- Create 5+ rewarded referrals for same referrer in current month
-- 6th should return reward_block_reason='monthly_cap_reached'

-- B8: Expiry (30 days)
-- INSERT referral with expires_at in past -> evaluate returns 'referral_expired'
