-- Migration: 20260304000003_fix_arena_rls_policies.sql
-- Description: Fix RLS policies for sweat_arenas to allow users to see all active arenas
-- 
-- AGENT NOTE: [2026-03-04] - supabase-dba
-- Problem: Users cannot see arenas in mobile app due to restrictive RLS policies
-- 
-- CHANGES:
-- - Make sweat_arenas SELECT policy less restrictive (allow all authenticated users to see active arenas)
-- - Keep INSERT/UPDATE/DELETE policies restrictive (only superadmin/gym_owner)
-- - Ensure get_available_arenas() RPC can access all arenas (SECURITY DEFINER already handles this)
-- 
-- IMPACT:
-- - Mobile app users can now see all active arenas
-- - get_available_arenas() RPC will work correctly
-- - Security: Only superadmin/gym_owner can create/modify arenas

-- ============================================================
-- FIX: sweat_arenas RLS Policies
-- ============================================================

-- Drop existing restrictive SELECT policy
DROP POLICY IF EXISTS "Users can view active arenas for their gyms" ON public.sweat_arenas;

-- Create new less restrictive SELECT policy
-- Allow all authenticated users to see active, non-finalized arenas
-- This is safe because arenas are public competitions
CREATE POLICY "Users can view active arenas"
  ON public.sweat_arenas FOR SELECT
  USING (
    is_active = true
    AND is_finalized = false
    AND start_date <= CURRENT_DATE
    AND end_date >= CURRENT_DATE
  );

COMMENT ON POLICY "Users can view active arenas" ON public.sweat_arenas IS
  'All authenticated users can view active, non-finalized arenas. '
  'This allows mobile app to display available arenas. '
  'Filtering by gym participation is handled by get_available_arenas() RPC.';

-- Keep existing restrictive policies for INSERT/UPDATE/DELETE
-- (Superadmin and gym_owner policies remain unchanged)

-- ============================================================
-- NOTE: get_available_arenas() uses SECURITY DEFINER
-- ============================================================
-- The get_available_arenas() RPC already uses SECURITY DEFINER,
-- which means it bypasses RLS. But we still need the SELECT policy
-- to be permissive enough for the RPC to work correctly.
-- 
-- The function is created in 20260303100003_sweat_arenas_system.sql
-- and already has GRANT EXECUTE statements there.

-- ============================================================
-- ADDITIONAL: Ensure arena_gyms SELECT policy is permissive
-- ============================================================
-- Users need to see arena_gyms to understand which gyms participate

DROP POLICY IF EXISTS "Users can view arena_gyms for visible arenas" ON public.arena_gyms;

CREATE POLICY "Users can view arena_gyms for active arenas"
  ON public.arena_gyms FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.sweat_arenas sa
      WHERE sa.id = arena_gyms.arena_id
        AND sa.is_active = true
        AND sa.is_finalized = false
    )
  );

COMMENT ON POLICY "Users can view arena_gyms for active arenas" ON public.arena_gyms IS
  'Users can view which gyms participate in active arenas. '
  'This is needed for get_available_arenas() to filter arenas by user''s gym.';
