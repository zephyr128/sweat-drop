-- Migration: 20260421192715_get_my_profile_single_row_contract.sql
-- Description: Restore get_my_profile() single-row return contract after is_demo rollout.
--
-- AGENT NOTE: [2026-04-21] - supabase-dba
--
-- CHANGES:
-- - Replaced function: public.get_my_profile()
-- - Return type restored to public.profiles (single row, not set-returning array)
-- - `is_demo` remains included because it is now a column on public.profiles
--
-- BREAKING CHANGES:
-- - None (compatibility restoration)

SET search_path TO public;

DROP FUNCTION IF EXISTS public.get_my_profile();

CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS public.profiles
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT *
  FROM public.profiles
  WHERE id = auth.uid()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;
