-- Migration: 20260423230000_fix_get_machine_status_is_active_coalesce.sql
-- Description: Fix get_machine_status() to treat machines.is_active = NULL as active,
--              consistent with get_my_demo_machine() which already uses COALESCE.
--
-- ROOT CAUSE (bug):
--   get_my_demo_machine()  uses COALESCE(m.is_active, true) = true  → NULL treated as active
--   get_machine_status()   used  m.is_active = true                 → NULL treated as inactive
--
--   Demo machines in production may have is_active = NULL (column default).
--   get_my_demo_machine() returns the machine and the mobile app stores its qr_uuid.
--   On 5x-tap → simulator modal → Start, get_machine_status() fails to find the same
--   machine → shows "machine not found" error to demo users on Android.
--
-- FIX: align get_machine_status() to use COALESCE(m.is_active, true).
--
-- IMPACT:
--   - Mobile App: demo simulator flow now works correctly for machines with is_active = NULL
--   - Any machine with is_active = NULL is treated as active (matches existing app behaviour)
--   - Machines explicitly set to is_active = false remain inaccessible (no change)
--   - Admin Panel: no impact
--
-- BREAKING CHANGES: None

DROP FUNCTION IF EXISTS public.get_machine_status(UUID);

CREATE OR REPLACE FUNCTION public.get_machine_status(p_qr_uuid UUID)
RETURNS TABLE (
  machine_id        UUID,
  machine_name      TEXT,
  gym_id            UUID,
  machine_type      TEXT,
  sensor_id         TEXT,
  ble_protocol      TEXT,
  is_busy           BOOLEAN,
  current_user_id   UUID,
  is_active         BOOLEAN,
  is_under_maintenance BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id                                       AS machine_id,
    m.name                                     AS machine_name,
    m.gym_id,
    m.type                                     AS machine_type,
    m.sensor_id,
    m.ble_protocol,
    m.is_busy,
    m.current_user_id,
    m.is_active,
    COALESCE(m.is_under_maintenance, false)    AS is_under_maintenance
  FROM public.machines m
  WHERE m.qr_uuid = p_qr_uuid
    AND COALESCE(m.is_active, true) = true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_machine_status(UUID) TO authenticated;
