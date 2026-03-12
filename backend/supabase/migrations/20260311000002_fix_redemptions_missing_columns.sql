-- Migration: 20260311000002_fix_redemptions_missing_columns.sql
-- Description: Hotfix — re-apply missing redemptions columns (source_type, description, nullable reward_id)
-- 
-- AGENT NOTE: [2026-03-11] - supabase-dba
-- Problem: Migration 20260303100000 was registered as applied (via repair.sh pattern)
--          but the actual ALTER TABLE statements never executed on the remote database.
--          This causes finalize_arena() to fail with: column "source_type" does not exist
-- 
-- Fix: Re-apply the schema changes using IF NOT EXISTS / idempotent patterns.
-- 
-- CHANGES:
-- - Make redemptions.reward_id NULLABLE (for arena/leaderboard prizes)
-- - Add redemptions.description column
-- - Add redemptions.source_type column with CHECK constraint
-- - Add redemptions.redemption_code column
-- - Update find_redemption_by_code() to use LEFT JOIN
-- 
-- BREAKING CHANGES: None (additive + idempotent)

-- ============================================================
-- 1. Make reward_id NULLABLE (idempotent — ALTER COLUMN DROP NOT NULL is safe to re-run)
-- ============================================================

ALTER TABLE public.redemptions ALTER COLUMN reward_id DROP NOT NULL;

-- Make gym_id nullable too (arena prizes may not always have a gym)
ALTER TABLE public.redemptions ALTER COLUMN gym_id DROP NOT NULL;

-- ============================================================
-- 2. Add missing columns
-- ============================================================

ALTER TABLE public.redemptions ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE public.redemptions ADD COLUMN IF NOT EXISTS source_type TEXT
  DEFAULT 'reward_store';

-- Backfill NULLs
UPDATE public.redemptions
SET source_type = 'reward_store'
WHERE source_type IS NULL;

-- Set NOT NULL + DEFAULT (safe to re-run)
ALTER TABLE public.redemptions ALTER COLUMN source_type SET DEFAULT 'reward_store';
ALTER TABLE public.redemptions ALTER COLUMN source_type SET NOT NULL;

-- Add redemption_code column
ALTER TABLE public.redemptions ADD COLUMN IF NOT EXISTS redemption_code TEXT;

-- ============================================================
-- 3. Add/replace CHECK constraint for source_type
-- ============================================================

ALTER TABLE public.redemptions DROP CONSTRAINT IF EXISTS chk_redemptions_source_type;
ALTER TABLE public.redemptions ADD CONSTRAINT chk_redemptions_source_type
  CHECK (source_type IN ('reward_store', 'arena_prize', 'leaderboard_prize'));

-- ============================================================
-- 4. Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_redemptions_source_type
  ON public.redemptions(source_type);

CREATE UNIQUE INDEX IF NOT EXISTS idx_redemptions_unique_claimed
  ON public.redemptions(user_id, reward_id)
  WHERE status = 'claimed' AND reward_id IS NOT NULL;

-- ============================================================
-- 5. Auto-generate redemption_code on INSERT (trigger)
-- ============================================================

DROP TRIGGER IF EXISTS trg_generate_redemption_code ON public.redemptions;
DROP FUNCTION IF EXISTS public.generate_redemption_code();

CREATE FUNCTION public.generate_redemption_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.redemption_code IS NULL THEN
    NEW.redemption_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_generate_redemption_code
  BEFORE INSERT ON public.redemptions
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_redemption_code();

-- ============================================================
-- 6. Update find_redemption_by_code() — LEFT JOIN for nullable reward_id
-- ============================================================

DROP FUNCTION IF EXISTS public.find_redemption_by_code(TEXT);

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
  LEFT JOIN public.rewards rew ON r.reward_id = rew.id
  LEFT JOIN public.gyms g ON r.gym_id = g.id
  WHERE r.redemption_code = p_code;
END;
$$;

GRANT EXECUTE ON FUNCTION public.find_redemption_by_code(TEXT) TO authenticated;

-- ============================================================
-- 7. Comments
-- ============================================================

COMMENT ON COLUMN public.redemptions.reward_id IS
  'Reference to rewards table. NULL for arena prizes and leaderboard prizes.';
COMMENT ON COLUMN public.redemptions.description IS
  'Prize description for arena/leaderboard prizes. NULL for reward store redemptions.';
COMMENT ON COLUMN public.redemptions.source_type IS
  'Origin: reward_store (spent drops), arena_prize (won in arena), leaderboard_prize (top 3).';
COMMENT ON COLUMN public.redemptions.redemption_code IS
  'Auto-generated 8-char alphanumeric code for prize claim verification.';
