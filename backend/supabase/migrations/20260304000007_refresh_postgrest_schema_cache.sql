-- Migration: 20260304000007_refresh_postgrest_schema_cache.sql
-- Description: Force PostgREST to refresh schema cache for RPC functions
-- 
-- AGENT NOTE: [2026-03-04] - supabase-dba
-- Problem: PostgREST schema cache not recognizing opt_into_arena() function
-- 
-- SOLUTION:
-- PostgREST caches function signatures. To force refresh, we:
-- 1. Drop and recreate the function (forces cache invalidation)
-- 2. Ensure grants are set correctly
-- 3. Use NOTIFY to signal schema change (if supported)
-- 
-- NOTE: On Supabase hosted, schema cache refreshes automatically after migrations.
-- If issue persists, may need to restart PostgREST or wait for cache TTL.

-- ============================================================
-- FORCE SCHEMA CACHE REFRESH: opt_into_arena()
-- ============================================================

-- Drop function to force cache invalidation
DROP FUNCTION IF EXISTS public.opt_into_arena(UUID);

-- Recreate function
CREATE OR REPLACE FUNCTION public.opt_into_arena(p_arena_id UUID)
RETURNS TABLE(success BOOLEAN, error_message TEXT)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_arena RECORD;
  v_user_gym_id UUID;
BEGIN
  -- Get arena details
  SELECT * INTO v_arena
  FROM public.sweat_arenas
  WHERE id = p_arena_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Arena not found'::TEXT;
    RETURN;
  END IF;

  -- Check if arena is active
  IF NOT v_arena.is_active THEN
    RETURN QUERY SELECT false, 'Arena is not active'::TEXT;
    RETURN;
  END IF;

  -- Check if arena has ended
  IF v_arena.end_date < CURRENT_DATE THEN
    RETURN QUERY SELECT false, 'Arena has ended'::TEXT;
    RETURN;
  END IF;

  -- Check if user is already opted in
  IF EXISTS (
    SELECT 1 FROM public.arena_participants
    WHERE arena_id = p_arena_id AND user_id = auth.uid()
  ) THEN
    RETURN QUERY SELECT false, 'Already opted into this arena'::TEXT;
    RETURN;
  END IF;

  -- Get user's gym_id
  -- For network arenas: user can opt-in from any gym
  -- For local/regional arenas: user must be member of a participating gym
  IF v_arena.arena_scope = 'network' THEN
    -- Network arenas: get any gym the user is a member of
    SELECT gym_id INTO v_user_gym_id
    FROM public.gym_memberships
    WHERE user_id = auth.uid()
    LIMIT 1;
  ELSE
    -- Local/Regional arenas: must be member of a gym participating in this arena
    SELECT ag.gym_id INTO v_user_gym_id
    FROM public.arena_gyms ag
    JOIN public.gym_memberships gm ON gm.gym_id = ag.gym_id
    WHERE ag.arena_id = p_arena_id
      AND gm.user_id = auth.uid()
    LIMIT 1;
  END IF;

  IF v_user_gym_id IS NULL THEN
    IF v_arena.arena_scope = 'network' THEN
      RETURN QUERY SELECT false, 'You must be a member of a gym to participate'::TEXT;
    ELSE
      RETURN QUERY SELECT false, 'Your gym is not participating in this arena'::TEXT;
    END IF;
    RETURN;
  END IF;

  -- Insert opt-in (use ON CONFLICT to handle race conditions)
  INSERT INTO public.arena_participants (arena_id, user_id, gym_id, current_score)
  VALUES (p_arena_id, auth.uid(), v_user_gym_id, 0)
  ON CONFLICT (arena_id, user_id) DO NOTHING;

  -- Check if user is now opted in (INSERT might have been skipped due to conflict)
  IF EXISTS (
    SELECT 1 FROM public.arena_participants
    WHERE arena_id = p_arena_id AND user_id = auth.uid()
  ) THEN
    RETURN QUERY SELECT true, NULL::TEXT;
  ELSE
    RETURN QUERY SELECT false, 'Failed to opt into arena'::TEXT;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.opt_into_arena(UUID) IS
  'Opts a user into an arena. Validates arena is active, user is member of participating gym (or any gym for network arenas), and not already opted in. '
  'Uses SECURITY DEFINER to bypass RLS.';

-- Grant execute permissions (explicit grants force cache refresh)
GRANT EXECUTE ON FUNCTION public.opt_into_arena(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.opt_into_arena(UUID) TO anon;

-- Verify function exists
DO $$
DECLARE
  v_func_oid OID;
BEGIN
  SELECT p.oid INTO v_func_oid
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.proname = 'opt_into_arena'
    AND pg_get_function_arguments(p.oid) = 'p_arena_id uuid';
  
  IF v_func_oid IS NULL THEN
    RAISE EXCEPTION 'opt_into_arena() function was not created successfully';
  END IF;
  
  RAISE NOTICE 'opt_into_arena() function created successfully (OID: %)', v_func_oid;
END $$;
