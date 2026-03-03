-- Migration: 20260303000001_fix_user_badges_and_seed_achievements.sql
-- Description: Fix user_badges schema for badge awarding + seed global achievements
--
-- AGENT NOTE: [2026-03-03] - supabase-dba
--
-- ROOT CAUSE: Badge awarding was broken due to:
--   1. user_badges.challenge_id still has NOT NULL constraint from original migration
--      → evaluate_badges() INSERT fails because it only provides global_achievement_id
--      → This crashes the entire award_drops() transaction
--   2. UNIQUE(user_id, global_achievement_id, gym_challenge_id) doesn't prevent duplicates
--      because PostgreSQL treats NULL != NULL in unique constraints
--   3. No global_achievements seed data existed
--
-- FIXES:
--   1. Drop NOT NULL on challenge_id (deprecated column)
--   2. Add proper partial unique indexes for duplicate prevention
--   3. Recreate evaluate_badges() with proper ON CONFLICT targeting
--   4. Seed default global achievements
--
-- IMPACT ON FRONTEND:
--   - Mobile App: Badges will now be awarded correctly after workouts
--   - Admin Panel: Trophy Room will show earned badges
--
-- BREAKING CHANGES: None (fixes broken behavior)

-- ============================================================
-- FIX 1: Drop NOT NULL on deprecated challenge_id column
-- ============================================================
-- The original user_badges table had: challenge_id UUID NOT NULL
-- The polymorphic migration (20250128000005) added global_achievement_id + gym_challenge_id
-- but never dropped the NOT NULL on challenge_id.
-- This prevents evaluate_badges() from inserting global achievement badges.

ALTER TABLE public.user_badges
  ALTER COLUMN challenge_id DROP NOT NULL;

-- ============================================================
-- FIX 2: Add proper partial unique indexes
-- ============================================================
-- The existing UNIQUE(user_id, global_achievement_id, gym_challenge_id) doesn't work
-- because NULL != NULL in PostgreSQL unique constraints.
-- Replace with partial unique indexes that correctly prevent duplicates.

-- Drop the broken composite unique constraint
ALTER TABLE public.user_badges
  DROP CONSTRAINT IF EXISTS user_badges_unique_per_user_and_achievement;

-- Add partial unique index for global achievements (one badge per user per achievement)
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_badges_unique_user_global
  ON public.user_badges (user_id, global_achievement_id)
  WHERE global_achievement_id IS NOT NULL;

-- Add partial unique index for gym challenges (one badge per user per challenge)
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_badges_unique_user_gym
  ON public.user_badges (user_id, gym_challenge_id)
  WHERE gym_challenge_id IS NOT NULL;

-- ============================================================
-- FIX 3: Recreate evaluate_badges() with proper ON CONFLICT
-- ============================================================

CREATE OR REPLACE FUNCTION public.evaluate_badges(
  p_user_id    UUID,
  p_session_id UUID
)
RETURNS TABLE(badge_name TEXT)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_achievement   RECORD;
  v_profile       RECORD;
  v_criteria      JSONB;
  v_met           BOOLEAN;
  v_session_count INTEGER;
  v_gym_count     INTEGER;
  v_row_count     INTEGER;
BEGIN
  -- Get current profile stats
  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN; -- No profile, skip badge evaluation
  END IF;

  -- Count completed sessions (with drops awarded)
  SELECT COUNT(*) INTO v_session_count
  FROM public.sessions
  WHERE user_id = p_user_id
    AND drops_earned > 0;

  -- Count distinct gyms visited
  SELECT COUNT(DISTINCT gym_id) INTO v_gym_count
  FROM public.gym_memberships
  WHERE user_id = p_user_id;

  -- Evaluate each active global achievement
  FOR v_achievement IN
    SELECT * FROM public.global_achievements
    WHERE is_active = true
  LOOP
    -- Skip if user already has this badge
    IF EXISTS (
      SELECT 1 FROM public.user_badges
      WHERE user_id = p_user_id
        AND global_achievement_id = v_achievement.id
    ) THEN
      CONTINUE;
    END IF;

    v_criteria := v_achievement.criteria;
    v_met := false;

    -- Evaluate criteria based on type
    CASE v_criteria->>'type'
      WHEN 'session_count' THEN
        v_met := v_session_count >= (v_criteria->>'value')::INTEGER;

      WHEN 'total_drops' THEN
        v_met := v_profile.total_drops >= (v_criteria->>'value')::INTEGER;

      WHEN 'streak_days' THEN
        v_met := v_profile.streak_days >= (v_criteria->>'value')::INTEGER;

      WHEN 'gym_count' THEN
        v_met := v_gym_count >= (v_criteria->>'value')::INTEGER;

      WHEN 'distance_km' THEN
        v_met := (
          SELECT COALESCE(SUM((raw_metrics->>'total_distance')::NUMERIC), 0) / 1000.0
          FROM public.sessions
          WHERE user_id = p_user_id AND drops_earned > 0
        ) >= (v_criteria->>'value')::NUMERIC;

      ELSE
        v_met := false;
    END CASE;

    -- Award badge if criteria met
    IF v_met THEN
      -- Insert badge using the partial unique index for conflict detection
      INSERT INTO public.user_badges
        (user_id, global_achievement_id, earned_at)
      VALUES
        (p_user_id, v_achievement.id, NOW())
      ON CONFLICT (user_id, global_achievement_id) WHERE global_achievement_id IS NOT NULL
      DO NOTHING;

      -- Check if we actually inserted (race condition guard)
      GET DIAGNOSTICS v_row_count = ROW_COUNT;

      IF v_row_count > 0 THEN
        -- Award badge bonus drops (only if badge was actually inserted)
        IF v_achievement.reward_drops > 0 THEN
          UPDATE public.profiles
          SET total_drops     = total_drops + v_achievement.reward_drops,
              available_drops = available_drops + v_achievement.reward_drops
          WHERE id = p_user_id;

          INSERT INTO public.drops_transactions
            (user_id, amount, transaction_type, reference_id, description)
          VALUES
            (p_user_id, v_achievement.reward_drops, 'badge',
             v_achievement.id, 'Badge: ' || v_achievement.name);
        END IF;

        -- Return badge name to caller (only for newly awarded badges)
        RETURN QUERY SELECT v_achievement.name::TEXT;
      END IF;
    END IF;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.evaluate_badges(UUID, UUID) IS
  'Evaluates all active global achievements against user stats. '
  'Awards badges and bonus drops for newly met criteria. '
  'Supports: session_count, total_drops, streak_days, gym_count, distance_km. '
  'Fixed: uses partial unique index ON CONFLICT to prevent duplicates.';

GRANT EXECUTE ON FUNCTION public.evaluate_badges(UUID, UUID) TO authenticated;

-- ============================================================
-- FIX 4: Seed default global achievements
-- ============================================================
-- These are the core achievements that every SweatDrop user can earn.
-- badge_image_url uses placeholder emoji-based URLs — replace with CDN URLs when available.

INSERT INTO public.global_achievements (code, name, description, badge_image_url, criteria, reward_drops, is_active, display_order)
VALUES
  -- Session milestones
  ('first_workout', 'First Sweat', 'Complete your first workout', 'https://sweatdrop.app/badges/first-workout.png',
   '{"type": "session_count", "value": 1}', 10, true, 1),
  
  ('ten_sessions', 'Getting Hooked', 'Complete 10 workouts', 'https://sweatdrop.app/badges/ten-sessions.png',
   '{"type": "session_count", "value": 10}', 50, true, 2),
  
  ('fifty_sessions', 'Iron Regular', 'Complete 50 workouts', 'https://sweatdrop.app/badges/fifty-sessions.png',
   '{"type": "session_count", "value": 50}', 200, true, 3),
  
  ('hundred_sessions', 'Centurion', 'Complete 100 workouts', 'https://sweatdrop.app/badges/hundred-sessions.png',
   '{"type": "session_count", "value": 100}', 500, true, 4),

  -- Drops milestones
  ('thousand_drops', 'Drop Collector', 'Earn 1,000 total drops', 'https://sweatdrop.app/badges/thousand-drops.png',
   '{"type": "total_drops", "value": 1000}', 25, true, 5),
  
  ('five_k_drops', 'Drop Hoarder', 'Earn 5,000 total drops', 'https://sweatdrop.app/badges/five-k-drops.png',
   '{"type": "total_drops", "value": 5000}', 100, true, 6),
  
  ('ten_k_drops', 'Drop Legend', 'Earn 10,000 total drops', 'https://sweatdrop.app/badges/ten-k-drops.png',
   '{"type": "total_drops", "value": 10000}', 250, true, 7),

  -- Streak milestones
  ('three_day_streak', 'Warm-Up Streak', '3-day workout streak', 'https://sweatdrop.app/badges/three-day-streak.png',
   '{"type": "streak_days", "value": 3}', 15, true, 8),
  
  ('seven_day_streak', 'Week Warrior', '7-day workout streak', 'https://sweatdrop.app/badges/seven-day-streak.png',
   '{"type": "streak_days", "value": 7}', 50, true, 9),
  
  ('fourteen_day_streak', 'Unstoppable', '14-day workout streak', 'https://sweatdrop.app/badges/fourteen-day-streak.png',
   '{"type": "streak_days", "value": 14}', 150, true, 10),
  
  ('thirty_day_streak', 'Iron Will', '30-day workout streak', 'https://sweatdrop.app/badges/thirty-day-streak.png',
   '{"type": "streak_days", "value": 30}', 500, true, 11),

  -- Multi-gym
  ('multi_gym', 'Gym Explorer', 'Work out at 3 different gyms', 'https://sweatdrop.app/badges/gym-explorer.png',
   '{"type": "gym_count", "value": 3}', 75, true, 12)

ON CONFLICT (code) DO NOTHING; -- Idempotent: don't overwrite if already seeded

-- ============================================================
-- FIX 5: Update update_challenge_progress() ON CONFLICT clauses
-- ============================================================
-- The update_challenge_progress() function (from 20260302000008) uses
-- ON CONFLICT (user_id, global_achievement_id, gym_challenge_id) which
-- referenced the old composite unique constraint that was dropped above.
-- We need to update it to use the new partial unique index instead.
-- Since CREATE OR REPLACE for the entire function would be very long,
-- we just recreate the function with the corrected ON CONFLICT clauses.

-- Note: This is a targeted fix. The full function body is preserved from
-- 20260302000008_phase1_core_award_drops.sql with only the ON CONFLICT
-- clauses corrected.

CREATE OR REPLACE FUNCTION public.update_challenge_progress(
  p_user_id    UUID,
  p_gym_id     UUID,
  p_drops      INTEGER,
  p_session_id UUID
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_challenge  RECORD;
  v_progress   RECORD;
  v_new_value  NUMERIC;
  v_tier       JSONB;
  v_tier_name  TEXT;
  v_tier_drops INTEGER;
  v_tier_rank  INTEGER;
  v_prev_rank  INTEGER;
BEGIN
  -- Loop over all active challenges for this gym
  FOR v_challenge IN
    SELECT * FROM public.gym_challenges
    WHERE gym_id = p_gym_id
      AND is_active = true
      AND start_date <= CURRENT_DATE
      AND end_date >= CURRENT_DATE
  LOOP
    -- Upsert progress row (create if not exists)
    INSERT INTO public.challenge_progress
      (challenge_id, user_id, gym_id, current_drops, current_value)
    VALUES
      (v_challenge.id, p_user_id, p_gym_id, 0, 0)
    ON CONFLICT (user_id, challenge_id) DO NOTHING;

    -- Get current progress with lock
    SELECT * INTO v_progress
    FROM public.challenge_progress
    WHERE challenge_id = v_challenge.id
      AND user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
      INSERT INTO public.challenge_progress
        (challenge_id, user_id, gym_id, current_drops, current_value)
      VALUES
        (v_challenge.id, p_user_id, p_gym_id, 0, 0)
      ON CONFLICT (user_id, challenge_id) DO NOTHING
      RETURNING * INTO v_progress;
      
      IF NOT FOUND THEN
        RAISE WARNING 'Failed to create challenge_progress for challenge_id=%, user_id=%', v_challenge.id, p_user_id;
        CONTINUE;
      END IF;
    END IF;

    -- Calculate new value based on scoring model
    v_new_value := COALESCE(v_progress.current_value, 0);

    CASE COALESCE(v_challenge.scoring_model, 'total_drops')
      WHEN 'total_drops' THEN
        v_new_value := v_new_value + p_drops;
      WHEN 'distance_km' THEN
        v_new_value := v_new_value + COALESCE(
          (SELECT (raw_metrics->>'total_distance')::NUMERIC / 1000.0
           FROM public.sessions WHERE id = p_session_id),
          0
        );
      WHEN 'days_visited' THEN
        v_new_value := (
          SELECT COUNT(DISTINCT DATE(started_at))
          FROM public.sessions
          WHERE user_id = p_user_id
            AND gym_id = p_gym_id
            AND DATE(started_at) >= v_challenge.start_date
            AND DATE(started_at) <= v_challenge.end_date
            AND drops_earned > 0
        );
      WHEN 'streak_days' THEN
        v_new_value := (
          SELECT streak_days FROM public.profiles WHERE id = p_user_id
        );
      ELSE
        v_new_value := v_new_value + p_drops;
    END CASE;

    -- Update progress
    UPDATE public.challenge_progress
    SET current_value = v_new_value,
        current_drops = CASE
          WHEN COALESCE(v_challenge.scoring_model, 'total_drops') = 'total_drops'
          THEN (current_drops + p_drops)
          ELSE current_drops
        END,
        updated_at = NOW()
    WHERE challenge_id = v_challenge.id
      AND user_id = p_user_id;

    -- Check completion against target_drops (for non-tiered challenges)
    IF v_challenge.tiers IS NULL
      AND NOT v_progress.is_completed
      AND v_new_value >= v_challenge.target_drops
    THEN
      UPDATE public.challenge_progress
      SET is_completed = true,
          completed_at = NOW()
      WHERE challenge_id = v_challenge.id
        AND user_id = p_user_id;

      -- Create badge entry (uses new partial unique index)
      INSERT INTO public.user_badges
        (user_id, gym_challenge_id, earned_at)
      VALUES
        (p_user_id, v_challenge.id, NOW())
      ON CONFLICT (user_id, gym_challenge_id) WHERE gym_challenge_id IS NOT NULL
      DO NOTHING;

      -- Award challenge reward drops
      IF NOT v_progress.drops_awarded AND v_challenge.reward_drops > 0 THEN
        UPDATE public.challenge_progress
        SET drops_awarded = true
        WHERE challenge_id = v_challenge.id AND user_id = p_user_id;

        UPDATE public.profiles
        SET total_drops     = total_drops + v_challenge.reward_drops,
            available_drops = available_drops + v_challenge.reward_drops,
            weekly_drops    = weekly_drops + v_challenge.reward_drops,
            monthly_drops   = monthly_drops + v_challenge.reward_drops
        WHERE id = p_user_id;

        UPDATE public.gym_memberships
        SET local_drops_balance = local_drops_balance + v_challenge.reward_drops
        WHERE user_id = p_user_id AND gym_id = p_gym_id;

        INSERT INTO public.drops_transactions
          (user_id, gym_id, amount, transaction_type, reference_id, description)
        VALUES
          (p_user_id, p_gym_id, v_challenge.reward_drops, 'challenge',
           v_challenge.id, 'Challenge complete: ' || v_challenge.name);
      END IF;
    END IF;

    -- Check TIER completion (Bronze → Silver → Gold)
    IF v_challenge.tiers IS NOT NULL AND NOT COALESCE(v_progress.drops_awarded, false) THEN
      v_prev_rank := CASE COALESCE(v_progress.tier_achieved, '')
        WHEN 'gold'   THEN 3
        WHEN 'silver' THEN 2
        WHEN 'bronze' THEN 1
        ELSE 0
      END;

      FOR v_tier IN
        SELECT value FROM jsonb_array_elements(v_challenge.tiers) AS value
        ORDER BY (value->>'target')::NUMERIC ASC
      LOOP
        v_tier_name  := lower(v_tier->>'label');
        v_tier_drops := COALESCE((v_tier->>'drops')::INTEGER, 0);
        v_tier_rank  := CASE v_tier_name
          WHEN 'gold'   THEN 3
          WHEN 'silver' THEN 2
          WHEN 'bronze' THEN 1
          ELSE 0
        END;

        IF v_new_value >= (v_tier->>'target')::NUMERIC
          AND v_tier_rank > v_prev_rank
        THEN
          UPDATE public.challenge_progress
          SET tier_achieved = v_tier_name
          WHERE challenge_id = v_challenge.id
            AND user_id = p_user_id;

          IF v_tier_drops > 0 THEN
            UPDATE public.profiles
            SET total_drops     = total_drops + v_tier_drops,
                available_drops = available_drops + v_tier_drops,
                weekly_drops    = weekly_drops + v_tier_drops,
                monthly_drops   = monthly_drops + v_tier_drops
            WHERE id = p_user_id;

            UPDATE public.gym_memberships
            SET local_drops_balance = local_drops_balance + v_tier_drops
            WHERE user_id = p_user_id AND gym_id = p_gym_id;

            INSERT INTO public.drops_transactions
              (user_id, gym_id, amount, transaction_type, reference_id, description)
            VALUES
              (p_user_id, p_gym_id, v_tier_drops, 'challenge',
               v_challenge.id, v_tier_name || ' tier: ' || v_challenge.name);
          END IF;

          v_prev_rank := v_tier_rank;
        END IF;
      END LOOP;

      -- Mark as fully awarded if gold reached
      IF v_prev_rank >= 3 THEN
        UPDATE public.challenge_progress
        SET drops_awarded = true, is_completed = true, completed_at = NOW()
        WHERE challenge_id = v_challenge.id AND user_id = p_user_id;

        -- Create badge entry (uses new partial unique index)
        INSERT INTO public.user_badges
          (user_id, gym_challenge_id, earned_at)
        VALUES
          (p_user_id, v_challenge.id, NOW())
        ON CONFLICT (user_id, gym_challenge_id) WHERE gym_challenge_id IS NOT NULL
        DO NOTHING;
      END IF;
    END IF;

  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.update_challenge_progress(UUID, UUID, INTEGER, UUID) IS
  'Updates challenge progress for all active challenges in a gym after a session. '
  'Handles scoring models: total_drops, distance_km, days_visited, streak_days. '
  'Awards tier rewards (Bronze/Silver/Gold) and completion rewards. '
  'Fixed: uses partial unique index ON CONFLICT for user_badges inserts.';

-- ============================================================
-- VERIFY: Check that the CHECK constraint still works
-- ============================================================
-- The existing CHECK constraint user_badges_exactly_one_reference requires
-- exactly one of global_achievement_id or gym_challenge_id to be NOT NULL.
-- With challenge_id now nullable, new inserts with only global_achievement_id
-- will satisfy: (global_achievement_id IS NOT NULL AND gym_challenge_id IS NULL) ✓
