-- RPC Function to get machine status by QR UUID
-- Used by mobile app to check if machine is available before starting workout

CREATE OR REPLACE FUNCTION public.get_machine_status(p_qr_uuid UUID)
RETURNS TABLE (
  machine_id UUID,
  machine_name TEXT,
  gym_id UUID,
  machine_type TEXT,
  sensor_id TEXT,
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
