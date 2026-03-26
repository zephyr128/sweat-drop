-- VERIFY: long session diminishing behavior
SELECT set_config('request.jwt.claim.sub', '0b202507-6c97-4e3b-9655-a743775616ea', true);

WITH sample AS (
  SELECT public.preview_drop_calculation(
    '4074dffe-6df8-4070-b560-5be794977bff'::uuid,
    'bike',
    120,
    85,
    NULL,
    NULL,
    NULL,
    900,
    false
  ) AS payload
)
SELECT
  'long_session_diminishing' AS test_name,
  ((payload->>'reducedByDiminishing')::INT > 0) AS pass,
  payload
FROM sample;
