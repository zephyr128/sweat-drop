-- Migration: 20260425183000_arenas_visible_only_at_linked_gym.sql
-- Description: Make arenas visible only at gyms they are explicitly linked
--              to (arena_gyms). Adds optional p_gym_id parameter to
--              get_available_arenas so the mobile app can request the
--              arena list scoped to the active gym.
--
-- AGENT NOTE: [2026-04-25] - supabase-dba
--
-- ROOT CAUSE (user-reported):
--   Superadmin creates a 'local' arena and links it to gym A only. A user
--   with memberships at both gym A and gym B opens the home screen with
--   active gym = gym B. The arena shows up in gym B's arena tab and the
--   user can open the detail screen and see scoring, leaderboard, etc.
--
--   The current get_available_arenas(p_user_id) only checks "is the user a
--   member of any gym in arena_gyms". That is correct for membership
--   eligibility but not for the active-gym view: the home screen / arenas
--   tab is logically a per-gym surface, so arenas should be filtered to
--   the gym the user is currently looking at. The arena_scope ('local' /
--   'regional' / 'network') is enforced at admin time by populating
--   arena_gyms (regional/network arenas are linked to many gyms; local
--   arenas to a single gym), so a uniform "arena_gyms must include
--   p_gym_id" predicate is sufficient at the read path.
--
-- FIX:
--   Add p_gym_id UUID DEFAULT NULL to get_available_arenas. When the
--   parameter is non-NULL the visibility check is tightened to
--   "EXISTS arena_gyms WHERE gym_id = p_gym_id". When NULL the previous
--   semantics (any gym membership) are preserved for backwards
--   compatibility — no other caller of this RPC needs to change.
--
-- IMPACT ON FRONTEND:
--   - Mobile App: useAvailableArenas now passes the active gym id, so the
--     home screen / arenas tab / arena detail screen only see arenas
--     linked to the active gym. Companion mobile change in
--     apps/mobile-app/hooks/useAvailableArenas.ts.
--   - Admin Panel: no change.
--
-- BREAKING CHANGES:
--   None at the RPC level (parameter is optional, default NULL preserves
--   existing behavior). The mobile app changes its call sites in the
--   matching commit.

-- Drop both the previous 1-arg version and any existing 2-arg version
-- defensively so re-running on a partially patched DB is safe.
DROP FUNCTION IF EXISTS public.get_available_arenas(UUID);
DROP FUNCTION IF EXISTS public.get_available_arenas(UUID, UUID);

CREATE OR REPLACE FUNCTION public.get_available_arenas(
  p_user_id UUID,
  p_gym_id  UUID DEFAULT NULL
)
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
  leader_score NUMERIC,
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
    (
      SELECT MAX(ap6.current_score)
      FROM public.arena_participants ap6
      WHERE ap6.arena_id = sa.id
    ) AS leader_score,
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
      (sa.is_finalized = false AND sa.end_date >= CURRENT_DATE)
      OR
      (sa.is_finalized = true AND sa.end_date >= CURRENT_DATE - INTERVAL '30 days')
    )
    AND (
      -- Active-gym scoping: the arena is visible at this gym only if it is
      -- explicitly linked via arena_gyms. arena_scope ('local' / 'regional'
      -- / 'network') is materialized at admin time by populating arena_gyms
      -- with the right set of gyms, so a single predicate is enough.
      CASE
        WHEN p_gym_id IS NOT NULL THEN EXISTS (
          SELECT 1 FROM public.arena_gyms ag_scoped
          WHERE ag_scoped.arena_id = sa.id
            AND ag_scoped.gym_id   = p_gym_id
        )
        -- Backwards-compatible fallback: any user-membership eligibility.
        ELSE EXISTS (
          SELECT 1
          FROM public.arena_gyms ag_any
          JOIN public.gym_memberships gm ON gm.gym_id = ag_any.gym_id
          WHERE ag_any.arena_id = sa.id
            AND gm.user_id      = p_user_id
        )
      END
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

GRANT EXECUTE ON FUNCTION public.get_available_arenas(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION public.get_available_arenas(UUID, UUID) IS
  'Returns arenas visible to p_user_id. When p_gym_id is provided the list '
  'is scoped to arenas explicitly linked to that gym via arena_gyms — this '
  'is what the mobile home / arenas tab passes so a local arena at gym A '
  'never appears when the active gym is gym B. When p_gym_id is NULL the '
  'function falls back to the previous "any user-membership" semantics for '
  'backwards compatibility.';
