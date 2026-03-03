-- Migration: 20260303100000_phase3_bugfixes_and_redemptions_prep.sql
-- Description: Phase 3.0 — Bug Fixes + Schema Prep for Sweat Arenas and Leaderboard Prizes
-- 
-- AGENT NOTE: [2026-03-03] - supabase-dba
-- Reference: docs/plans/phase3_audit_and_arenas_plan.md — Phase 3.0
-- 
-- CHANGES:
-- - Bug Fix #1: Drop idx_redemptions_unique_pending, create idx_redemptions_unique_claimed
-- - Bug Fix #2: Verify claim_reward() has GREATEST(0, ...) guard (already correct)
-- - Bug Fix #3: Update expire_stale_drops() to also deduct from local_drops_balance
-- - Schema Prep: Make redemptions.reward_id NULLABLE (for arena/leaderboard prizes)
-- - Schema Prep: Add redemptions.description column
-- - Schema Prep: Add redemptions.source_type column with CHECK constraint
-- - Update: find_redemption_by_code() with LEFT JOIN for nullable reward_id
-- 
-- IMPACT ON FRONTEND:
-- - Mobile App: Will need to handle source_type in redemptions
-- - Admin Panel: Will need to filter/display source_type for redemptions
-- 
-- BREAKING CHANGES:
-- - redemptions.reward_id is now NULLABLE (backward compatible)
-- - New columns added (backward compatible)
-- 
-- NEXT STEPS:
-- 1. Run: supabase gen types typescript --local > backend/types/database.types.ts
-- 2. Update MIGRATION_NOTES.md
-- 3. Proceed to Phase 3.1: Unified Leaderboard System

-- ============================================================
-- BUG FIX #1: idx_redemptions_unique_pending targets wrong status
-- ============================================================
-- The index uses WHERE status = 'pending' but ClaimStatus enum has
-- 'claimed' | 'redeemed' | 'cancelled' | 'expired' (no 'pending').
-- claim_reward() inserts with status = 'claimed', so duplicates are not prevented.

DROP INDEX IF EXISTS idx_redemptions_unique_pending;

CREATE UNIQUE INDEX idx_redemptions_unique_claimed
  ON public.redemptions(user_id, reward_id)
  WHERE status = 'claimed' AND reward_id IS NOT NULL;
  -- NOTE: WHERE reward_id IS NOT NULL excludes arena/leaderboard prizes
  -- which have reward_id = NULL and should not be deduplicated this way

COMMENT ON INDEX idx_redemptions_unique_claimed IS
  'Prevents duplicate claimed redemptions for the same user+reward. '
  'Excludes arena/leaderboard prizes (reward_id = NULL).';

-- ============================================================
-- BUG FIX #2: claim_reward() can make available_drops negative
-- ============================================================
-- Verify that claim_reward() already has GREATEST(0, ...) guard.
-- Reading from 20260302000009_phase1_claim_reward.sql line 118:
--   SET available_drops = GREATEST(0, available_drops - v_reward.price_drops)
-- This is already correct, so no change needed.

-- ============================================================
-- BUG FIX #3: expire_stale_drops() must also deduct from local balance
-- ============================================================
-- Currently only deducts from profiles.available_drops.
-- Must also deduct from gym_memberships.local_drops_balance using gym_id from transactions.

CREATE OR REPLACE FUNCTION public.expire_stale_drops()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- 1. Deduct from profiles.available_drops (global)
  WITH expired_by_user AS (
    SELECT
      user_id,
      SUM(amount) AS total_expiring
    FROM public.drops_transactions
    WHERE expires_at IS NOT NULL
      AND expires_at < NOW()
      AND expires_at > NOW() - INTERVAL '25 hours'  -- only process recent expirations
      AND amount > 0
      AND transaction_type = 'session'
    GROUP BY user_id
  ),
  updated AS (
    UPDATE public.profiles p
    SET available_drops = GREATEST(0, p.available_drops - e.total_expiring)
    FROM expired_by_user e
    WHERE p.id = e.user_id
    RETURNING p.id
  )
  SELECT COUNT(*) INTO v_count FROM updated;

  -- 2. Deduct from gym_memberships.local_drops_balance (gym-scoped)
  WITH expired_by_user_gym AS (
    SELECT
      user_id,
      gym_id,
      SUM(amount) AS total_expiring
    FROM public.drops_transactions
    WHERE expires_at IS NOT NULL
      AND expires_at < NOW()
      AND expires_at > NOW() - INTERVAL '25 hours'
      AND amount > 0
      AND transaction_type = 'session'
      AND gym_id IS NOT NULL
    GROUP BY user_id, gym_id
  )
  UPDATE public.gym_memberships gm
  SET local_drops_balance = GREATEST(0, gm.local_drops_balance - e.total_expiring),
      updated_at = NOW()
  FROM expired_by_user_gym e
  WHERE gm.user_id = e.user_id
    AND gm.gym_id = e.gym_id;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.expire_stale_drops() IS
  'Deducts expired drops from both profiles.available_drops (global) and '
  'gym_memberships.local_drops_balance (gym-scoped). Processes transactions '
  'that expired in the last 25 hours to avoid double-processing.';

-- ============================================================
-- SCHEMA PREP: Make redemptions.reward_id NULLABLE
-- ============================================================
-- Required so arena prizes and leaderboard prizes can be stored
-- in the same redemptions table with reward_id = NULL.

ALTER TABLE public.redemptions ALTER COLUMN reward_id DROP NOT NULL;

-- Add description column (for arena/leaderboard prize descriptions)
ALTER TABLE public.redemptions ADD COLUMN IF NOT EXISTS description TEXT;

-- Add source_type column to distinguish redemption origins
ALTER TABLE public.redemptions ADD COLUMN IF NOT EXISTS source_type TEXT
  DEFAULT 'reward_store' NOT NULL;

-- Add CHECK constraint for source_type
ALTER TABLE public.redemptions DROP CONSTRAINT IF EXISTS chk_redemptions_source_type;
ALTER TABLE public.redemptions ADD CONSTRAINT chk_redemptions_source_type
  CHECK (source_type IN ('reward_store', 'arena_prize', 'leaderboard_prize'));

-- Index for filtering by source_type
CREATE INDEX IF NOT EXISTS idx_redemptions_source_type
  ON public.redemptions(source_type);

-- Backfill existing redemptions with source_type = 'reward_store'
UPDATE public.redemptions
SET source_type = 'reward_store'
WHERE source_type IS NULL OR source_type = '';

-- Comments
COMMENT ON COLUMN public.redemptions.reward_id IS
  'Reference to rewards table. NULL for arena prizes and leaderboard prizes.';
COMMENT ON COLUMN public.redemptions.description IS
  'Prize description for arena/leaderboard prizes. NULL for reward store redemptions (use reward.name instead).';
COMMENT ON COLUMN public.redemptions.source_type IS
  'Origin of redemption: reward_store (spent drops), arena_prize (won in arena), leaderboard_prize (top 3 position).';

-- ============================================================
-- UPDATE: find_redemption_by_code() — LEFT JOIN for nullable reward_id
-- ============================================================
-- Must use LEFT JOIN so arena prizes (reward_id = NULL) still return data.
-- Returns source_type and description for all redemption types.

CREATE OR REPLACE FUNCTION public.find_redemption_by_code(p_code TEXT)
RETURNS TABLE(
  redemption_id UUID,
  user_id UUID,
  username TEXT,
  reward_name TEXT,
  reward_type TEXT,
  drops_spent INTEGER,
  status TEXT,
  created_at TIMESTAMPTZ,
  gym_id UUID,
  gym_name TEXT,
  source_type TEXT,
  description TEXT
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id,
    r.user_id,
    p.username,
    COALESCE(rew.name, r.description)::TEXT AS reward_name,
    COALESCE(rew.reward_type, r.source_type)::TEXT AS reward_type,
    r.drops_spent,
    r.status,
    r.created_at,
    r.gym_id,
    g.name,
    r.source_type,
    r.description
  FROM public.redemptions r
  JOIN public.profiles p ON r.user_id = p.id
  LEFT JOIN public.rewards rew ON r.reward_id = rew.id  -- LEFT JOIN: reward_id can be NULL
  JOIN public.gyms g ON r.gym_id = g.id
  WHERE r.redemption_code = p_code;
END;
$$;

COMMENT ON FUNCTION public.find_redemption_by_code(TEXT) IS
  'Finds a redemption by its code. Uses LEFT JOIN on rewards to support '
  'arena prizes and leaderboard prizes where reward_id is NULL. '
  'Returns source_type and description for all redemption types. '
  'Used by reception desk to validate redemption codes.';

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.find_redemption_by_code(TEXT) TO authenticated;
