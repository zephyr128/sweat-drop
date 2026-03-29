-- Verify pilot visibility migration and listing behavior

-- 1) Column exists
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'gyms'
  AND column_name = 'is_pilot_enabled';

-- 2) Basic distribution
SELECT
  COUNT(*) AS total_gyms,
  COUNT(*) FILTER (WHERE COALESCE(is_active, true) = true) AS active_gyms,
  COUNT(*) FILTER (WHERE is_pilot_enabled = true) AS pilot_enabled_gyms
FROM public.gyms;

-- 3) Pilot-only function behavior
SELECT COUNT(*) AS all_visible
FROM public.get_public_gyms_for_mobile(false);

SELECT COUNT(*) AS pilot_visible
FROM public.get_public_gyms_for_mobile(true);

-- 4) Preview sample payload
SELECT id, name, city, is_pilot_enabled
FROM public.get_public_gyms_for_mobile(true)
ORDER BY name
LIMIT 20;
