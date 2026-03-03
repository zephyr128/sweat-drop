-- Migration: 20260302000006_extend_rewards_schema.sql
-- Description: Extends rewards table with sponsor fields, availability dates, and one-time flag
--
-- AGENT NOTE: [2026-03-02] - supabase-dba (Phase 0, Task 0.6)
-- Reference: docs/plans/mvp_full_audit_and_build_plan.md
--
-- CHANGES:
-- - Added column: public.rewards.sponsor_name (TEXT)
-- - Added column: public.rewards.sponsor_logo (TEXT)
-- - Added column: public.rewards.available_from (TIMESTAMPTZ)
-- - Added column: public.rewards.available_until (TIMESTAMPTZ)
-- - Added column: public.rewards.is_one_time (BOOLEAN, default false)
--
-- REWARD CLAIM RULES (per Q4):
-- - is_one_time = false (default): can re-claim after previous claim is redeemed
-- - is_one_time = true: can only claim ONCE ever (global unique per user)
-- - Always block duplicate PENDING claims (no two 'pending' for same user+reward)
--
-- IMPACT ON FRONTEND:
-- - Admin Panel: RewardsManager form gets sponsor fields, date pickers, one-time toggle
-- - Mobile App: Store shows availability dates, "One-Time Offer" badge
--
-- BREAKING CHANGES:
-- - None (additive only)

-- 1. Sponsor fields (for co-branded rewards)
ALTER TABLE public.rewards
  ADD COLUMN IF NOT EXISTS sponsor_name TEXT;

ALTER TABLE public.rewards
  ADD COLUMN IF NOT EXISTS sponsor_logo TEXT;

-- 2. Availability window (time-limited rewards)
ALTER TABLE public.rewards
  ADD COLUMN IF NOT EXISTS available_from TIMESTAMPTZ;

ALTER TABLE public.rewards
  ADD COLUMN IF NOT EXISTS available_until TIMESTAMPTZ;

-- 3. One-time claim flag
ALTER TABLE public.rewards
  ADD COLUMN IF NOT EXISTS is_one_time BOOLEAN DEFAULT false NOT NULL;

-- 4. Partial unique index: prevent duplicate PENDING claims for same user+reward
-- A user can't have two 'pending' redemptions for the same reward simultaneously
CREATE UNIQUE INDEX IF NOT EXISTS idx_redemptions_unique_pending
  ON public.redemptions(user_id, reward_id)
  WHERE status = 'pending';

-- 5. Index for availability queries
CREATE INDEX IF NOT EXISTS idx_rewards_available_from ON public.rewards(available_from);
CREATE INDEX IF NOT EXISTS idx_rewards_available_until ON public.rewards(available_until);

-- 6. Comments
COMMENT ON COLUMN public.rewards.sponsor_name IS 'Sponsor/partner name for co-branded rewards (e.g., "MyProtein")';
COMMENT ON COLUMN public.rewards.sponsor_logo IS 'URL to sponsor logo image. Stored in Supabase Storage.';
COMMENT ON COLUMN public.rewards.available_from IS 'When this reward becomes available. NULL = available immediately.';
COMMENT ON COLUMN public.rewards.available_until IS 'When this reward expires. NULL = available indefinitely.';
COMMENT ON COLUMN public.rewards.is_one_time IS 'If true, each user can claim this reward only ONCE ever. If false, can re-claim after previous claim is redeemed.';
