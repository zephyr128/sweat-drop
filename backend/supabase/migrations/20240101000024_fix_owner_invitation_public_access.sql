-- Fix public access to owner invitations
-- Ensure unauthenticated users can view owner invitations by token

-- The issue is that the "Superadmins can view owner invitations" policy has a bad condition:
-- `role = 'gym_owner'` checks if the invitation role is gym_owner (always true for owner invitations)
-- This doesn't check if the user is a gym_owner, which causes issues.

-- First, drop the problematic superadmin policy
DROP POLICY IF EXISTS "Superadmins can view owner invitations" ON public.staff_invitations;

-- Recreate it correctly - superadmins can view all invitations
CREATE POLICY "Superadmins can view owner invitations"
  ON public.staff_invitations FOR SELECT
  USING (
    public.is_superadmin(auth.uid())
  );

-- Ensure the public policy allows viewing all pending invitations (including owner invitations)
-- Drop and recreate to ensure it's applied correctly
DROP POLICY IF EXISTS "Public can view invitations by token" ON public.staff_invitations;

-- Create a policy that allows anyone (anon or authenticated) to view pending invitations
-- The application will filter by token, this policy just allows the query to run
CREATE POLICY "Public can view invitations by token"
  ON public.staff_invitations FOR SELECT
  TO anon, authenticated
  USING (
    status = 'pending' AND
    expires_at > NOW()
  );

-- Note: PostgreSQL RLS evaluates policies with OR logic, so if any policy allows access, the user can access.
-- The public policy above should allow unauthenticated users to view pending invitations by token.
