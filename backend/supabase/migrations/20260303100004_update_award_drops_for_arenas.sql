-- Migration: 20260303100004_update_award_drops_for_arenas.sql
-- Description: Update award_drops() to call update_arena_scores() after challenge progress update
-- 
-- AGENT NOTE: [2026-03-03] - supabase-dba (Phase 3.2)
-- Reference: docs/plans/phase3_audit_and_arenas_plan.md — Phase 3.2, Section 4.7
-- 
-- CHANGES:
-- - Add step 13b in award_drops() to call update_arena_scores() for real-time arena score updates
-- 
-- IMPACT:
-- - award_drops() now also updates arena scores for total_drops and streak_days arenas
-- - Backward compatible (no breaking changes)

-- Read the full award_drops() function and recreate it with the new step
-- Step 13b: UPDATE ARENA SCORES (for total_drops and streak_days arenas)

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

  -- 13. UPDATE CHALLENGE PROGRESS
  PERFORM public.update_challenge_progress(
    v_session.user_id,
    v_session.gym_id,
    v_final_drops,
    p_session_id
  );

  -- 13b. UPDATE ARENA SCORES (for total_drops and streak_days arenas)
  -- Real-time score updates for arenas using total_drops or streak_days scoring models
  PERFORM public.update_arena_scores(
    v_session.user_id,
    v_session.gym_id,
    v_final_drops
  );

  -- 14. EVALUATE BADGES
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
  'drops_transactions (ledger), challenge_progress, arena_scores (for total_drops/streak_days arenas), and badges.';
