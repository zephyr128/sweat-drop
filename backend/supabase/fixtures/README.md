# SWEATDROP Test Fixtures

This folder contains deterministic, idempotent SQL fixtures for local and CI test runs.

## Files

- `seed_test_data.sql`: inserts baseline test data for anti-abuse and economy flows.
- `cleanup_test_data.sql`: removes the deterministic records inserted by seed.

Utility commands from repo root:

- `pnpm test:fixtures:reset`
- `pnpm test:fixtures:seed`

## Determinism

- Fixed UUIDs are used for gym, users, machine/equipment, session, reward, redemption, and check-in rows.
- Fixed UTC timestamps are used to avoid flaky time-based behavior.

## Idempotency

- `seed_test_data.sql` uses `ON CONFLICT` where possible.
- `cleanup_test_data.sql` can be run repeatedly and safely.

## Scope Covered

- gyms, users/profiles, memberships
- machines/equipment + lock ownership signals
- sessions (valid + suspicious)
- rewards/redemptions with limits scenarios
- check-ins (strict/lenient style examples)
- anti-abuse telemetry (`fraud_events`, `user_device_fingerprints`) when tables exist
