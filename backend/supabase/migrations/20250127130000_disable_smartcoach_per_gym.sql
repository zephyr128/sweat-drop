-- Disable SmartCoach Feature Per Gym Migration
-- Adds feature flag to control SmartCoach availability per gym
-- For MVP, SmartCoach is disabled by default for all gyms

-- Add smartcoach_enabled column to gyms table
ALTER TABLE public.gyms
  ADD COLUMN IF NOT EXISTS smartcoach_enabled BOOLEAN DEFAULT false NOT NULL;

-- Create index for faster filtering (useful for queries that filter by smartcoach_enabled)
CREATE INDEX IF NOT EXISTS idx_gyms_smartcoach_enabled ON public.gyms(smartcoach_enabled) WHERE smartcoach_enabled = true;

-- Comment for documentation
COMMENT ON COLUMN public.gyms.smartcoach_enabled IS 'Controls whether SmartCoach feature is enabled for this gym. Defaults to false (disabled) for MVP. Gym admins can enable it via admin panel.';
