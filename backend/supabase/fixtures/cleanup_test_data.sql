-- Deterministic cleanup for SWEATDROP test fixtures
-- Safe to run multiple times.

BEGIN;

DELETE FROM public.redemptions
WHERE id IN ('70000000-0000-0000-0000-000000000001');

DELETE FROM public.rewards
WHERE id IN (
  '60000000-0000-0000-0000-000000000001',
  '60000000-0000-0000-0000-000000000002'
);

DELETE FROM public.sessions
WHERE id IN (
  '50000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000002'
);

DO $$
BEGIN
  IF to_regclass('public.checkins') IS NOT NULL THEN
    DELETE FROM public.checkins
    WHERE id IN (
      '80000000-0000-0000-0000-000000000001',
      '80000000-0000-0000-0000-000000000002'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.fraud_events') IS NOT NULL THEN
    DELETE FROM public.fraud_events
    WHERE id = '90000000-0000-0000-0000-000000000001';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.user_device_fingerprints') IS NOT NULL THEN
    DELETE FROM public.user_device_fingerprints
    WHERE user_id = '20000000-0000-0000-0000-000000000001'
      AND device_hash = 'fixture-device-hash-001';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.machines') IS NOT NULL THEN
    DELETE FROM public.machines
    WHERE id = '40000000-0000-0000-0000-000000000001';
  ELSIF to_regclass('public.equipment') IS NOT NULL THEN
    DELETE FROM public.equipment
    WHERE id = '40000000-0000-0000-0000-000000000001';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.gym_memberships') IS NOT NULL THEN
    DELETE FROM public.gym_memberships
    WHERE id IN (
      '30000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000002'
    );
  END IF;
END $$;

DELETE FROM public.profiles
WHERE id IN (
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002'
);

DELETE FROM public.gyms
WHERE id = '10000000-0000-0000-0000-000000000001';

COMMIT;
