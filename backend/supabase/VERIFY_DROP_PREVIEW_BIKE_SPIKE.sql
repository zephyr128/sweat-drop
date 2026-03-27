-- VERIFY: bike sustained vs spike
SELECT set_config(
  'request.jwt.claim.sub',
  COALESCE(
    (SELECT g.owner_id::text FROM public.gyms g WHERE g.id = '4074dffe-6df8-4070-b560-5be794977bff'::uuid),
    (SELECT p.id::text FROM public.profiles p WHERE p.role = 'superadmin' LIMIT 1)
  ),
  true
);

WITH sustained AS (
  SELECT public.preview_drop_calculation(
    '4074dffe-6df8-4070-b560-5be794977bff'::uuid,
    'bike',
    30,
    90,
    NULL,
    NULL,
    NULL,
    280,
    false
  ) AS payload
), spike AS (
  SELECT public.preview_drop_calculation(
    '4074dffe-6df8-4070-b560-5be794977bff'::uuid,
    'bike',
    30,
    90,
    NULL,
    NULL,
    NULL,
    280,
    true
  ) AS payload
)
SELECT
  'bike_sustained_vs_spike' AS test_name,
  ((sustained.payload->>'finalDrops')::INT > (spike.payload->>'finalDrops')::INT) AS pass,
  sustained.payload AS sustained_payload,
  spike.payload AS spike_payload
FROM sustained, spike;
