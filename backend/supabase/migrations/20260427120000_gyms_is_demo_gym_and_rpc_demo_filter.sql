-- Migration: 20260427120000_gyms_is_demo_gym_and_rpc_demo_filter.sql
-- Description: Add gyms.is_demo_gym flag, superadmin-only guard trigger, and patch
--              get_public_gyms_for_mobile() to hide demo gyms from non-demo users.
--
-- AGENT NOTE: [2026-04-27] - supabase-dba
--
-- CHANGES:
-- - Added column:    public.gyms.is_demo_gym (BOOLEAN NOT NULL DEFAULT false)
-- - Added index:     idx_gyms_is_demo_gym (partial, WHERE is_demo_gym = true)
-- - Added function:  public.enforce_gyms_is_demo_gym_superadmin_only()
-- - Added trigger:   trg_gyms_guard_is_demo_gym_update on public.gyms
-- - Replaced RPC:    public.get_public_gyms_for_mobile(BOOLEAN) — now RETURNS SETOF public.gyms
--                    with demo-aware filter (is_demo_gym hidden from non-demo callers)
-- - Data UPDATE:     SweatDrop test gym → is_demo_gym=true, is_mobile_listed=false
--
-- IMPACT ON FRONTEND:
-- - Mobile App: gyms.tsx already uses this RPC — no change needed.
--               mobile-coder must switch home.tsx + (onboarding)/home-gym.tsx
--               away from direct table queries to this RPC (Step 2 of plan).
-- - Admin Panel: Out of scope; admins must continue to see all gyms.
--
-- BREAKING CHANGES:
-- - None. Return type widens from a hand-listed subset to SETOF public.gyms; all
--   previously returned columns are still present. Callers that destructure by name
--   are unaffected.
--
-- NEXT STEPS:
-- 1. supabase gen types typescript --linked > backend/types/database.types.ts
-- 2. Update MIGRATION_NOTES.md with [2026-04-27] entry
-- 3. Update CHANGELOG.md under [Unreleased] / Added
-- 4. mobile-coder: Step 2 of plan (home.tsx + onboarding/home-gym.tsx)
--
-- KNOWN ISSUE / FOLLOW-UP:
-- - 20260328000002 created get_public_gyms_for_mobile(BOOLEAN, BOOLEAN). The
--   CREATE OR REPLACE below uses a 1-arg signature, so PostgreSQL keeps the old
--   overload alongside the new one (different signatures). The 2-arg overload
--   is dropped explicitly by the cleanup migration:
--   20260427121500_drop_get_public_gyms_for_mobile_2arg_overload.sql
--   Apply both migrations to retain only the 1-arg version.

SET search_path TO public;

-- =============================================================================
-- 1. Add gyms.is_demo_gym column
-- =============================================================================

ALTER TABLE public.gyms
  ADD COLUMN IF NOT EXISTS is_demo_gym BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.gyms.is_demo_gym IS
  'When true, this gym is visible only to profiles.is_demo = true users '
  '(Apple reviewer, internal QA, sales demos). Must never be true for real partner gyms.';

-- Partial index: only demo gyms incur index overhead; the common case (false) is a heap scan.
CREATE INDEX IF NOT EXISTS idx_gyms_is_demo_gym
  ON public.gyms(is_demo_gym)
  WHERE is_demo_gym = true;

-- =============================================================================
-- 2. Superadmin-only mutation guard (mirrors profiles.is_demo pattern)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.enforce_gyms_is_demo_gym_superadmin_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Service-role / postgres contexts may not carry auth.uid(); allow those flows.
  IF NEW.is_demo_gym IS DISTINCT FROM OLD.is_demo_gym
     AND auth.uid() IS NOT NULL
     AND NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'Only superadmin can modify gyms.is_demo_gym';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gyms_guard_is_demo_gym_update ON public.gyms;

CREATE TRIGGER trg_gyms_guard_is_demo_gym_update
  BEFORE UPDATE ON public.gyms
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_gyms_is_demo_gym_superadmin_only();

-- =============================================================================
-- 3. Patch get_public_gyms_for_mobile() — demo-aware, returns full gyms row
--
--    Signature preserved: p_pilot_only BOOLEAN DEFAULT false
--    Return type changed: RETURNS TABLE(...) → RETURNS SETOF public.gyms
--    so all columns (including is_demo_gym, is_mobile_listed) flow through
--    without a schema-lock on the hand-listed subset.
--
--    Demo filter logic:
--      - Non-demo / anonymous callers: is_demo_gym = false rows only.
--      - Demo callers (profiles.is_demo = true): all active gyms including demo gyms.
--    Anonymous callers (auth.uid() IS NULL) always fall into the non-demo branch
--    because the EXISTS sub-select short-circuits to false — desired behavior.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_public_gyms_for_mobile(
  p_pilot_only BOOLEAN DEFAULT false
)
RETURNS SETOF public.gyms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT g.*
  FROM public.gyms g
  WHERE COALESCE(g.is_active, true) = true
    AND (NOT p_pilot_only OR g.is_pilot_enabled = true)
    AND (
      COALESCE(g.is_demo_gym, false) = false
      OR EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND COALESCE(p.is_demo, false) = true
      )
    )
  ORDER BY g.name ASC;
END;
$$;

COMMENT ON FUNCTION public.get_public_gyms_for_mobile(BOOLEAN) IS
  'Returns active gyms visible to the caller. Demo gyms (is_demo_gym = true) are '
  'returned only to demo users (profiles.is_demo = true). '
  'Single source of truth for mobile gym discovery. '
  'p_pilot_only=true further restricts to is_pilot_enabled=true rows; '
  'demo filter is applied independently of the pilot filter. '
  'Anonymous callers always receive the non-demo subset (auth.uid() IS NULL).';

-- Re-grant to match prior version (both anon and authenticated had EXECUTE).
-- Anon callers will never see demo gyms because auth.uid() IS NULL makes
-- the EXISTS subquery return false.
GRANT EXECUTE ON FUNCTION public.get_public_gyms_for_mobile(BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_gyms_for_mobile(BOOLEAN) TO anon;

-- =============================================================================
-- 4. Seed the existing SweatDrop test gym
--
--    Defense-in-depth: also flip is_mobile_listed=false so the direct table-
--    fallback path in gyms.tsx cannot leak this row if the RPC ever fails.
--
--    The WHERE clause is idempotent: if this UPDATE already ran, COALESCE check
--    prevents a no-op re-execution from silently flipping the flag back.
--    If multiple rows match the ILIKE pattern, narrow by adding AND id = '<uuid>'
--    before applying. See MIGRATION_NOTES.md [2026-04-27] for the resolved id.
-- =============================================================================

UPDATE public.gyms
SET is_demo_gym       = true,
    is_mobile_listed  = false,
    updated_at        = NOW()
WHERE name ILIKE 'sweatdrop gym%'
  AND COALESCE(is_demo_gym, false) = false;
