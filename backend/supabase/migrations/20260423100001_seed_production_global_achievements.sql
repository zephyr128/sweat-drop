-- Migration: 20260423100001_seed_production_global_achievements.sql
-- Description: Seed the production tiered achievement catalog — 5 categories × 5 tiers = 25 achievements.
--
-- AGENT NOTE: [2026-04-23] - supabase-dba
--
-- CHANGES:
-- - Inserted 25 production global achievements across 5 categories
-- - Categories: sessions, total_drops, streak, multi_gym, distance
-- - Tiers per category: bronze → silver → gold → platinum → diamond
-- - Badge images use canonical paths in the global-achievement-badges public bucket
--   (URLs resolve once Phase 2 uploads the PNGs; 404s degrade gracefully in the mobile Image component)
--
-- ECONOMY CALIBRATION:
-- - max_drops_per_session = 120, avg ≈ 100
-- - max_drops_per_day     = 300  (4 sessions/day)
-- - max_drops_per_week    = 1500
-- - Committed user (3 workouts/week): ≈ 300 drops/week, ≈ 14 400/year
-- - Diamond tiers are aspirational at 1–2 years; Bronze is first-session achievable
--
-- IMPACT ON FRONTEND:
-- - Mobile App: New Trophy Room (Phase 3) reads category + tier for grouped layout
-- - Admin Panel: New tier chip + grouped list view (Phase 4)
--
-- BREAKING CHANGES: None
--
-- NEXT STEPS:
-- 1. Upload 25 PNGs to global-achievement-badges bucket (Phase 2)
-- 2. Run: supabase gen types typescript --local > backend/types/database.types.ts
-- 3. Verify: SELECT COUNT(*) FROM global_achievements WHERE is_active = true; → 25

-- ============================================================
-- Category 1: Sessions  (criteria.type = 'session_count')
-- ============================================================

INSERT INTO public.global_achievements
  (code, name, description, badge_image_url, criteria, reward_drops, is_active, display_order, category, tier)
VALUES

  (
    'sessions_bronze',
    'First Sweat',
    'Complete your first workout',
    'https://qdtdfofodfdlutkmlzzf.supabase.co/storage/v1/object/public/global-achievement-badges/sessions_bronze-badge.png',
    '{"type": "session_count", "operator": ">=", "value": 1, "scope": "global"}',
    20, true, 101, 'sessions', 'bronze'
  ),
  (
    'sessions_silver',
    'Getting Hooked',
    'Complete 10 workouts',
    'https://qdtdfofodfdlutkmlzzf.supabase.co/storage/v1/object/public/global-achievement-badges/sessions_silver-badge.png',
    '{"type": "session_count", "operator": ">=", "value": 10, "scope": "global"}',
    100, true, 102, 'sessions', 'silver'
  ),
  (
    'sessions_gold',
    'Iron Regular',
    'Complete 50 workouts',
    'https://qdtdfofodfdlutkmlzzf.supabase.co/storage/v1/object/public/global-achievement-badges/sessions_gold-badge.png',
    '{"type": "session_count", "operator": ">=", "value": 50, "scope": "global"}',
    400, true, 103, 'sessions', 'gold'
  ),
  (
    'sessions_platinum',
    'Centurion',
    'Complete 100 workouts',
    'https://qdtdfofodfdlutkmlzzf.supabase.co/storage/v1/object/public/global-achievement-badges/sessions_platinum-badge.png',
    '{"type": "session_count", "operator": ">=", "value": 100, "scope": "global"}',
    1000, true, 104, 'sessions', 'platinum'
  ),
  (
    'sessions_diamond',
    '250 Club',
    'Complete 250 workouts',
    'https://qdtdfofodfdlutkmlzzf.supabase.co/storage/v1/object/public/global-achievement-badges/sessions_diamond-badge.png',
    '{"type": "session_count", "operator": ">=", "value": 250, "scope": "global"}',
    3000, true, 105, 'sessions', 'diamond'
  ),

-- ============================================================
-- Category 2: Total Drops  (criteria.type = 'total_drops')
-- ============================================================

  (
    'drops_bronze',
    'Drop Collector',
    'Earn 500 total drops',
    'https://qdtdfofodfdlutkmlzzf.supabase.co/storage/v1/object/public/global-achievement-badges/drops_bronze-badge.png',
    '{"type": "total_drops", "operator": ">=", "value": 500, "scope": "global"}',
    25, true, 201, 'total_drops', 'bronze'
  ),
  (
    'drops_silver',
    'Drop Saver',
    'Earn 2,500 total drops',
    'https://qdtdfofodfdlutkmlzzf.supabase.co/storage/v1/object/public/global-achievement-badges/drops_silver-badge.png',
    '{"type": "total_drops", "operator": ">=", "value": 2500, "scope": "global"}',
    150, true, 202, 'total_drops', 'silver'
  ),
  (
    'drops_gold',
    'Drop Hoarder',
    'Earn 10,000 total drops',
    'https://qdtdfofodfdlutkmlzzf.supabase.co/storage/v1/object/public/global-achievement-badges/drops_gold-badge.png',
    '{"type": "total_drops", "operator": ">=", "value": 10000, "scope": "global"}',
    500, true, 203, 'total_drops', 'gold'
  ),
  (
    'drops_platinum',
    'Drop Tycoon',
    'Earn 25,000 total drops',
    'https://qdtdfofodfdlutkmlzzf.supabase.co/storage/v1/object/public/global-achievement-badges/drops_platinum-badge.png',
    '{"type": "total_drops", "operator": ">=", "value": 25000, "scope": "global"}',
    1500, true, 204, 'total_drops', 'platinum'
  ),
  (
    'drops_diamond',
    'Drop Legend',
    'Earn 50,000 total drops',
    'https://qdtdfofodfdlutkmlzzf.supabase.co/storage/v1/object/public/global-achievement-badges/drops_diamond-badge.png',
    '{"type": "total_drops", "operator": ">=", "value": 50000, "scope": "global"}',
    4000, true, 205, 'total_drops', 'diamond'
  ),

-- ============================================================
-- Category 3: Streak  (criteria.type = 'streak_days')
-- ============================================================

  (
    'streak_bronze',
    'Warm-Up Streak',
    '3 consecutive workout days',
    'https://qdtdfofodfdlutkmlzzf.supabase.co/storage/v1/object/public/global-achievement-badges/streak_bronze-badge.png',
    '{"type": "streak_days", "operator": ">=", "value": 3, "scope": "global"}',
    30, true, 301, 'streak', 'bronze'
  ),
  (
    'streak_silver',
    'Week Warrior',
    '7 consecutive workout days',
    'https://qdtdfofodfdlutkmlzzf.supabase.co/storage/v1/object/public/global-achievement-badges/streak_silver-badge.png',
    '{"type": "streak_days", "operator": ">=", "value": 7, "scope": "global"}',
    100, true, 302, 'streak', 'silver'
  ),
  (
    'streak_gold',
    'Unstoppable',
    '14 consecutive workout days',
    'https://qdtdfofodfdlutkmlzzf.supabase.co/storage/v1/object/public/global-achievement-badges/streak_gold-badge.png',
    '{"type": "streak_days", "operator": ">=", "value": 14, "scope": "global"}',
    300, true, 303, 'streak', 'gold'
  ),
  (
    'streak_platinum',
    'Iron Will',
    '30 consecutive workout days',
    'https://qdtdfofodfdlutkmlzzf.supabase.co/storage/v1/object/public/global-achievement-badges/streak_platinum-badge.png',
    '{"type": "streak_days", "operator": ">=", "value": 30, "scope": "global"}',
    900, true, 304, 'streak', 'platinum'
  ),
  (
    'streak_diamond',
    'Forged in Fire',
    '60 consecutive workout days',
    'https://qdtdfofodfdlutkmlzzf.supabase.co/storage/v1/object/public/global-achievement-badges/streak_diamond-badge.png',
    '{"type": "streak_days", "operator": ">=", "value": 60, "scope": "global"}',
    2500, true, 305, 'streak', 'diamond'
  ),

-- ============================================================
-- Category 4: Multi-Gym  (criteria.type = 'gym_count')
-- ============================================================

  (
    'multi_gym_bronze',
    'Second Home',
    'Work out at 2 different gyms',
    'https://qdtdfofodfdlutkmlzzf.supabase.co/storage/v1/object/public/global-achievement-badges/multi_gym_bronze-badge.png',
    '{"type": "gym_count", "operator": ">=", "value": 2, "scope": "global"}',
    40, true, 401, 'multi_gym', 'bronze'
  ),
  (
    'multi_gym_silver',
    'Gym Explorer',
    'Work out at 3 different gyms',
    'https://qdtdfofodfdlutkmlzzf.supabase.co/storage/v1/object/public/global-achievement-badges/multi_gym_silver-badge.png',
    '{"type": "gym_count", "operator": ">=", "value": 3, "scope": "global"}',
    120, true, 402, 'multi_gym', 'silver'
  ),
  (
    'multi_gym_gold',
    'Nomad',
    'Work out at 5 different gyms',
    'https://qdtdfofodfdlutkmlzzf.supabase.co/storage/v1/object/public/global-achievement-badges/multi_gym_gold-badge.png',
    '{"type": "gym_count", "operator": ">=", "value": 5, "scope": "global"}',
    350, true, 403, 'multi_gym', 'gold'
  ),
  (
    'multi_gym_platinum',
    'Cross-Trainer',
    'Work out at 8 different gyms',
    'https://qdtdfofodfdlutkmlzzf.supabase.co/storage/v1/object/public/global-achievement-badges/multi_gym_platinum-badge.png',
    '{"type": "gym_count", "operator": ">=", "value": 8, "scope": "global"}',
    900, true, 404, 'multi_gym', 'platinum'
  ),
  (
    'multi_gym_diamond',
    'Chain Conqueror',
    'Work out at 12 different gyms',
    'https://qdtdfofodfdlutkmlzzf.supabase.co/storage/v1/object/public/global-achievement-badges/multi_gym_diamond-badge.png',
    '{"type": "gym_count", "operator": ">=", "value": 12, "scope": "global"}',
    2500, true, 405, 'multi_gym', 'diamond'
  ),

-- ============================================================
-- Category 5: Distance  (criteria.type = 'distance_km')
-- Evaluates SUM(raw_metrics->>'total_distance') / 1000.0 across sessions
-- ============================================================

  (
    'distance_bronze',
    'Kilometer Club',
    'Ride or run 10 km',
    'https://qdtdfofodfdlutkmlzzf.supabase.co/storage/v1/object/public/global-achievement-badges/distance_bronze-badge.png',
    '{"type": "distance_km", "operator": ">=", "value": 10, "scope": "global"}',
    25, true, 501, 'distance', 'bronze'
  ),
  (
    'distance_silver',
    'Mover',
    'Ride or run 50 km',
    'https://qdtdfofodfdlutkmlzzf.supabase.co/storage/v1/object/public/global-achievement-badges/distance_silver-badge.png',
    '{"type": "distance_km", "operator": ">=", "value": 50, "scope": "global"}',
    150, true, 502, 'distance', 'silver'
  ),
  (
    'distance_gold',
    'Road Warrior',
    'Ride or run 250 km',
    'https://qdtdfofodfdlutkmlzzf.supabase.co/storage/v1/object/public/global-achievement-badges/distance_gold-badge.png',
    '{"type": "distance_km", "operator": ">=", "value": 250, "scope": "global"}',
    500, true, 503, 'distance', 'gold'
  ),
  (
    'distance_platinum',
    'Marathoner',
    'Ride or run 1,000 km',
    'https://qdtdfofodfdlutkmlzzf.supabase.co/storage/v1/object/public/global-achievement-badges/distance_platinum-badge.png',
    '{"type": "distance_km", "operator": ">=", "value": 1000, "scope": "global"}',
    1500, true, 504, 'distance', 'platinum'
  ),
  (
    'distance_diamond',
    'Odyssey',
    'Ride or run 2,500 km',
    'https://qdtdfofodfdlutkmlzzf.supabase.co/storage/v1/object/public/global-achievement-badges/distance_diamond-badge.png',
    '{"type": "distance_km", "operator": ">=", "value": 2500, "scope": "global"}',
    4000, true, 505, 'distance', 'diamond'
  )

ON CONFLICT (code) DO NOTHING;
-- Idempotent: safe to re-run; duplicate codes are silently skipped.
