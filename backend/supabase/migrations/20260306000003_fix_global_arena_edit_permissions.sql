-- Migration: 20260306000003_fix_global_arena_edit_permissions.sql
-- Description: Restrict global arena editing to superadmin only. gym_owner/gym_admin have read-only access.
-- 
-- AGENT NOTE: [2026-03-06] - supabase-dba
-- Requirement: Global arenas (arena_scope = 'network') can only be edited by superadmin.
--              gym_owner and gym_admin can view global arenas but cannot edit/delete them.
--              gym_owner and gym_admin can edit/delete only local arenas for their gyms.
-- 
-- CHANGES:
-- - Drop existing UPDATE/DELETE policies on sweat_arenas
-- - Add UPDATE policy: superadmin can edit all, gym_owner/admin can edit only local arenas for their gyms
-- - Add DELETE policy: superadmin can delete all, gym_owner/admin can delete only local arenas for their gyms
-- - Update SELECT policy: gym_owner/admin can view global arenas (read-only)

-- ============================================================================
-- 1. DROP existing UPDATE/DELETE policies (if any)
-- ============================================================================

DROP POLICY IF EXISTS "Gym owner can update local arenas" ON public.sweat_arenas;
DROP POLICY IF EXISTS "Gym owner can delete local arenas" ON public.sweat_arenas;
DROP POLICY IF EXISTS "Gym admin can update local arenas" ON public.sweat_arenas;
DROP POLICY IF EXISTS "Gym admin can delete local arenas" ON public.sweat_arenas;

-- ============================================================================
-- 2. UPDATE SELECT policy — Allow gym_owner/admin to view global arenas
-- ============================================================================

-- Drop existing SELECT policies
DROP POLICY IF EXISTS "Users can view active arenas for their gyms" ON public.sweat_arenas;
DROP POLICY IF EXISTS "Users can view active arenas" ON public.sweat_arenas;

-- Create new SELECT policy that allows:
-- - Superadmin: see all arenas
-- - gym_owner/gym_admin: see all active arenas (including global/network)
-- - Regular users: see active arenas for their gyms
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
    -- Regular users see active arenas for their gyms
    (is_active = true AND (
      arena_scope = 'network' OR
      EXISTS (
        SELECT 1 FROM public.arena_gyms ag
        JOIN public.gym_memberships gm ON gm.gym_id = ag.gym_id
        WHERE ag.arena_id = sweat_arenas.id
          AND gm.user_id = auth.uid()
      )
    ))
  );

-- ============================================================================
-- 3. CREATE UPDATE policy — Restrict global arena editing to superadmin
-- ============================================================================

CREATE POLICY "Superadmin can update all arenas"
  ON public.sweat_arenas FOR UPDATE
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

CREATE POLICY "Gym staff can update local arenas for their gyms"
  ON public.sweat_arenas FOR UPDATE
  USING (
    -- Only local arenas
    arena_scope = 'local' AND
    -- User is gym_owner or gym_admin
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('gym_owner', 'gym_admin')
    ) AND
    -- Arena is associated with user's gym
    EXISTS (
      SELECT 1 FROM public.arena_gyms ag
      JOIN public.gym_staff gs ON gs.gym_id = ag.gym_id
      WHERE ag.arena_id = sweat_arenas.id
        AND gs.user_id = auth.uid()
        AND gs.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    -- Ensure they can't change arena_scope to 'network' (must stay 'local')
    arena_scope = 'local' AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('gym_owner', 'gym_admin')
    ) AND
    EXISTS (
      SELECT 1 FROM public.arena_gyms ag
      JOIN public.gym_staff gs ON gs.gym_id = ag.gym_id
      WHERE ag.arena_id = sweat_arenas.id
        AND gs.user_id = auth.uid()
        AND gs.role IN ('owner', 'admin')
    )
  );

-- ============================================================================
-- 4. CREATE DELETE policy — Restrict global arena deletion to superadmin
-- ============================================================================

CREATE POLICY "Superadmin can delete all arenas"
  ON public.sweat_arenas FOR DELETE
  USING (public.is_superadmin(auth.uid()));

CREATE POLICY "Gym staff can delete local arenas for their gyms"
  ON public.sweat_arenas FOR DELETE
  USING (
    -- Only local arenas
    arena_scope = 'local' AND
    -- User is gym_owner or gym_admin
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('gym_owner', 'gym_admin')
    ) AND
    -- Arena is associated with user's gym (check via arena_gyms)
    EXISTS (
      SELECT 1 FROM public.arena_gyms ag
      WHERE ag.arena_id = sweat_arenas.id
        AND (
          -- gym_admin: check admin_gym_id
          (EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'gym_admin' AND admin_gym_id = ag.gym_id
          )) OR
          -- gym_owner: check if gym.owner_id matches or admin_gym_id matches
          (EXISTS (
            SELECT 1 FROM public.profiles p
            JOIN public.gyms g ON g.id = ag.gym_id
            WHERE p.id = auth.uid() 
              AND p.role = 'gym_owner'
              AND (g.owner_id = auth.uid() OR p.admin_gym_id = ag.gym_id)
          ))
        )
    )
  );

-- ============================================================================
-- 5. UPDATE INSERT policy — Ensure gym_owner/admin can only create local arenas
-- ============================================================================

-- Drop existing INSERT policy
DROP POLICY IF EXISTS "Gym owner can create local arenas" ON public.sweat_arenas;

-- Create new INSERT policy
CREATE POLICY "Gym staff can create local arenas"
  ON public.sweat_arenas FOR INSERT
  WITH CHECK (
    -- Superadmin can create any arena
    public.is_superadmin(auth.uid()) OR
    -- gym_owner/gym_admin can only create local arenas
    (
      arena_scope = 'local' AND
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role IN ('gym_owner', 'gym_admin')
      )
    )
  );

COMMENT ON POLICY "Superadmin can update all arenas" ON public.sweat_arenas IS
  'Superadmin can update any arena, including global (network) arenas.';
COMMENT ON POLICY "Gym staff can update local arenas for their gyms" ON public.sweat_arenas IS
  'gym_owner and gym_admin can only update local arenas associated with their gyms. Cannot edit global arenas.';
COMMENT ON POLICY "Superadmin can delete all arenas" ON public.sweat_arenas IS
  'Superadmin can delete any arena, including global (network) arenas.';
COMMENT ON POLICY "Gym staff can delete local arenas for their gyms" ON public.sweat_arenas IS
  'gym_owner and gym_admin can only delete local arenas associated with their gyms. Cannot delete global arenas.';
COMMENT ON POLICY "Users can view active arenas" ON public.sweat_arenas IS
  'Superadmin sees all. gym_owner/gym_admin see all active arenas (read-only for global). Regular users see arenas for their gyms.';
