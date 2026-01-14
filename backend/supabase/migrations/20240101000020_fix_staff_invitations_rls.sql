-- Fix RLS policies for staff_invitations to allow gym_owners to create invitations
-- This migration adds policies for gym_owners to manage staff invitations for their gyms

-- Drop existing policies that might conflict
DROP POLICY IF EXISTS "Gym owners can view owned gym invitations" ON public.staff_invitations;
DROP POLICY IF EXISTS "Gym owners can create owned gym invitations" ON public.staff_invitations;
DROP POLICY IF EXISTS "Gym owners can update owned gym invitations" ON public.staff_invitations;

-- Gym owners can view invitations for their owned gyms
CREATE POLICY "Gym owners can view owned gym invitations"
  ON public.staff_invitations FOR SELECT
  USING (
    public.is_gym_owner(auth.uid()) AND
    EXISTS (
      SELECT 1 FROM public.gyms 
      WHERE id = staff_invitations.gym_id 
      AND owner_id = auth.uid()
    )
  );

-- Gym owners can create invitations for their owned gyms
CREATE POLICY "Gym owners can create owned gym invitations"
  ON public.staff_invitations FOR INSERT
  WITH CHECK (
    public.is_gym_owner(auth.uid()) AND
    EXISTS (
      SELECT 1 FROM public.gyms 
      WHERE id = staff_invitations.gym_id 
      AND owner_id = auth.uid()
    ) AND
    invited_by = auth.uid()
  );

-- Gym owners can update invitations for their owned gyms
CREATE POLICY "Gym owners can update owned gym invitations"
  ON public.staff_invitations FOR UPDATE
  USING (
    public.is_gym_owner(auth.uid()) AND
    EXISTS (
      SELECT 1 FROM public.gyms 
      WHERE id = staff_invitations.gym_id 
      AND owner_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_gym_owner(auth.uid()) AND
    EXISTS (
      SELECT 1 FROM public.gyms 
      WHERE id = staff_invitations.gym_id 
      AND owner_id = auth.uid()
    )
  );

-- Also ensure gym admins can still create invitations
-- Use direct access to assigned_gym_id to avoid function dependency issues
DROP POLICY IF EXISTS "Gym admins can create gym invitations" ON public.staff_invitations;
CREATE POLICY "Gym admins can create gym invitations"
  ON public.staff_invitations FOR INSERT
  WITH CHECK (
    public.is_gym_admin(auth.uid()) AND
    gym_id = (SELECT assigned_gym_id FROM public.profiles WHERE id = auth.uid()) AND
    invited_by = auth.uid()
  );

-- Update gym admins view policy
DROP POLICY IF EXISTS "Gym admins can view gym invitations" ON public.staff_invitations;
CREATE POLICY "Gym admins can view gym invitations"
  ON public.staff_invitations FOR SELECT
  USING (
    public.is_gym_admin(auth.uid()) AND
    gym_id = (SELECT assigned_gym_id FROM public.profiles WHERE id = auth.uid())
  );

-- Update gym admins update policy
DROP POLICY IF EXISTS "Gym admins can update gym invitations" ON public.staff_invitations;
CREATE POLICY "Gym admins can update gym invitations"
  ON public.staff_invitations FOR UPDATE
  USING (
    public.is_gym_admin(auth.uid()) AND
    gym_id = (SELECT assigned_gym_id FROM public.profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    public.is_gym_admin(auth.uid()) AND
    gym_id = (SELECT assigned_gym_id FROM public.profiles WHERE id = auth.uid())
  );
