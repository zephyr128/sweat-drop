-- Migration: 20260311000001_arena_completed_visibility_and_results.sql
-- Description: Enable completed arena visibility + user arena result RPC + fix redemption status
-- 
-- AGENT NOTE: [2026-03-11] - supabase-dba
-- Reference: docs/plans/arena_expiration_and_results_flow.md — Steps 2, 3
-- 
-- CHANGES:
-- - Updated get_available_arenas() to return finalized arenas from last 30 days
-- - Updated arena_status CASE to properly return 'ended' for finalized arenas
-- - Created get_user_arena_result() RPC for mobile app results view
-- - Fixed finalize_arena() to insert redemptions with status='pending' (not 'claimed')
-- - Updated RLS on sweat_arenas to allow viewing finalized arenas
-- 
-- IMPACT ON FRONTEND:
-- - Mobile App: Can now see completed arenas (arena_status='ended'), call get_user_arena_result()
-- - Admin Panel: No changes needed — get_arena_results() already works for finalized arenas
-- 
-- BREAKING CHANGES:
-- - None (additive changes only)

-- ============================================================================
-- 1. FIX: finalize_arena() — Insert redemptions with status='pending'
-- ============================================================================
-- Redemptions should start as 'pending' until user physically claims the prize.
-- The edge function notification filter was also updated to match.

CREATE OR REPLACE FUNCTION public.finalize_arena(p_arena_id UUID)
RETURNS TABLE(winners_count INTEGER)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_arena RECORD;
  v_winner RECORD;
  v_prize JSONB;
  v_redemption_id UUID;
  v_winner_count INTEGER := 0;
  v_rank INTEGER;
  v_user_gym_id UUID;
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
    ORDER BY ap.current_score DESC, p.username ASC
  LOOP
    v_rank := v_rank + 1;

    v_user_gym_id := v_winner.gym_id;
    
    IF v_user_gym_id IS NULL THEN
      SELECT home_gym_id INTO v_user_gym_id
      FROM public.profiles
      WHERE id = v_winner.user_id;
      
      IF v_user_gym_id IS NULL THEN
        SELECT gym_id INTO v_user_gym_id
        FROM public.arena_gyms
        WHERE arena_id = p_arena_id
        LIMIT 1;
      END IF;
      
      IF v_user_gym_id IS NULL THEN
        RAISE EXCEPTION 'Cannot determine gym_id for user % in arena %.', 
          v_winner.user_id, p_arena_id;
      END IF;
    END IF;

    v_prize := NULL;
    IF jsonb_array_length(v_arena.prizes) > 0 THEN
      SELECT prize INTO v_prize
      FROM jsonb_array_elements(v_arena.prizes) AS prize
      WHERE (prize->>'rank')::INTEGER = v_rank
      LIMIT 1;
    END IF;

    IF v_prize IS NOT NULL THEN
      INSERT INTO public.redemptions (
        user_id, reward_id, gym_id, drops_spent, status, source_type, description
      )
      VALUES (
        v_winner.user_id, NULL, v_user_gym_id, 0,
        'pending',
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
      SET final_rank = EXCLUDED.final_rank,
          final_score = EXCLUDED.final_score,
          prize_description = EXCLUDED.prize_description,
          redemption_id = EXCLUDED.redemption_id;

      v_winner_count := v_winner_count + 1;
    ELSE
      INSERT INTO public.arena_results (
        arena_id, user_id, final_rank, final_score, prize_description, redemption_id
      )
      VALUES (
        p_arena_id, v_winner.user_id, v_rank, v_winner.current_score, NULL, NULL
      )
      ON CONFLICT (arena_id, user_id) DO UPDATE
      SET final_rank = EXCLUDED.final_rank,
          final_score = EXCLUDED.final_score,
          prize_description = EXCLUDED.prize_description,
          redemption_id = EXCLUDED.redemption_id;
    END IF;
  END LOOP;

  UPDATE public.sweat_arenas
  SET is_finalized = true,
      finalized_at = NOW(),
      updated_at = NOW()
  WHERE id = p_arena_id;

  RETURN QUERY SELECT v_winner_count;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error finalizing arena %: %', p_arena_id, SQLERRM;
    RAISE;
END;
$$;

COMMENT ON FUNCTION public.finalize_arena(UUID) IS
  'Finalizes an arena: ranks participants, creates arena_results, awards prizes as pending redemptions. '
  'Redemptions start with status=pending (user must claim). Called by finalize-arena edge function.';

GRANT EXECUTE ON FUNCTION public.finalize_arena(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_arena(UUID) TO service_role;

-- ============================================================================
-- 2. UPDATE: get_available_arenas() — Include completed arenas (last 30 days)
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_available_arenas(UUID);

CREATE OR REPLACE FUNCTION public.get_available_arenas(p_user_id UUID)
RETURNS TABLE(
  arena_id UUID,
  name TEXT,
  description TEXT,
  sponsor_name TEXT,
  sponsor_logo TEXT,
  scoring_model TEXT,
  start_date DATE,
  end_date DATE,
  participant_count BIGINT,
  user_opted_in BOOLEAN,
  user_rank BIGINT,
  user_score NUMERIC,
  prizes JSONB,
  opt_in_type TEXT,
  opt_in_value INTEGER,
  card_color TEXT,
  card_text_color TEXT,
  card_gradient_end TEXT,
  arena_status TEXT,
  gym_score_breakdown JSONB,
  is_finalized BOOLEAN,
  finalized_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sa.id AS arena_id,
    sa.name,
    sa.description,
    sa.sponsor_name,
    sa.sponsor_logo,
    sa.scoring_model,
    sa.start_date,
    sa.end_date,
    COUNT(DISTINCT ap.id)::BIGINT AS participant_count,
    EXISTS (
      SELECT 1 FROM public.arena_participants ap2
      WHERE ap2.arena_id = sa.id AND ap2.user_id = p_user_id
    ) AS user_opted_in,
    (
      SELECT COUNT(*)::BIGINT + 1
      FROM public.arena_participants ap3
      WHERE ap3.arena_id = sa.id
        AND ap3.current_score > COALESCE((
          SELECT ap4.current_score
          FROM public.arena_participants ap4
          WHERE ap4.arena_id = sa.id AND ap4.user_id = p_user_id
        ), 0)
    ) AS user_rank,
    (
      SELECT ap5.current_score
      FROM public.arena_participants ap5
      WHERE ap5.arena_id = sa.id AND ap5.user_id = p_user_id
    ) AS user_score,
    sa.prizes,
    COALESCE(sa.opt_in_type, 'free')::TEXT AS opt_in_type,
    COALESCE(sa.opt_in_value, 0)::INTEGER AS opt_in_value,
    sa.card_color::TEXT,
    sa.card_text_color::TEXT,
    sa.card_gradient_end::TEXT,
    CASE
      WHEN sa.is_finalized = true AND sa.end_date < CURRENT_DATE THEN 'ended'
      WHEN sa.start_date > CURRENT_DATE THEN 'upcoming'
      WHEN sa.end_date < CURRENT_DATE THEN 'ended'
      ELSE 'active'
    END::TEXT AS arena_status,
    (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'gym_id', apgs.gym_id,
          'gym_name', g.name,
          'score', apgs.score,
          'sessions', apgs.sessions
        ) ORDER BY apgs.score DESC
      ), '[]'::jsonb)
      FROM public.arena_participant_gym_scores apgs
      JOIN public.gyms g ON g.id = apgs.gym_id
      WHERE apgs.arena_id = sa.id
        AND apgs.user_id = p_user_id
    ) AS gym_score_breakdown,
    sa.is_finalized,
    sa.finalized_at
  FROM public.sweat_arenas sa
  LEFT JOIN public.arena_participants ap ON ap.arena_id = sa.id
  WHERE sa.is_active = true
    AND (
      -- Upcoming + active arenas (not yet ended)
      (sa.is_finalized = false AND sa.end_date >= CURRENT_DATE)
      OR
      -- Completed arenas from last 30 days
      (sa.is_finalized = true AND sa.end_date >= CURRENT_DATE - INTERVAL '30 days')
    )
    AND EXISTS (
      SELECT 1 FROM public.arena_gyms ag
      JOIN public.gym_memberships gm ON gm.gym_id = ag.gym_id
      WHERE ag.arena_id = sa.id
        AND gm.user_id = p_user_id
    )
  GROUP BY sa.id, sa.name, sa.description, sa.sponsor_name, sa.sponsor_logo,
           sa.scoring_model, sa.start_date, sa.end_date, sa.prizes,
           sa.opt_in_type, sa.opt_in_value, sa.card_color, sa.card_text_color,
           sa.card_gradient_end, sa.is_finalized, sa.finalized_at
  ORDER BY
    CASE
      WHEN sa.is_finalized = true THEN 2
      WHEN sa.start_date > CURRENT_DATE THEN 0
      ELSE 1
    END,
    sa.start_date ASC;
END;
$$;

COMMENT ON FUNCTION public.get_available_arenas(UUID) IS
  'Returns arenas available to a user: upcoming, active, and completed (last 30 days). '
  'Only shows arenas where user''s gym participates (via arena_gyms). '
  'Now includes is_finalized and finalized_at columns, and arena_status=ended for completed arenas.';

GRANT EXECUTE ON FUNCTION public.get_available_arenas(UUID) TO authenticated;

-- ============================================================================
-- 3. UPDATE RLS: sweat_arenas — Allow viewing finalized arenas (last 30 days)
-- ============================================================================

DROP POLICY IF EXISTS "Users can view active arenas" ON public.sweat_arenas;

CREATE POLICY "Users can view active arenas"
  ON public.sweat_arenas FOR SELECT
  USING (
    public.is_superadmin(auth.uid()) OR
    -- gym_owner/gym_admin see all active + recently finalized arenas
    (is_active = true AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('gym_owner', 'gym_admin')
    )) OR
    -- Regular users: active arenas where their gym participates
    (is_active = true AND is_finalized = false AND EXISTS (
      SELECT 1 FROM public.arena_gyms ag
      JOIN public.gym_memberships gm ON gm.gym_id = ag.gym_id
      WHERE ag.arena_id = sweat_arenas.id
        AND gm.user_id = auth.uid()
    )) OR
    -- Regular users: finalized arenas from last 30 days where their gym participated
    (is_active = true AND is_finalized = true AND end_date >= CURRENT_DATE - INTERVAL '30 days' AND EXISTS (
      SELECT 1 FROM public.arena_gyms ag
      JOIN public.gym_memberships gm ON gm.gym_id = ag.gym_id
      WHERE ag.arena_id = sweat_arenas.id
        AND gm.user_id = auth.uid()
    ))
  );

COMMENT ON POLICY "Users can view active arenas" ON public.sweat_arenas IS
  'Superadmin sees all. gym_owner/gym_admin see all active arenas. '
  'Regular users see active arenas (where gym participates) AND finalized arenas from last 30 days.';

-- ============================================================================
-- 4. CREATE: get_user_arena_result() — User-specific arena results RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_user_arena_result(p_arena_id UUID, p_user_id UUID)
RETURNS TABLE(
  final_rank INTEGER,
  final_score NUMERIC,
  total_participants BIGINT,
  prize_description TEXT,
  redemption_code TEXT,
  redemption_status TEXT,
  top_participants JSONB
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ar.final_rank::INTEGER,
    ar.final_score,
    (
      SELECT COUNT(*)::BIGINT
      FROM public.arena_results ar2
      WHERE ar2.arena_id = p_arena_id
    ) AS total_participants,
    ar.prize_description::TEXT,
    r.redemption_code::TEXT,
    r.status::TEXT AS redemption_status,
    (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'rank', sub.final_rank,
          'username', sub.username,
          'avatar_url', sub.avatar_url,
          'score', sub.final_score,
          'gym_name', sub.gym_name,
          'is_current_user', sub.user_id = p_user_id
        ) ORDER BY sub.final_rank ASC
      ), '[]'::jsonb)
      FROM (
        SELECT
          ar3.final_rank,
          ar3.final_score,
          ar3.user_id,
          p2.username,
          p2.avatar_url,
          g.name AS gym_name
        FROM public.arena_results ar3
        JOIN public.profiles p2 ON p2.id = ar3.user_id
        LEFT JOIN public.arena_participants ap ON ap.arena_id = ar3.arena_id AND ap.user_id = ar3.user_id
        LEFT JOIN public.gyms g ON g.id = ap.gym_id
        WHERE ar3.arena_id = p_arena_id
        ORDER BY ar3.final_rank ASC
        LIMIT 10
      ) sub
    ) AS top_participants
  FROM public.arena_results ar
  LEFT JOIN public.redemptions r ON r.id = ar.redemption_id
  WHERE ar.arena_id = p_arena_id
    AND ar.user_id = p_user_id;
END;
$$;

COMMENT ON FUNCTION public.get_user_arena_result(UUID, UUID) IS
  'Returns a specific user''s result for a finalized arena. '
  'Includes final rank, score, total participants, prize info, redemption code/status, '
  'and top 10 participants with rank, username, avatar, score, gym name.';

GRANT EXECUTE ON FUNCTION public.get_user_arena_result(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_arena_result(UUID, UUID) TO service_role;
