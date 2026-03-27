-- VERIFY: long session diminishing behavior
SELECT set_config(
  'request.jwt.claim.sub',
  COALESCE(
    (SELECT g.owner_id::text FROM public.gyms g WHERE g.id = '4074dffe-6df8-4070-b560-5be794977bff'::uuid),
    (SELECT p.id::text FROM public.profiles p WHERE p.role = 'superadmin' LIMIT 1)
  ),
  true
);

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
