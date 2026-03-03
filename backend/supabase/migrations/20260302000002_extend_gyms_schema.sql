-- Migration: 20260302000002_extend_gyms_schema.sql
-- Description: Adds subscription plan and is_active to gyms table
--
-- AGENT NOTE: [2026-03-02] - supabase-dba (Phase 0, Task 0.2)
-- Reference: docs/plans/mvp_full_audit_and_build_plan.md
--
-- CHANGES:
-- - Added column: public.gyms.subscription_plan (TEXT, default 'starter')
-- - Added column: public.gyms.is_active (BOOLEAN, default true)
--
-- BLOCKER DECISIONS APPLIED:
-- - Blocker 3: Gym join code REMOVED from MVP scope.
--   QR scan auto-joins gym. No gyms.code column needed.
-- - Q7: No feature gates for MVP. subscription_plan exists but
--   checkFeatureAccess() always returns true.
--
-- NOTE: gyms.subscription_type already exists from migration 0014.
--   We add subscription_plan as the canonical column with CHECK constraint.
--   subscription_type is left as-is for backward compat.
--
-- IMPACT ON FRONTEND:
-- - Admin Panel: Can display subscription plan on gym settings
-- - Mobile App: No changes needed
--
-- BREAKING CHANGES:
-- - None (additive only)

-- 1. Add subscription plan with CHECK constraint
-- Note: subscription_type (TEXT, no constraint) already exists from 20240101000014
-- We add subscription_plan as the properly constrained version
ALTER TABLE public.gyms
  ADD COLUMN IF NOT EXISTS subscription_plan TEXT DEFAULT 'pro'
    CHECK (subscription_plan IN ('starter', 'growth', 'pro', 'elite'));

-- 2. Add is_active flag
-- Note: is_suspended (BOOLEAN) exists from 20240101000014
-- We add is_active as the positive-logic version (easier to query)
ALTER TABLE public.gyms
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true NOT NULL;

-- 3. Backfill: set is_active based on is_suspended (if it exists)
-- is_active = NOT is_suspended
UPDATE public.gyms
SET is_active = NOT COALESCE(is_suspended, false)
WHERE is_active = true; -- Only update rows that haven't been manually set

-- 4. All pilot gyms get 'pro' plan (per Q7: no feature gates for MVP)
UPDATE public.gyms
SET subscription_plan = 'pro'
WHERE subscription_plan IS NULL;

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_gyms_subscription_plan ON public.gyms(subscription_plan);
CREATE INDEX IF NOT EXISTS idx_gyms_is_active ON public.gyms(is_active) WHERE is_active = true;

-- 6. Comments
COMMENT ON COLUMN public.gyms.subscription_plan IS 'Pricing tier: starter, growth, pro, elite. All pilot gyms default to pro. Feature gates NOT enforced in MVP.';
COMMENT ON COLUMN public.gyms.is_active IS 'Whether gym is active. Positive-logic replacement for is_suspended.';
