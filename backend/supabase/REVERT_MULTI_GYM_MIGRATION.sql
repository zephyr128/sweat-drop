-- REVERT Multi-Gym Ownership Migration
-- Run this in Supabase SQL Editor to revert all changes

-- IMPORTANT: Drop policies FIRST, then functions (policies depend on functions)

-- 1. Drop RLS policies created by the migration (MUST BE FIRST)
DROP POLICY IF EXISTS "gym_owner_update_own_gyms" ON public.gyms;
DROP POLICY IF EXISTS "gym_owner_own_gyms" ON public.gyms;
DROP POLICY IF EXISTS "superadmin_manage_owners" ON public.owners;
DROP POLICY IF EXISTS "gym_owner_own_ownerships" ON public.owners;
DROP POLICY IF EXISTS "superadmin_all_owners" ON public.owners;
DROP POLICY IF EXISTS "active_gym_challenges" ON public.challenges;
DROP POLICY IF EXISTS "gym_active_machines" ON public.machines;

-- 2. Drop functions created by the migration (after policies are dropped)
DROP FUNCTION IF EXISTS public.get_gym_billing_info(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.get_gym_owner_stats() CASCADE;
DROP FUNCTION IF EXISTS public.activate_gym(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.suspend_gym(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.get_gym_status(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.is_gym_active(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.owns_gym(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.get_owned_gym_ids(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.is_gym_owner(UUID) CASCADE;

-- 3. Drop indexes created by the migration
DROP INDEX IF EXISTS idx_gyms_subscription_ends_at;
DROP INDEX IF EXISTS idx_gyms_status;
DROP INDEX IF EXISTS idx_gyms_owner_id;
DROP INDEX IF EXISTS idx_owners_gym_id;
DROP INDEX IF EXISTS idx_owners_user_id;

-- 4. Drop owners table
DROP TABLE IF EXISTS public.owners CASCADE;

-- 5. Remove columns from gyms table
ALTER TABLE public.gyms
  DROP COLUMN IF EXISTS subscription_ends_at,
  DROP COLUMN IF EXISTS max_machines,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS owner_id;

-- 6. Revert profiles role back to gym_admin (if they were changed to gym_owner)
-- Note: This will revert gym_owner users back to gym_admin
UPDATE public.profiles
SET role = 'gym_admin'
WHERE role = 'gym_owner';

-- 7. Drop gym_status enum type
DROP TYPE IF EXISTS gym_status CASCADE;

-- Note: We cannot remove 'gym_owner' from user_role enum in PostgreSQL
-- The enum value will remain but won't be used
-- If you want to remove it, you would need to:
-- 1. Create a new enum without 'gym_owner'
-- 2. Update all columns to use the new enum
-- 3. Drop the old enum
-- This is complex and not recommended unless necessary

-- 8. Restore original RLS policies for gyms (if they were dropped)
-- Note: These should already exist from previous migrations
-- If they don't, you may need to restore them from migration 20240101000005_enhanced_rbac_routing.sql

-- 9. Restore original RLS policies for machines (if they were dropped)
-- Note: These should already exist from previous migrations

-- 10. Restore original RLS policies for challenges (if they were dropped)
-- Note: These should already exist from previous migrations

-- Verification queries (run these to verify revert):
-- SELECT * FROM information_schema.tables WHERE table_name = 'owners'; -- Should return no rows
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'gyms' AND column_name IN ('owner_id', 'status', 'max_machines', 'subscription_ends_at'); -- Should return no rows
-- SELECT * FROM pg_type WHERE typname = 'gym_status'; -- Should return no rows
