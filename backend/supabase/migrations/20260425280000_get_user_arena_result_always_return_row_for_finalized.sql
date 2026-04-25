-- Migration: 20260425280000_get_user_arena_result_always_return_row_for_finalized.sql
-- Description: Make get_user_arena_result return one row for every finalized
--              arena, even when the calling user did not participate or when
--              nobody participated at all. This unblocks two stuck UI states:
--
--                * Finalized arena, the current user did not opt in       →
--                  used to return zero rows so the mobile fell through to
--                  the "Rezultati još nisu dostupni" placeholder. Should
--                  show the leaderboard + a "you did not participate" panel.
--
--                * Finalized arena, no participants whatsoever            →
--                  finalize_arena() runs the cron, flips is_finalized=true,
--                  but writes zero rows into arena_results because the
--                  participant LOOP filters `current_score > 0`. Mobile
--                  again fell through to the placeholder. Should show a
--                  clear "no participants" copy.
--
-- AGENT NOTE: [2026-04-25] - supabase-dba
--
-- ROOT CAUSE:
--   Prior version of get_user_arena_result was anchored on `arena_results`:
--     FROM public.arena_results ar
--     WHERE ar.arena_id = p_arena_id
--       AND ar.user_id  = p_user_id;
--   With no row in arena_results for (arena, user), the entire result set
--   was empty. The top_participants subquery was also gated by row
--   existence, so the leaderboard never reached the client even when other
--   users had results. The mobile arena/[id] screen relies on a non-null
--   arenaResult object to switch out of its "results pending" placeholder,
--   so finalized arenas with no current-user row looked indistinguishable
--   from arenas that simply hadn't been finalized yet.
--
-- FIX:
--   Anchor on `sweat_arenas` so the row is always produced for any
--   finalized arena. LEFT JOIN to arena_results / redemptions; user-level
--   fields (final_rank, final_score, prize_description, redemption_*) are
--   NULL when the user did not participate. The top_participants /
--   total_participants subqueries are computed on the always-present
--   arena row, so the leaderboard reaches the client whether or not the
--   caller has a personal result.
--
-- IMPACT ON FRONTEND:
--   Mobile arena/[id]/index.tsx must distinguish four ended states:
--     1. Ended, NOT finalized                 → "results being calculated"
--        (RPC returns 0 rows by design — finalize_arena hasn't run yet)
--     2. Finalized, total_participants = 0    → "no participants"
--     3. Finalized, user didn't participate   → leaderboard + "you didn't join"
--     4. Finalized, user has a result         → full personal result panel
--   Existing callers that only consume rows when arenaResult is non-null
--   keep working; they will now receive a row in case (3) and (4) and use
--   final_rank IS NULL / total_participants = 0 to branch.
--
-- BREAKING CHANGES:
--   None. Function signature and column list unchanged. Existing callers
--   that handle nullable final_rank / final_score / prize_description
--   keep working as-is.

DROP FUNCTION IF EXISTS public.get_user_arena_result(UUID, UUID);

CREATE OR REPLACE FUNCTION public.get_user_arena_result(
  p_arena_id UUID,
  p_user_id  UUID
)
RETURNS TABLE(
  final_rank          INTEGER,
  final_score         NUMERIC,
  total_participants  BIGINT,
  prize_description   TEXT,
  redemption_code     TEXT,
  redemption_status   TEXT,
  top_participants    JSONB
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ar.final_rank::INTEGER,
    ar.final_score,
    -- Always defined: total participants count from arena_results.
    COALESCE((
      SELECT COUNT(*)::BIGINT
      FROM public.arena_results ar2
      WHERE ar2.arena_id = p_arena_id
    ), 0) AS total_participants,
    ar.prize_description::TEXT,
    r.redemption_code::TEXT,
    r.status::TEXT AS redemption_status,
    -- Top 10 leaderboard: always computed (independent of user's row).
    (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'rank',            sub.final_rank,
          'username',        sub.username,
          'avatar_url',      sub.avatar_url,
          'score',           sub.final_score,
          'gym_name',        sub.gym_name,
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
        LEFT JOIN public.arena_participants ap
               ON ap.arena_id = ar3.arena_id AND ap.user_id = ar3.user_id
        LEFT JOIN public.gyms g ON g.id = ap.gym_id
        WHERE ar3.arena_id = p_arena_id
        ORDER BY ar3.final_rank ASC
        LIMIT 10
      ) sub
    ) AS top_participants
  -- Anchor on sweat_arenas so the row is produced even when arena_results
  -- has no entry for the caller. Restricted to finalized arenas — the
  -- mobile UI uses absence-of-row as the signal for "ended but not yet
  -- finalized" (= "results being calculated").
  FROM public.sweat_arenas sa
  LEFT JOIN public.arena_results ar
         ON ar.arena_id = sa.id AND ar.user_id = p_user_id
  LEFT JOIN public.redemptions r
         ON r.id = ar.redemption_id
  WHERE sa.id          = p_arena_id
    AND sa.is_finalized = true;
END;
$$;

COMMENT ON FUNCTION public.get_user_arena_result(UUID, UUID) IS
  'Returns one row for every finalized arena, regardless of whether the '
  'caller participated. User-level fields (final_rank, final_score, '
  'prize_description, redemption_code, redemption_status) are NULL when '
  'the caller did not participate. total_participants and top_participants '
  'are always populated from the arena''s overall results — total=0 and '
  'top_participants=[] is the legitimate "finalized with no participants" '
  'shape. When called for a non-finalized arena (still pending the '
  'finalize_arena() cron), the function intentionally returns zero rows '
  'so the mobile UI can render the "results being calculated" state.';

GRANT EXECUTE ON FUNCTION public.get_user_arena_result(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_arena_result(UUID, UUID) TO service_role;
