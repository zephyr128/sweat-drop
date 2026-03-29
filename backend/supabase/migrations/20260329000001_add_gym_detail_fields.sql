-- Add gym detail fields for App Store launch
-- Enables rich gym profiles (description, hours, contact, location)

ALTER TABLE public.gyms
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS working_hours JSONB,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS website TEXT,
  ADD COLUMN IF NOT EXISTS instagram TEXT,
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS is_founding_partner BOOLEAN DEFAULT false NOT NULL;

-- working_hours JSONB format:
-- {
--   "mon": { "open": "06:00", "close": "22:00" },
--   "tue": { "open": "06:00", "close": "22:00" },
--   ...
--   "sun": { "open": "08:00", "close": "18:00" }
-- }

COMMENT ON COLUMN public.gyms.working_hours IS 'JSONB with day keys (mon-sun), each having open/close times';
COMMENT ON COLUMN public.gyms.is_founding_partner IS 'Displayed as "Founding Partner" badge in mobile app';
