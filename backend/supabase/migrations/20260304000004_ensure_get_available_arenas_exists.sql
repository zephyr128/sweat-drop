-- Migration: 20260304000004_ensure_get_available_arenas_exists.sql
-- Description: Ensures get_available_arenas() RPC function exists
-- 
-- AGENT NOTE: [2026-03-04] - supabase-dba
-- Problem: get_available_arenas() function may not exist in database
-- 
-- CHANGES:
-- - Recreate get_available_arenas() RPC if it doesn't exist
-- - Ensure proper grants are set

-- ============================================================
-- get_available_arenas() RPC
-- ============================================================

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
  prizes JSONB
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sa.id,
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
      SELECT ROW_NUMBER() OVER (ORDER BY ap3.current_score DESC)
      FROM public.arena_participants ap3
      WHERE ap3.arena_id = sa.id
        AND ap3.current_score > (
          SELECT COALESCE(current_score, 0)
          FROM public.arena_participants
          WHERE arena_id = sa.id AND user_id = p_user_id
        )
    )::BIGINT AS user_rank,
    (
      SELECT current_score
      FROM public.arena_participants
      WHERE arena_id = sa.id AND user_id = p_user_id
    ) AS user_score,
    sa.prizes
  FROM public.sweat_arenas sa
  LEFT JOIN public.arena_participants ap ON ap.arena_id = sa.id
  WHERE sa.is_active = true
    AND sa.is_finalized = false
    AND sa.start_date <= CURRENT_DATE
    AND sa.end_date >= CURRENT_DATE
    AND (
      sa.arena_scope = 'network' OR
      EXISTS (
        SELECT 1 FROM public.arena_gyms ag
        JOIN public.gym_memberships gm ON gm.gym_id = ag.gym_id
        WHERE ag.arena_id = sa.id
          AND gm.user_id = p_user_id
      )
    )
  GROUP BY sa.id, sa.name, sa.description, sa.sponsor_name, sa.sponsor_logo,
           sa.scoring_model, sa.start_date, sa.end_date, sa.prizes
  ORDER BY sa.start_date DESC;
END;
$$;

COMMENT ON FUNCTION public.get_available_arenas(UUID) IS
  'Returns arenas available to a user (active + user''s gyms participating). '
  'Includes user''s opt-in status, participant count, rank, score, and prizes. '
  'Uses SECURITY DEFINER to bypass RLS.';

GRANT EXECUTE ON FUNCTION public.get_available_arenas(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_available_arenas(UUID) TO anon;
