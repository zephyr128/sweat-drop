-- VERIFY: session cap enforcement
SELECT set_config('request.jwt.claim.sub', '0b202507-6c97-4e3b-9655-a743775616ea', true);

WITH sample AS (
  SELECT public.preview_drop_calculation(
    '4074dffe-6df8-4070-b560-5be794977bff'::uuid,
    'treadmill',
    240,
    NULL,
    14,
    8,
    NULL,
    2200,
    false
  ) AS payload
)
SELECT
  'session_cap_enforced' AS test_name,
  ((payload->>'appliedCap') = 'session_cap') AS pass,
  payload
FROM sample;
