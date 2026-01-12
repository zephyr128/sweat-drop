-- ============================================
-- QUICK SETUP: Multi-Gym Support
-- ============================================
-- Run this entire file in Supabase SQL Editor
-- This will add branding fields and create 3 test gyms

-- Step 1: Add branding columns to gyms table
ALTER TABLE public.gyms
ADD COLUMN IF NOT EXISTS primary_color TEXT,
ADD COLUMN IF NOT EXISTS background_url TEXT,
ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Step 2: Add comments for documentation
COMMENT ON COLUMN public.gyms.primary_color IS 'Primary brand color in hex format (e.g., #00E5FF)';
COMMENT ON COLUMN public.gyms.background_url IS 'URL to gym background image';
COMMENT ON COLUMN public.gyms.logo_url IS 'URL to gym logo image';

-- Step 3: Create index for faster lookups (optional)
CREATE INDEX IF NOT EXISTS idx_gyms_primary_color ON public.gyms(primary_color) WHERE primary_color IS NOT NULL;

-- Step 4: Insert 3 test gyms with different branding
INSERT INTO public.gyms (id, name, city, country, address, primary_color, background_url, logo_url, created_at, updated_at)
VALUES
  (
    '550e8400-e29b-41d4-a716-446655440001',
    'Elite Fitness Center',
    'New York',
    'USA',
    '123 Main Street, New York, NY 10001',
    '#00E5FF', -- Cyan (default theme)
    NULL,
    NULL,
    NOW(),
    NOW()
  ),
  (
    '550e8400-e29b-41d4-a716-446655440002',
    'Power Gym',
    'Los Angeles',
    'USA',
    '456 Fitness Ave, Los Angeles, CA 90001',
    '#FF6B6B', -- Red/Coral
    NULL,
    NULL,
    NOW(),
    NOW()
  ),
  (
    '550e8400-e29b-41d4-a716-446655440003',
    'Zenith Athletics',
    'Chicago',
    'USA',
    '789 Sports Blvd, Chicago, IL 60601',
    '#4ECDC4', -- Teal/Turquoise
    NULL,
    NULL,
    NOW(),
    NOW()
  )
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  city = EXCLUDED.city,
  country = EXCLUDED.country,
  address = EXCLUDED.address,
  primary_color = EXCLUDED.primary_color,
  background_url = EXCLUDED.background_url,
  logo_url = EXCLUDED.logo_url,
  updated_at = NOW();

-- Step 5: Verify the setup
SELECT 
  id,
  name,
  city,
  primary_color,
  created_at
FROM public.gyms
ORDER BY name;

-- ============================================
-- OPTIONAL: Set a user's home gym for testing
-- ============================================
-- Uncomment and replace 'YOUR_USER_ID' with actual user ID
-- UPDATE public.profiles
-- SET home_gym_id = '550e8400-e29b-41d4-a716-446655440001'
-- WHERE id = 'YOUR_USER_ID';
