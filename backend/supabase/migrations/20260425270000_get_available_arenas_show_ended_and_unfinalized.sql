-- Migration: 20260425270000_get_available_arenas_show_ended_and_unfinalized.sql
-- Description: Stop hiding ended-but-not-yet-finalized arenas, and widen
--              the historical-results window so what gym owners see in the
--              admin panel matches what users see in the mobile app.
--
-- AGENT NOTE: [2026-04-25] - supabase-dba
--
-- ROOT CAUSE (user-reported, prod):
--   "U adminu kao vlasnik teretane jasno vidim da je jedna arena live i jedna
--    zavrsena za moju gym. Kada odem u app — nema nijedne arene. Nema
--    aktivnih, nema zavrsenih. Dodajem arene, ali se nijedna vise ne vidi
--    u appu."
--   ("In admin I clearly see one live and one finished arena for my gym.
--    In the app, no arenas — neither active nor finished.")
--
--   The previous get_available_arenas WHERE clause had two compounding bugs
--   that filtered arenas the admin still surfaces:
--
--     1. "Ended-but-not-finalized" trap. Arenas whose end_date < today but
--        whose is_finalized is still false (because finalize_arena() runs
--        only when superadmin clicks the button or a future cron fires)
--        fell through both branches:
--           (is_finalized = false AND end_date >= today)  ← false
--           (is_finalized = true  AND end_date >= today - 30d) ← false
--        Result: a brand-new arena that ended yesterday silently disappears
--        from every mobile surface (home carousel, arenas tab, /arena/[id])
--        until somebody manually finalizes it.
--
--     2. 30-day finalized window. Even after finalize_arena() runs, the
--        arena disappears from mobile after 30 days, while the admin keeps
--        showing it indefinitely. For a gym whose only arenas finished >30
--        days ago this means the mobile shows ZERO arenas while the admin
--        clearly lists them — exactly the user-visible discrepancy.
--
-- FIX:
--   - Drop the conditional date predicate.
--   - Keep is_active = true (admin can intentionally deactivate).
--   - Apply a single, generous look-back window: end_date >= today - 90d.
--     This still bounds the result set on long-running gyms (no unbounded
--     scan) while letting recently-ended arenas — finalized or not — appear
--     in the mobile list with the correct arena_status (the CASE below
--     already maps end_date < today to 'ended', regardless of is_finalized).
--   - Upcoming arenas (start_date > today) keep showing because end_date
--     for an upcoming arena is in the future and trivially > today - 90d.
--
-- WHY 90 DAYS:
--   Three months of history is enough for users to navigate from a "results
--   pending" push, see their final rank, and claim a prize without the
--   arena vanishing on them. Older finalized arenas are still discoverable
--   via the admin / sponsorship reports — the mobile carousel doesn't need
--   to be a permanent archive.
--
-- IMPACT ON FRONTEND:
--   - Mobile App: arena tab and home carousel now show every linked arena
--     ended within 90 days plus all currently-active and upcoming arenas.
--     The arena_status column already returns 'ended' for end_date < today
--     so the existing UI ("Ended" pill, finalized banner) keeps working.
--   - Admin Panel: no change.
--
-- BREAKING CHANGES:
--   None. The function signature and return columns are unchanged. Older
--   mobile builds that still call get_available_arenas(p_user_id) (without
--   p_gym_id) keep working — the parameter remains DEFAULT NULL and the
--   legacy "any gym membership" fallback is preserved.

-- Drop both signatures defensively before re-creating, so re-running on a
-- partially-patched DB (e.g. dev / staging that already had the prior
-- 20260425183000 version) is safe.
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
    -- Status uses dates first so an ended-but-not-finalized arena reads as
    -- 'ended' rather than 'active'. The mobile UI already renders this.
    CASE
      WHEN sa.start_date > CURRENT_DATE THEN 'upcoming'
      WHEN sa.end_date   < CURRENT_DATE THEN 'ended'
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
    -- Single, generous look-back: keep recently-ended arenas (finalized or
    -- not) discoverable in the mobile UI for a 90-day tail. Upcoming and
    -- currently-active arenas trivially satisfy this because end_date is in
    -- the future.
    AND sa.end_date >= CURRENT_DATE - INTERVAL '90 days'
    AND (
      -- Active-gym scoping: when p_gym_id is provided the arena is visible
      -- at this gym only if it is explicitly linked via arena_gyms.
      -- arena_scope ('local' / 'regional' / 'network') is materialized at
      -- admin time by populating arena_gyms with the right set of gyms,
      -- so a single predicate is enough.
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
    -- Show upcoming first, then active, then ended/finalized. Within each
    -- bucket, sort by start_date descending for "most recent first".
    CASE
      WHEN sa.start_date > CURRENT_DATE THEN 0
      WHEN sa.end_date   >= CURRENT_DATE THEN 1
      ELSE 2
    END,
    sa.start_date DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_available_arenas(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION public.get_available_arenas(UUID, UUID) IS
  'Returns arenas visible to p_user_id. When p_gym_id is provided the list '
  'is scoped to arenas explicitly linked to that gym via arena_gyms. The '
  'arena set includes upcoming, currently-active, and recently-ended '
  '(within 90 days) arenas regardless of is_finalized state — admin and '
  'mobile must agree on what is visible. is_active = true is always '
  'required (admin can intentionally hide an arena by deactivating it).';
