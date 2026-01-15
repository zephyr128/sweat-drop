-- Add average_rpm column to sessions table
-- This stores the average RPM calculated from BLE sensor data during the workout

ALTER TABLE public.sessions
ADD COLUMN IF NOT EXISTS average_rpm INTEGER;

-- Add comment for documentation
COMMENT ON COLUMN public.sessions.average_rpm IS 'Average RPM (revolutions per minute) calculated from BLE sensor data during the workout session';
