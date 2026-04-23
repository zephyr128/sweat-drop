-- Migration: 20260423100000_add_tier_category_to_global_achievements.sql
-- Description: Add tier + category columns to global_achievements; deactivate legacy seed rows.
--
-- AGENT NOTE: [2026-04-23] - supabase-dba
--
-- CHANGES:
-- - Added column: public.global_achievements.tier (TEXT, nullable, CHECK bronze|silver|gold|platinum|diamond)
-- - Added column: public.global_achievements.category (TEXT, nullable, CHECK sessions|total_drops|streak|multi_gym|distance|special)
-- - Added index: idx_global_achievements_category_tier ON (category, tier)
-- - Soft-deactivated 12 legacy seed achievements (is_active = false)
--
-- IMPACT ON FRONTEND:
-- - Mobile App: Must read `category` + `tier` columns for the new tiered Trophy Room layout (Phase 3)
-- - Admin Panel: Should display tier chip in achievement list (Phase 4)
--
-- BREAKING CHANGES:
-- - None — legacy user_badges rows are fully preserved; only the source achievements are deactivated
--
-- NEXT STEPS:
-- 1. Apply migration 20260423100001_seed_production_global_achievements.sql
-- 2. Run: supabase gen types typescript --local > backend/types/database.types.ts
-- 3. Update MIGRATION_NOTES.md

-- ============================================================
-- 1. Add `tier` column
-- ============================================================

ALTER TABLE public.global_achievements
  ADD COLUMN IF NOT EXISTS tier TEXT
  CHECK (tier IN ('bronze', 'silver', 'gold', 'platinum', 'diamond'));

COMMENT ON COLUMN public.global_achievements.tier IS
  'Tier within a category (bronze → silver → gold → platinum → diamond). '
  'Drives badge frame color and ladder ordering in the mobile Trophy Room. '
  'Null for legacy or one-off special achievements.';

-- ============================================================
-- 2. Add `category` column
-- ============================================================

ALTER TABLE public.global_achievements
  ADD COLUMN IF NOT EXISTS category TEXT
  CHECK (category IN ('sessions', 'total_drops', 'streak', 'multi_gym', 'distance', 'special'));

COMMENT ON COLUMN public.global_achievements.category IS
  'UI grouping hint for the mobile Trophy Room category ladder. '
  'Independent from criteria.type but typically mirrors it '
  '(e.g. category=''sessions'' ↔ criteria.type=''session_count''). '
  'Null rows are hidden from the category view but visible in flat list.';

-- ============================================================
-- 3. Composite index for the mobile grouping query
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_global_achievements_category_tier
  ON public.global_achievements (category, tier)
  WHERE is_active = true;

-- ============================================================
-- 4. Soft-deactivate the 12 legacy seed achievements
-- ============================================================
-- We keep the rows intact so existing user_badges FK references are preserved.
-- New users will only encounter the production catalog seeded in the next migration.

UPDATE public.global_achievements
SET
  is_active  = false,
  updated_at = NOW()
WHERE code IN (
  'first_workout',
  'ten_sessions',
  'fifty_sessions',
  'hundred_sessions',
  'thousand_drops',
  'five_k_drops',
  'ten_k_drops',
  'three_day_streak',
  'seven_day_streak',
  'fourteen_day_streak',
  'thirty_day_streak',
  'multi_gym'
);
