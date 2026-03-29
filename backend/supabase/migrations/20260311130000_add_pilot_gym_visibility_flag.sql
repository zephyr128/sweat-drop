-- Additive and safe: introduces pilot visibility control for gym listing.
-- This does not remove or modify existing gym data.

ALTER TABLE public.gyms
ADD COLUMN IF NOT EXISTS is_pilot_enabled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.gyms.is_pilot_enabled IS
'Controls whether the gym is visible in pilot-only member gym lists.';

CREATE INDEX IF NOT EXISTS idx_gyms_is_pilot_enabled
ON public.gyms (is_pilot_enabled);

-- Keep existing rows visible by default after migration.
UPDATE public.gyms
SET is_pilot_enabled = true
WHERE is_pilot_enabled IS DISTINCT FROM true;

-- Public/mobile-safe listing function for staged rollouts.
CREATE OR REPLACE FUNCTION public.get_public_gyms_for_mobile(
  p_pilot_only BOOLEAN DEFAULT false
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  city TEXT,
  country TEXT,
  address TEXT,
  owner_id UUID,
  lat NUMERIC,
  lng NUMERIC,
  working_hours TEXT,
  is_pilot_enabled BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    g.id,
    g.name,
    g.city,
    g.country,
    g.address,
    g.owner_id,
    g.lat,
    g.lng,
    g.working_hours,
    g.is_pilot_enabled,
    g.created_at,
    g.updated_at
  FROM public.gyms g
  WHERE COALESCE(g.is_active, true) = true
    AND (NOT p_pilot_only OR g.is_pilot_enabled = true)
  ORDER BY g.name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_gyms_for_mobile(BOOLEAN) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_gyms_for_mobile(BOOLEAN) TO authenticated;
