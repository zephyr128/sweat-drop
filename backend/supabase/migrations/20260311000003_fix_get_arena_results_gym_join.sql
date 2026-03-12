-- Migration: 20260311000002_fix_get_arena_results_gym_join.sql
-- Description: Fix get_arena_results() — join gyms through arena_participants, not arena_results.gym_id
-- 
-- AGENT NOTE: [2026-03-11] - admin-coder (hotfix for blocking bug)
-- 
-- BUG: get_arena_results() referenced ar.gym_id which does not exist on arena_results table.
-- The arena_results table only has: id, arena_id, user_id, final_rank, final_score, prize_description, redemption_id.
-- gym_id lives on arena_participants, so we join through that instead.
-- 
-- IMPACT: Unblocks admin panel Results tab for finalized arenas.

DROP FUNCTION IF EXISTS public.get_arena_results(UUID);

CREATE OR REPLACE FUNCTION public.get_arena_results(p_arena_id UUID)
RETURNS TABLE(
  rank INTEGER,
  user_id UUID,
  username TEXT,
  avatar_url TEXT,
  gym_name TEXT,
  final_score NUMERIC,
  prize TEXT,
  redemption_code TEXT,
  redemption_status TEXT,
  gym_breakdown JSONB
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_is_superadmin BOOLEAN;
  v_caller_gym_id UUID;
BEGIN
  SELECT public.is_superadmin(v_caller_id) INTO v_is_superadmin;
  
  IF NOT v_is_superadmin THEN
    SELECT admin_gym_id INTO v_caller_gym_id
    FROM public.profiles
    WHERE id = v_caller_id;
    
    IF v_caller_gym_id IS NULL THEN
      SELECT id INTO v_caller_gym_id
      FROM public.gyms
      WHERE owner_id = v_caller_id
      LIMIT 1;
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    ar.final_rank::INTEGER AS rank,
    ar.user_id,
    p.username::TEXT,
    p.avatar_url::TEXT,
    COALESCE(g.name, 'Unknown')::TEXT AS gym_name,
    ar.final_score,
    ar.prize_description::TEXT AS prize,
    r.redemption_code::TEXT,
    r.status::TEXT AS redemption_status,
    CASE
      WHEN v_is_superadmin THEN
        (SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'gym_id', apgs.gym_id,
            'gym_name', g2.name,
            'score', apgs.score,
            'sessions', apgs.sessions
          ) ORDER BY apgs.score DESC
        ), '[]'::jsonb)
        FROM public.arena_participant_gym_scores apgs
        JOIN public.gyms g2 ON g2.id = apgs.gym_id
        WHERE apgs.arena_id = p_arena_id AND apgs.user_id = ar.user_id)
      ELSE
        (SELECT jsonb_build_object(
          'own_gym_score', COALESCE(SUM(
            CASE WHEN apgs.gym_id = v_caller_gym_id THEN apgs.score ELSE 0 END
          ), 0),
          'other_gyms_score', COALESCE(SUM(
            CASE WHEN apgs.gym_id != v_caller_gym_id OR v_caller_gym_id IS NULL THEN apgs.score ELSE 0 END
          ), 0),
          'total_sessions', COALESCE(SUM(apgs.sessions), 0)
        )
        FROM public.arena_participant_gym_scores apgs
        WHERE apgs.arena_id = p_arena_id AND apgs.user_id = ar.user_id)
    END AS gym_breakdown
  FROM public.arena_results ar
  JOIN public.profiles p ON p.id = ar.user_id
  LEFT JOIN public.arena_participants ap ON ap.arena_id = ar.arena_id AND ap.user_id = ar.user_id
  LEFT JOIN public.gyms g ON g.id = ap.gym_id
  LEFT JOIN public.redemptions r ON r.id = ar.redemption_id
  WHERE ar.arena_id = p_arena_id
  ORDER BY ar.final_rank ASC;
END;
$$;

COMMENT ON FUNCTION public.get_arena_results(UUID) IS
  'Returns finalized arena results with ranking, user info, scores, prizes, redemption codes, and redemption status. '
  'Includes gym_breakdown JSONB: full per-gym breakdown for superadmin, privacy-respecting (own vs others) for gym owners. '
  'Gym name is resolved via arena_participants.gym_id (not arena_results which has no gym_id column).';

GRANT EXECUTE ON FUNCTION public.get_arena_results(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_arena_results(UUID) TO service_role;
