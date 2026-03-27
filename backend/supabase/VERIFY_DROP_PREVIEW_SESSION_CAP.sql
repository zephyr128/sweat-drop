-- VERIFY: session cap enforcement
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
