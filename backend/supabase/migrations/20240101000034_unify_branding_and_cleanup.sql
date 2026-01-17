-- Unify Branding System and Cleanup Unused Tables
-- This migration:
-- 1. Migrates all branding data to owner_branding (unified approach)
-- 2. Removes redundant branding columns from gyms table
-- 3. Removes gym_branding table (redundant)
-- 4. Keeps equipment table for backward compatibility but marks it as deprecated

-- Step 1: Migrate branding data from gyms.primary_color to owner_branding
-- Only migrate if owner_branding doesn't already exist for that owner
INSERT INTO public.owner_branding (owner_id, primary_color, logo_url, background_url, created_at, updated_at)
SELECT DISTINCT
  g.owner_id,
  COALESCE(g.primary_color, '#00E5FF') as primary_color,
  g.logo_url,
  g.background_url,
  NOW() as created_at,
  NOW() as updated_at
FROM public.gyms g
WHERE g.owner_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.owner_branding ob 
    WHERE ob.owner_id = g.owner_id
  )
  AND (g.primary_color IS NOT NULL OR g.logo_url IS NOT NULL OR g.background_url IS NOT NULL);

-- Step 2: Migrate branding data from gym_branding to owner_branding
-- Only migrate if owner_branding doesn't already exist for that owner
INSERT INTO public.owner_branding (owner_id, primary_color, logo_url, background_url, created_at, updated_at)
SELECT DISTINCT
  g.owner_id,
  COALESCE(gb.primary_color, '#00E5FF') as primary_color,
  gb.logo_url,
  gb.background_url,
  NOW() as created_at,
  NOW() as updated_at
FROM public.gyms g
INNER JOIN public.gym_branding gb ON g.id = gb.gym_id
WHERE g.owner_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.owner_branding ob 
    WHERE ob.owner_id = g.owner_id
  )
  AND (gb.primary_color IS NOT NULL OR gb.logo_url IS NOT NULL OR gb.background_url IS NOT NULL);

-- Step 3: Remove branding columns from gyms table
ALTER TABLE public.gyms
  DROP COLUMN IF EXISTS primary_color,
  DROP COLUMN IF EXISTS logo_url,
  DROP COLUMN IF EXISTS background_url;

-- Step 4: Drop gym_branding table (redundant, replaced by owner_branding)
-- First drop RLS policies
DROP POLICY IF EXISTS "superadmin_all_branding" ON public.gym_branding;
DROP POLICY IF EXISTS "gym_admin_own_branding" ON public.gym_branding;
DROP POLICY IF EXISTS "receptionist_view_branding" ON public.gym_branding;

-- Drop indexes
DROP INDEX IF EXISTS idx_gym_branding_gym_id;

-- Drop the table
DROP TABLE IF EXISTS public.gym_branding;

-- Step 5: Add comment to equipment table marking it as deprecated
-- Equipment table is kept for backward compatibility but should not be used for new features
-- New system uses 'machines' table instead
COMMENT ON TABLE public.equipment IS 'DEPRECATED: Legacy equipment table. Use machines table instead. Kept for backward compatibility with old sessions.';

-- Step 6: Add comment to owner_branding confirming it's the unified branding system
COMMENT ON TABLE public.owner_branding IS 'Unified branding system: Global branding per gym owner. Applies to all gyms owned by that owner. Replaces gyms.primary_color and gym_branding table.';

-- Step 7: Update any remaining references in comments
COMMENT ON COLUMN public.gyms.owner_id IS 'Gym owner ID. Branding is managed via owner_branding table.';
