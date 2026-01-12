-- Seed data for multi-gym testing
-- This file contains sample gyms with different branding for testing the multi-gym feature

-- Insert test gyms with different branding
INSERT INTO public.gyms (id, name, city, country, address, primary_color, background_url, logo_url, created_at, updated_at)
VALUES
  (
    '550e8400-e29b-41d4-a716-446655440001',
    'Elite Fitness Center',
    'New York',
    'USA',
    '123 Main Street, New York, NY 10001',
    '#00E5FF', -- Cyan (default theme color)
    NULL, -- No background image
    NULL, -- No logo image
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

-- Optional: Update existing gyms to have default branding if they don't have one
UPDATE public.gyms
SET 
  primary_color = COALESCE(primary_color, '#00E5FF'),
  updated_at = NOW()
WHERE primary_color IS NULL;
