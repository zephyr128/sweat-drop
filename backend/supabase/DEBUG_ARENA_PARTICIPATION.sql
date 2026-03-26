-- Debug why active_arenas_count is 0
-- Run this in Supabase SQL Editor

-- 1. Check all arenas (regardless of participation)
SELECT 
  sa.id,
  sa.name,
  sa.scoring_model,
  sa.arena_scope,
  sa.is_active,
  sa.is_finalized,
  sa.start_date,
  sa.end_date,
  CURRENT_DATE as today,
  CASE 
    WHEN sa.start_date <= CURRENT_DATE AND sa.end_date >= CURRENT_DATE THEN '✓ In date range'
    WHEN sa.start_date > CURRENT_DATE THEN '✗ Not started yet'
    WHEN sa.end_date < CURRENT_DATE THEN '✗ Already ended'
    ELSE '?'
  END as date_status,
  CASE 
    WHEN sa.is_active = true AND sa.is_finalized = false THEN '✓ Active'
    WHEN sa.is_active = false THEN '✗ Inactive'
    WHEN sa.is_finalized = true THEN '✗ Finalized'
    ELSE '?'
  END as arena_status
FROM public.sweat_arenas sa
ORDER BY sa.created_at DESC;

-- 2. Check if you're opted into any arenas
SELECT 
  ap.arena_id,
  sa.name as arena_name,
  sa.scoring_model,
  ap.user_id,
  ap.gym_id,
  ap.current_score,
  ap.opted_in_at,
  ap.updated_at
FROM public.arena_participants ap
JOIN public.sweat_arenas sa ON ap.arena_id = sa.id
WHERE ap.user_id = auth.uid()
ORDER BY ap.opted_in_at DESC;

-- 3. Check active arenas you're opted into (with detailed status)
SELECT 
  ap.arena_id,
  sa.name as arena_name,
  sa.scoring_model,
  sa.arena_scope,
  sa.is_active,
  sa.is_finalized,
  sa.start_date,
  sa.end_date,
  CURRENT_DATE as today,
  ap.current_score,
  ap.opted_in_at,
  ap.updated_at,
  CASE 
    WHEN sa.is_active = true 
      AND sa.is_finalized = false 
      AND sa.start_date <= CURRENT_DATE 
      AND sa.end_date >= CURRENT_DATE 
    THEN '✓ Active and in range'
    WHEN sa.is_active = false THEN '✗ Arena is inactive'
    WHEN sa.is_finalized = true THEN '✗ Arena is finalized'
    WHEN sa.start_date > CURRENT_DATE THEN '✗ Arena not started yet'
    WHEN sa.end_date < CURRENT_DATE THEN '✗ Arena already ended'
    ELSE '?'
  END as status
FROM public.arena_participants ap
JOIN public.sweat_arenas sa ON ap.arena_id = sa.id
WHERE ap.user_id = auth.uid()
ORDER BY ap.opted_in_at DESC;

-- 4. Count active arenas you're opted into (same logic as verification script)
SELECT 
  COUNT(*) as active_arenas_count
FROM public.arena_participants ap
JOIN public.sweat_arenas sa ON ap.arena_id = sa.id
WHERE ap.user_id = auth.uid()
  AND sa.is_active = true
  AND sa.is_finalized = false
  AND sa.start_date <= CURRENT_DATE
  AND sa.end_date >= CURRENT_DATE;

-- 5. Check if you need to opt into arenas
-- This shows arenas you're NOT opted into but could be
SELECT 
  sa.id,
  sa.name,
  sa.scoring_model,
  sa.arena_scope,
  sa.start_date,
  sa.end_date,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM public.arena_participants ap2 
      WHERE ap2.arena_id = sa.id AND ap2.user_id = auth.uid()
    ) THEN '✓ Already opted in'
    ELSE '⚠ Not opted in'
  END as participation_status
FROM public.sweat_arenas sa
WHERE sa.is_active = true
  AND sa.is_finalized = false
  AND sa.start_date <= CURRENT_DATE
  AND sa.end_date >= CURRENT_DATE
ORDER BY sa.created_at DESC;
