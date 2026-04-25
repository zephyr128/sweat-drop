-- Migration: 20260425230000_get_user_best_streak.sql
-- Description: Add get_user_best_streak(user_id) RPC for the member profile
--              stats card so it can show the user's all-time longest streak
--              instead of the current one.
--
-- AGENT NOTE: [2026-04-25] - supabase-dba
--
-- CONTEXT:
-- The mobile member profile screen (app/user/[id].tsx) used to display the
-- current `profiles.streak_days` value, which resets to 1 (or 0) the moment
-- a day is missed. From the user's perspective the "Streak" stat on a
-- profile is more meaningful as the *all-time best* — same semantics as
-- "Lifetime drops". We compute it from history (sessions + gym_checkins)
-- on the fly using the same gap-based grouping the streak recalculation
-- migration (20260312000005) uses, so it is guaranteed to match the
-- accounting that issues streak badges.
--
-- Rationale for an RPC instead of a stored column:
-- - Avoids touching award_drops() / perform_checkin() (critical paths)
-- - Avoids a backfill + maintenance trigger
-- - Profile views are not on the workout hot path; a single CTE per view
--   is fine
--
-- IMPACT ON FRONTEND:
-- - Mobile: app/user/[id].tsx calls this RPC and renders the result in
--   the streak stat card (label still "Streak" — semantics shift to best).
--
-- BREAKING CHANGES: None — additive RPC.
-- IDEMPOTENT: CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.get_user_best_streak(p_user_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH visit_dates AS (
    SELECT DATE(started_at AT TIME ZONE 'Europe/Belgrade') AS visit_date
    FROM public.sessions
    WHERE user_id = p_user_id
      AND is_active = false
      AND drops_earned > 0
    UNION
    SELECT DATE(checked_in_at AT TIME ZONE 'Europe/Belgrade') AS visit_date
    FROM public.gym_checkins
    WHERE user_id = p_user_id
  ),
  unique_visits AS (
    SELECT DISTINCT visit_date FROM visit_dates
  ),
  numbered AS (
    -- Classic islands-and-gaps trick: dates that are part of the same
    -- consecutive run share `visit_date - row_number()`.
    SELECT
      visit_date,
      visit_date - (ROW_NUMBER() OVER (ORDER BY visit_date))::INT AS grp
    FROM unique_visits
  ),
  streak_lengths AS (
    SELECT COUNT(*)::INT AS streak_len
    FROM numbered
    GROUP BY grp
  )
  SELECT COALESCE(MAX(streak_len), 0) FROM streak_lengths;
$$;

COMMENT ON FUNCTION public.get_user_best_streak(UUID) IS
  'Returns the longest historical streak (consecutive Europe/Belgrade days '
  'with at least one session+drops or check-in) for a user. Computed from '
  'sessions + gym_checkins so it always matches what the streak badge '
  'awards consider. Used by the member profile screen.';

GRANT EXECUTE ON FUNCTION public.get_user_best_streak(UUID) TO authenticated;
