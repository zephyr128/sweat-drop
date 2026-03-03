-- Migration: 20260302000001_add_profile_mvp_columns.sql
-- Description: Adds MVP columns to profiles table for wallet, streaks, push, and newcomer tracking
--
-- AGENT NOTE: [2026-03-02] - supabase-dba (Phase 0, Task 0.1)
-- Reference: docs/plans/mvp_full_audit_and_build_plan.md
--
-- CHANGES:
-- - Added column: public.profiles.available_drops (INTEGER, default 0)
-- - Added column: public.profiles.weekly_drops (INTEGER, default 0)
-- - Added column: public.profiles.monthly_drops (INTEGER, default 0)
-- - Added column: public.profiles.streak_days (INTEGER, default 0)
-- - Added column: public.profiles.last_visit_date (DATE)
-- - Added column: public.profiles.expo_push_token (TEXT)
-- - Added column: public.profiles.is_newcomer (BOOLEAN, default true)
-- - Added indexes for leaderboard period queries
--
-- BLOCKER DECISIONS APPLIED:
-- - Blocker 1 (Option B): Keep total_drops as-is, add available_drops.
--   total_drops = all-time earned (never decreases, used for leaderboard)
--   available_drops = global wallet (reserved for future; MVP uses local_drops_balance)
-- - Blocker 4 (Option A): available_drops NOT wired to spending yet.
--   Backfilled to total_drops for consistency.
--
-- IMPACT ON FRONTEND:
-- - Mobile App: Can now display streak_days, send expo_push_token on login
-- - Admin Panel: Can now filter newcomers, see streak data
--
-- BREAKING CHANGES:
-- - None (additive only)

-- 1. Add wallet / economy columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS available_drops INTEGER DEFAULT 0 NOT NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS weekly_drops INTEGER DEFAULT 0 NOT NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS monthly_drops INTEGER DEFAULT 0 NOT NULL;

-- 2. Add streak tracking columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS streak_days INTEGER DEFAULT 0 NOT NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_visit_date DATE;

-- 3. Add push notification token
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS expo_push_token TEXT;

-- 4. Add newcomer flag (true for first 30 days)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_newcomer BOOLEAN DEFAULT true NOT NULL;

-- 5. Backfill existing data
-- available_drops = total_drops for all existing users (one-time)
UPDATE public.profiles
SET available_drops = total_drops
WHERE available_drops = 0 AND total_drops > 0;

-- is_newcomer = false for users older than 30 days
UPDATE public.profiles
SET is_newcomer = false
WHERE created_at < NOW() - INTERVAL '30 days';

-- 6. Add indexes for leaderboard period queries
CREATE INDEX IF NOT EXISTS idx_profiles_weekly_drops ON public.profiles(weekly_drops DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_monthly_drops ON public.profiles(monthly_drops DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_total_drops ON public.profiles(total_drops DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_streak_days ON public.profiles(streak_days DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_is_newcomer ON public.profiles(is_newcomer) WHERE is_newcomer = true;
CREATE INDEX IF NOT EXISTS idx_profiles_last_visit_date ON public.profiles(last_visit_date DESC);

-- 7. Add comments
COMMENT ON COLUMN public.profiles.available_drops IS 'Global spendable wallet balance. Reserved for future cross-gym spending. MVP uses gym_memberships.local_drops_balance.';
COMMENT ON COLUMN public.profiles.weekly_drops IS 'Drops earned this week. Reset every Monday 00:00 by cron job. Used for weekly leaderboard.';
COMMENT ON COLUMN public.profiles.monthly_drops IS 'Drops earned this month. Reset 1st of every month by cron job. Used for monthly leaderboard.';
COMMENT ON COLUMN public.profiles.streak_days IS 'Consecutive days of training. Incremented on session end if last_visit_date was yesterday. Reset to 1 if gap > 1 day.';
COMMENT ON COLUMN public.profiles.last_visit_date IS 'Date of last completed workout session. Used for streak calculation.';
COMMENT ON COLUMN public.profiles.expo_push_token IS 'Expo push notification token. Set by mobile app on login/startup.';
COMMENT ON COLUMN public.profiles.is_newcomer IS 'True for first 30 days after signup. Reset by daily cron job. Used for newcomer leaderboard tab.';
