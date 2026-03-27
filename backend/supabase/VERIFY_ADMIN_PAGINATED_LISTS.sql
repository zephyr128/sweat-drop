-- ============================================================
-- VERIFICATION: Admin Paginated List RPCs
-- ============================================================
-- Must run with auth context set:
--   SELECT set_config('request.jwt.claim.sub', '<superadmin-uuid>', true);

-- SETUP
SELECT set_config('request.jwt.claim.sub', '0b202507-6c97-4e3b-9655-a743775616ea', true);

-- ============================================================
-- 1. PAGINATION CORRECTNESS
-- ============================================================

-- Page 1 of 3
SELECT 'pagination: page 1' AS test,
  r->'total_count' AS total,
  r->'page' AS page,
  r->'total_pages' AS pages,
  jsonb_array_length(r->'items') AS items_ct
FROM public.admin_list_members('4074dffe-6df8-4070-b560-5be794977bff', NULL, 1, 3) r;

-- Page 2 of 3
SELECT 'pagination: page 2' AS test,
  r->'page' AS page,
  jsonb_array_length(r->'items') AS items_ct
FROM public.admin_list_members('4074dffe-6df8-4070-b560-5be794977bff', NULL, 2, 3) r;

-- Last page (partial)
SELECT 'pagination: last page' AS test,
  r->'page' AS page,
  jsonb_array_length(r->'items') AS items_ct
FROM public.admin_list_members('4074dffe-6df8-4070-b560-5be794977bff', NULL, 4, 3) r;

-- ============================================================
-- 2. SEARCH CORRECTNESS
-- ============================================================

SELECT 'search: members for "n"' AS test,
  r->'total_count' AS total
FROM public.admin_list_members('4074dffe-6df8-4070-b560-5be794977bff', 'n') r;

SELECT 'search: machines for "bike"' AS test,
  r->'total_count' AS total
FROM public.admin_list_machines('4074dffe-6df8-4070-b560-5be794977bff', 'bike') r;

-- ============================================================
-- 3. SORT CORRECTNESS
-- ============================================================

-- Sort by username ascending
SELECT 'sort: members by username asc' AS test,
  r->'items'->0->>'username' AS first_item
FROM public.admin_list_members('4074dffe-6df8-4070-b560-5be794977bff', NULL, 1, 1, 'username', 'asc') r;

-- Sort by username descending
SELECT 'sort: members by username desc' AS test,
  r->'items'->0->>'username' AS first_item
FROM public.admin_list_members('4074dffe-6df8-4070-b560-5be794977bff', NULL, 1, 1, 'username', 'desc') r;

-- ============================================================
-- 4. AUTHORIZATION ISOLATION (negative test)
-- ============================================================

-- Set as regular user (not admin)
SELECT set_config('request.jwt.claim.sub', 'f955d32e-fc37-4a5e-89a2-f97a8da6fca3', true);

SELECT 'auth: regular user blocked' AS test,
  r->>'error' AS result,
  CASE WHEN r->>'error' = 'Unauthorized' THEN 'PASS' ELSE 'FAIL' END AS verdict
FROM public.admin_list_members('4074dffe-6df8-4070-b560-5be794977bff') r;

-- No auth
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT 'auth: no auth blocked' AS test,
  r->>'error' AS result,
  CASE WHEN r->>'error' = 'Unauthorized' THEN 'PASS' ELSE 'FAIL' END AS verdict
FROM public.admin_list_members('4074dffe-6df8-4070-b560-5be794977bff') r;

-- ============================================================
-- 5. ALL DOMAINS RETURN DATA
-- ============================================================

SELECT set_config('request.jwt.claim.sub', '0b202507-6c97-4e3b-9655-a743775616ea', true);

SELECT domain, total, items,
  CASE WHEN total IS NOT NULL AND items IS NOT NULL THEN 'PASS' ELSE 'FAIL' END AS verdict
FROM (
  SELECT 'members' AS domain, r->'total_count' AS total, jsonb_array_length(r->'items') AS items
  FROM public.admin_list_members('4074dffe-6df8-4070-b560-5be794977bff') r
  UNION ALL
  SELECT 'redemptions', r->'total_count', jsonb_array_length(r->'items')
  FROM public.admin_list_redemptions('4074dffe-6df8-4070-b560-5be794977bff') r
  UNION ALL
  SELECT 'rewards', r->'total_count', jsonb_array_length(r->'items')
  FROM public.admin_list_rewards('4074dffe-6df8-4070-b560-5be794977bff') r
  UNION ALL
  SELECT 'machines', r->'total_count', jsonb_array_length(r->'items')
  FROM public.admin_list_machines('4074dffe-6df8-4070-b560-5be794977bff') r
  UNION ALL
  SELECT 'team', r->'total_count', jsonb_array_length(r->'items')
  FROM public.admin_list_team('4074dffe-6df8-4070-b560-5be794977bff') r
  UNION ALL
  SELECT 'challenges', r->'total_count', jsonb_array_length(r->'items')
  FROM public.admin_list_challenges('4074dffe-6df8-4070-b560-5be794977bff') r
  UNION ALL
  SELECT 'arenas', r->'total_count', jsonb_array_length(r->'items')
  FROM public.admin_list_arenas('4074dffe-6df8-4070-b560-5be794977bff') r
) x;

-- ============================================================
-- 6. BOUNDED QUERY CHECK — limit clamping
-- ============================================================

SELECT set_config('request.jwt.claim.sub', '0b202507-6c97-4e3b-9655-a743775616ea', true);

-- Requesting limit=999 should be clamped to 100
SELECT 'limit clamping: 999 -> 100' AS test,
  r->'limit' AS applied_limit,
  CASE WHEN (r->>'limit')::int = 100 THEN 'PASS' ELSE 'FAIL' END AS verdict
FROM public.admin_list_members('4074dffe-6df8-4070-b560-5be794977bff', NULL, 1, 999) r;

-- Requesting limit=0 should be clamped to 1
SELECT 'limit clamping: 0 -> 1' AS test,
  r->'limit' AS applied_limit,
  CASE WHEN (r->>'limit')::int = 1 THEN 'PASS' ELSE 'FAIL' END AS verdict
FROM public.admin_list_members('4074dffe-6df8-4070-b560-5be794977bff', NULL, 1, 0) r;
