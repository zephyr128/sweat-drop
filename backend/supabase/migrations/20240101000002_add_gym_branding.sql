-- Add branding fields to gyms table for multi-gym support
-- This allows each gym to have its own visual identity

ALTER TABLE public.gyms
ADD COLUMN IF NOT EXISTS primary_color TEXT,
ADD COLUMN IF NOT EXISTS background_url TEXT,
ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Add comments for documentation
COMMENT ON COLUMN public.gyms.primary_color IS 'Primary brand color in hex format (e.g., #00E5FF)';
COMMENT ON COLUMN public.gyms.background_url IS 'URL to gym background image';
COMMENT ON COLUMN public.gyms.logo_url IS 'URL to gym logo image';

-- Create index for faster lookups by primary_color (optional, for filtering)
CREATE INDEX IF NOT EXISTS idx_gyms_primary_color ON public.gyms(primary_color) WHERE primary_color IS NOT NULL;
