-- Migration: 20260304000008_verify_all_arena_functions.sql
-- Description: Verify all arena-related RPC functions exist and are properly granted
-- 
-- AGENT NOTE: [2026-03-04] - supabase-dba
-- Problem: PostgREST schema cache may not recognize functions
-- 
-- CHANGES:
-- - Verify opt_into_arena() exists
-- - Verify get_available_arenas() exists
-- - Verify finalize_arena() exists
-- - Ensure all have proper grants
-- - Force schema refresh by explicit GRANT statements

-- ============================================================
-- VERIFY AND REFRESH: opt_into_arena()
-- ============================================================

-- Explicit grant to force PostgREST cache refresh
GRANT EXECUTE ON FUNCTION public.opt_into_arena(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.opt_into_arena(UUID) TO anon;

-- ============================================================
-- VERIFY AND REFRESH: get_available_arenas()
-- ============================================================

-- Explicit grant to force PostgREST cache refresh
GRANT EXECUTE ON FUNCTION public.get_available_arenas(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_available_arenas(UUID) TO anon;

-- ============================================================
-- VERIFY AND REFRESH: finalize_arena()
-- ============================================================
-- Note: finalize_arena() is created in 20260303100003_sweat_arenas_system.sql
-- If it doesn't exist, it will be created there. This migration only grants permissions.

-- Check if function exists before granting
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'finalize_arena'
  ) THEN
    -- Explicit grant to force PostgREST cache refresh
    GRANT EXECUTE ON FUNCTION public.finalize_arena(UUID) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.finalize_arena(UUID) TO service_role;
    RAISE NOTICE 'finalize_arena() grants refreshed';
  ELSE
    RAISE NOTICE 'finalize_arena() function not found - will be created in 20260303100003 migration';
  END IF;
END $$;

-- ============================================================
-- VERIFY ALL FUNCTIONS EXIST
-- ============================================================

DO $$
DECLARE
  v_func_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_func_count
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.proname IN ('opt_into_arena', 'get_available_arenas');
  
  IF v_func_count < 2 THEN
    RAISE WARNING 'Not all core arena functions found. Expected 2, found %', v_func_count;
  ELSE
    RAISE NOTICE 'Core arena functions verified: opt_into_arena(), get_available_arenas()';
  END IF;
  
  -- Check finalize_arena separately (may not exist if migration not applied)
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'finalize_arena'
  ) THEN
    RAISE NOTICE 'finalize_arena() also verified';
  END IF;
END $$;

-- ============================================================
-- NOTE: PostgREST Schema Cache
-- ============================================================
-- PostgREST caches function signatures. After running this migration:
-- 1. Wait 1-2 minutes for cache to refresh automatically
-- 2. Or restart PostgREST service (if you have access)
-- 3. Or call the function directly via SQL to verify it works
--
-- To test:
-- SELECT * FROM public.opt_into_arena('arena-id-here'::UUID);
