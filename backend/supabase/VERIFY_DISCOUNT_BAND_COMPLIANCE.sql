-- VERIFY: Discount-Aware Band Compliance
-- Tests 3 scenarios using temporary test rewards
-- Band for coffee on gym 4074dffe: min=240, max=293

-- Scenario 1: Coffee final=160, discount=20%, band 240-293
-- normalized = 160 / (1 - 0.20) = 160 / 0.80 = 200 => below 240 => out of band
-- BUT per task description: band 120-220 was example; real band is 240-293.
-- Let's test with final=200, discount=20%: normalized = 200/0.8 = 250 => in band [240,293]

-- Scenario 2: Coffee final=100, discount=0%, manual mode => normalized=100 => below 240 => out of band

-- Scenario 3: Manual mode reward at 260 drops => normalized=260 => in band

DO $$
DECLARE
  v_gym_id UUID := '4074dffe-6df8-4070-b560-5be794977bff';
  v_r1 UUID; v_r2 UUID; v_r3 UUID;
  v_row RECORD;
BEGIN
  -- Create test rewards
  INSERT INTO public.rewards (gym_id, name, description, reward_type, price_drops,
    price_calc_mode, discount_percent, base_price_rsd)
  VALUES (v_gym_id, '__TEST_DISC_20pct', 'test', 'coffee', 200,
    'discount_from_rsd', 20, 125.00)
  RETURNING id INTO v_r1;

  INSERT INTO public.rewards (gym_id, name, description, reward_type, price_drops,
    price_calc_mode, discount_percent)
  VALUES (v_gym_id, '__TEST_MANUAL_LOW', 'test', 'coffee', 100,
    'manual_drops', 0)
  RETURNING id INTO v_r2;

  INSERT INTO public.rewards (gym_id, name, description, reward_type, price_drops,
    price_calc_mode, discount_percent)
  VALUES (v_gym_id, '__TEST_MANUAL_OK', 'test', 'coffee', 260,
    'manual_drops', 0)
  RETURNING id INTO v_r3;

  -- Scenario 1: discount 20%, final=200 => normalized=250, band [240,293] => in_band
  SELECT * INTO v_row FROM public.compute_reward_band_compliance(v_r1, v_gym_id);
  RAISE NOTICE 'S1: name=%, final=%, disc=%, normalized=%, band=[%,%], in_band=%, reason=%',
    v_row.reward_name, v_row.final_price_drops, v_row.discount_percent,
    v_row.normalized_price_drops, v_row.band_min, v_row.band_max,
    v_row.in_band, v_row.compliance_reason;
  IF v_row.in_band = true AND v_row.normalized_price_drops = 250 THEN
    RAISE NOTICE 'S1: PASS';
  ELSE
    RAISE NOTICE 'S1: FAIL (expected in_band=true, norm=250)';
  END IF;

  -- Scenario 2: manual, final=100, no discount => normalized=100, band [240,293] => out
  SELECT * INTO v_row FROM public.compute_reward_band_compliance(v_r2, v_gym_id);
  RAISE NOTICE 'S2: name=%, final=%, disc=%, normalized=%, band=[%,%], in_band=%, reason=%',
    v_row.reward_name, v_row.final_price_drops, v_row.discount_percent,
    v_row.normalized_price_drops, v_row.band_min, v_row.band_max,
    v_row.in_band, v_row.compliance_reason;
  IF v_row.in_band = false AND v_row.compliance_reason = 'below_band_min' THEN
    RAISE NOTICE 'S2: PASS';
  ELSE
    RAISE NOTICE 'S2: FAIL (expected in_band=false, below_band_min)';
  END IF;

  -- Scenario 3: manual, final=260 => normalized=260, band [240,293] => in band
  SELECT * INTO v_row FROM public.compute_reward_band_compliance(v_r3, v_gym_id);
  RAISE NOTICE 'S3: name=%, final=%, disc=%, normalized=%, band=[%,%], in_band=%, reason=%',
    v_row.reward_name, v_row.final_price_drops, v_row.discount_percent,
    v_row.normalized_price_drops, v_row.band_min, v_row.band_max,
    v_row.in_band, v_row.compliance_reason;
  IF v_row.in_band = true AND v_row.compliance_reason = 'in_band' THEN
    RAISE NOTICE 'S3: PASS';
  ELSE
    RAISE NOTICE 'S3: FAIL (expected in_band=true)';
  END IF;

  -- Cleanup test data
  DELETE FROM public.rewards WHERE id IN (v_r1, v_r2, v_r3);
  RAISE NOTICE 'Test rewards cleaned up';
END $$;
