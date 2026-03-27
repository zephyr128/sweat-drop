-- Migration: 20260325000023_fix_admin_gym_access_check.sql
-- Description: Fix _admin_check_gym_access to check gyms.owner_id and assigned_gym_id,
--              not just admin_gym_id (which can be NULL for gym owners).

CREATE OR REPLACE FUNCTION public._admin_check_gym_access(p_gym_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid          UUID;
  v_role         TEXT;
  v_admin_gym    UUID;
  v_assigned_gym UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RETURN false; END IF;

  SELECT role::TEXT, admin_gym_id, assigned_gym_id
  INTO v_role, v_admin_gym, v_assigned_gym
  FROM public.profiles WHERE id = v_uid;

  IF v_role = 'superadmin' THEN RETURN true; END IF;

  IF v_role IN ('gym_owner', 'gym_admin', 'receptionist') THEN
    IF v_admin_gym = p_gym_id THEN RETURN true; END IF;
    IF v_assigned_gym = p_gym_id THEN RETURN true; END IF;
    IF EXISTS (SELECT 1 FROM public.gyms WHERE id = p_gym_id AND owner_id = v_uid) THEN RETURN true; END IF;
  END IF;

  RETURN false;
END;
$$;
