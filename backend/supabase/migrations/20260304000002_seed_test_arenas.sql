-- Migration: 20260304000002_seed_test_arenas.sql
-- Description: Seeds test arena data for development/testing
-- 
-- AGENT NOTE: [2026-03-04] - mobile-coder
-- Creates test arenas so the mobile app arena UI is visible.
-- Uses 'network' scope for maximum visibility (all users can see).
-- Also links arenas to known seed gyms via arena_gyms.
-- 
-- IMPACT:
-- - Mobile App: Arena carousel on home screen will show arenas
-- - Admin Panel: Arena management will have data to display
-- 
-- IDEMPOTENT: Uses ON CONFLICT DO NOTHING for all inserts

-- ============================================================
-- 1. INSERT TEST ARENAS
-- ============================================================

-- Arena 1: Network-wide (visible to ALL users regardless of gym)
INSERT INTO public.sweat_arenas (
  id, name, description, arena_scope, scoring_model,
  sponsor_name, sponsor_logo, sponsor_contact_email,
  prizes, start_date, end_date,
  is_active, is_finalized, sponsor_fee_cents
) VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'March Madness Challenge',
  'Earn the most drops across the entire SweatDrop network this month! Top 3 winners get amazing prizes from our sponsor.',
  'network',
  'total_drops',
  'FitFuel Nutrition',
  NULL,
  'sponsor@fitfuel.example.com',
  '[
    {"rank": 1, "prize": "1-Year FitFuel Subscription", "value": "€240"},
    {"rank": 2, "prize": "6-Month FitFuel Subscription", "value": "€120"},
    {"rank": 3, "prize": "FitFuel Starter Pack", "value": "€45"}
  ]'::jsonb,
  CURRENT_DATE - INTERVAL '5 days',
  CURRENT_DATE + INTERVAL '25 days',
  true,
  false,
  50000
) ON CONFLICT (id) DO NOTHING;

-- Arena 2: Local arena (requires arena_gyms link)
INSERT INTO public.sweat_arenas (
  id, name, description, arena_scope, scoring_model,
  sponsor_name, sponsor_logo, sponsor_contact_email,
  prizes, start_date, end_date,
  is_active, is_finalized, sponsor_fee_cents
) VALUES (
  'a0000000-0000-0000-0000-000000000002',
  '🔥 7-Day Streak Showdown',
  'Who can maintain the longest training streak? Visit your gym every day to climb the leaderboard!',
  'local',
  'streak_days',
  'GymWear Pro',
  NULL,
  'sponsor@gymwearpro.example.com',
  '[
    {"rank": 1, "prize": "Premium Gym Outfit", "value": "€85"},
    {"rank": 2, "prize": "Training Gloves + Bottle", "value": "€35"},
    {"rank": 3, "prize": "GymWear T-Shirt", "value": "€20"}
  ]'::jsonb,
  CURRENT_DATE - INTERVAL '2 days',
  CURRENT_DATE + INTERVAL '12 days',
  true,
  false,
  15000
) ON CONFLICT (id) DO NOTHING;

-- Arena 3: Regional arena (multiple gyms)
INSERT INTO public.sweat_arenas (
  id, name, description, arena_scope, scoring_model,
  sponsor_name, sponsor_logo, sponsor_contact_email,
  prizes, start_date, end_date,
  is_active, is_finalized, sponsor_fee_cents
) VALUES (
  'a0000000-0000-0000-0000-000000000003',
  'Variety is the Spice of Fitness',
  'Use as many different machines as possible! The more variety in your workouts, the higher your score.',
  'regional',
  'variety_score',
  'SportZone',
  NULL,
  'arenas@sportzone.example.com',
  '[
    {"rank": 1, "prize": "€100 SportZone Gift Card", "value": "€100"},
    {"rank": 2, "prize": "€50 SportZone Gift Card", "value": "€50"},
    {"rank": 3, "prize": "€25 SportZone Gift Card", "value": "€25"}
  ]'::jsonb,
  CURRENT_DATE - INTERVAL '3 days',
  CURRENT_DATE + INTERVAL '18 days',
  true,
  false,
  25000
) ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 2. LINK ARENAS TO GYMS (arena_gyms)
-- ============================================================

-- Link Arena 2 (local) to all known seed gyms
-- This ensures at least one local arena is visible
INSERT INTO public.arena_gyms (arena_id, gym_id)
SELECT 
  'a0000000-0000-0000-0000-000000000002'::UUID,
  g.id
FROM public.gyms g
ON CONFLICT (arena_id, gym_id) DO NOTHING;

-- Link Arena 3 (regional) to all known seed gyms
INSERT INTO public.arena_gyms (arena_id, gym_id)
SELECT 
  'a0000000-0000-0000-0000-000000000003'::UUID,
  g.id
FROM public.gyms g
ON CONFLICT (arena_id, gym_id) DO NOTHING;

-- Network arenas (Arena 1) don't need arena_gyms entries
-- because get_available_arenas() checks: arena_scope = 'network' OR EXISTS(arena_gyms...)

-- ============================================================
-- 3. VERIFY
-- ============================================================

DO $$
DECLARE
  v_arena_count INTEGER;
  v_link_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_arena_count FROM public.sweat_arenas WHERE is_active = true;
  SELECT COUNT(*) INTO v_link_count FROM public.arena_gyms;
  
  RAISE NOTICE 'Seed arenas: % active arenas, % gym links', v_arena_count, v_link_count;
END $$;
