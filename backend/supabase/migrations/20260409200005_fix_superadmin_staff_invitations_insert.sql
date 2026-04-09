-- Migration: 20260409200005_fix_superadmin_staff_invitations_insert.sql
-- Description: Add general superadmin INSERT/UPDATE/DELETE policies on staff_invitations.
--
-- ROOT CAUSE: .env.prod.local had SUPABASE_SERVICE_ROLE_KEY set to the anon key,
-- so the admin client was operating as anon (subject to RLS) instead of service_role
-- (bypasses RLS). The only INSERT policy for superadmins was restricted to
-- role = 'gym_owner', meaning superadmins couldn't insert staff invitations either.
--
-- This migration adds a general-purpose superadmin policy as defense-in-depth:
-- even if the service_role key is misconfigured, an authenticated superadmin
-- can still manage invitations through RLS.
--
-- CHANGES:
--   - Added "Superadmins can manage all invitations" INSERT/UPDATE/DELETE policies
--   - Dropped the narrow "Superadmins can create owner invitations" INSERT policy
--
-- BREAKING CHANGES: None

-- Drop the narrow superadmin INSERT policy (only allowed role = 'gym_owner')
DROP POLICY IF EXISTS "Superadmins can create owner invitations" ON public.staff_invitations;

-- General superadmin policy: full control on all invitations
DROP POLICY IF EXISTS "Superadmins full access to invitations" ON public.staff_invitations;
CREATE POLICY "Superadmins full access to invitations"
  ON public.staff_invitations FOR ALL
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));
