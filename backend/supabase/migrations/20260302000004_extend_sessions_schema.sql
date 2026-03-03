-- Migration: 20260302000004_extend_sessions_schema.sql
-- Description: Extends sessions table with calories, multiplier, and raw BLE metrics
--
-- AGENT NOTE: [2026-03-02] - supabase-dba (Phase 0, Task 0.4)
-- Reference: docs/plans/mvp_full_audit_and_build_plan.md
--
-- CHANGES:
-- - Added column: public.sessions.calories (NUMERIC)
-- - Added column: public.sessions.multiplier (NUMERIC, default 1.0)
-- - Added column: public.sessions.raw_metrics (JSONB)
--
-- BLOCKER DECISIONS APPLIED:
-- - Blocker 2 (Option B — Hybrid): Mobile saves raw_metrics during workout.
--   Server re-calculates drops authoritatively using award_drops().
--   calories may be estimated (Q2 fallback formula).
--
-- CALORIES FORMULA (per Q2):
-- - FTMS devices: use reported calories if available
-- - Treadmill fallback: duration_min × 8 × (avg_speed / 8.0)
-- - Bike/Elliptical fallback: duration_min × 7
-- - Show "~312 cal" (with tilde) for estimates in UI
--
-- raw_metrics JSONB structure:
-- {
--   "avg_speed": 8.5,        -- km/h
--   "max_speed": 12.0,       -- km/h
--   "avg_cadence": 85,       -- RPM
--   "max_cadence": 110,      -- RPM
--   "total_distance": 5200,  -- meters
--   "avg_incline": 2.5,      -- percentage
--   "max_incline": 8.0,      -- percentage
--   "avg_power": 150,        -- watts
--   "max_power": 280,        -- watts
--   "calories_source": "device" | "estimated"
-- }
--
-- IMPACT ON FRONTEND:
-- - Mobile App: workout.tsx saves raw_metrics on session update before calling award_drops()
-- - Admin Panel: Can display detailed session metrics in analytics
--
-- BREAKING CHANGES:
-- - None (additive only)

-- 1. Add calories column (may be estimated or device-reported)
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS calories NUMERIC;

-- 2. Add multiplier column (streak × challenge × gym boost)
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS multiplier NUMERIC DEFAULT 1.0 NOT NULL;

-- 3. Add raw BLE metrics JSONB
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS raw_metrics JSONB;

-- 4. Comments
COMMENT ON COLUMN public.sessions.calories IS 'Calories burned during session. From BLE device if available, otherwise estimated via fallback formula. Show "~" prefix in UI for estimates.';
COMMENT ON COLUMN public.sessions.multiplier IS 'Combined multiplier applied to drops calculation: streak_multiplier × challenge_multiplier × gym_boost. Default 1.0.';
COMMENT ON COLUMN public.sessions.raw_metrics IS 'Raw BLE metrics collected during workout: avg_speed, max_speed, avg_cadence, total_distance, avg_incline, avg_power, calories_source.';
