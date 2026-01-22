-- Allow NULL gym_id for gym_owner role invitations
-- Owner invitations can be general (without a specific gym) or specific to a gym

-- First, make gym_id nullable (remove NOT NULL constraint)
ALTER TABLE public.staff_invitations
  ALTER COLUMN gym_id DROP NOT NULL;

-- Add CHECK constraint to ensure gym_id is NOT NULL for gym_admin and receptionist roles
-- Allow NULL or NOT NULL for gym_owner role
ALTER TABLE public.staff_invitations
  DROP CONSTRAINT IF EXISTS staff_invitations_gym_id_check;

ALTER TABLE public.staff_invitations
  ADD CONSTRAINT staff_invitations_gym_id_check
  CHECK (
    (role IN ('gym_admin', 'receptionist') AND gym_id IS NOT NULL) OR
    (role = 'gym_owner')
  );
