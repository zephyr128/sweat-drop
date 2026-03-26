-- VERIFY: treadmill speed+incline variants
SELECT set_config('request.jwt.claim.sub', '0b202507-6c97-4e3b-9655-a743775616ea', true);

WITH baseline AS (
  SELECT public.preview_drop_calculation(
    '4074dffe-6df8-4070-b560-5be794977bff'::uuid,
    'treadmill',
    30,
    NULL,
    8,
    0,
    NULL,
    260,
    false
  ) AS payload
), stronger AS (
  SELECT public.preview_drop_calculation(
    '4074dffe-6df8-4070-b560-5be794977bff'::uuid,
    'treadmill',
    30,
    NULL,
    10,
    6,
    NULL,
    300,
    false
  ) AS payload
)
SELECT
  'treadmill_speed_incline_fairness' AS test_name,
  ((stronger.payload->>'finalDrops')::INT > (baseline.payload->>'finalDrops')::INT) AS pass,
  baseline.payload AS baseline_payload,
  stronger.payload AS stronger_payload
FROM baseline, stronger;
