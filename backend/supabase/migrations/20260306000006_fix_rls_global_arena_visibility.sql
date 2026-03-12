-- Migration: 20260306000006_fix_rls_global_arena_visibility.sql
-- Description: Fix RLS policy on sweat_arenas to require arena_gyms participation for ALL arena scopes
-- 
-- AGENT NOTE: [2026-03-06] - supabase-dba
-- Problem: RLS policy on sweat_arenas allows all users to see network arenas without checking arena_gyms.
--          This allows direct queries to sweat_arenas table to bypass get_available_arenas() filtering.
-- Solution: Update RLS policy to require arena_gyms participation for ALL arena scopes (including network).
-- 
-- CHANGES:
-- - Update "Users can view active arenas" policy to remove special case for arena_scope = 'network'
-- - Require arena_gyms participation check for ALL arena scopes

-- ============================================================================
-- UPDATE RLS POLICY: sweat_arenas — Require arena_gyms participation
-- ============================================================================

-- Drop existing SELECT policy
DROP POLICY IF EXISTS "Users can view active arenas" ON public.sweat_arenas;

-- Create new SELECT policy that requires arena_gyms participation for ALL scopes
CREATE POLICY "Users can view active arenas"
  ON public.sweat_arenas FOR SELECT
  USING (
    -- Superadmin sees all
    public.is_superadmin(auth.uid()) OR
    -- gym_owner/gym_admin see all active arenas (read-only access to global arenas)
    (is_active = true AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('gym_owner', 'gym_admin')
    )) OR
    -- Regular users see active arenas ONLY if their gym participates (is in arena_gyms)
    -- This applies to ALL arena scopes (local, regional, network)
    (is_active = true AND EXISTS (
      SELECT 1 FROM public.arena_gyms ag
      JOIN public.gym_memberships gm ON gm.gym_id = ag.gym_id
      WHERE ag.arena_id = sweat_arenas.id
        AND gm.user_id = auth.uid()
    ))
  );

COMMENT ON POLICY "Users can view active arenas" ON public.sweat_arenas IS
  'Superadmin sees all. gym_owner/gym_admin see all active arenas (read-only). '
  'Regular users see arenas ONLY if their gym participates (is in arena_gyms). '
  'This applies to ALL arena scopes (local, regional, network). Global arenas are not automatically visible.';
