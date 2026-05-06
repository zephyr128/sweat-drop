-- Migration: 20260506204600_machines_type_add_stepper.sql
-- Description: Expand machines.type CHECK constraint to include 'stepper'.
--
-- AGENT NOTE: [2026-05-06] - supabase-dba
-- Plan: docs/plans/feature_admin_machine_type_elliptical_stepper.md (Step 5)
--
-- CONTEXT:
--   Original constraint (20240101000009): ('treadmill', 'bike')
--   Expanded constraint (20260302000003): ('treadmill', 'bike', 'elliptical', 'weight')
--   'elliptical' was already allowed. 'stepper' was never added.
--   drop_model_config.machine_type already includes 'stepper' (20260325000004).
--   drop_activity_signal_guard already handles 'stepper' (20260325000013).
--   Only machines.type CHECK is blocking inserts with type='stepper'.
--
-- CHANGES:
--   - Dropped: machines_type_check CHECK constraint
--   - Added:   machines_type_check CHECK (type IN ('treadmill', 'bike', 'elliptical', 'weight', 'stepper'))
--
-- IMPACT ON FRONTEND:
--   - Admin Panel: After this migration, INSERT/UPDATE with type='stepper' will succeed.
--                  admin-coder can proceed with Step 1–4 (UI constants, Zod, labels).
--   - Mobile App:  No change required; mobile does not INSERT machines.
--
-- BREAKING CHANGES:
--   - None. Purely additive; existing rows with 'treadmill', 'bike', 'elliptical', 'weight' are unaffected.
--
-- ROLLBACK:
--   To revert, drop this constraint and re-add without 'stepper':
--     ALTER TABLE public.machines DROP CONSTRAINT IF EXISTS machines_type_check;
--     ALTER TABLE public.machines
--       ADD CONSTRAINT machines_type_check
--         CHECK (type IN ('treadmill', 'bike', 'elliptical', 'weight'));
--   Pre-condition: no rows with type='stepper' must exist before rolling back.
--
-- NEXT STEPS:
--   1. supabase db push
--   2. admin-coder: proceed with Steps 1–4 of the feature plan
--   3. Update MIGRATION_NOTES.md (done below)

-- 1. Drop existing constraint
ALTER TABLE public.machines
  DROP CONSTRAINT IF EXISTS machines_type_check;

-- 2. Recreate with 'stepper' added
ALTER TABLE public.machines
  ADD CONSTRAINT machines_type_check
    CHECK (type IN ('treadmill', 'bike', 'elliptical', 'weight', 'stepper'));

-- 3. Update table comment to reflect all current types
COMMENT ON COLUMN public.machines.type IS 'Machine type: treadmill, bike, elliptical, weight, or stepper';
