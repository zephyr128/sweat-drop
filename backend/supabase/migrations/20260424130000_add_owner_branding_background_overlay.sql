-- Add a user-tunable "background overlay" strength to owner_branding.
-- Purpose: let gym owners increase the darkening layer over their background
-- photo so the primary brand color stays legible on top of the image
-- (e.g. a light photo + a cyan primary needs a stronger overlay for contrast).
--
-- 0.0 = no overlay (photo fully visible)
-- 0.5 = default (matches the legacy hardcoded gradient 0.30 → 0.50 → 0.65)
-- 1.0 = fully black (photo hidden)
--
-- The mobile home screen uses this value to scale its 3-stop LinearGradient:
--   top    = overlay * 0.60
--   middle = overlay * 1.00
--   bottom = overlay * 1.30  (clamped to 1)

ALTER TABLE public.owner_branding
ADD COLUMN IF NOT EXISTS background_overlay NUMERIC(3, 2)
  NOT NULL DEFAULT 0.50;

-- Clamp to [0, 1] at the database level
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'owner_branding_background_overlay_range'
  ) THEN
    ALTER TABLE public.owner_branding
      ADD CONSTRAINT owner_branding_background_overlay_range
      CHECK (background_overlay >= 0 AND background_overlay <= 1);
  END IF;
END $$;

COMMENT ON COLUMN public.owner_branding.background_overlay IS
  'Darken-layer strength (0..1) applied over the background image so the primary brand color stays legible. 0 = image untouched, 1 = fully black.';
