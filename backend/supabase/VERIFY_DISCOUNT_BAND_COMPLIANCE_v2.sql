-- VERIFY: Discount-Aware Band Compliance (SELECT-based output)
-- Real gym band for coffee: min=240, max=293

-- Setup: insert test rewards
INSERT INTO public.rewards (id, gym_id, name, description, reward_type, price_drops,
  price_calc_mode, discount_percent, base_price_rsd)
VALUES
  ('aaaaaaaa-0001-0001-0001-000000000001', '4074dffe-6df8-4070-b560-5be794977bff',
   '__TEST_DISC_20pct', 'test', 'coffee', 200,
   'discount_from_rsd', 20, 125.00),
  ('aaaaaaaa-0001-0001-0001-000000000002', '4074dffe-6df8-4070-b560-5be794977bff',
   '__TEST_MANUAL_LOW', 'test', 'coffee', 100,
   'manual_drops', 0, NULL),
  ('aaaaaaaa-0001-0001-0001-000000000003', '4074dffe-6df8-4070-b560-5be794977bff',
   '__TEST_MANUAL_OK', 'test', 'coffee', 260,
   'manual_drops', 0, NULL)
ON CONFLICT DO NOTHING;

-- Query: check what trigger wrote for discount mode reward
SELECT 'trigger_check' AS scenario, id, name, price_drops, discount_percent, price_calc_mode
FROM public.rewards WHERE id = 'aaaaaaaa-0001-0001-0001-000000000001';

-- Scenario 1: discount_from_rsd, 20% off
-- Trigger computed price_drops from base_price_rsd=125, discount=20%, drops_per_rsd=2.0
-- effective_rsd = 125*(1-0.20) = 100, effective_drops = round(100*2.0) = 200
-- normalized for compliance = 200 / (1-0.20) = 250
-- band [240,293] => in_band=true
SELECT 'S1: discount 20%%' AS scenario,
  c.reward_name, c.final_price_drops, c.discount_percent,
  c.normalized_price_drops, c.band_min, c.band_max, c.in_band, c.compliance_reason
FROM public.compute_reward_band_compliance(
  'aaaaaaaa-0001-0001-0001-000000000001',
  '4074dffe-6df8-4070-b560-5be794977bff') c;

-- Scenario 2: manual, final=100, no discount => below band
SELECT 'S2: manual low' AS scenario,
  c.reward_name, c.final_price_drops, c.discount_percent,
  c.normalized_price_drops, c.band_min, c.band_max, c.in_band, c.compliance_reason
FROM public.compute_reward_band_compliance(
  'aaaaaaaa-0001-0001-0001-000000000002',
  '4074dffe-6df8-4070-b560-5be794977bff') c;

-- Scenario 3: manual, final=260 => in band
SELECT 'S3: manual ok' AS scenario,
  c.reward_name, c.final_price_drops, c.discount_percent,
  c.normalized_price_drops, c.band_min, c.band_max, c.in_band, c.compliance_reason
FROM public.compute_reward_band_compliance(
  'aaaaaaaa-0001-0001-0001-000000000003',
  '4074dffe-6df8-4070-b560-5be794977bff') c;

-- Cleanup
DELETE FROM public.rewards WHERE id IN (
  'aaaaaaaa-0001-0001-0001-000000000001',
  'aaaaaaaa-0001-0001-0001-000000000002',
  'aaaaaaaa-0001-0001-0001-000000000003'
);
