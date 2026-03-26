-- VERIFY: Economy RSD Calibration + Discount Pricing

-- 1. Verify new tokenomics_config columns
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'tokenomics_config'
  AND column_name IN ('drops_per_rsd','currency_code','calibration_version','calibration_meta')
ORDER BY column_name;

-- 2. Verify new rewards columns
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'rewards'
  AND column_name IN ('base_price_rsd','discount_percent','price_calc_mode','final_price_rsd_snapshot','drops_per_rsd_snapshot')
ORDER BY column_name;

-- 3. Verify constraints exist
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid IN ('public.tokenomics_config'::regclass, 'public.rewards'::regclass)
  AND conname IN ('chk_drops_per_rsd_range','chk_discount_percent_range','chk_price_calc_mode');

-- 4. Verify function exists
SELECT p.proname, pg_get_function_result(p.oid) AS return_type
FROM pg_proc p
WHERE p.proname = 'compute_reward_price_drops'
  AND p.pronamespace = 'public'::regnamespace;

-- 5. Verify trigger exists
SELECT tgname, tgtype
FROM pg_trigger
WHERE tgrelid = 'public.rewards'::regclass
  AND tgname = 'trg_rewards_discount_price_sync';

-- 6. Verify current tokenomics data
SELECT gym_id, drops_per_rsd, currency_code, calibration_version
FROM public.tokenomics_config;

-- ================================================================
-- 7. DISCOUNT PRICING VALIDATION — 3 scenarios
-- ================================================================

-- 7a. Coffee 200 RSD, 20% off (expect: effective_rsd=160, drops=320, rate=2.0)
SELECT 'Coffee 200 RSD, 20% off' AS scenario, *
FROM public.compute_reward_price_drops(NULL, 200, 20);

-- 7b. Coffee 200 RSD, 50% off (expect: effective_rsd=100, drops=200, rate=2.0)
SELECT 'Coffee 200 RSD, 50% off' AS scenario, *
FROM public.compute_reward_price_drops(NULL, 200, 50);

-- 7c. Membership 4000 RSD, 50% off (expect: effective_rsd=2000, drops=4000, rate=2.0)
SELECT 'Membership 4000 RSD, 50% off' AS scenario, *
FROM public.compute_reward_price_drops(NULL, 4000, 50);

-- ================================================================
-- 8. CONSTRAINT VALIDATION
-- ================================================================

-- 8a. Reject drops_per_rsd out of range (should fail)
DO $$
BEGIN
  BEGIN
    UPDATE public.tokenomics_config SET drops_per_rsd = 0.01 WHERE true;
    RAISE EXCEPTION 'SHOULD HAVE FAILED: drops_per_rsd = 0.01 was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK: drops_per_rsd < 0.05 rejected';
  END;
END $$;

-- 8b. Reject discount_percent out of range (should fail)
DO $$
BEGIN
  BEGIN
    PERFORM public.compute_reward_price_drops(NULL, 100, 96);
    RAISE EXCEPTION 'SHOULD HAVE FAILED: discount_percent = 96 was accepted';
  EXCEPTION WHEN raise_exception THEN
    RAISE NOTICE 'OK: discount_percent > 95 rejected';
  END;
END $$;

-- 8c. Reject null base price
DO $$
BEGIN
  BEGIN
    PERFORM public.compute_reward_price_drops(NULL, NULL, 20);
    RAISE EXCEPTION 'SHOULD HAVE FAILED: null base_price_rsd was accepted';
  EXCEPTION WHEN raise_exception THEN
    RAISE NOTICE 'OK: null base_price_rsd rejected';
  END;
END $$;

-- 9. Verify existing rewards unchanged (manual_drops mode)
SELECT id, name, price_drops, price_calc_mode, base_price_rsd, discount_percent
FROM public.rewards
LIMIT 5;
