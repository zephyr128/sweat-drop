-- Run this migration in Supabase SQL Editor
-- This implements SuperAdmin exclusive gym control and Multi-Gym Owner experience

-- IMPORTANT: Run the entire migration file: 20240101000014_superadmin_gym_control.sql
-- This file is just a reminder to run the migration

-- After running the migration, verify:
-- 1. Check that gyms table has owner_id, is_suspended, subscription_type columns
-- 2. Check that owner_branding table exists
-- 3. Check that RLS policies are in place
-- 4. Test SuperAdmin Control Tower at /dashboard/super
-- 5. Test Gym Owner switching between their gyms

SELECT 'Migration file: 20240101000014_superadmin_gym_control.sql' AS instruction;
