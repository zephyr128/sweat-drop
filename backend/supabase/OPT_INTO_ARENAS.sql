-- How to opt into arenas
-- Run these queries in Supabase SQL Editor

-- 1. First, check which active arenas are available
SELECT 
  sa.id,
  sa.name,
  sa.scoring_model,
  sa.arena_scope,
  sa.start_date,
  sa.end_date,
  CURRENT_DATE as today,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM public.arena_participants ap2 
      WHERE ap2.arena_id = sa.id AND ap2.user_id = auth.uid()
    ) THEN '✓ Already opted in'
    ELSE '⚠ Not opted in - use opt_into_arena() below'
  END as participation_status
FROM public.sweat_arenas sa
WHERE sa.is_active = true
  AND sa.is_finalized = false
  AND sa.start_date <= CURRENT_DATE
  AND sa.end_date >= CURRENT_DATE
ORDER BY sa.created_at DESC;

-- 2. Opt into a specific arena using the RPC function
-- Replace 'arena-id-here' with the actual arena ID from query 1
-- Example:
-- SELECT * FROM public.opt_into_arena('204ffb3f-f2d7-40e6-bb9c-95275e647b70'::UUID);
-- SELECT * FROM public.opt_into_arena('6983d2ee-df4e-4563-8066-4faa7a39404c'::UUID);
-- SELECT * FROM public.opt_into_arena('a0000000-0000-0000-0000-000000000001'::UUID);
-- SELECT * FROM public.opt_into_arena('a0000000-0000-0000-0000-000000000002'::UUID);
-- SELECT * FROM public.opt_into_arena('a0000000-0000-0000-0000-000000000003'::UUID);

-- 3. After opting in, verify your participation
SELECT 
  ap.arena_id,
  sa.name as arena_name,
  sa.scoring_model,
  ap.current_score,
  ap.opted_in_at,
  ap.updated_at
FROM public.arena_participants ap
JOIN public.sweat_arenas sa ON ap.arena_id = sa.id
WHERE ap.user_id = auth.uid()
  AND sa.is_active = true
  AND sa.is_finalized = false
  AND sa.start_date <= CURRENT_DATE
  AND sa.end_date >= CURRENT_DATE
ORDER BY ap.opted_in_at DESC;

-- 4. Count active arenas you're now opted into
SELECT 
  COUNT(*) as active_arenas_count
FROM public.arena_participants ap
JOIN public.sweat_arenas sa ON ap.arena_id = sa.id
WHERE ap.user_id = auth.uid()
  AND sa.is_active = true
  AND sa.is_finalized = false
  AND sa.start_date <= CURRENT_DATE
  AND sa.end_date >= CURRENT_DATE;
