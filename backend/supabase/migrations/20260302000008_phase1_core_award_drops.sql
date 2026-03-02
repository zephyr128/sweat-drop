-- Migration: 20260302000008_phase1_core_award_drops.sql
-- Description: Phase 1 Core Logic — award_drops(), update_challenge_progress(), evaluate_badges()
--
-- AGENT NOTE: [2026-03-02] - supabase-dba (Phase 1, Tasks 1.1-1.3)
-- Reference: docs/plans/mvp_full_audit_and_build_plan.md
--
-- THIS IS THE MOST CRITICAL MIGRATION IN THE SYSTEM.
--
-- BLOCKER DECISIONS IMPLEMENTED:
-- - Blocker 1: total_drops incremented (never decreases), available_drops incremented (future wallet)
-- - Blocker 2: Server-side drops calculation (calories × 2.5 × multiplier)
-- - Blocker 4: available_drops incremented on earn but NOT decremented on spend (MVP)
-- - Blocker 5: award_drops() handles partial sessions from abandoned session cleanup
--
-- INTERFACE CONTRACT:
-- award_drops(p_session_id UUID)
-- → RETURNS TABLE(drops_earned INTEGER, multiplier NUMERIC, badges_earned TEXT[])
-- Called by: mobile app after workout ends, cron for abandoned sessions
--
-- FUNCTIONS CREATED:
-- 1. public.award_drops(UUID) — Server-side drops calculation + distribution
-- 2. public.update_challenge_progress(UUID, UUID, INTEGER, UUID) — Challenge progress + tier awards
-- 3. public.evaluate_badges(UUID, UUID) — Badge criteria evaluation + awarding
--
-- BREAKING CHANGES:
-- - New function award_drops() is the canonical way to finalize sessions
-- - Old end_session() and add_drops() are kept for backward compatibility
-- - Mobile must switch to calling award_drops() instead of end_session()

-- ============================================================
-- FUNCTION 1: award_drops() — THE CORE DROPS ENGINE
-- ============================================================

CREATE OR REPLACE FUNCTION public.award_drops(
  p_session_id UUID
)
RETURNS TABLE(
  drops_earned  INTEGER,
  multiplier    NUMERIC,
  badges_earned TEXT[]
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_session      RECORD;
  v_profile      RECORD;
  v_base_drops   INTEGER;
  v_multiplier   NUMERIC := 1.0;
  v_final_drops  INTEGER;
  v_balance_after INTEGER;
  v_new_streak   INTEGER;
  v_badges       TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- 1. LOCK SESSION ROW — prevents concurrent awards
  SELECT * INTO v_session
  FROM public.sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found: %', p_session_id;
  END IF;

  -- 2. IDEMPOTENCY — if already awarded, return existing values
  IF v_session.drops_earned > 0 THEN
    RETURN QUERY SELECT
      v_session.drops_earned::INTEGER,
      COALESCE(v_session.multiplier, 1.0)::NUMERIC,
      ARRAY[]::TEXT[];
    RETURN;
  END IF;

  -- 3. GET PROFILE (lock for update — prevents race conditions on balance)
  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = v_session.user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for user: %', v_session.user_id;
  END IF;

  -- 4. SERVER-SIDE DROPS CALCULATION
  -- Priority: device-reported calories > duration-based estimate
  -- Formula: base_drops = calories × 2.5
  -- Fallback: (duration_minutes × 7) × 2.5 [bike/elliptical default]
  v_base_drops := GREATEST(1, ROUND(
    COALESCE(
      v_session.calories,                          -- device-reported or mobile-estimated calories
      (v_session.duration_seconds / 60.0) * 7.0    -- fallback: duration × 7 cal/min
    ) * 2.5
  ));

  -- 5. STREAK CALCULATION
  v_new_streak := CASE
    WHEN v_profile.last_visit_date IS NULL THEN 1                -- first ever visit
    WHEN v_profile.last_visit_date = CURRENT_DATE THEN
      v_profile.streak_days                                       -- same day, no change
    WHEN v_profile.last_visit_date = CURRENT_DATE - 1 THEN
      v_profile.streak_days + 1                                   -- consecutive day
    ELSE 1                                                        -- streak broken
  END;

  -- 6. STREAK MULTIPLIER
  v_multiplier := CASE
    WHEN v_new_streak >= 14 THEN 2.0
    WHEN v_new_streak >= 7  THEN 1.5
    WHEN v_new_streak >= 3  THEN 1.2
    ELSE 1.0
  END;

  -- 7. FINAL DROPS (minimum 1)
  v_final_drops := GREATEST(1, ROUND(v_base_drops * v_multiplier));

  -- 8. UPDATE SESSION — marks as processed, stores authoritative values
  UPDATE public.sessions
  SET drops_earned    = v_final_drops,
      multiplier      = v_multiplier,
      ended_at        = COALESCE(ended_at, NOW()),
      is_active       = false,
      updated_at      = NOW()
  WHERE id = p_session_id;

  -- 9. UPDATE PROFILE BALANCES
  -- total_drops: all-time (never decreases, leaderboard score)
  -- available_drops: global wallet (incremented on earn, NOT decremented on spend in MVP)
  -- weekly_drops / monthly_drops: period counters (reset by cron)
  -- streak_days / last_visit_date: streak tracking
  UPDATE public.profiles
  SET total_drops     = total_drops + v_final_drops,
      available_drops = available_drops + v_final_drops,
      weekly_drops    = weekly_drops + v_final_drops,
      monthly_drops   = monthly_drops + v_final_drops,
      last_visit_date = CURRENT_DATE,
      streak_days     = v_new_streak,
      updated_at      = NOW()
  WHERE id = v_session.user_id;

  -- 10. UPDATE GYM MEMBERSHIP LOCAL BALANCE
  -- This is the actual spendable balance (gym-scoped, MVP Blocker 4)
  UPDATE public.gym_memberships
  SET local_drops_balance = local_drops_balance + v_final_drops,
      updated_at          = NOW()
  WHERE user_id = v_session.user_id
    AND gym_id  = v_session.gym_id;

  -- If membership doesn't exist, create one (first visit to this gym)
  IF NOT FOUND THEN
    INSERT INTO public.gym_memberships (user_id, gym_id, local_drops_balance)
    VALUES (v_session.user_id, v_session.gym_id, v_final_drops)
    ON CONFLICT (user_id, gym_id)
    DO UPDATE SET local_drops_balance = gym_memberships.local_drops_balance + v_final_drops;
  END IF;

  -- 11. GET BALANCE SNAPSHOT for ledger entry
  SELECT available_drops INTO v_balance_after
  FROM public.profiles
  WHERE id = v_session.user_id;

  -- 12. APPEND TO DROPS LEDGER (audit trail)
  INSERT INTO public.drops_transactions
    (user_id, gym_id, amount, transaction_type,
     reference_id, balance_after, expires_at, description)
  VALUES
    (v_session.user_id, v_session.gym_id,
     v_final_drops, 'session',
     p_session_id, v_balance_after,
     NOW() + INTERVAL '90 days',
     'Workout session — ' || v_final_drops || ' drops (×' || v_multiplier || ')');

  -- 13. UPDATE CHALLENGE PROGRESS (see Function 2 below)
  PERFORM public.update_challenge_progress(
    v_session.user_id,
    v_session.gym_id,
    v_final_drops,
    p_session_id
  );

  -- 14. EVALUATE BADGES (see Function 3 below)
  SELECT COALESCE(array_agg(bn.badge_name), ARRAY[]::TEXT[])
  INTO v_badges
  FROM public.evaluate_badges(v_session.user_id, p_session_id) AS bn(badge_name);

  -- 15. RETURN
  RETURN QUERY SELECT v_final_drops, v_multiplier, v_badges;
END;
$$;

COMMENT ON FUNCTION public.award_drops(UUID) IS
  'Server-side drops calculation and distribution. Idempotent — safe to call multiple times for same session. '
  'Calculates: base_drops = calories × 2.5 × streak_multiplier. '
  'Updates: profiles (total + available + weekly + monthly + streak), gym_memberships (local balance), '
  'drops_transactions (ledger), challenge_progress, and badges.';

-- Grant execute to authenticated users (they call via RPC)
GRANT EXECUTE ON FUNCTION public.award_drops(UUID) TO authenticated;


-- ============================================================
-- FUNCTION 2: update_challenge_progress()
-- ============================================================

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
    -- CRITICAL: Include gym_id for RLS policies and gym-specific queries
    INSERT INTO public.challenge_progress
      (challenge_id, user_id, gym_id, current_drops, current_value)
    VALUES
      (v_challenge.id, p_user_id, p_gym_id, 0, 0)
    ON CONFLICT (user_id, challenge_id) DO NOTHING;

    -- Get current progress with lock
    -- CRITICAL: After INSERT with ON CONFLICT DO NOTHING, row may not exist yet
    SELECT * INTO v_progress
    FROM public.challenge_progress
    WHERE challenge_id = v_challenge.id
      AND user_id = p_user_id
    FOR UPDATE;

    -- If progress row doesn't exist (race condition), create it now
    IF NOT FOUND THEN
      INSERT INTO public.challenge_progress
        (challenge_id, user_id, gym_id, current_drops, current_value)
      VALUES
        (v_challenge.id, p_user_id, p_gym_id, 0, 0)
      ON CONFLICT (user_id, challenge_id) DO NOTHING
      RETURNING * INTO v_progress;
      
      -- If still not found after INSERT, something is wrong
      IF NOT FOUND THEN
        RAISE WARNING 'Failed to create challenge_progress for challenge_id=%, user_id=%', v_challenge.id, p_user_id;
        CONTINUE; -- Skip this challenge
      END IF;
    END IF;

    -- Calculate new value based on scoring model
    v_new_value := COALESCE(v_progress.current_value, 0);

    CASE COALESCE(v_challenge.scoring_model, 'total_drops')
      WHEN 'total_drops' THEN
        v_new_value := v_new_value + p_drops;

      WHEN 'distance_km' THEN
        -- Extract distance from session raw_metrics
        v_new_value := v_new_value + COALESCE(
          (SELECT (raw_metrics->>'total_distance')::NUMERIC / 1000.0
           FROM public.sessions WHERE id = p_session_id),
          0
        );

      WHEN 'days_visited' THEN
        -- Count unique days with sessions during challenge period
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
        -- Use profile streak_days directly
        v_new_value := (
          SELECT streak_days FROM public.profiles WHERE id = p_user_id
        );

      ELSE
        -- Unknown scoring model, use drops as default
        v_new_value := v_new_value + p_drops;
    END CASE;

    -- Update progress and current_drops (keep both in sync)
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

      -- Award challenge reward drops (if not already awarded)
      IF NOT v_progress.drops_awarded AND v_challenge.reward_drops > 0 THEN
        UPDATE public.challenge_progress
        SET drops_awarded = true
        WHERE challenge_id = v_challenge.id AND user_id = p_user_id;

        -- Add reward drops to all balances
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
      -- Rank tiers: bronze=1, silver=2, gold=3
      v_prev_rank := CASE COALESCE(v_progress.tier_achieved, '')
        WHEN 'gold'   THEN 3
        WHEN 'silver' THEN 2
        WHEN 'bronze' THEN 1
        ELSE 0
      END;

      -- Check each tier in order (they should be sorted by target in the JSONB)
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

        -- Only award if: user reached target AND hasn't reached this tier yet
        IF v_new_value >= (v_tier->>'target')::NUMERIC
          AND v_tier_rank > v_prev_rank
        THEN
          -- Update tier achieved
          UPDATE public.challenge_progress
          SET tier_achieved = v_tier_name
          WHERE challenge_id = v_challenge.id
            AND user_id = p_user_id;

          -- Award tier drops
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

          -- Update prev_rank so we can check next tier
          v_prev_rank := v_tier_rank;
        END IF;
      END LOOP;

      -- Mark as fully awarded if gold reached
      IF v_prev_rank >= 3 THEN
        UPDATE public.challenge_progress
        SET drops_awarded = true, is_completed = true, completed_at = NOW()
        WHERE challenge_id = v_challenge.id AND user_id = p_user_id;
      END IF;
    END IF;

  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.update_challenge_progress(UUID, UUID, INTEGER, UUID) IS
  'Updates challenge progress for all active challenges in a gym after a session. '
  'Handles scoring models: total_drops, distance_km, days_visited, streak_days. '
  'Awards tier rewards (Bronze/Silver/Gold) and completion rewards.';


-- ============================================================
-- FUNCTION 3: evaluate_badges()
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
BEGIN
  -- Get current profile stats
  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = p_user_id;

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
      -- Insert badge (the polymorphic constraint requires global_achievement_id set, gym_challenge_id NULL)
      INSERT INTO public.user_badges
        (user_id, global_achievement_id, earned_at)
      VALUES
        (p_user_id, v_achievement.id, NOW())
      ON CONFLICT DO NOTHING;

      -- Award badge bonus drops (if any)
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

      -- Return badge name to caller
      RETURN QUERY SELECT v_achievement.name::TEXT;
    END IF;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.evaluate_badges(UUID, UUID) IS
  'Evaluates all active global achievements against user stats. '
  'Awards badges and bonus drops for newly met criteria. '
  'Supports: session_count, total_drops, streak_days, gym_count, distance_km.';

GRANT EXECUTE ON FUNCTION public.evaluate_badges(UUID, UUID) TO authenticated;
