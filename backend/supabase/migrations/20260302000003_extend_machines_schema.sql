-- Migration: 20260302000003_extend_machines_schema.sql
-- Description: Extends machines table with BLE protocol, expanded types, and registration tracking
--
-- AGENT NOTE: [2026-03-02] - supabase-dba (Phase 0, Task 0.3)
-- Reference: docs/plans/mvp_full_audit_and_build_plan.md
--
-- CHANGES:
-- - Added column: public.machines.ble_protocol (TEXT with CHECK)
-- - Added column: public.machines.protocol_verified (BOOLEAN, default false)
-- - Added column: public.machines.zone (TEXT)
-- - Added column: public.machines.registered_by (UUID → profiles)
-- - Added column: public.machines.registered_at (TIMESTAMPTZ)
-- - DROPPED old type CHECK constraint, added new one with elliptical + weight
--
-- BLE PRIORITY (per Q1):
-- 1. FTMS (Life Fitness, Technogym, Matrix, Horizon)
-- 2. Magene CSC (already implemented)
-- 3. FitShow (Shua V9, Vortex gym)
-- 4. KS Fit (low priority)
--
-- IMPACT ON FRONTEND:
-- - Admin Panel: MachinesManager can now set ble_protocol, zone
-- - Mobile App: ble-service.ts uses ble_protocol to select parser
--
-- BREAKING CHANGES:
-- - machines.type CHECK constraint expanded (additive, not breaking)

-- 1. Add BLE protocol column
ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS ble_protocol TEXT
    CHECK (ble_protocol IN ('ftms', 'fitshow', 'magene', 'ksfit'));

-- 2. Add protocol verification flag
ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS protocol_verified BOOLEAN DEFAULT false NOT NULL;

-- 3. Add zone/area label
ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS zone TEXT;

-- 4. Add registration tracking
ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS registered_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS registered_at TIMESTAMPTZ;

-- 5. Expand machine type CHECK constraint to include elliptical and weight
-- First drop the old constraint (machines_type_check)
-- Use DO block to handle if constraint doesn't exist
DO $$
BEGIN
  -- Try to drop the existing CHECK constraint on type
  ALTER TABLE public.machines DROP CONSTRAINT IF EXISTS machines_type_check;
EXCEPTION
  WHEN undefined_object THEN
    NULL; -- Constraint doesn't exist, continue
END $$;

-- Add new expanded constraint
ALTER TABLE public.machines
  ADD CONSTRAINT machines_type_check
    CHECK (type IN ('treadmill', 'bike', 'elliptical', 'weight'));

-- 6. Backfill: set ble_protocol for machines that have sensor_id (likely Magene)
UPDATE public.machines
SET ble_protocol = 'magene'
WHERE sensor_id IS NOT NULL
  AND ble_protocol IS NULL;

-- 7. Indexes
CREATE INDEX IF NOT EXISTS idx_machines_ble_protocol ON public.machines(ble_protocol);
CREATE INDEX IF NOT EXISTS idx_machines_zone ON public.machines(zone);

-- 8. Comments
COMMENT ON COLUMN public.machines.ble_protocol IS 'BLE protocol used by this machine: ftms (standard gym equipment), fitshow (Chinese brands), magene (speed/cadence sensors), ksfit (NPE Runn)';
COMMENT ON COLUMN public.machines.protocol_verified IS 'True if BLE protocol has been tested and confirmed working via Web Bluetooth or mobile pairing';
COMMENT ON COLUMN public.machines.zone IS 'Physical zone/area in the gym (e.g., "Cardio Floor", "Weight Room", "Studio A")';
COMMENT ON COLUMN public.machines.registered_by IS 'User who registered this machine (superadmin or gym_owner)';
COMMENT ON COLUMN public.machines.registered_at IS 'When this machine was registered/paired';
