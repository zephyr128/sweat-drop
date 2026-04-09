-- Migration: 20260409300001_seed_tokenomics_config_global_default.sql
-- Description: Ensure global tokenomics_config default row exists.
-- The original migration 20260324000015 had this INSERT but it may not have
-- applied correctly if the table was created in a separate transaction.

INSERT INTO public.tokenomics_config (
  gym_id,
  max_drops_per_session,
  max_drops_per_day,
  max_drops_per_week,
  max_rewarded_sessions_per_day,
  max_checkin_drops_per_day,
  price_band_json
)
SELECT
  NULL,
  120,
  300,
  1500,
  4,
  1,
  jsonb_build_object(
    'coffee',        jsonb_build_object('min', 120,  'max', 220),
    'protein_snack', jsonb_build_object('min', 180,  'max', 320),
    'day_pass',      jsonb_build_object('min', 500,  'max', 900),
    'pt_intro',      jsonb_build_object('min', 1200, 'max', 2200),
    'merch_small',   jsonb_build_object('min', 700,  'max', 1500),
    'merch_premium', jsonb_build_object('min', 1800, 'max', 4000),
    'physical',      jsonb_build_object('min', 1,    'max', 100000)
  )
WHERE NOT EXISTS (SELECT 1 FROM public.tokenomics_config WHERE gym_id IS NULL);
