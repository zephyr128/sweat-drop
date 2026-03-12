-- Migration: 20260306000004_fix_global_arena_visibility.sql
-- Description: Fix get_available_arenas() to show global arenas only to users from gyms that accepted invitations
-- 
-- AGENT NOTE: [2026-03-06] - supabase-dba
-- Problem: Global arenas (arena_scope = 'network') are visible to ALL users, even if their gym hasn't accepted the invitation.
-- Solution: Change get_available_arenas() to check arena_gyms participation even for network arenas.
--           Global arenas should only be visible to users whose gyms have accepted invitations (are in arena_gyms).
-- 
-- CHANGES:
-- - Update get_available_arenas() WHERE clause to require arena_gyms participation for ALL arena scopes
-- - Remove the special case for arena_scope = 'network' that bypasses arena_gyms check

-- ============================================================================
-- UPDATE FUNCTION: get_available_arenas() — Require arena_gyms participation
-- ============================================================================

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
  arena_status TEXT
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
    -- NEW fields
    COALESCE(sa.opt_in_type, 'free')::TEXT AS opt_in_type,
    COALESCE(sa.opt_in_value, 0)::INTEGER AS opt_in_value,
    sa.card_color::TEXT,
    sa.card_text_color::TEXT,
    sa.card_gradient_end::TEXT,
    CASE
      WHEN sa.start_date > CURRENT_DATE THEN 'upcoming'
      WHEN sa.end_date < CURRENT_DATE THEN 'ended'
      ELSE 'active'
    END::TEXT AS arena_status
  FROM public.sweat_arenas sa
  LEFT JOIN public.arena_participants ap ON ap.arena_id = sa.id
  WHERE sa.is_active = true
    AND sa.is_finalized = false
    AND sa.end_date >= CURRENT_DATE  -- Include upcoming AND active (but not ended)
    -- FIXED: Require arena_gyms participation for ALL arena scopes (including network)
    -- Global arenas are only visible to users whose gyms have accepted invitations
    AND EXISTS (
      SELECT 1 FROM public.arena_gyms ag
      JOIN public.gym_memberships gm ON gm.gym_id = ag.gym_id
      WHERE ag.arena_id = sa.id
        AND gm.user_id = p_user_id
    )
  GROUP BY sa.id, sa.name, sa.description, sa.sponsor_name, sa.sponsor_logo,
           sa.scoring_model, sa.start_date, sa.end_date, sa.prizes,
           sa.opt_in_type, sa.opt_in_value, sa.card_color, sa.card_text_color, sa.card_gradient_end
  ORDER BY
    -- Upcoming first, then active, then by start date
    CASE WHEN sa.start_date > CURRENT_DATE THEN 0 ELSE 1 END,
    sa.start_date ASC;
END;
$$;

COMMENT ON FUNCTION public.get_available_arenas(UUID) IS
  'Returns arenas available to a user. Only shows arenas where user''s gym has accepted invitation (is in arena_gyms). '
  'This applies to ALL arena scopes (local, regional, network). Global arenas are not automatically visible to all users.';

GRANT EXECUTE ON FUNCTION public.get_available_arenas(UUID) TO authenticated;
