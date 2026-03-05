-- Migration: 20260305000002_fix_streak_and_arena_updates.sql
-- Description: Fixes streak challenge progress and arena score updates
-- 
-- AGENT NOTE: [2026-03-05] - supabase-dba
-- 
-- PROBLEMS:
-- 1. Streak challenges: update_challenge_progress() updates current_value but NOT current_streak_days
--    Mobile app reads current_streak_days, so it shows 0/10 instead of 3/10
-- 2. Arena leaderboard: All users show 0 drops - update_arena_scores() may not be updating correctly
--    or streak_days arenas may have NULL handling issues
-- 
-- CHANGES:
-- - Fix update_challenge_progress() to update current_streak_days for streak_days scoring model
-- - Fix update_arena_scores() to handle NULL streak_days and ensure scores update correctly
-- 
-- IMPACT ON FRONTEND:
-- - Mobile App: Streak challenges will now show correct progress (current_streak_days)
-- - Mobile App: Arena leaderboards will show correct scores
-- 
-- BREAKING CHANGES:
-- - None (bug fixes only)

-- ============================================================================
-- FIX 1: update_challenge_progress() - Update current_streak_days for streak challenges
-- ============================================================================

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
  v_new_streak INTEGER;
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
    v_new_streak := NULL; -- Initialize

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
        -- FIX: Get streak_days from profiles and update BOTH current_value AND current_streak_days
        SELECT COALESCE(streak_days, 0) INTO v_new_streak
        FROM public.profiles
        WHERE id = p_user_id;
        v_new_value := v_new_streak;
      ELSE
        v_new_value := v_new_value + p_drops;
    END CASE;

    -- Update progress
    -- FIX: Update current_streak_days when scoring_model is streak_days
    UPDATE public.challenge_progress
    SET current_value = v_new_value,
        current_drops = CASE
          WHEN COALESCE(v_challenge.scoring_model, 'total_drops') = 'total_drops'
          THEN (current_drops + p_drops)
          ELSE current_drops
        END,
        current_streak_days = CASE
          WHEN COALESCE(v_challenge.scoring_model, 'total_drops') = 'streak_days'
          THEN COALESCE(v_new_streak, current_streak_days, 0)
          ELSE current_streak_days
        END,
        updated_at = NOW()
    WHERE challenge_id = v_challenge.id
      AND user_id = p_user_id;

    -- Check completion against target_drops (for non-tiered challenges)
    -- FIX: Use current_streak_days for streak_days scoring model, current_value for others
    IF v_challenge.tiers IS NULL
      AND NOT v_progress.is_completed
    THEN
      DECLARE
        v_progress_value NUMERIC;
      BEGIN
        IF COALESCE(v_challenge.scoring_model, 'total_drops') = 'streak_days' THEN
          v_progress_value := COALESCE(v_new_streak, v_progress.current_streak_days, 0);
        ELSE
          v_progress_value := v_new_value;
        END IF;

        IF v_progress_value >= v_challenge.target_drops THEN
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
      END;
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

        -- FIX: Use current_streak_days for streak_days scoring model, current_value for others
        DECLARE
          v_tier_progress_value NUMERIC;
        BEGIN
          IF COALESCE(v_challenge.scoring_model, 'total_drops') = 'streak_days' THEN
            v_tier_progress_value := COALESCE(v_new_streak, v_progress.current_streak_days, 0);
          ELSE
            v_tier_progress_value := v_new_value;
          END IF;

          IF v_tier_progress_value >= (v_tier->>'target')::NUMERIC
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
        END;
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

-- ============================================================================
-- FIX 2: update_arena_scores() - Fix NULL handling and ensure scores update
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_arena_scores(
  p_user_id UUID,
  p_gym_id UUID,
  p_drops INTEGER
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_streak INTEGER;
BEGIN
  -- Get current streak from profile (once, reuse for all streak_days arenas)
  SELECT COALESCE(streak_days, 0) INTO v_profile_streak
  FROM public.profiles
  WHERE id = p_user_id;

  -- For total_drops: add drops to current_score
  UPDATE public.arena_participants ap
  SET current_score = current_score + p_drops,
      updated_at = NOW()
  FROM public.sweat_arenas sa
  JOIN public.arena_gyms ag ON ag.arena_id = sa.id
  WHERE ap.arena_id = sa.id
    AND ap.user_id = p_user_id
    AND ag.gym_id = p_gym_id
    AND sa.is_active = true
    AND sa.is_finalized = false
    AND sa.start_date <= CURRENT_DATE
    AND sa.end_date >= CURRENT_DATE
    AND sa.scoring_model = 'total_drops';
    
  -- For streak_days: update with current profile streak
  -- FIX: Use COALESCE to handle NULL, and always update (not just GREATEST)
  -- This ensures scores are set even if they start at 0
  UPDATE public.arena_participants ap
  SET current_score = GREATEST(
    COALESCE(ap.current_score, 0),
    COALESCE(v_profile_streak, 0)
  ),
  updated_at = NOW()
  FROM public.sweat_arenas sa
  JOIN public.arena_gyms ag ON ag.arena_id = sa.id
  WHERE ap.arena_id = sa.id
    AND ap.user_id = p_user_id
    AND ag.gym_id = p_gym_id
    AND sa.is_active = true
    AND sa.is_finalized = false
    AND sa.start_date <= CURRENT_DATE
    AND sa.end_date >= CURRENT_DATE
    AND sa.scoring_model = 'streak_days';
END;
$$;

COMMENT ON FUNCTION public.update_challenge_progress(UUID, UUID, INTEGER, UUID) IS
  'Updates challenge progress for all active challenges in a gym after a session. '
  'Handles scoring models: total_drops, distance_km, days_visited, streak_days. '
  'FIXED: Now updates current_streak_days for streak_days scoring model. '
  'Awards badges and drops when challenges are completed.';

COMMENT ON FUNCTION public.update_arena_scores(UUID, UUID, INTEGER) IS
  'Updates arena scores in real-time for total_drops and streak_days scoring models. '
  'Called by award_drops() after each session. '
  'FIXED: Properly handles NULL streak_days and ensures scores are updated correctly.';
