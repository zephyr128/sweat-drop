-- Migration: 20260425180000_arena_demo_guards_and_cleanup.sql
-- Description: Add is_demo guards to opt_into_arena and finalize_arena, clean up demo user arena data
--
-- AGENT NOTE: [2026-04-25] - supabase-dba
--
-- CHANGES:
-- - Patched opt_into_arena(): reject demo accounts (is_demo = true)
-- - Patched finalize_arena(): skip demo users in winner ranking loop
-- - Data cleanup: removed arena_results, redemptions (arena_prize), and arena_participants for demo users
--
-- IMPACT ON FRONTEND:
-- - Mobile App: Demo accounts will now see "Demo accounts cannot join arenas" on opt-in attempt
-- - Admin Panel: None
--
-- BREAKING CHANGES:
-- - None (demo accounts should never have participated)

-- ============================================================
-- 1. Patch opt_into_arena: add is_demo guard after "arena is active" check
-- ============================================================

CREATE OR REPLACE FUNCTION public.opt_into_arena(p_arena_id UUID)
RETURNS TABLE(success BOOLEAN, error_message TEXT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_arena RECORD;
  v_user_id UUID := auth.uid();
  v_user_gym_id UUID;
  v_user_profile RECORD;
  v_local_balance INTEGER;
  v_drops_paid INTEGER := 0;
BEGIN
  -- 1. Fetch arena
  SELECT * INTO v_arena
  FROM public.sweat_arenas
  WHERE id = p_arena_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Arena not found.'::TEXT;
    RETURN;
  END IF;

  -- 2. Check arena is active
  IF NOT v_arena.is_active THEN
    RETURN QUERY SELECT false, 'Arena is not active.'::TEXT;
    RETURN;
  END IF;

  -- 3. Reject demo accounts
  IF COALESCE((SELECT is_demo FROM public.profiles WHERE id = v_user_id), false) THEN
    RETURN QUERY SELECT false, 'Demo accounts cannot join arenas.'::TEXT;
    RETURN;
  END IF;

  -- 4. Check arena hasn't ended (but allow opt-in for future arenas)
  IF v_arena.end_date < CURRENT_DATE THEN
    RETURN QUERY SELECT false, 'Arena has already ended.'::TEXT;
    RETURN;
  END IF;

  -- 5. Check if already opted in
  IF EXISTS (
    SELECT 1 FROM public.arena_participants
    WHERE arena_id = p_arena_id AND user_id = v_user_id
  ) THEN
    RETURN QUERY SELECT false, 'Already opted in.'::TEXT;
    RETURN;
  END IF;

  -- 6. Find user's gym that participates in this arena
  SELECT gm.gym_id INTO v_user_gym_id
  FROM public.gym_memberships gm
  JOIN public.arena_gyms ag ON ag.gym_id = gm.gym_id
  WHERE gm.user_id = v_user_id
    AND ag.arena_id = p_arena_id
  LIMIT 1;

  -- For network arenas, use user's home gym
  IF v_user_gym_id IS NULL AND v_arena.arena_scope = 'network' THEN
    SELECT home_gym_id INTO v_user_gym_id
    FROM public.profiles
    WHERE id = v_user_id;
  END IF;

  IF v_user_gym_id IS NULL THEN
    RETURN QUERY SELECT false, 'You are not a member of any participating gym.'::TEXT;
    RETURN;
  END IF;

  -- 7. Check opt-in requirements
  SELECT * INTO v_user_profile
  FROM public.profiles
  WHERE id = v_user_id;

  IF COALESCE(v_arena.opt_in_type, 'free') = 'drops' THEN
    SELECT COALESCE(local_drops_balance, 0) INTO v_local_balance
    FROM public.gym_memberships
    WHERE user_id = v_user_id AND gym_id = v_user_gym_id;

    IF COALESCE(v_local_balance, 0) < COALESCE(v_arena.opt_in_value, 0) THEN
      RETURN QUERY SELECT false, ('Not enough drops. Need ' || v_arena.opt_in_value || ' drops to join.')::TEXT;
      RETURN;
    END IF;

    UPDATE public.gym_memberships
    SET local_drops_balance = local_drops_balance - v_arena.opt_in_value,
        updated_at = NOW()
    WHERE user_id = v_user_id AND gym_id = v_user_gym_id;

    UPDATE public.profiles
    SET total_drops = GREATEST(0, total_drops - v_arena.opt_in_value),
        updated_at = NOW()
    WHERE id = v_user_id;

    v_drops_paid := COALESCE(v_arena.opt_in_value, 0);

  ELSIF COALESCE(v_arena.opt_in_type, 'free') = 'streak' THEN
    IF COALESCE(v_user_profile.streak_days, 0) < COALESCE(v_arena.opt_in_value, 0) THEN
      RETURN QUERY SELECT false, ('Streak too low. Need ' || v_arena.opt_in_value || '-day streak to join.')::TEXT;
      RETURN;
    END IF;

  ELSIF COALESCE(v_arena.opt_in_type, 'free') = 'level' THEN
    IF COALESCE(v_user_profile.total_drops, 0) < COALESCE(v_arena.opt_in_value, 0) THEN
      RETURN QUERY SELECT false, ('Not enough reputation. Need ' || v_arena.opt_in_value || ' total drops to join.')::TEXT;
      RETURN;
    END IF;
  END IF;

  -- 8. Insert participant with opt_in_drops_paid
  INSERT INTO public.arena_participants (arena_id, user_id, gym_id, current_score, opt_in_drops_paid)
  VALUES (p_arena_id, v_user_id, v_user_gym_id, 0, v_drops_paid)
  ON CONFLICT (arena_id, user_id) DO NOTHING;

  IF EXISTS (
    SELECT 1 FROM public.arena_participants
    WHERE arena_id = p_arena_id AND user_id = v_user_id
  ) THEN
    RETURN QUERY SELECT true, NULL::TEXT;
  ELSE
    RETURN QUERY SELECT false, 'Failed to opt into arena'::TEXT;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.opt_into_arena(UUID) TO authenticated, anon;

-- ============================================================
-- 2. Patch finalize_arena: exclude demo users from winner ranking
-- ============================================================

CREATE OR REPLACE FUNCTION public.finalize_arena(p_arena_id UUID)
RETURNS TABLE(winners_count INTEGER)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_arena         RECORD;
  v_winner        RECORD;
  v_prize         JSONB;
  v_redemption_id UUID;
  v_winner_count  INTEGER := 0;
  v_rank          INTEGER;
  v_user_gym_id   UUID;
  v_status        TEXT;
BEGIN
  SELECT * INTO v_arena
  FROM public.sweat_arenas
  WHERE id = p_arena_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Arena not found: %', p_arena_id;
  END IF;

  IF v_arena.is_finalized THEN
    RAISE EXCEPTION 'Arena already finalized: %', p_arena_id;
  END IF;

  IF v_arena.end_date >= CURRENT_DATE THEN
    RAISE EXCEPTION 'Arena has not ended yet. End date: %', v_arena.end_date;
  END IF;

  v_rank := 0;
  FOR v_winner IN
    SELECT
      ap.user_id,
      ap.gym_id,
      ap.current_score,
      ROW_NUMBER() OVER (ORDER BY ap.current_score DESC, p.username ASC) AS rank
    FROM public.arena_participants ap
    JOIN public.profiles p ON p.id = ap.user_id
    WHERE ap.arena_id = p_arena_id
      AND ap.current_score > 0
      AND COALESCE(p.is_demo, false) = false
    ORDER BY ap.current_score DESC, p.username ASC
  LOOP
    v_rank := v_rank + 1;

    -- Gym resolution (membership-aware fallback chain)
    v_user_gym_id := v_winner.gym_id;

    IF v_user_gym_id IS NULL THEN
      SELECT p.home_gym_id INTO v_user_gym_id
      FROM public.profiles p
      JOIN public.arena_gyms ag
        ON ag.arena_id = p_arena_id AND ag.gym_id = p.home_gym_id
      JOIN public.gym_memberships gm
        ON gm.gym_id = p.home_gym_id AND gm.user_id = v_winner.user_id
      WHERE p.id = v_winner.user_id;
    END IF;

    IF v_user_gym_id IS NULL THEN
      SELECT ag.gym_id INTO v_user_gym_id
      FROM public.arena_gyms ag
      JOIN public.gym_memberships gm
        ON gm.gym_id = ag.gym_id AND gm.user_id = v_winner.user_id
      WHERE ag.arena_id = p_arena_id
      ORDER BY gm.created_at ASC
      LIMIT 1;
    END IF;

    IF v_user_gym_id IS NULL THEN
      RAISE EXCEPTION
        'Cannot determine collection gym for user % in arena %. '
        'User has no membership in any arena gym.',
        v_winner.user_id, p_arena_id;
    END IF;

    v_prize := NULL;
    IF jsonb_array_length(v_arena.prizes) > 0 THEN
      SELECT prize INTO v_prize
      FROM jsonb_array_elements(v_arena.prizes) AS prize
      WHERE (prize->>'rank')::INTEGER = v_rank
      LIMIT 1;
    END IF;

    IF v_prize IS NOT NULL THEN
      v_status := CASE
        WHEN public.is_member_verified(v_winner.user_id, v_user_gym_id) THEN 'pending'
        ELSE 'pending_verification'
      END;

      INSERT INTO public.redemptions (
        user_id, reward_id, gym_id, drops_spent,
        status, source_type, description
      )
      VALUES (
        v_winner.user_id, NULL, v_user_gym_id, 0,
        v_status,
        'arena_prize',
        format('Arena Prize: %s #%s - %s', v_arena.name, v_rank, v_prize->>'prize')
      )
      RETURNING id INTO v_redemption_id;

      INSERT INTO public.arena_results (
        arena_id, user_id, final_rank, final_score, prize_description, redemption_id
      )
      VALUES (
        p_arena_id, v_winner.user_id, v_rank, v_winner.current_score,
        v_prize->>'prize', v_redemption_id
      )
      ON CONFLICT (arena_id, user_id) DO UPDATE
        SET final_rank        = EXCLUDED.final_rank,
            final_score       = EXCLUDED.final_score,
            prize_description = EXCLUDED.prize_description,
            redemption_id     = EXCLUDED.redemption_id;

      v_winner_count := v_winner_count + 1;
    ELSE
      INSERT INTO public.arena_results (
        arena_id, user_id, final_rank, final_score, prize_description, redemption_id
      )
      VALUES (
        p_arena_id, v_winner.user_id, v_rank, v_winner.current_score, NULL, NULL
      )
      ON CONFLICT (arena_id, user_id) DO UPDATE
        SET final_rank        = EXCLUDED.final_rank,
            final_score       = EXCLUDED.final_score,
            prize_description = EXCLUDED.prize_description,
            redemption_id     = EXCLUDED.redemption_id;
    END IF;
  END LOOP;

  UPDATE public.sweat_arenas
  SET is_finalized = true,
      finalized_at = NOW(),
      updated_at   = NOW()
  WHERE id = p_arena_id;

  RETURN QUERY SELECT v_winner_count;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error finalizing arena %: %', p_arena_id, SQLERRM;
    RAISE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalize_arena(UUID) TO authenticated, service_role;

-- ============================================================
-- 3. Data cleanup: remove demo user arena data
-- ============================================================

-- Delete arena results first (has FK to redemptions.id)
DELETE FROM public.arena_results
WHERE user_id IN (SELECT id FROM public.profiles WHERE COALESCE(is_demo, false) = true);

-- Then delete redemptions created for demo users via arena prizes
DELETE FROM public.redemptions
WHERE source_type = 'arena_prize'
  AND user_id IN (SELECT id FROM public.profiles WHERE COALESCE(is_demo, false) = true);

-- Delete arena participants for demo users
DELETE FROM public.arena_participants
WHERE user_id IN (SELECT id FROM public.profiles WHERE COALESCE(is_demo, false) = true);
