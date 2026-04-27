-- Migration: 20260427121500_drop_get_public_gyms_for_mobile_2arg_overload.sql
-- Description: Drop the legacy 2-argument overload of get_public_gyms_for_mobile
--              left over from 20260328000002. The 1-argument version created by
--              20260427120000_gyms_is_demo_gym_and_rpc_demo_filter.sql became an
--              overload (different signature → CREATE OR REPLACE did not replace),
--              causing PostgreSQL ambiguity when callers invoke `rpc(name)` with no
--              args and TS overload pollution in the regenerated database.types.ts.
--
-- AGENT NOTE: [2026-04-27] - supabase-dba (cleanup follow-up)
--
-- CHANGES:
-- - Drops public.get_public_gyms_for_mobile(boolean, boolean) if present.
--   The remaining single signature is public.get_public_gyms_for_mobile(boolean).
--
-- IMPACT ON FRONTEND:
-- - Mobile App: removes ambiguity for `supabase.rpc('get_public_gyms_for_mobile')`
--               called with no args (`gyms.tsx`, `home.tsx`, `(onboarding)/home-gym.tsx`).
-- - Admin Panel: no callers touched.
--
-- BREAKING CHANGES:
-- - Any caller passing `p_listed_only` to this RPC will now fail. Audit confirms
--   no caller in `apps/mobile-app` or `apps/admin-panel` passes p_listed_only;
--   the parameter only ever existed in the 2026-03-28 transitional signature.
--
-- IDEMPOTENCY: IF EXISTS guards make this safe to run repeatedly.

SET search_path TO public;

DROP FUNCTION IF EXISTS public.get_public_gyms_for_mobile(boolean, boolean);
