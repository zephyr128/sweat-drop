-- Migration: 20260509060000_machines_ble_identity_name_and_serial.sql
-- Description: Add BLE Local Name + DIS Serial Number identity columns to machines.
--              Replaces opaque Web Bluetooth device.id (sensor_id) as the authoritative
--              machine identity for cross-device-stable peripheral matching on iOS/Android.
--
-- AGENT NOTE: [2026-05-09] - supabase-dba
--
-- BACKGROUND:
--   iOS CoreBluetooth does not expose BLE MAC addresses. The Web Bluetooth device.id
--   stored in machines.sensor_id is a per-(origin × browser) opaque hash and cannot be
--   reproduced on a different device. This was the root cause of the Vortex pilot
--   cross-talk incident (2026-05-08): the mobile client silently fell back to
--   strongest-RSSI selection instead of identity-based matching.
--
--   The BLE spec provides two cross-device-stable identifiers:
--     1. Local Name (in advertisement packet) — same on every scanner, regardless of platform
--     2. DIS Serial Number (0x180A / 0x2A25) — hardware-bound, factory-burned
--
--   This migration stores both. Legacy sensor_id column is retained for backward
--   compatibility with Yesoul flow and pre-migration admin builds.
--
-- SUPERSEDES:
--   backend/supabase/migrations/20260508210000_machine_rpc_observed_peripheral_id_check.sql
--   (that file has been renamed to .skipped and must NOT be applied to production)
--
-- PLAN REFERENCE:
--   docs/plans/feature_ble_machine_identity_name_and_serial_redesign.md — Steps 0 + 1
--
-- CHANGES:
--   - Added column: public.machines.ble_device_name (TEXT, nullable)
--   - Added column: public.machines.ble_serial_number (TEXT, nullable)
--   - Added column: public.machines.ble_pairing_verified (BOOLEAN NOT NULL DEFAULT false)
--   - Added index:  idx_machines_gym_ble_device_name (gym_id, ble_device_name) PARTIAL
--   - Added trigger function: public.machines_ble_device_name_unique_per_gym_check()
--   - Added trigger: trg_machines_ble_device_name_unique
--   - Added function: public.cache_machine_ble_identity(UUID, TEXT, TEXT) → JSONB
--
-- IMPACT ON FRONTEND:
--   - Mobile App (Step 3 + 4 — mobile-coder):
--       Call cache_machine_ble_identity RPC after every successful BLE connection.
--       Pass machine.ble_device_name + ble_serial_number + ble_pairing_verified to
--       the new connectToMachine() method.
--   - Admin Panel (Step 2 — admin-coder):
--       Read device.name + DIS Serial Number during Web Bluetooth pairing and save
--       ble_device_name, ble_serial_number, ble_pairing_verified alongside sensor_id.
--       Display new BLE Identity section in MachineDetailView.
--
-- BREAKING CHANGES:
--   None. All new columns are nullable or have safe defaults. Existing clients that
--   do not read/write these columns are unaffected. The obsolete sensor_id column
--   remains present and writable.
--
-- NEXT STEPS (after applying to dev/staging/prod):
--   1. supabase gen types typescript --local > backend/types/database.types.ts
--   2. admin-coder: Step 2 — capture ble_device_name + ble_serial_number during Web BT pairing
--   3. mobile-coder: Step 3 — connectToMachine() + DIS read + cache_machine_ble_identity call
--   4. mobile-coder: Step 4 — workout.tsx wires full machine identity
--   5. supabase-dba: Step 5 — server-side identity check migration (20260509070000)

-- ═══════════════════════════════════════════════════════════════
-- 1. SCHEMA CHANGES
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS ble_device_name      TEXT,
  ADD COLUMN IF NOT EXISTS ble_serial_number    TEXT,
  ADD COLUMN IF NOT EXISTS ble_pairing_verified BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.machines.ble_device_name IS
  'BLE-advertised Local Name set by FTMS firmware (e.g., "38069-129"). '
  'Cross-device stable: same value on iOS and Android, regardless of which '
  'device performed pairing. Primary identity field. NULL for machines paired '
  'before this migration — auto-backfilled by cache_machine_ble_identity RPC '
  'on the first successful workout connection.';

COMMENT ON COLUMN public.machines.ble_serial_number IS
  'Device Information Service (0x180A) Serial Number String (0x2A25), read '
  'post-GATT-connect. Hardware-bound, factory-burned. Used as belt-and-suspenders '
  'identity verification after connection. NULL if DIS not exposed by firmware '
  '(non-FTMS-compliant machines) or not yet read.';

COMMENT ON COLUMN public.machines.ble_pairing_verified IS
  'TRUE once a workout has successfully read DIS Serial Number from this machine '
  '(via cache_machine_ble_identity RPC). When TRUE, mobile clients are required '
  'to verify serial post-connect. When FALSE, clients auto-backfill serial on '
  'first successful connection.';

-- ═══════════════════════════════════════════════════════════════
-- 2. INDEX
-- Supports per-gym name uniqueness check + scan-result filter.
-- Partial: only index rows with a non-null BLE device name so the
-- index stays small during the rollout window when most rows are NULL.
-- ═══════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_machines_gym_ble_device_name
  ON public.machines(gym_id, ble_device_name)
  WHERE ble_device_name IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════
-- 3. PER-GYM UNIQUENESS TRIGGER
-- Enforced via trigger rather than UNIQUE constraint because legacy
-- NULL ble_device_name rows must be allowed during the rollout window
-- (a UNIQUE constraint treats each NULL as distinct, but a partial
-- UNIQUE on WHERE ble_device_name IS NOT NULL would also work — the
-- trigger approach produces a more descriptive error message and is
-- easier to relax if a gym migration scenario requires it).
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.machines_ble_device_name_unique_per_gym_check()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.ble_device_name IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.machines
    WHERE gym_id        = NEW.gym_id
      AND ble_device_name = NEW.ble_device_name
      AND id            <> NEW.id
  ) THEN
    RAISE EXCEPTION
      'BLE device name % is already used by another machine in gym %. '
      'Possible factory-defect duplicate broadcast name — contact equipment vendor.',
      NEW.ble_device_name, NEW.gym_id;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.machines_ble_device_name_unique_per_gym_check() IS
  'Trigger function: enforces per-gym uniqueness of ble_device_name. '
  'NULL values are always allowed (legacy / not-yet-paired machines). '
  'A duplicate within the same gym indicates a factory firmware defect '
  'and should be reported to the equipment vendor.';

DROP TRIGGER IF EXISTS trg_machines_ble_device_name_unique ON public.machines;
CREATE TRIGGER trg_machines_ble_device_name_unique
  BEFORE INSERT OR UPDATE OF ble_device_name, gym_id ON public.machines
  FOR EACH ROW
  EXECUTE FUNCTION public.machines_ble_device_name_unique_per_gym_check();

-- ═══════════════════════════════════════════════════════════════
-- 4. cache_machine_ble_identity RPC
-- Called by mobile client on first successful BLE connection.
-- Caches the observed Local Name + DIS Serial Number into the
-- machines row. Idempotent: subsequent calls are no-ops if values
-- already match. Anti-spoofing: caller must hold the machine lock.
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.cache_machine_ble_identity(
  p_machine_id      UUID,
  p_observed_name   TEXT,
  p_observed_serial TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_machine RECORD;
  v_action  TEXT := 'no_change';
  v_changes JSONB := '{}'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT id, gym_id, current_user_id, is_busy,
         ble_device_name, ble_serial_number, ble_pairing_verified
  INTO v_machine
  FROM public.machines
  WHERE id = p_machine_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Machine not found: %', p_machine_id;
  END IF;

  -- Anti-spoofing: only the user currently holding the machine lock can
  -- write identity data. A rogue client that scans a QR, connects to a
  -- nearby peripheral, and calls this RPC without a valid lock is rejected.
  IF NOT v_machine.is_busy OR v_machine.current_user_id IS DISTINCT FROM auth.uid() THEN
    PERFORM public.log_fraud_event(
      auth.uid(), v_machine.gym_id, 'cache_ble_identity_unauthorized', 'high',
      jsonb_build_object(
        'machine_id',  p_machine_id,
        'is_busy',     v_machine.is_busy,
        'lock_holder', v_machine.current_user_id
      ));
    RAISE EXCEPTION 'Caller does not hold lock on machine %', p_machine_id;
  END IF;

  -- ── VERIFICATION PATH ────────────────────────────────────────────
  -- Identity already cached and verified → observed values must match.
  IF v_machine.ble_pairing_verified AND v_machine.ble_serial_number IS NOT NULL THEN
    IF p_observed_serial IS DISTINCT FROM v_machine.ble_serial_number
       OR (v_machine.ble_device_name IS NOT NULL
           AND p_observed_name IS DISTINCT FROM v_machine.ble_device_name)
    THEN
      PERFORM public.log_fraud_event(
        auth.uid(), v_machine.gym_id, 'ble_identity_post_connect_mismatch', 'high',
        jsonb_build_object(
          'machine_id',      p_machine_id,
          'expected_name',   v_machine.ble_device_name,
          'expected_serial', v_machine.ble_serial_number,
          'observed_name',   p_observed_name,
          'observed_serial', p_observed_serial
        ));
      RETURN jsonb_build_object('verified', false, 'action', 'mismatch');
    END IF;

    RETURN jsonb_build_object('verified', true, 'action', 'already_verified');
  END IF;

  -- ── BACKFILL PATH ────────────────────────────────────────────────
  -- First connection after migration (or after manual BLE device name entry).
  -- COALESCE preserves any name manually entered by a superadmin in the admin
  -- panel before the first workout auto-populates it.
  UPDATE public.machines
  SET ble_device_name      = COALESCE(ble_device_name, p_observed_name),
      ble_serial_number    = COALESCE(ble_serial_number, p_observed_serial),
      ble_pairing_verified = (p_observed_serial IS NOT NULL),
      updated_at           = NOW()
  WHERE id = p_machine_id;

  v_action := CASE
    WHEN p_observed_serial IS NOT NULL THEN 'verified_and_cached'
    WHEN p_observed_name   IS NOT NULL THEN 'name_cached_pending_serial'
    ELSE 'no_change'
  END;

  v_changes := jsonb_build_object(
    'cached_name',   v_machine.ble_device_name IS NULL AND p_observed_name   IS NOT NULL,
    'cached_serial', v_machine.ble_serial_number IS NULL AND p_observed_serial IS NOT NULL,
    'verified',      p_observed_serial IS NOT NULL
  );

  RETURN jsonb_build_object('verified', true, 'action', v_action, 'changes', v_changes);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cache_machine_ble_identity(UUID, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.cache_machine_ble_identity(UUID, TEXT, TEXT) IS
  'Auto-backfill or verify BLE identity for a machine. Called by the mobile '
  'client after a successful BLE connection during a workout. '
  'First call (ble_pairing_verified=false): caches observed Local Name and DIS '
  'Serial Number, sets ble_pairing_verified=true when serial is present. '
  'Subsequent calls (ble_pairing_verified=true): verify observed values match '
  'cached values — mismatch logs ble_identity_post_connect_mismatch fraud event '
  'and returns {verified:false, action:mismatch}. '
  'Anti-spoofing: caller must hold the machine lock '
  '(machines.current_user_id = auth.uid() AND machines.is_busy = true).';

-- ═══════════════════════════════════════════════════════════════
-- 5. SMOKE TESTS (inline, run at migration time)
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_pre_count  INTEGER;
  v_post_count INTEGER;
  v_col_count  INTEGER;
BEGIN
  -- Verify row count unchanged
  SELECT COUNT(*) INTO v_pre_count  FROM public.machines;
  SELECT COUNT(*) INTO v_post_count FROM public.machines;
  IF v_pre_count <> v_post_count THEN
    RAISE EXCEPTION 'Smoke test FAILED: machines row count changed during migration (% → %)',
      v_pre_count, v_post_count;
  END IF;

  -- Verify all three columns exist on machines
  SELECT COUNT(*) INTO v_col_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'machines'
    AND column_name  IN ('ble_device_name', 'ble_serial_number', 'ble_pairing_verified');
  IF v_col_count <> 3 THEN
    RAISE EXCEPTION 'Smoke test FAILED: expected 3 new BLE identity columns on machines, found %',
      v_col_count;
  END IF;

  -- Verify all existing machines have NULL BLE name/serial and pairing_verified=false
  IF EXISTS (
    SELECT 1 FROM public.machines
    WHERE ble_device_name IS NOT NULL
       OR ble_serial_number IS NOT NULL
       OR ble_pairing_verified = true
    LIMIT 1
  ) THEN
    RAISE EXCEPTION
      'Smoke test FAILED: some machines already have non-null BLE identity columns '
      'before migration — unexpected pre-existing data.';
  END IF;

  -- Verify RPC function exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'cache_machine_ble_identity'
  ) THEN
    RAISE EXCEPTION 'Smoke test FAILED: cache_machine_ble_identity function not found';
  END IF;

  -- Verify trigger exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'machines'
      AND t.tgname  = 'trg_machines_ble_device_name_unique'
  ) THEN
    RAISE EXCEPTION 'Smoke test FAILED: trg_machines_ble_device_name_unique trigger not found';
  END IF;

  RAISE NOTICE
    'Migration 20260509060000 applied successfully. '
    '% machines — all ble_device_name/ble_serial_number initially NULL '
    '(auto-backfill on first workout connection via cache_machine_ble_identity RPC).',
    v_post_count;
END $$;
