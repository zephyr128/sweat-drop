-- Migration: 20260304100009_sync_gym_owner_admin_gym_id.sql
-- Description: Sync admin_gym_id for gym_owner when gyms.owner_id is set
-- 
-- AGENT NOTE: [2026-03-04] - supabase-dba
-- 
-- Problem: gym_owner cannot upload to bucket because admin_gym_id is not set
-- Solution: Create trigger to automatically set admin_gym_id when gyms.owner_id is set
--           Also backfill existing gym owners
-- 
-- CHANGES:
-- - Create trigger to sync admin_gym_id when gyms.owner_id changes
-- - Backfill admin_gym_id for existing gym owners
-- 
-- IMPACT ON FRONTEND:
-- - Admin Panel: Gym owners can now upload badge images using admin_gym_id fallback
-- 
-- BREAKING CHANGES:
-- - None (additive only)

-- ============================================================================
-- 1. Backfill admin_gym_id for existing gym owners
-- ============================================================================
-- For each gym where owner_id is set, update the owner's profile to have admin_gym_id
UPDATE public.profiles p
SET admin_gym_id = g.id
FROM public.gyms g
WHERE g.owner_id = p.id
  AND p.role = 'gym_owner'
  AND (p.admin_gym_id IS NULL OR p.admin_gym_id != g.id);

-- ============================================================================
-- 2. Create function to sync admin_gym_id when gyms.owner_id changes
-- ============================================================================
CREATE OR REPLACE FUNCTION public.sync_gym_owner_admin_gym_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- When owner_id is set, update the owner's profile to have admin_gym_id
  IF NEW.owner_id IS NOT NULL THEN
    UPDATE public.profiles
    SET admin_gym_id = NEW.id
    WHERE id = NEW.owner_id
      AND role = 'gym_owner';
  END IF;
  
  -- When owner_id is changed or removed, update old owner's admin_gym_id
  IF OLD.owner_id IS NOT NULL AND (OLD.owner_id != NEW.owner_id OR NEW.owner_id IS NULL) THEN
    -- Only clear admin_gym_id if they don't own any other gyms
    UPDATE public.profiles
    SET admin_gym_id = NULL
    WHERE id = OLD.owner_id
      AND role = 'gym_owner'
      AND NOT EXISTS (
        SELECT 1 FROM public.gyms
        WHERE owner_id = OLD.owner_id
        AND id != OLD.id
      );
  END IF;
  
  RETURN NEW;
END;
$$;

-- ============================================================================
-- 3. Create trigger on gyms table
-- ============================================================================
DROP TRIGGER IF EXISTS sync_gym_owner_admin_gym_id_trigger ON public.gyms;

CREATE TRIGGER sync_gym_owner_admin_gym_id_trigger
  AFTER INSERT OR UPDATE OF owner_id ON public.gyms
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_gym_owner_admin_gym_id();

-- ============================================================================
-- 4. Also sync when profile role changes to gym_owner
-- ============================================================================
CREATE OR REPLACE FUNCTION public.sync_gym_owner_on_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- When role changes to gym_owner, set admin_gym_id from any gym they own
  IF NEW.role = 'gym_owner' AND (OLD.role != 'gym_owner' OR OLD.role IS NULL) THEN
    UPDATE public.profiles
    SET admin_gym_id = (
      SELECT id FROM public.gyms
      WHERE owner_id = NEW.id
      LIMIT 1
    )
    WHERE id = NEW.id
      AND admin_gym_id IS NULL;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_gym_owner_on_role_change_trigger ON public.profiles;

CREATE TRIGGER sync_gym_owner_on_role_change_trigger
  AFTER UPDATE OF role ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_gym_owner_on_role_change();

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON FUNCTION public.sync_gym_owner_admin_gym_id IS 
  'Automatically syncs admin_gym_id in profiles when gyms.owner_id is set. '
  'This allows gym_owner to use admin_gym_id as fallback for bucket access.';

COMMENT ON FUNCTION public.sync_gym_owner_on_role_change IS 
  'Automatically sets admin_gym_id when user role changes to gym_owner.';
