-- ============================================================
-- VALIDATION: Reward Band Enforcement Policy
-- ============================================================
-- Test gym: 4074dffe-6df8-4070-b560-5be794977bff
-- coffee band: min=120, max=220
-- We create a temporary out-of-band reward (price=50, below band)
-- and test warn/enforce modes + hard safety rails.

-- SCENARIO 1: mode=warn, out-of-band reward → should be redeemable
-- First ensure mode is 'warn'
UPDATE public.tokenomics_config
SET reward_band_enforcement_mode = 'warn'
WHERE gym_id = '4074dffe-6df8-4070-b560-5be794977bff';

-- Create temporary out-of-band test reward (coffee type, price 50 = below min 120)
INSERT INTO public.rewards (id, gym_id, name, reward_type, price_drops, is_active, redemption_limit)
VALUES (
  'aaaaaaaa-bbbb-cccc-dddd-000000000001',
  '4074dffe-6df8-4070-b560-5be794977bff',
  '__TEST_OOB_REWARD__',
  'coffee',
  50,
  true,
  'unlimited'
);

-- Find user with enough balance (>=50)
SELECT
  'SCENARIO 1 SETUP: test user' AS test,
  gm.user_id,
  gm.local_drops_balance
FROM public.gym_memberships gm
WHERE gm.gym_id = '4074dffe-6df8-4070-b560-5be794977bff'
  AND gm.local_drops_balance >= 50
ORDER BY gm.local_drops_balance DESC
LIMIT 1;

-- Call claim_reward in warn mode
SELECT
  'SCENARIO 1: warn mode, out-of-band coffee' AS test,
  cr.success,
  cr.error_message,
  CASE
    WHEN cr.success = true THEN 'PASS — allowed in warn mode'
    ELSE 'FAIL — should not be blocked in warn mode'
  END AS verdict
FROM public.claim_reward(
  (SELECT gm.user_id FROM public.gym_memberships gm
   WHERE gm.gym_id = '4074dffe-6df8-4070-b560-5be794977bff' AND gm.local_drops_balance >= 50
   ORDER BY gm.local_drops_balance DESC LIMIT 1),
  'aaaaaaaa-bbbb-cccc-dddd-000000000001',
  '4074dffe-6df8-4070-b560-5be794977bff'
) cr;

-- Check fraud_events log was created
SELECT
  'SCENARIO 1: fraud event logged' AS test,
  fe.event_type,
  fe.severity,
  fe.metadata->>'reward_type' AS reward_type,
  (fe.metadata->>'price_drops')::int AS price_drops,
  (fe.metadata->>'band_min')::int AS band_min,
  (fe.metadata->>'band_max')::int AS band_max,
  fe.metadata->>'enforcement_mode' AS enforcement_mode,
  CASE
    WHEN fe.event_type = 'reward_out_of_band_redeemed' THEN 'PASS — event logged'
    ELSE 'FAIL'
  END AS verdict
FROM public.fraud_events fe
WHERE fe.event_type = 'reward_out_of_band_redeemed'
  AND fe.metadata->>'reward_id' = 'aaaaaaaa-bbbb-cccc-dddd-000000000001'
ORDER BY fe.created_at DESC
LIMIT 1;

-- ============================================================
-- SCENARIO 2: mode=enforce, out-of-band reward → should be BLOCKED
-- ============================================================

UPDATE public.tokenomics_config
SET reward_band_enforcement_mode = 'enforce'
WHERE gym_id = '4074dffe-6df8-4070-b560-5be794977bff';

-- Create another test reward
INSERT INTO public.rewards (id, gym_id, name, reward_type, price_drops, is_active, redemption_limit)
VALUES (
  'aaaaaaaa-bbbb-cccc-dddd-000000000002',
  '4074dffe-6df8-4070-b560-5be794977bff',
  '__TEST_OOB_REWARD_ENFORCE__',
  'coffee',
  50,
  true,
  'unlimited'
);

SELECT
  'SCENARIO 2: enforce mode, out-of-band coffee' AS test,
  cr.success,
  cr.error_message,
  CASE
    WHEN cr.success = false AND cr.error_message = 'This reward is temporarily unavailable.' THEN 'PASS — blocked with safe message'
    WHEN cr.success = true THEN 'FAIL — should be blocked in enforce mode'
    ELSE 'FAIL — wrong error message: ' || COALESCE(cr.error_message, 'null')
  END AS verdict
FROM public.claim_reward(
  (SELECT gm.user_id FROM public.gym_memberships gm
   WHERE gm.gym_id = '4074dffe-6df8-4070-b560-5be794977bff' AND gm.local_drops_balance >= 50
   ORDER BY gm.local_drops_balance DESC LIMIT 1),
  'aaaaaaaa-bbbb-cccc-dddd-000000000002',
  '4074dffe-6df8-4070-b560-5be794977bff'
) cr;

-- ============================================================
-- SCENARIO 3: hard safety — zero price always blocked in both modes
-- ============================================================

INSERT INTO public.rewards (id, gym_id, name, reward_type, price_drops, is_active, redemption_limit)
VALUES (
  'aaaaaaaa-bbbb-cccc-dddd-000000000003',
  '4074dffe-6df8-4070-b560-5be794977bff',
  '__TEST_ZERO_PRICE__',
  'coffee',
  0,
  true,
  'unlimited'
);

-- Test in warn mode
UPDATE public.tokenomics_config
SET reward_band_enforcement_mode = 'warn'
WHERE gym_id = '4074dffe-6df8-4070-b560-5be794977bff';

SELECT
  'SCENARIO 3a: hard safety, zero price in warn mode' AS test,
  cr.success,
  cr.error_message,
  CASE
    WHEN cr.success = false AND cr.error_message = 'Invalid reward pricing' THEN 'PASS — hard block'
    ELSE 'FAIL — should always block zero price'
  END AS verdict
FROM public.claim_reward(
  (SELECT gm.user_id FROM public.gym_memberships gm
   WHERE gm.gym_id = '4074dffe-6df8-4070-b560-5be794977bff' AND gm.local_drops_balance >= 50
   ORDER BY gm.local_drops_balance DESC LIMIT 1),
  'aaaaaaaa-bbbb-cccc-dddd-000000000003',
  '4074dffe-6df8-4070-b560-5be794977bff'
) cr;

-- Test in enforce mode
UPDATE public.tokenomics_config
SET reward_band_enforcement_mode = 'enforce'
WHERE gym_id = '4074dffe-6df8-4070-b560-5be794977bff';

SELECT
  'SCENARIO 3b: hard safety, zero price in enforce mode' AS test,
  cr.success,
  cr.error_message,
  CASE
    WHEN cr.success = false AND cr.error_message = 'Invalid reward pricing' THEN 'PASS — hard block'
    ELSE 'FAIL — should always block zero price'
  END AS verdict
FROM public.claim_reward(
  (SELECT gm.user_id FROM public.gym_memberships gm
   WHERE gm.gym_id = '4074dffe-6df8-4070-b560-5be794977bff' AND gm.local_drops_balance >= 50
   ORDER BY gm.local_drops_balance DESC LIMIT 1),
  'aaaaaaaa-bbbb-cccc-dddd-000000000003',
  '4074dffe-6df8-4070-b560-5be794977bff'
) cr;

-- ============================================================
-- CLEANUP: restore state and remove test data
-- ============================================================

UPDATE public.tokenomics_config
SET reward_band_enforcement_mode = 'warn'
WHERE gym_id = '4074dffe-6df8-4070-b560-5be794977bff';

-- Reverse the scenario 1 redemption: restore balance + remove redemption + remove tx
DELETE FROM public.drops_transactions
WHERE reference_id IN (
  SELECT id FROM public.redemptions
  WHERE reward_id IN (
    'aaaaaaaa-bbbb-cccc-dddd-000000000001',
    'aaaaaaaa-bbbb-cccc-dddd-000000000002',
    'aaaaaaaa-bbbb-cccc-dddd-000000000003'
  )
);

-- Refund balance for scenario 1 successful claim
UPDATE public.gym_memberships
SET local_drops_balance = local_drops_balance + 50
WHERE user_id = (
  SELECT r.user_id FROM public.redemptions r
  WHERE r.reward_id = 'aaaaaaaa-bbbb-cccc-dddd-000000000001'
  LIMIT 1
)
AND gym_id = '4074dffe-6df8-4070-b560-5be794977bff';

UPDATE public.profiles
SET available_drops = available_drops + 50
WHERE id = (
  SELECT r.user_id FROM public.redemptions r
  WHERE r.reward_id = 'aaaaaaaa-bbbb-cccc-dddd-000000000001'
  LIMIT 1
);

DELETE FROM public.redemptions
WHERE reward_id IN (
  'aaaaaaaa-bbbb-cccc-dddd-000000000001',
  'aaaaaaaa-bbbb-cccc-dddd-000000000002',
  'aaaaaaaa-bbbb-cccc-dddd-000000000003'
);

DELETE FROM public.fraud_events
WHERE metadata->>'reward_id' IN (
  'aaaaaaaa-bbbb-cccc-dddd-000000000001',
  'aaaaaaaa-bbbb-cccc-dddd-000000000002',
  'aaaaaaaa-bbbb-cccc-dddd-000000000003'
);

DELETE FROM public.rewards
WHERE id IN (
  'aaaaaaaa-bbbb-cccc-dddd-000000000001',
  'aaaaaaaa-bbbb-cccc-dddd-000000000002',
  'aaaaaaaa-bbbb-cccc-dddd-000000000003'
);

SELECT 'CLEANUP COMPLETE' AS status;
