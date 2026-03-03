-- Migration: 20260302000012_update_get_machine_status_ble_protocol.sql
-- Description: Updates get_machine_status() RPC to include ble_protocol column
--
-- AGENT NOTE: [2026-03-02] - mobile-coder / supabase-dba (Task 3.4 audit)
-- The ble_protocol column was added to machines in migration 20260302000003
-- but the get_machine_status() RPC was never updated to return it.
-- Without this, the mobile app cannot detect FTMS machines and falls back
-- to auto-detection (which may fail if machine exposes both CSC and FTMS).
--
-- CHANGES:
-- - Updated get_machine_status() return type to include ble_protocol TEXT
--
-- IMPACT ON FRONTEND:
-- - Mobile App: ScannerScreen now receives machine.ble_protocol correctly
-- - Admin Panel: No impact
--
-- BREAKING CHANGES: None (additive only)

-- Drop and recreate with new return signature
DROP FUNCTION IF EXISTS public.get_machine_status(UUID);

CREATE OR REPLACE FUNCTION public.get_machine_status(p_qr_uuid UUID)
RETURNS TABLE (
  machine_id UUID,
  machine_name TEXT,
  gym_id UUID,
  machine_type TEXT,
  sensor_id TEXT,
  ble_protocol TEXT,
  is_busy BOOLEAN,
  current_user_id UUID,
  is_active BOOLEAN,
  is_under_maintenance BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id AS machine_id,
    m.name AS machine_name,
    m.gym_id,
    m.type AS machine_type,
    m.sensor_id,
    m.ble_protocol,
    m.is_busy,
    m.current_user_id,
    m.is_active,
    COALESCE(m.is_under_maintenance, false) AS is_under_maintenance
  FROM public.machines m
  WHERE m.qr_uuid = p_qr_uuid
  AND m.is_active = true;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_machine_status(UUID) TO authenticated;
