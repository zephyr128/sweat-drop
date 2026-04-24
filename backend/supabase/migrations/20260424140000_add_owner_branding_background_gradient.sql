-- Add a user-defined 2-stop gradient to owner_branding for when there is NO
-- background photo. Today the mobile home screen falls back to a hardcoded
-- `#080808 → #0A0E1A → #080808` dark gradient; with these columns the gym
-- owner can set their own gradient colors (e.g. brand-tinted dark wash).
--
--   background_gradient_start: color at the top of the screen
--   background_gradient_end:   color at the bottom of the screen
--
-- Both default to the legacy hardcoded values so existing installs look
-- identical after the migration runs.

ALTER TABLE public.owner_branding
  ADD COLUMN IF NOT EXISTS background_gradient_start TEXT NOT NULL DEFAULT '#080808',
  ADD COLUMN IF NOT EXISTS background_gradient_end   TEXT NOT NULL DEFAULT '#0A0E1A';

-- Enforce a hex #RRGGBB shape at the DB level so bad values can't leak in.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'owner_branding_background_gradient_hex_shape'
  ) THEN
    ALTER TABLE public.owner_branding
      ADD CONSTRAINT owner_branding_background_gradient_hex_shape
      CHECK (
        background_gradient_start ~* '^#[0-9a-f]{6}$'
        AND background_gradient_end ~* '^#[0-9a-f]{6}$'
      );
  END IF;
END $$;

COMMENT ON COLUMN public.owner_branding.background_gradient_start IS
  'Top color of the fallback gradient shown when background_url is null. Hex #RRGGBB.';
COMMENT ON COLUMN public.owner_branding.background_gradient_end IS
  'Bottom color of the fallback gradient shown when background_url is null. Hex #RRGGBB.';
