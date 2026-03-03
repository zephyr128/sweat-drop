-- Migration: 20260302000007_extend_challenges_schema.sql
-- Description: Extends gym_challenges + challenge_progress with scoring model, tiers, and sponsor
--
-- AGENT NOTE: [2026-03-02] - supabase-dba (Phase 0, Task 0.7)
-- Reference: docs/plans/mvp_full_audit_and_build_plan.md
--
-- CHANGES:
-- - Added column: public.gym_challenges.scoring_model (TEXT, default 'total_drops')
-- - Added column: public.gym_challenges.tiers (JSONB)
-- - Added column: public.gym_challenges.sponsor_name (TEXT)
-- - Added column: public.gym_challenges.sponsor_logo (TEXT)
-- - Added column: public.gym_challenges.prize_description (TEXT)
-- - Added column: public.challenge_progress.current_value (NUMERIC, default 0)
-- - Added column: public.challenge_progress.tier_achieved (TEXT)
-- - Added column: public.challenge_progress.drops_awarded (BOOLEAN, default false)
--
-- SCORING MODELS:
-- - 'total_drops': Sum of drops earned during challenge period
-- - 'distance_km': Total distance in km (from sessions.raw_metrics.total_distance)
-- - 'days_visited': Count of unique days with at least one session
--
-- TIERS JSONB STRUCTURE:
-- [
--   { "label": "Bronze", "target": 500,  "drops": 50 },
--   { "label": "Silver", "target": 1000, "drops": 150 },
--   { "label": "Gold",   "target": 2000, "drops": 500 }
-- ]
--
-- IMPACT ON FRONTEND:
-- - Admin Panel: ChallengesManager form gets scoring_model dropdown, tiers editor
-- - Mobile App: Challenge detail shows tier progress bars
--
-- BREAKING CHANGES:
-- - None (additive only)

-- ============================================================
-- GYM_CHALLENGES TABLE EXTENSIONS
-- ============================================================

-- 1. Scoring model: what metric does this challenge track?
ALTER TABLE public.gym_challenges
  ADD COLUMN IF NOT EXISTS scoring_model TEXT DEFAULT 'total_drops' NOT NULL
    CHECK (scoring_model IN ('total_drops', 'distance_km', 'days_visited', 'streak_days'));

-- 2. Tiers: Bronze/Silver/Gold progression with different rewards
-- JSONB array of { label: string, target: number, drops: number }
ALTER TABLE public.gym_challenges
  ADD COLUMN IF NOT EXISTS tiers JSONB;

-- 3. Sponsor fields for co-branded challenges
ALTER TABLE public.gym_challenges
  ADD COLUMN IF NOT EXISTS sponsor_name TEXT;

ALTER TABLE public.gym_challenges
  ADD COLUMN IF NOT EXISTS sponsor_logo TEXT;

-- 4. Prize description (free-text for gym owner to describe the reward)
ALTER TABLE public.gym_challenges
  ADD COLUMN IF NOT EXISTS prize_description TEXT;

-- ============================================================
-- CHALLENGE_PROGRESS TABLE EXTENSIONS
-- ============================================================

-- 5. Generic numeric value for non-drops scoring models
-- For 'total_drops': mirrors current_drops
-- For 'distance_km': total km tracked
-- For 'days_visited': count of unique visit days
ALTER TABLE public.challenge_progress
  ADD COLUMN IF NOT EXISTS current_value NUMERIC DEFAULT 0 NOT NULL;

-- 6. Which tier has been achieved (NULL = none yet)
ALTER TABLE public.challenge_progress
  ADD COLUMN IF NOT EXISTS tier_achieved TEXT
    CHECK (tier_achieved IN ('bronze', 'silver', 'gold'));

-- 7. Prevent double-awarding of tier/completion rewards
ALTER TABLE public.challenge_progress
  ADD COLUMN IF NOT EXISTS drops_awarded BOOLEAN DEFAULT false NOT NULL;

-- ============================================================
-- BACKFILL
-- ============================================================

-- 8. Backfill current_value from current_drops for existing progress
UPDATE public.challenge_progress
SET current_value = current_drops::NUMERIC
WHERE current_value = 0 AND current_drops > 0;

-- ============================================================
-- INDEXES
-- ============================================================

-- 9. Indexes
CREATE INDEX IF NOT EXISTS idx_gym_challenges_scoring_model
  ON public.gym_challenges(scoring_model);

CREATE INDEX IF NOT EXISTS idx_challenge_progress_drops_awarded
  ON public.challenge_progress(drops_awarded)
  WHERE drops_awarded = false;

-- ============================================================
-- COMMENTS
-- ============================================================

COMMENT ON COLUMN public.gym_challenges.scoring_model IS 'Metric tracked by this challenge: total_drops (sum of drops), distance_km (total distance), days_visited (unique visit days).';
COMMENT ON COLUMN public.gym_challenges.tiers IS 'Optional tier progression: JSONB array of {label, target, drops}. Example: [{"label":"Bronze","target":500,"drops":50},{"label":"Silver","target":1000,"drops":150}]';
COMMENT ON COLUMN public.gym_challenges.sponsor_name IS 'Sponsor/partner name for co-branded challenges';
COMMENT ON COLUMN public.gym_challenges.sponsor_logo IS 'URL to sponsor logo image';
COMMENT ON COLUMN public.gym_challenges.prize_description IS 'Free-text description of the prize/reward for completing this challenge';
COMMENT ON COLUMN public.challenge_progress.current_value IS 'Generic progress value. For total_drops: same as current_drops. For distance_km: km accumulated. For days_visited: day count.';
COMMENT ON COLUMN public.challenge_progress.tier_achieved IS 'Highest tier reached: "Bronze", "Silver", "Gold", or NULL if no tier yet.';
COMMENT ON COLUMN public.challenge_progress.drops_awarded IS 'Whether drops have been awarded for this progress entry. Prevents double-awarding on concurrent updates.';
