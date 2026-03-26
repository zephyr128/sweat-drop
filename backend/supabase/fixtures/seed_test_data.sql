-- Deterministic test seed fixtures for SWEATDROP
-- Safe to run multiple times.

BEGIN;

-- 1) Gym baseline
INSERT INTO public.gyms (id, name, city, country, address, created_at, updated_at)
VALUES (
  '10000000-0000-0000-0000-000000000001',
  'Test Gym One',
  'Belgrade',
  'RS',
  'Test Address 1',
  '2026-01-01T09:00:00Z',
  '2026-01-01T09:00:00Z'
)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  updated_at = EXCLUDED.updated_at;

-- 2) Profiles baseline
INSERT INTO public.profiles (id, email, username, full_name, home_gym_id, total_drops, created_at, updated_at)
VALUES
  (
    '20000000-0000-0000-0000-000000000001',
    'fixture-user-1@sweatdrop.test',
    'fixture_user_1',
    'Fixture User One',
    '10000000-0000-0000-0000-000000000001',
    1200,
    '2026-01-01T09:00:00Z',
    '2026-01-01T09:00:00Z'
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    'fixture-user-2@sweatdrop.test',
    'fixture_user_2',
    'Fixture User Two',
    '10000000-0000-0000-0000-000000000001',
    300,
    '2026-01-01T09:00:00Z',
    '2026-01-01T09:00:00Z'
  )
ON CONFLICT (id) DO UPDATE
SET
  username = EXCLUDED.username,
  total_drops = EXCLUDED.total_drops,
  updated_at = EXCLUDED.updated_at;

-- 3) Membership baseline (if table exists in current schema)
DO $$
BEGIN
  IF to_regclass('public.gym_memberships') IS NOT NULL THEN
    INSERT INTO public.gym_memberships (id, gym_id, user_id, role, local_drops_balance, created_at, updated_at)
    VALUES
      (
        '30000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000001',
        '20000000-0000-0000-0000-000000000001',
        'member',
        800,
        '2026-01-01T09:00:00Z',
        '2026-01-01T09:00:00Z'
      ),
      (
        '30000000-0000-0000-0000-000000000002',
        '10000000-0000-0000-0000-000000000001',
        '20000000-0000-0000-0000-000000000002',
        'member',
        150,
        '2026-01-01T09:00:00Z',
        '2026-01-01T09:00:00Z'
      )
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- 4) Machine/equipment baseline (supports both legacy and newer table names)
DO $$
BEGIN
  IF to_regclass('public.machines') IS NOT NULL THEN
    INSERT INTO public.machines (id, gym_id, name, type, unique_qr_code, is_active, created_at, updated_at)
    VALUES (
      '40000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      'Fixture Treadmill',
      'treadmill',
      'FIXTURE-QR-001',
      true,
      '2026-01-01T09:00:00Z',
      '2026-01-01T09:00:00Z'
    )
    ON CONFLICT (id) DO NOTHING;
  ELSIF to_regclass('public.equipment') IS NOT NULL THEN
    INSERT INTO public.equipment (id, gym_id, name, qr_code, equipment_type, is_active, created_at, updated_at)
    VALUES (
      '40000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      'Fixture Treadmill',
      'FIXTURE-QR-001',
      'treadmill',
      true,
      '2026-01-01T09:00:00Z',
      '2026-01-01T09:00:00Z'
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- 5) Session fixtures (valid + suspicious candidate)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sessions'
      AND column_name = 'machine_id'
  ) THEN
    INSERT INTO public.sessions (
      id,
      user_id,
      gym_id,
      machine_id,
      started_at,
      ended_at,
      duration_seconds,
      drops_earned,
      is_active,
      created_at,
      updated_at
    )
    VALUES
      (
        '50000000-0000-0000-0000-000000000001',
        '20000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000001',
        '40000000-0000-0000-0000-000000000001',
        '2026-01-10T10:00:00Z',
        '2026-01-10T10:45:00Z',
        2700,
        120,
        false,
        '2026-01-10T10:00:00Z',
        '2026-01-10T10:45:00Z'
      ),
      (
        '50000000-0000-0000-0000-000000000002',
        '20000000-0000-0000-0000-000000000002',
        '10000000-0000-0000-0000-000000000001',
        '40000000-0000-0000-0000-000000000001',
        '2026-01-10T11:00:00Z',
        NULL,
        NULL,
        0,
        true,
        '2026-01-10T11:00:00Z',
        '2026-01-10T11:00:00Z'
      )
    ON CONFLICT (id) DO NOTHING;
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sessions'
      AND column_name = 'equipment_id'
  ) THEN
    INSERT INTO public.sessions (
      id,
      user_id,
      gym_id,
      equipment_id,
      started_at,
      ended_at,
      duration_seconds,
      drops_earned,
      is_active,
      created_at,
      updated_at
    )
    VALUES
      (
        '50000000-0000-0000-0000-000000000001',
        '20000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000001',
        '40000000-0000-0000-0000-000000000001',
        '2026-01-10T10:00:00Z',
        '2026-01-10T10:45:00Z',
        2700,
        120,
        false,
        '2026-01-10T10:00:00Z',
        '2026-01-10T10:45:00Z'
      ),
      (
        '50000000-0000-0000-0000-000000000002',
        '20000000-0000-0000-0000-000000000002',
        '10000000-0000-0000-0000-000000000001',
        '40000000-0000-0000-0000-000000000001',
        '2026-01-10T11:00:00Z',
        NULL,
        NULL,
        0,
        true,
        '2026-01-10T11:00:00Z',
        '2026-01-10T11:00:00Z'
      )
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- 6) Rewards + one pending redemption
INSERT INTO public.rewards (
  id,
  gym_id,
  name,
  description,
  reward_type,
  price_drops,
  stock,
  is_one_time,
  is_active,
  created_at,
  updated_at
)
VALUES
  (
    '60000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'Protein Shake',
    'Fixture limited reward',
    'consumable',
    100,
    20,
    false,
    true,
    '2026-01-10T09:00:00Z',
    '2026-01-10T09:00:00Z'
  ),
  (
    '60000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    'Towel',
    'Fixture once reward',
    'merch',
    250,
    5,
    true,
    true,
    '2026-01-10T09:00:00Z',
    '2026-01-10T09:00:00Z'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.redemptions (
  id,
  user_id,
  reward_id,
  gym_id,
  status,
  drops_spent,
  created_at,
  updated_at
)
VALUES (
  '70000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '60000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'pending',
  100,
  '2026-01-10T12:00:00Z',
  '2026-01-10T12:00:00Z'
)
ON CONFLICT (id) DO NOTHING;

-- 7) Check-in examples (strict/lenient tests consume these as deterministic rows)
DO $$
BEGIN
  IF to_regclass('public.checkins') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'checkins'
        AND column_name = 'checkin_date'
    ) THEN
    INSERT INTO public.checkins (
      id,
      user_id,
      gym_id,
      checkin_date,
      verified,
      verification_mode,
      latitude,
      longitude,
      created_at
    )
    VALUES
      (
        '80000000-0000-0000-0000-000000000001',
        '20000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000001',
        '2026-01-10',
        true,
        'strict',
        44.7866,
        20.4489,
        '2026-01-10T08:00:00Z'
      ),
      (
        '80000000-0000-0000-0000-000000000002',
        '20000000-0000-0000-0000-000000000002',
        '10000000-0000-0000-0000-000000000001',
        '2026-01-10',
        false,
        'lenient',
        NULL,
        NULL,
        '2026-01-10T08:10:00Z'
      )
    ON CONFLICT (id) DO NOTHING;
    END IF;
  END IF;
END $$;

-- 8) Anti-abuse telemetry seeds
DO $$
BEGIN
  IF to_regclass('public.fraud_events') IS NOT NULL THEN
    INSERT INTO public.fraud_events (
      id,
      user_id,
      gym_id,
      event_type,
      severity,
      metadata,
      created_at
    )
    VALUES (
      '90000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000002',
      '10000000-0000-0000-0000-000000000001',
      'concurrent_session_attempt',
      'high',
      '{"source":"fixture","note":"seeded suspicious event"}'::jsonb,
      '2026-01-10T11:05:00Z'
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.user_device_fingerprints') IS NOT NULL THEN
    INSERT INTO public.user_device_fingerprints (
      user_id,
      device_hash,
      first_seen_at,
      last_seen_at,
      is_trusted
    )
    VALUES (
      '20000000-0000-0000-0000-000000000001',
      'fixture-device-hash-001',
      '2026-01-10T09:59:00Z',
      '2026-01-10T12:00:00Z',
      true
    )
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

COMMIT;
