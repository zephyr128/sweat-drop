-- Migration: 20260425250000_relax_get_user_drop_limits_membership_requirement.sql
-- Description: Allow any authenticated user to read a gym's drop limits.
--
-- AGENT NOTE: [2026-04-25] - supabase-dba
--
-- ROOT CAUSE (user-reported):
--   "I updated tokenomics for two gyms (320/2200 and 340/2000), but the mobile
--    app always shows daily 300 / weekly 1.5k regardless of which gym I switch
--    to."
--
--   The previous version of get_user_drop_limits (20260325000011) required
--   the caller to either:
--     a) have a gym_memberships row for p_gym_id, OR
--     b) be a superadmin / owner of that gym / admin of that gym.
--
--   But gym_memberships is created LAZILY by award_drops() on the first
--   successful session at a gym (see 20260425182000_award_drops_per_gym_caps,
--   lines 535-547). So a user previewing a gym they haven't trained at yet
--   has no row and the RPC raises 'Unauthorized'. The mobile hook
--   useDropLimitStatus catches the error implicitly (`supabase.rpc` returns
--   { data: null, error } rather than throwing), silently falls back to its
--   hardcoded defaults (max_drops_per_day 300, max_drops_per_week 1500),
--   and the user sees those numbers in every gym.
--
-- WHY IT'S SAFE TO LOOSEN:
--   These four columns are not sensitive. They're public "rules of the road"
--   that the user MUST see in order to plan their workout — same class of
--   data as gym opening hours or membership prices, both of which are
--   served to anyone who can open the app. Mobile flows that legitimately
--   need to read them BEFORE a user has any earned-drops history at the
--   target gym include:
--     - Home screen activity rings (when previewing a gym you haven't
--       trained at, e.g. exploring a partner gym before joining).
--     - Scanner pre-flight (validating the cap before scanning a QR).
--     - gym-welcome / discovery cards.
--   None of these reveal anything you couldn't see by looking at the
--   gym's flyer.
--
--   We DO keep auth.uid() IS NOT NULL — anonymous calls remain blocked,
--   matching the GRANT TO authenticated below.
--
-- FIX:
--   Drop the gym_memberships+role gate. Any authenticated caller may read
--   the limits for any gym. The query still falls back to the gym_id IS
--   NULL global default row when the gym has no row of its own.
--
-- IMPACT:
--   - Mobile App: useDropLimitStatus stops silently using defaults — the
--     home screen daily-goal ring and the wallet quota gauge now reflect
--     the actual per-gym tokenomics_config, and switching gyms updates
--     them as expected.
--   - Admin Panel: no change.

CREATE OR REPLACE FUNCTION public.get_user_drop_limits(
  p_gym_id UUID
)
RETURNS TABLE(
  max_drops_per_session INTEGER,
  max_rewarded_sessions_per_day INTEGER,
  max_drops_per_day INTEGER,
  max_drops_per_week INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT
    GREATEST(COALESCE(tc.max_drops_per_session, 120), 1)::INTEGER,
    GREATEST(COALESCE(tc.max_rewarded_sessions_per_day, 4), 1)::INTEGER,
    GREATEST(
      COALESCE(tc.max_drops_per_day, 300),
      GREATEST(COALESCE(tc.max_drops_per_session, 120), 1)
    )::INTEGER,
    GREATEST(
      COALESCE(tc.max_drops_per_week, 1500),
      GREATEST(
        COALESCE(tc.max_drops_per_day, 300),
        GREATEST(COALESCE(tc.max_drops_per_session, 120), 1)
      )
    )::INTEGER
  FROM public.tokenomics_config tc
  WHERE (tc.gym_id = p_gym_id OR tc.gym_id IS NULL)
  ORDER BY CASE WHEN tc.gym_id = p_gym_id THEN 0 ELSE 1 END
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_drop_limits(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_user_drop_limits(UUID) IS
  'Reads display-only drop limits (per-session / per-day / per-week / '
  'rewarded-sessions-per-day) for the given gym from tokenomics_config. '
  'Available to any authenticated caller — these are non-sensitive '
  '"rules of the road" required by the home dashboard, scanner, and '
  'gym-preview flows even before the user has any earned-drops history '
  'at the target gym. Falls back to the global default row '
  '(gym_id IS NULL) when the gym has no row of its own.';
