# Migration Notes

This file tracks database schema changes and their impact on frontend applications.

**Last Updated:** 2026-05-09 (BLE machine identity — name + serial architecture)

---

## [2026-05-09] - BLE machine identity — name + serial schema + RPC guards (Steps 1 + 5)

**Migration Files:**
- `backend/supabase/migrations/20260509060000_machines_ble_identity_name_and_serial.sql` (Step 1)
- `backend/supabase/migrations/20260509070000_machine_rpc_observed_ble_identity_check.sql` (Step 5)

**Supersedes / Replaces:**
- `backend/supabase/migrations/20260508210000_machine_rpc_observed_peripheral_id_check.sql` → **renamed to `.skipped`, NOT to be applied to production**

**Agent:** supabase-dba

**Plan / Trigger:** P0 architectural fix for Vortex pilot cross-talk root cause.
`machines.sensor_id` (Web Bluetooth opaque `device.id`) cannot be reproduced on iOS (CoreBluetooth hides MAC addresses) and is therefore useless as a cross-device identity. The correct identifiers are the BLE Local Name (advertised, cross-device-stable) and the DIS Serial Number (hardware-bound, read post-GATT-connect). Plan: `docs/plans/feature_ble_machine_identity_name_and_serial_redesign.md`.

---

### Migration 20260509060000 — Schema changes (Step 1)

**Changes (schema):**

- **`public.machines.ble_device_name TEXT`** (NEW, nullable)
  - BLE Local Name from advertisement packet (e.g., `"38069-129"`). Primary identity field.
  - Cross-device stable: same value on iOS, Android, and Web Bluetooth regardless of which device performed pairing.
  - NULL for all existing rows after migration (auto-backfilled on first workout connection via RPC).

- **`public.machines.ble_serial_number TEXT`** (NEW, nullable)
  - Device Information Service (0x180A) Serial Number String (0x2A25), read post-GATT-connect.
  - Hardware-bound, factory-burned. Belt-and-suspenders identity verification after connection.
  - NULL if DIS not exposed by firmware (non-FTMS-spec-compliant machines) or not yet read.

- **`public.machines.ble_pairing_verified BOOLEAN NOT NULL DEFAULT false`** (NEW)
  - TRUE once `cache_machine_ble_identity` has successfully cached a DIS Serial Number.
  - When TRUE: mobile clients must verify serial post-connect.
  - When FALSE: clients auto-backfill on first successful connection.

- **`idx_machines_gym_ble_device_name`** — partial index on `(gym_id, ble_device_name) WHERE ble_device_name IS NOT NULL`. Supports per-gym uniqueness check and scan-result filter.

- **`trg_machines_ble_device_name_unique` / `machines_ble_device_name_unique_per_gym_check()`** — trigger enforcing per-gym uniqueness of `ble_device_name`. NULL rows skipped (allowed during rollout). Duplicate within same gym raises descriptive exception (factory firmware defect indicator).

**Changes (functions):**

- **`public.cache_machine_ble_identity(p_machine_id UUID, p_observed_name TEXT, p_observed_serial TEXT) → JSONB`** (NEW)
  - Called by mobile client immediately after successful BLE connection during a workout.
  - Anti-spoofing: caller must hold the machine lock (`is_busy=true AND current_user_id=auth.uid()`). Non-lock callers → `cache_ble_identity_unauthorized` fraud event.
  - First call (not yet verified): caches observed Local Name + serial, sets `ble_pairing_verified=true` if serial present.
  - Subsequent calls (already verified): verifies observed values match cached → mismatch logs `ble_identity_post_connect_mismatch` fraud event, returns `{verified:false, action:'mismatch'}`.
  - Return shape: `{verified: boolean, action: 'no_change'|'name_cached_pending_serial'|'verified_and_cached'|'already_verified'|'mismatch', changes?: object}`
  - GRANT: `authenticated`

**Impact:**
- **Admin Panel (Step 2 — admin-coder REQUIRED):**
  - Capture `device.name` (→ `ble_device_name`) and DIS Serial Number (→ `ble_serial_number`) during Web Bluetooth pairing in `MachinesManager.tsx`.
  - Save alongside existing `sensor_id` in `updateMachine()` / `machine-actions.ts`.
  - Display new "BLE Identity" section in `MachineDetailView.tsx` with pairing verified badge.
- **Mobile App (Steps 3 + 4 — mobile-coder REQUIRED):**
  - Call `cache_machine_ble_identity` RPC after every successful BLE connection.
  - Pass `machine.ble_device_name`, `machine.ble_serial_number`, `machine.ble_pairing_verified` to new `connectToMachine()` method.
- **Admin Panel (Step 6 — admin-coder):**
  - Backfill UI for legacy machines with NULL `ble_device_name`.

**New fraud_event types:**
- `cache_ble_identity_unauthorized` (severity high) — cache RPC called by user not holding lock
- `ble_identity_post_connect_mismatch` (severity high) — cache RPC found mismatch on verified machine

**Breaking Changes:** None. All new columns are nullable or DEFAULT false. Existing clients unaffected.

**Rollback:**
```sql
ALTER TABLE public.machines
  DROP COLUMN IF EXISTS ble_device_name,
  DROP COLUMN IF EXISTS ble_serial_number,
  DROP COLUMN IF EXISTS ble_pairing_verified;
DROP TRIGGER IF EXISTS trg_machines_ble_device_name_unique ON public.machines;
DROP FUNCTION IF EXISTS public.machines_ble_device_name_unique_per_gym_check();
DROP FUNCTION IF EXISTS public.cache_machine_ble_identity(UUID, TEXT, TEXT);
DROP INDEX IF EXISTS idx_machines_gym_ble_device_name;
```

---

### Migration 20260509070000 — Server-side BLE identity guard (Step 5)

**Changes (functions):**

- **`public.ble_identity_matches_machine(p_observed_name TEXT, p_observed_serial TEXT, p_expected_name TEXT, p_expected_serial TEXT, p_pairing_verified BOOLEAN) → BOOLEAN`** (NEW, IMMUTABLE)
  - Fail-open when both observed values are NULL (old mobile builds).
  - Strict mode (pairing_verified=true): serial match is primary truth; name is fallback if serial absent.
  - Loose mode (pairing_verified=false, name only): name match required.
  - Legacy mode (no expected name): fail-open (machine predates migration, will auto-backfill).

- **`public.update_machine_heartbeat(p_machine_id UUID, p_user_id UUID, p_observed_name TEXT DEFAULT NULL, p_observed_serial TEXT DEFAULT NULL) → BOOLEAN`** (UPDATED)
  - New optional params `p_observed_name`, `p_observed_serial`.
  - On mismatch: logs `ble_identity_server_mismatch` (severity high), sets `sessions.raw_metrics.security.ble_identity_mismatch = "true"`, returns FALSE without extending heartbeat.
  - NULL observed → no check → backward-compatible with old builds.

- **`public.update_machine_rpm(p_machine_id UUID, p_user_id UUID, p_rpm INTEGER, p_observed_name TEXT DEFAULT NULL, p_observed_serial TEXT DEFAULT NULL) → BOOLEAN`** (UPDATED)
  - Same as heartbeat. Mismatch prevents `machines.last_rpm` from being overwritten with cross-talk data.

- **`public.award_drops(p_session_id UUID) → TABLE(...)` (UPDATED)**
  - New early-exit guard: if `sessions.raw_metrics.security.ble_identity_mismatch = "true"`, awards 0 drops, logs `drops_zeroed_ble_identity_mismatch` (severity high), finalises session, returns `(0, 1.0, [])`.
  - All other behavior (per-gym caps, soft tiers, happy-hour, leaderboard upsert, side-effects) is byte-identical to `20260425182000_award_drops_per_gym_caps.sql`.
  - Function signature unchanged — purely additive guard.

**Impact:**
- **Mobile App (Step 4 — workout.tsx — mobile-coder REQUIRED):**
  - Pass `p_observed_name: bleService.getConnectedDeviceName()` and `p_observed_serial: bleService.getConnectedSerialNumber()` in every `supabase.rpc('update_machine_heartbeat', ...)` and `supabase.rpc('update_machine_rpm', ...)` call.
- **Admin Panel:** No change.

**New fraud_event types:**
- `ble_identity_server_mismatch` (severity high) — fires per heartbeat/RPM call when mismatch detected
- `drops_zeroed_ble_identity_mismatch` (severity high) — fires once per compromised session at award_drops

**Breaking Changes:** None. NULL observed values fail-open. Older mobile builds unaffected.

**Rollback (Step 5 only):**
Re-apply function bodies from `20260324000014_fraud_events_and_logging.sql` (heartbeat, rpm) and `20260425182000_award_drops_per_gym_caps.sql` (award_drops).
```sql
DROP FUNCTION IF EXISTS public.ble_identity_matches_machine(TEXT, TEXT, TEXT, TEXT, BOOLEAN);
```

---

## [2026-05-08] - BLE peripheral identity check in RPC functions — ⚠️ SKIPPED / SUPERSEDED

**Migration File:**
- `backend/supabase/migrations/20260508210000_machine_rpc_observed_peripheral_id_check.sql.skipped`
- **This file was renamed to `.skipped` and must NOT be applied to production.**
- It is superseded by `20260509060000` + `20260509070000` above.

The original approach compared the opaque Web Bluetooth `device.id` hash (stored as `sensor_id`) via `peripheral_id_matches_sensor()`. This approach is architecturally invalid on iOS because `CBPeripheral.identifier` is per-(device × app-install) and cannot match the Web Bluetooth hash from admin pairing on a different device or browser. The new approach uses BLE Local Name + DIS Serial Number, which are cross-device-stable per the BLE specification.

---

## [2026-05-08] - BLE peripheral identity check in RPC functions — cross-talk defence

**Migration File:**
- `backend/supabase/migrations/20260508210000_machine_rpc_observed_peripheral_id_check.sql`

**Agent:** supabase-dba

**Plan / Trigger:** P0 production incident at Vortex pilot (2026-05-08): BLE service was silently connecting to the strongest-RSSI FTMS machine in range instead of verifying the discovered peripheral matches `machines.sensor_id`. With 9 side-by-side treadmills, this caused RPM/heartbeat data from a neighbouring machine to be written against the user's session, producing 305 fraud_events across 2 users and drops earned from another machine's metrics.

**Root Cause:**
`apps/mobile-app/lib/ble-service.ts` (base64 branch) sorted scan results by RSSI and connected to the top device without validating `device.id` or `device.name` against `sensorId`. The "strongest-signal-wins" logic is safe only when one FTMS machine is powered on in range; in Vortex with 9 running treadmills, it deterministically picks the nearest neighbour's device.

**Changes (no schema changes — all are function updates):**

- **`public.peripheral_id_matches_sensor(p_observed TEXT, p_expected_sensor_id TEXT) → BOOLEAN`** (NEW)
  - Immutable helper. Normalises both inputs (strip separators, lowercase), then tries: exact string match, base64→hex decode of sensor_id, substring prefix match, reversed-byte hex. Returns `TRUE` for `NULL` inputs (backward compat / old builds).

- **`public.update_machine_heartbeat(p_machine_id, p_user_id, p_observed_peripheral_id TEXT DEFAULT NULL) → BOOLEAN`** (UPDATED)
  - New optional param `p_observed_peripheral_id`.
  - On mismatch: logs `peripheral_id_server_mismatch` (severity `high`) to `fraud_events`, sets `sessions.raw_metrics.security.peripheral_id_mismatch = 'true'` on the active session, returns `FALSE` without extending the heartbeat.
  - `NULL` → no peripheral check → identical to previous behaviour.

- **`public.update_machine_rpm(p_machine_id, p_user_id, p_rpm, p_observed_peripheral_id TEXT DEFAULT NULL) → BOOLEAN`** (UPDATED)
  - Same as heartbeat. On mismatch: logs event, flags session, returns `FALSE` without updating `machines.last_rpm`.

- **`public.award_drops(p_session_id UUID) → TABLE(...)` (UPDATED)**
  - New early-exit guard: if `sessions.raw_metrics #>> '{security,peripheral_id_mismatch}' = 'true'`, awards `0` drops, logs `drops_zeroed_peripheral_mismatch` (severity `high`), finalises the session (`is_active = false`), and returns `0 drops`. The machine lock is released so the user is not left stuck.

**Impact:**
- **Mobile App (REQUIRED CHANGE — Step 1 of same plan, mobile-coder):**
  - `apps/mobile-app/lib/ble-service.ts`: add `getConnectedPeripheralId(): string | null`
  - `apps/mobile-app/app/workout.tsx`: pass `p_observed_peripheral_id: bleService.getConnectedPeripheralId()` in every `supabase.rpc('update_machine_heartbeat', ...)` and `supabase.rpc('update_machine_rpm', ...)` call.
  - **Backward compatible:** old builds that omit the param pass `NULL` → no change.
- **Admin Panel:** no change.

**New fraud_event types (no schema change):**
- `peripheral_id_server_mismatch` — severity `high` — fires per heartbeat/RPM call when mismatch detected
- `drops_zeroed_peripheral_mismatch` — severity `high` — fires once per compromised session at award_drops

**Breaking Changes:** None. NULL observed_peripheral_id passes through unchanged.

**Rollback:**
Re-apply the previous function bodies from `20260324000014_fraud_events_and_logging.sql` (heartbeat, rpm) and `20260425182000_award_drops_per_gym_caps.sql` (award_drops). `peripheral_id_matches_sensor` can be dropped: `DROP FUNCTION IF EXISTS public.peripheral_id_matches_sensor(TEXT, TEXT);`

---

## [2026-05-08] - `profiles.expo_push_token_env` — push token environment isolation

**Migration File:**
- `backend/supabase/migrations/20260508140000_push_token_env_isolation.sql`

**Agent:** supabase-dba

**Plan / Trigger:** Production incident — dev `send-happy-hour-reminders` cron delivered a Vortex Happy Hour push to a phone running the **prod** build, surfacing `/gym-detail?gymId=<dev-uuid>` → "gym not found". Root cause: `profiles.expo_push_token` had no env tag, so any scheduler in any environment could send to any token row.

**Root Cause:**
1. `eas.json` development + production profiles both use the same `EXPO_PUBLIC_EAS_PROJECT_ID`, so dev and prod share an Expo push namespace.
2. `profiles.expo_push_token` stored a single opaque token string with no env metadata.
3. Dev DB seeded from prod inherited prod-issued tokens. Dev cron `send-happy-hour-reminders` read those rows and called Expo, which routed the push to whichever install owned the token (prod).
4. Prod app received a payload whose `gym_id` was authored against the dev DB → "gym not found".

**Changes:**
- `public.profiles` gains:
  - `expo_push_token_env       TEXT` with `CHECK (env IS NULL OR env IN ('production', 'preview', 'development'))`
  - `expo_push_token_bundle    TEXT` (diagnostic; senders do not branch on it)
  - `expo_push_token_updated_at TIMESTAMPTZ`
- Partial index `idx_profiles_push_token_env ON (expo_push_token_env) WHERE expo_push_token IS NOT NULL` — supports the per-send `IN (...)` lookup performed by `send-push`.
- One-shot backfill: `UPDATE profiles SET expo_push_token_env = 'production' WHERE expo_push_token IS NOT NULL AND expo_push_token_env IS NULL`. Mobile clients running a dev/preview build re-write the tag on next foreground sync (savePushToken now treats env mismatch as a write trigger).

**Impact:**
- **Mobile App (REQUIRED CHANGE — shipped in same release):**
  - `apps/mobile-app/app.config.js` exposes `appEnv` and `bundleId` via `Constants.expoConfig.extra`.
  - `apps/mobile-app/lib/notifications.ts`:
    - `savePushToken()` writes the three new columns and re-writes the row when the env tag has changed (not just the token string), so backfilled-as-`production` rows on dev/preview builds self-correct.
    - `clearPushToken()` clears all four columns.
    - `getDeepLinkFromNotification()` refuses to navigate when `data.app_env` differs from the install's `APP_ENV` — defense-in-depth against any token that slips past the server filter.
- **Backend (REQUIRED CHANGE — shipped in same release):**
  - `backend/supabase/functions/send-push/index.ts` reads `APP_ENV` Supabase function secret (default `'production'`), looks up `expo_push_token_env` for each input token, and drops env mismatches (counted as `skipped_env_mismatch` in the response body and structured logs). Stamps `data.app_env = APP_ENV` on every outbound Expo message and inbox row.
  - `backend/supabase/functions/_shared/expo-push.ts` — `compactSendPushMetrics` now surfaces `app_env` and `skipped_env_mismatch`.
- **Other schedulers** (happy-hour, streak, re-engagement, drops-expiry, finalize-arena, leaderboard-prizes, notify-arena-participants, send-prize-ready-push, process-campaigns) need NO changes — `send-push` is the single gate.
- **Operational:** Dev Supabase project MUST set the function secret `APP_ENV=development` (preview project: `'preview'`). Prod project can leave the default. See `docs/plans/production_env_split_dev_prod_runbook.md` §5a.
- **Admin Panel:** No change.

**Breaking Changes:**
- None for prod users (backfill = `'production'` matches the existing routing for prod-issued tokens).
- Dev DB tokens that were originally minted by prod are now correctly tagged `'production'` and will be skipped by dev cron once dev's `APP_ENV='development'` secret is set. Mobile clients running the actual dev build re-stamp their token to `'development'` on next foreground sync, restoring dev push delivery for them.

**Safety:**
- `APP_ENV` defaults to `'production'` in `send-push` — a project that forgets to configure the secret is treated as prod, never the reverse. Dev project explicitly opts in.
- Env lookup failure (DB error) is logged and falls open — a transient hiccup must not silently swallow legitimate prod sends. Sustained failures are visible in `event: send-push:env_lookup_error` logs.
- Mobile `APP_ENV` resolution falls back to `'production'` for the same reason. A misconfigured EAS profile cannot mistag a real prod build as dev.

**Rollback:**
```sql
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS expo_push_token_env,
  DROP COLUMN IF EXISTS expo_push_token_bundle,
  DROP COLUMN IF EXISTS expo_push_token_updated_at;
DROP INDEX IF EXISTS public.idx_profiles_push_token_env;
```
After rollback the next `send-push` deploy must also revert the env-filter block (it will fail open on the missing column lookup, so behavior degrades gracefully even pre-revert).

---

## [2026-05-07] - `cleanup_abandoned_sessions` — orphan active-session sweep

**Migration File:**
- `backend/supabase/migrations/20260507060000_cleanup_orphan_active_sessions.sql`

**Agent:** supabase-dba

**Plan / Trigger:** Production incident, Vortex gym (9 FTMS treadmills) — every scan failed with "Machine busy" while `machines.is_busy = false` for every treadmill.

**Root Cause:**
`start_session_safely()` refuses to create a new session whenever `public.sessions` has a row with `(machine_id = X, is_active = true)` — regardless of `machines.is_busy`. It returns `machine_busy` (different user) or `user_active_session_conflict` (same user). Both are mapped to the "Machine busy" modal in the mobile app (`apps/mobile-app/components/ScannerScreen.tsx`, `lib/qr/handleQrDeepLink.ts`).

The previous `cleanup_abandoned_sessions()` versions (`20260302000011` → `20260325000002` → `20260325000003` → `20260409200003`) iterate **only** over `machines WHERE is_busy = true`. When `unlock_machine()` succeeds but the corresponding session row never gets `is_active = false` (e.g. `award_drops()` failed earlier, app crashed mid-finalize, network timeout on the final sync, or the simulator-bypass insert path that intentionally writes `machine_id = NULL`), the session becomes a permanent orphan. No cron path can ever reach it. Every future scan against that machine — or every future scan attempted by that user — fails with "Machine busy" indefinitely.

**Changes:**
- `cleanup_abandoned_sessions()` rewritten with **two sweeps**:
  - **Sweep 1 (unchanged):** machines `WHERE is_busy = true` → existing inactivity / lock-starvation logic. Byte-identical to `20260409200003`.
  - **Sweep 2 (new):** `sessions WHERE is_active = true` AND the machine is no longer locked by this session's owner (`machine_id IS NULL` OR `m.is_busy = false` OR `m.current_user_id IS DISTINCT FROM s.user_id`) AND last activity is older than `GREATEST(gym.session_inactivity_autofinish_sec, 600)` (10-min hard floor). Closes via `finalize_inactive_session()` with reason `'orphan_session_cleanup'` so any earned drops are still awarded and a `fraud_events` audit row is logged.
- One-shot `DO $$ ... cleanup_abandoned_sessions() ... $$` block at the end of the migration so existing Vortex orphans heal at deploy time without waiting up to 5 minutes for the next pg_cron tick.

**Impact:**
- **Mobile App:** No client changes required. Stale `is_active = true` sessions self-heal within the next 5-min cron tick. The "Machine busy" deadlock no longer requires manual SQL intervention.
- **Admin Panel:** No change.
- **Cron schedule:** Unchanged (still `*/5 * * * *` via pg_cron job `cleanup-abandoned-sessions`).

**Breaking Changes:**
- None. Sweep 1 logic is byte-identical to `20260409200003`. Sweep 2 only closes sessions that are by definition already detached from any active machine lock and older than 10 minutes since last activity.

**Safety:**
- 10-minute hard floor in addition to gym policy threshold. A session mid-finalize (final sync + `award_drops()` round-trip) cannot exceed ~60s, so the floor guarantees we never close a session that is actually still resolving.
- `finalize_inactive_session()` is idempotent and `SECURITY DEFINER`; it impersonates the session owner via `set_config('request.jwt.claim.sub', ...)` to call `award_drops`, so legitimate orphans that earned drops still credit the user before closing.
- `SKIP LOCKED` on both sweeps — concurrent cron ticks cannot fight over the same row.
- Per-row sub-transaction with `EXCEPTION WHEN OTHERS THEN` fallback — a single problematic row can never poison the entire sweep.

**Rollback:**
```sql
-- Restore the prior (sweep-1-only) implementation by re-running migration 20260409200003.
-- No schema changes were introduced by this migration.
```

---

## [2026-05-06] - `machines.type` CHECK constraint — add `stepper`

**Migration File:**
- `backend/supabase/migrations/20260506204600_machines_type_add_stepper.sql`

**Agent:** supabase-dba

**Plan:** `docs/plans/feature_admin_machine_type_elliptical_stepper.md` (Step 5 — DB guardrail check)

**Root Cause:**
The `machines.type` column has had a CHECK constraint (`machines_type_check`) since the initial schema. The last expansion (`20260302000003`) set it to `('treadmill', 'bike', 'elliptical', 'weight')`. The value `'stepper'` was never added, so any INSERT or UPDATE with `type = 'stepper'` would fail with a constraint violation. `'elliptical'` was already allowed.

**Changes:**
- Dropped: `machines_type_check` constraint (previous allowed set: `treadmill, bike, elliptical, weight`)
- Re-added: `machines_type_check` with `('treadmill', 'bike', 'elliptical', 'weight', 'stepper')`
- Updated column comment on `public.machines.type`

**Impact:**
- **Admin Panel:** `admin-coder` can now proceed with Steps 1–4 (UI constants, Zod schema extension, label/icon map, QR compatibility). No other admin panel changes required from the DB side.
- **Mobile App:** No change. Mobile never INSERT/UPDATEs machines directly.
- **Drop calculation:** Already handles `stepper` — `drop_model_config.machine_type` CHECK (`20260325000004`) and `drop_activity_signal_guard` (`20260325000013`) both already include `stepper`.

**Breaking Changes:**
- None. Purely additive; all existing rows are unaffected.

**Rollback (pre-condition: no `stepper` rows exist):**
```sql
ALTER TABLE public.machines DROP CONSTRAINT IF EXISTS machines_type_check;
ALTER TABLE public.machines
  ADD CONSTRAINT machines_type_check
    CHECK (type IN ('treadmill', 'bike', 'elliptical', 'weight'));
```

**Next Steps:**
1. [x] Migration applied via `supabase db push`
2. [ ] admin-coder: Step 1 — add `MACHINE_TYPES` constants + label/icon map in admin panel
3. [ ] admin-coder: Step 2 — extend Zod schema in `machine-actions.ts` to include `elliptical | stepper`
4. [ ] admin-coder: Step 3 — update list/edit modal displays (map-based, all 4 types)
5. [ ] admin-coder: Step 4 — verify bike QR still appends `?s=csc`; elliptical/stepper do not

---

## [2026-04-27] - Demo Gym Visibility Gating (`gyms.is_demo_gym` + RPC patch)

**Migration Files:**
- `backend/supabase/migrations/20260427120000_gyms_is_demo_gym_and_rpc_demo_filter.sql`
- `backend/supabase/migrations/20260427121500_drop_get_public_gyms_for_mobile_2arg_overload.sql` (cleanup of legacy 2-arg overload)

**Agent:** supabase-dba

**Changes:**
- Added column `public.gyms.is_demo_gym BOOLEAN NOT NULL DEFAULT false`
- Added partial index `idx_gyms_is_demo_gym` (WHERE is_demo_gym = true)
- Added trigger function `enforce_gyms_is_demo_gym_superadmin_only()` — mirrors `profiles.is_demo` guard; only superadmin can flip the flag
- Added BEFORE UPDATE trigger `trg_gyms_guard_is_demo_gym_update` on `public.gyms`
- Dropped the legacy 2-arg overload `get_public_gyms_for_mobile(BOOLEAN, BOOLEAN)` from `20260328000002` (cleanup migration `20260427121500`) — without this, `CREATE OR REPLACE` of the new 1-arg version would not actually replace the prior version (different signatures = a second overload), causing ambiguity for `supabase.rpc('get_public_gyms_for_mobile')` calls without args.
- Replaced `get_public_gyms_for_mobile(BOOLEAN)` with a demo-aware version:
  - Return type widened from hand-listed `TABLE(...)` to `SETOF public.gyms` (all columns, backwards-compatible)
  - Demo gyms (`is_demo_gym = true`) now hidden from non-demo callers; visible only to `profiles.is_demo = true` users
  - Signature preserved: `p_pilot_only BOOLEAN DEFAULT false`
  - EXECUTE re-granted to `authenticated` and `anon`
- Data UPDATE: SweatDrop test gym → `is_demo_gym = true`, `is_mobile_listed = false`
  - WHERE clause: `name ILIKE 'sweatdrop gym%' AND COALESCE(is_demo_gym, false) = false`
  - If the SweatDrop test gym id needs to be referenced explicitly in future migrations, retrieve it via: `SELECT id, name FROM public.gyms WHERE is_demo_gym = true;`

**Impact:**
- **Mobile App:** `gyms.tsx` (already RPC-driven) — no change needed. `mobile-coder` must update `home.tsx` and `(onboarding)/home-gym.tsx` to switch from direct table queries to `supabase.rpc('get_public_gyms_for_mobile')` (Step 2 of plan).
- **Admin Panel:** No change required; admins see all gyms regardless of `is_demo_gym`.

**Breaking Changes:**
- None. Return shape of `get_public_gyms_for_mobile()` widens (every previously returned column is still present).

**Next Steps:**
1. [x] `supabase gen types typescript --linked > backend/types/database.types.ts` — done
2. [ ] mobile-coder: `apps/mobile-app/app/(onboarding)/home-gym.tsx` — switch to RPC (Step 2.1)
3. [ ] mobile-coder: `apps/mobile-app/app/home.tsx` (~L662) — switch to RPC (Step 2.2)
4. [ ] Verification: demo user sees SweatDrop gym in onboarding; non-demo user does not

---

## [2026-04-25] - `get_user_arena_result`: always return one row for finalized arenas

**Migrations**
- `20260425280000_get_user_arena_result_always_return_row_for_finalized.sql`

**Agents:** supabase-dba, mobile-coder

#### User-Reported Problem
> "Proveri zasto pise rezultati jos nisu dostupni za zavrsene arene"
> ("Check why it says results not yet available for finished arenas.")

The Decathlon arena on prod-v2 was finalized at 2026-04-25T00:30 UTC by
the `finalize-arena` cron, but had zero participants. Mobile rendered
the generic "Rezultati još nisu dostupni" placeholder, indistinguishable
from an arena still pending finalization.

#### Root Cause
The previous `get_user_arena_result` body:
```sql
FROM public.arena_results ar
WHERE ar.arena_id = p_arena_id
  AND ar.user_id  = p_user_id;
```
With no row in `arena_results` for the (arena, user) pair, the entire
result set was empty — including the `top_participants` subquery, which
was computed per-row. Two distinct UX states collapsed into the same
"no row" return: (a) arena still pending finalization, and (b) arena
finalized but the caller didn't participate (or nobody did). Mobile
treated both as state (a).

#### Fix
- Anchor on `public.sweat_arenas` with `LEFT JOIN` to `arena_results`
  and `redemptions`. The function now produces one row for every
  finalized arena; user-level columns are `NULL` when the caller has no
  result entry.
- `total_participants` and `top_participants` are always populated. A
  finalized arena with no participants legitimately returns
  `total_participants = 0` and `top_participants = []`.
- Non-finalized arenas continue to return zero rows by design — the
  mobile UI uses absence-of-row as the signal for "results pending".

#### Frontend Changes
- `apps/mobile-app/app/arena/[id]/index.tsx`:
  - `loadArenaResult` is now invoked for **every** ended arena, not only
    when the caller opted in. Non-participants now see the published
    leaderboard.
  - The ended-state branch was split into four sub-states:
    1. Ended + not finalized → "Results being calculated".
    2. Finalized + 0 participants → "Nobody joined this arena".
    3. Finalized + user did not participate → "DNP" copy + full
       leaderboard card.
    4. Finalized + user has a result → original personal-result panel.
  - The prizes card is now hidden only when the user has a personal
    result (state 4). For states 1-3 the prize list remains visible so
    people can see what was on the line.
- `apps/mobile-app/hooks/useAvailableArenas.ts`: `AvailableArena` gains
  `is_finalized: boolean` and `finalized_at: string | null` (the RPC has
  returned them since 2026-03-11).
- `apps/mobile-app/locales/{en,sr}/arena.json`: new keys
  `noParticipants`, `didNotParticipate`. Existing `noResults` re-copied
  from "Results not available yet" → "Results are being calculated" to
  match its actual meaning.

#### Verified Impact (prod-v2)
| Arena | State | RPC return | UI render |
| --- | --- | --- | --- |
| Decathlon (finalized, 0 participants) | (2) | one row, all-null user fields, `total_participants=0`, `top_participants=[]` | "Nobody joined this arena" |
| SweatDrop Arena (active, not finalized) | n/a | zero rows | n/a (active branch) |
| Hypothetical: finalized + 5 participants, caller didn't join | (3) | one row, user fields null, leaderboard array length 5 | "DNP" + leaderboard |

#### Breaking Changes
None. Function signature and column list unchanged. Existing callers
that read `final_rank` / `final_score` / `prize_description` already
treat them as nullable, so no client churn beyond the mobile detail
screen above.

---

## [2026-04-25] - `get_available_arenas`: stop hiding ended-but-not-finalized arenas

**Migrations**
- `20260425270000_get_available_arenas_show_ended_and_unfinalized.sql`

**Agents:** supabase-dba

#### User-Reported Problem
> "U adminu kao vlasnik teretane jasno vidim da je jedna arena live i jedna
> zavrsena za moju gym. Kada odem u app — nema nijedne arene. Nema aktivnih,
> nema zavrsenih. Ovo se desava na produkciji. Dodajem arene, ali se nijedna
> vise ne vidi u appu."

Translation: in admin, the gym owner sees one live and one finished arena;
mobile shows zero arenas. Reported on production.

#### Root Cause
`get_available_arenas`'s WHERE clause had two compounding date traps that
filtered arenas the admin still surfaces:

1. **Ended-but-not-finalized trap.** The predicate read:
   ```
   (is_finalized = false AND end_date >= CURRENT_DATE)
   OR (is_finalized = true  AND end_date >= CURRENT_DATE - 30d)
   ```
   An arena whose `end_date < today` but whose `is_finalized` is still
   `false` (because `finalize_arena()` runs only on superadmin click /
   future cron) fell through both branches. A brand-new arena that ended
   yesterday silently disappeared from the home carousel and arenas tab
   until somebody finalized it manually.
2. **30-day finalized window.** Even after `finalize_arena()` runs, the
   arena vanishes from mobile after 30 days. The admin keeps showing it
   indefinitely, so a gym whose only arenas finished >30 days ago shows
   zero arenas in mobile while the admin lists them — exactly the
   user-visible discrepancy.

#### Fix
- Replace the conditional date predicate with a single 90-day look-back:
  `sa.end_date >= CURRENT_DATE - INTERVAL '90 days'`.
- Keep `is_active = true` (admin can intentionally hide an arena).
- The status `CASE` already maps `end_date < today → 'ended'` regardless
  of `is_finalized`, so the existing mobile UI ("Ended" pill, finalized
  banner) keeps rendering correctly.
- Three-bucket ordering (upcoming → active → ended) preserved.

#### Verified Impact
| Gym | Before fix | After fix |
| --- | --- | --- |
| Vortex (1 active + 7 historical) | 3 arenas | 8 arenas |
| NSF Autokomanda (3 finalized >30d ago) | 0 arenas | 3 arenas |
| Play (3 finalized >30d ago) | 0 arenas | 3 arenas |
| Blok 45 (no arena_gyms link) | 0 (correct) | 0 (correct) |

#### Frontend Impact
- **Mobile App** — arenas tab and home carousel now match what gym owners
  see in the admin panel. No frontend code change required.
- **Admin Panel** — no change.

#### Breaking Changes
None. Function signature and return columns are unchanged. Legacy mobile
builds calling `get_available_arenas(p_user_id)` (single argument) keep
working — `p_gym_id` remains `DEFAULT NULL` and falls back to the
"any-gym membership" eligibility check.

---

## [2026-04-25] - Per-gym home dashboard: NULL gym_id backfill + stale-state hardening

**Migrations**
- `20260425260000_backfill_drops_transactions_gym_id.sql` (data-only)

**Agents:** supabase-dba, mobile-coder

#### User-Reported Problem
> "I dalje mi na home screenu pisu drops iz druge teretane. U gym 1 sam zaradio
> 56 drops + 30 bonus. Kada se prebacim u gym2 i dalje se vidi to, a treba da
> pise 0 jer u tom gymu 2 nisam nista ostvario. Isto to i za today u gauge."

Translation: home gauge / "+N bonus" pill keeps showing gym1's drops after the
user switches to gym2.

#### Root Cause (two compounding issues)
1. **Backend — legacy NULL `gym_id` on `drops_transactions`.**
   The deprecated `add_drops(p_user_id, p_gym_id, p_amount, …)` function
   (last revised in `20250127170000_fix_add_drops_session_date.sql`, fully
   dropped in `20260305000001_cleanup_unused_objects.sql`) accepted
   `p_gym_id` but **never** included it in the INSERT into
   `drops_transactions`. Every row it wrote — sessions, challenge rewards,
   refunds — got `gym_id = NULL`. After `20260425181000` added the per-gym
   filter `(p_gym_id IS NULL OR dt.gym_id = p_gym_id)` to
   `get_home_dashboard.week_drops`, those legacy rows became invisible on
   any specific gym (correct economically: an unattributable drop is not
   gym-spendable). But the user still perceived "drops follow me everywhere"
   because in environments where `20260425181000` had not been deployed,
   the RPC returned all rows regardless of gym.
2. **Frontend — `useHomeStats` / `useDropLimitStatus` / `useCompeteStats`
   kept the previous gym's data on the screen until the new gym's RPC
   resolved**, with no sentinel check on returning responses, so a slow
   reply from gym1 could overwrite gym2's just-loaded state.

#### Fixes
**Backend** (`20260425260000_backfill_drops_transactions_gym_id.sql`):
- Backfill `drops_transactions.gym_id` for legacy NULL rows by joining:
  - `sessions` for `transaction_type = 'session'`
  - `gym_checkins` (proximity match within ±2 min, single-candidate only) for `'checkin'`
  - `gym_challenges` for `'challenge'`
  - `arena_participants` (keyed on user_id + arena_id) for `'arena'`
  - `redemptions` for `'reward_claim'` / `'redemption'` / `'expired'` / `'refund'`
- Genuinely unattributable rows (e.g. `'bonus'` with deleted reference) are
  intentionally left NULL — the home dashboard correctly excludes them.
- Idempotent and safe to re-run.

**Mobile**
- `useHomeStats.ts`, `useDropLimitStatus.ts`, `useCompeteStats.ts`: added an
  `activeGymRef` sentinel that
  - resets state to empty/defaults the moment `gymId` changes (so the gauge
    flips to 0 instantly, no stale gym1 values during the RPC round-trip), and
  - drops in-flight responses whose `requestedGymId !== activeGymRef.current`
    (race-condition guard for rapid gym switches).

#### Deployment Required
- **Verify `20260425181000_home_dashboard_gym_filter_and_badge_drops_fix.sql`
  has been applied** to the target Supabase (`get_home_dashboard.week_drops`
  must include the `(p_gym_id IS NULL OR dt.gym_id = p_gym_id)` predicate).
  Without it, the per-gym view collapses back to "all drops everywhere".
- Apply `20260425260000_backfill_drops_transactions_gym_id.sql` to clean up
  any legacy NULL `gym_id` rows.
- Ship the mobile changes.

---

## How to Use This File

1. **supabase-dba:** Add entry after creating migration
2. **mobile-coder:** Read before starting mobile work
3. **admin-coder:** Read before starting admin work
4. **architect:** Read when planning new features

---

## Recent Migrations

### [2026-04-23] - Prod Hotfix #2: Android prod AAB leaking dev `EXPO_PUBLIC_DEV_QR_UUID`

**Migration:** _none (build-script + app-config change only)_

**Agent:** devops / mobile-coder

#### Observed Problem (QA, persistent)
After the COALESCE fix below was shipped, demo user on the **Android prod
AAB** still saw:

> Development machine with QR UUID `92e1ad0d-8a2a-4993-8b19-61244ab82164`
> not found. Please check DEV_QR_UUID in ScannerScreen.tsx

The **iOS prod IPA** (built through EAS Cloud using `eas.json` → `production`
profile) worked correctly for the same demo account. The UUID in the error
(`92e1…`) is a **dev-Supabase** machine — it does not exist in the prod DB,
so no SQL change could have ever fixed this.

#### Root Cause
Two-step leak specific to the local Android release pipeline
(`apps/mobile-app/scripts/build-android-release.sh --env prod`):

1. `apps/mobile-app/.env` (local, gitignored) contains
   `EXPO_PUBLIC_DEV_QR_UUID=92e1ad0d-…` for 5×-tap simulator convenience
   during dev. `.env.prod.local` correctly does **not** define it.
2. The build script sourced `.env.prod.local` into the shell and passed
   `EXPO_NO_DOTENV=1` **only** to `expo prebuild`. The later
   `./gradlew bundleRelease` step invokes Metro through `@expo/cli`, which
   re-reads `.env` from disk by default. `@expo/cli`'s dotenv loader uses
   _"existing env wins"_ — so `EXPO_PUBLIC_SUPABASE_URL` correctly stayed
   prod (already in shell), but `EXPO_PUBLIC_DEV_QR_UUID` (not in shell)
   got injected from `.env` into `process.env` and baked into the JS bundle
   by `babel-preset-expo`.
3. At runtime on the Android prod AAB, `useDemoMachine` sees the env var,
   short-circuits past `get_my_demo_machine()`, and `ScannerScreen` calls
   `get_machine_status('92e1…')` against the prod DB, where that row does
   not exist → `machineNotFound` / `devModeNotFound` modal.

iOS prod was unaffected because the iOS IPA is built via **EAS Cloud**,
which ignores local dotfiles and injects only the `eas.json` → `production`
env block (where `EXPO_PUBLIC_DEV_QR_UUID` is deliberately absent).

#### Changes
- `apps/mobile-app/scripts/build-android-release.sh`:
  - `export EXPO_NO_DOTENV=1` at the top of the script so **every** child
    process (prebuild, Metro inside gradle, expo-cli, etc.) skips on-disk
    `.env*` files. The shell env, sourced explicitly from `.env.prod.local`
    or `.env.dev.local`, becomes the single source of truth.
  - `unset EXPO_PUBLIC_DEV_QR_UUID` before sourcing the per-env file, in
    case the caller's interactive shell has it exported.
  - New prod safety guards that fail the build fast if:
    - `EXPO_PUBLIC_DEV_QR_UUID` is set while building prod;
    - `EXPO_PUBLIC_APP_ENV` ≠ `production`;
    - `EXPO_PUBLIC_SUPABASE_URL` does not match the known prod project ref.
- Android `versionCode` bumped (auto-incremented by the build script on the
  next run). The previous AAB (versionCode 29) must not be uploaded.

#### Impact on Frontend
- **Mobile App:** no source change required — the runtime code paths were
  already correct. Demo user on Android prod will now fall back to
  `get_my_demo_machine()` (the same path iOS was using), which returns the
  real prod demo machine and passes `get_machine_status()` cleanly.
- **Admin Panel:** no change.

#### Breaking Changes
None.

#### Deploy
1. Rebuild Android AAB: `cd apps/mobile-app && ./scripts/build-android-release.sh --env prod`.
2. Verify the guards printed `[build] Environment: PRODUCTION` and that no
   error about `EXPO_PUBLIC_DEV_QR_UUID` is printed.
3. Upload the new AAB to Play Console → Internal Testing.
4. QA on Android: sign in with demo account → 5× tap scan frame → Start →
   simulator session must launch without the "machine not found" modal.

---

### [2026-04-23] - Prod Hotfix: Demo Simulator "machine not found" on Android

**Migration:** `20260423230000_fix_get_machine_status_is_active_coalesce.sql`

**Agent:** supabase-dba

#### Observed Problem (QA)
Demo user on a production Android build taps the scan frame 5x, opens the
simulator modal, presses **Start** → mobile app shows "machine not found"
(localised `devModeNotFound`). The same demo account on iOS worked fine —
that device had previously activated the machine through the admin panel
(which set `is_active = true` explicitly), while the Android QA account's
demo machine row still had `is_active` at its column default (NULL).

#### Root Cause
Two RPCs were inconsistent about how they treat `machines.is_active`:

| RPC                      | Predicate                         | NULL result  |
|--------------------------|-----------------------------------|--------------|
| `get_my_demo_machine()`  | `COALESCE(m.is_active, true)=true`| **active**   |
| `get_machine_status()`   | `m.is_active = true`              | **inactive** |

`useDemoMachine` calls `get_my_demo_machine()` → gets the qr_uuid →
`startDevelopWorkout` calls `get_machine_status(qr_uuid)` → 0 rows →
ScannerScreen shows `machineNotFound` with `devModeNotFound` body. This is
entirely platform-agnostic; the "iOS works / Android broken" symptom was
just a coincidence of which account had which machine row.

#### Changes
- `get_machine_status()` rewritten to use `COALESCE(m.is_active, true) = true`,
  matching `get_my_demo_machine()` and the existing app-level semantics
  (machines default to "active" when the flag has not been explicitly set).
- Machines with `is_active = false` remain inaccessible (no regression).

#### Impact on Frontend
- **Mobile App:** Demo simulator flow now resolves the same machine in both
  RPCs. No client code change required (existing `ScannerScreen` + `useDemoMachine`
  paths work once the DB is fixed). Any future user-facing QR scan whose
  machine row had `is_active = NULL` will also start working.
- **Admin Panel:** No change.

#### Breaking Changes
None.

#### Deploy
```bash
cd backend && supabase db push
```

---

### [2026-04-23] - Prod Performance: Fold Home-Screen Queries into One RPC

**Migration:** `20260423220000_get_home_dashboard_rpc.sql`

**Agent:** supabase-dba

#### Changes
- New RPC: `public.get_home_dashboard(p_gym_id UUID DEFAULT NULL) RETURNS JSONB`
  (SECURITY DEFINER, STABLE).
- Returns a single JSON payload covering what previously required 7 round-trips:
  `profile` (streak/last_visit), `week_drops`, `last_session`,
  `local_drops_balance`, `rewards`, `active_redemptions`, `checkin_status`.
- Existing RPCs (`get_my_drops`, `get_my_sessions`, `get_my_redemptions`,
  `get_checkin_status`) are **unchanged** — they remain in use on other
  screens (`/transactions`, session history, leaderboard, etc.).

#### Impact on Frontend
- **Mobile App:** `useHomeStats.ts` rewritten to call `get_home_dashboard` once
  and derive all derived fields from the single payload. It additionally
  exposes `checkinStatus`, which `home.tsx` now reads instead of firing its
  own `get_checkin_status` call. Net effect on the home-screen mount:
  **7 supabase calls → 1**.
- **Admin Panel:** No change.

#### Breaking Changes
- None. Additive RPC; older mobile clients continue to work via the legacy
  multi-call path.

#### Verification
```sql
-- As an authenticated user (or via supabase.rpc in a dev client):
SELECT public.get_home_dashboard('<gym_uuid>');
-- Expect JSONB with keys: profile, week_drops, last_session,
--   local_drops_balance, rewards, active_redemptions, checkin_status
```

---

### [2026-04-23] - Prod Hotfix: Trim `supabase_realtime` Publication

**Migration:** `20260423210000_trim_realtime_hot_tables.sql`

**Agent:** supabase-dba

#### Observed Problem (pg_stat_statements on prod)
| query                    | calls  | mean_ms | max_ms  | %_total_time |
|--------------------------|--------|---------|---------|--------------|
| `realtime.list_changes`  | 31 996 | 7.3     | 10 228  | **35.57 %**  |

Realtime's WAL decoder was stalling for up to 10 seconds, and during each stall
every authenticated request queued behind it. Mobile clients saw this as
"timeouts to *.supabase.co" across the board. App RPCs themselves were healthy.

#### Changes
- `ALTER PUBLICATION supabase_realtime DROP TABLE public.drops_transactions`
- `ALTER PUBLICATION supabase_realtime DROP TABLE public.user_notifications`
- `public.user_badges` and `public.redemptions` **kept** in the publication
  (rare events, drive UX-critical toasts).
- Idempotent: guards with `pg_publication_tables` lookup, so safe to re-apply.

#### Impact on Frontend
- **Mobile App (coordinated commit):**
  - `home.tsx` / `wallet.tsx`: removed `useRealtimeRefresh({ table: 'drops_transactions', ... })`.
    Replaced with new `useForegroundRefresh` hook (AppState-based).
  - `useNotifications.ts`: removed both `user-notifications-inbox` and
    `unread-notif-badge` channels. Inbox refreshes on focus + foreground.
    Push notifications (APNS/FCM) already deliver real-time banners.
  - `useUserBadges.ts`: removed duplicate realtime channel;
    `useBadgeNotifications` is now the **single** subscriber on `user_badges`
    and fanout-updates `useUserBadges` via its `onBadgeEarned` callback.
- **Admin Panel:** No change.
- **Behavioural change:** drops balance / unread count updates now happen on
  screen focus or foreground resume (100–300 ms latency) instead of instantly.
  Previously, the realtime push had a worst-case latency of 500 ms – 10 s due
  to decoder stalls.

#### Breaking Changes
- None. Old mobile builds still open channels on these tables; the channels
  just receive no events. Those builds already include AppState / focus-based
  refresh paths.

#### Rollback
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.drops_transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_notifications;
```

#### Monitoring
Expect `realtime.list_changes` `prop_total_time` to drop from ~35 % to ~10 %
within 5 minutes of deploy.

---

### [2026-04-23] - Exclude Demo/Test Accounts from Global & Arena Leaderboards

**Migration:** `20260423200000_exclude_demo_users_from_global_and_arena_leaderboards.sql`

**Agent:** supabase-dba

#### Changes
- Patched `get_leaderboard()`: `'global'` and `'arena'` branches now filter `COALESCE(p.is_demo, false) = false`
- Seeded `is_demo = true` on all profiles who are members of SweatDrop test gym (`e247acc4-1c4b-4610-99c6-48f9964facad`)
- `'gym'` and `'challenge'` branches intentionally unchanged (already scope-isolated)
- Added `COMMENT ON FUNCTION` documenting demo-exclusion policy

#### Impact on Frontend
- **Mobile App:** Demo/test usernames no longer appear on Global or Arena leaderboard tabs. No code change needed.
- **Admin Panel:** No change.

#### Breaking Changes
- None

#### Operational Note
When provisioning new QA / Apple-review accounts, set `is_demo = true` immediately after signup.

---

### [2026-04-23] - Production Global Achievements — Tiered Category System (Phase 1)

**Migrations:**
- `20260423100000_add_tier_category_to_global_achievements.sql`
- `20260423100001_seed_production_global_achievements.sql`

**Agent:** supabase-dba

#### Changes
- Added `tier TEXT` column to `global_achievements` with CHECK constraint (`bronze | silver | gold | platinum | diamond`). Nullable — legacy rows unaffected.
- Added `category TEXT` column to `global_achievements` with CHECK constraint (`sessions | total_drops | streak | multi_gym | distance | special`). Nullable.
- Added composite index `idx_global_achievements_category_tier ON (category, tier) WHERE is_active = true` for mobile grouping query performance.
- Soft-deactivated 12 legacy seed achievements (`is_active = false`) — rows preserved for existing `user_badges` FK references.
- Seeded 25 production tiered achievements: 5 categories × 5 tiers (bronze → silver → gold → platinum → diamond).

#### Active Achievement Counts (after migration)
| Category    | Bronze | Silver | Gold | Platinum | Diamond |
|-------------|--------|--------|------|----------|---------|
| sessions    | 1      | 1      | 1    | 1        | 1       |
| total_drops | 1      | 1      | 1    | 1        | 1       |
| streak      | 1      | 1      | 1    | 1        | 1       |
| multi_gym   | 1      | 1      | 1    | 1        | 1       |
| distance    | 1      | 1      | 1    | 1        | 1       |
| **Total**   |        |        |      |          | **25**  |

#### Impact
- **Mobile App (Phase 3):** `TrophyRoom` must read `category` + `tier` to render the new grouped ladder layout. `BadgeCard` needs a `tier` prop for frame color. `useAllBadges` hook must include these fields. See `docs/plans/production_global_achievements_redesign_plan.md` Phase 3.
- **Admin Panel (Phase 4):** `AchievementsManager` should add Category/Tier selects and grouped list view with tier chips. "Show inactive" toggle to surface the 12 deactivated legacy rows. See plan Phase 4.

#### Breaking Changes
- **None.** Existing `user_badges` rows untouched. Legacy achievement rows soft-deactivated (not deleted). Old Trophy Room renders unchanged — it ignores `category`/`tier` columns gracefully.

#### Verification Queries
```sql
-- Should return 25
SELECT COUNT(*) FROM global_achievements WHERE is_active = true;

-- Should show 5 rows per category, 1 per tier
SELECT category, tier, COUNT(*) FROM global_achievements WHERE is_active = true GROUP BY 1, 2 ORDER BY 1, 2;

-- Legacy rows still present but inactive
SELECT code, is_active FROM global_achievements WHERE code IN ('first_workout', 'ten_sessions', 'multi_gym');
```

#### Next Steps
1. [ ] Phase 2: Upload 25 PNGs to `global-achievement-badges` bucket (`{code}-badge.png` per catalog)
2. [ ] Phase 3: mobile-coder — Trophy Room redesign with category/tier layout
3. [ ] Phase 4: admin-coder — AchievementsManager grouped view + tier chips

---

### [2026-04-21] - External Pilot Demo Gate (`profiles.is_demo` + demo machines)

**Migrations:**
- `20260421192713_profiles_is_demo_flag.sql`
- `20260421192714_get_my_profile_include_is_demo.sql`
- `20260421192715_get_my_profile_single_row_contract.sql`
- `20260421195628_machines_is_demo_machine_and_rpc.sql`

**Agent:** supabase-dba

#### Changes
- Added `public.profiles.is_demo BOOLEAN NOT NULL DEFAULT false`
- Added column comment describing reviewer/demo-only usage and anti-fraud intent
- Added partial index `idx_profiles_is_demo` (`WHERE is_demo = true`)
- Added update policy `profiles_is_demo_superadmin_only` using `public.is_superadmin(auth.uid())`
- Added trigger guard `trg_profiles_guard_is_demo_update` to block non-superadmin `is_demo` mutations while preserving regular self-profile updates
- Updated `public.get_my_profile()` to include `is_demo` while preserving single-row `RETURNS public.profiles` contract (non-array RPC response)
- Added `public.machines.is_demo_machine BOOLEAN NOT NULL DEFAULT false`
- Added partial index `idx_machines_is_demo_machine` (`WHERE is_demo_machine = true`)
- Added RPC `public.get_my_demo_machine()` (returns one eligible demo machine for demo users)

#### Impact
- **Mobile App:** Can gate simulator entry behind server-side `profiles.is_demo` and resolve simulator target via `get_my_demo_machine()`.
- **Admin Panel:** Superadmin can toggle demo users and mark demo-capable machines.

#### Breaking Changes
- None (additive schema + additive RPC output field)

#### Next Steps
1. [x] Pushed migrations to DEV, then to PROD.
2. [x] Regenerated database types to include `profiles.is_demo`, `machines.is_demo_machine`, `get_my_profile.is_demo`, and `get_my_demo_machine`.
3. [ ] mobile-coder: consume `is_demo` in auth profile type and simulator gate.
4. [ ] admin-coder: add superadmin toggle UI for demo users.

---

### [2026-03-30] - Pre-Production Dead Feature Cleanup

**Migrations:**
- `20260330000001_pre_production_dead_feature_cleanup.sql`
- `20260330000002_cleanup_remaining_dead_tables.sql`

#### Tables Dropped (16)

**SmartCoach / Programs stack** (never shipped, feature-gated off, 0 active users):
- `coach_profiles`, `coach_gym_affiliations`
- `live_sessions`, `smartcoach_user_progress`
- `workout_day_templates`, `day_template_items`
- `workout_programs`, `program_days`, `program_items`
- `user_active_programs`, `workout_plan_progress`
- `completed_exercises`, `plan_session_history`
- `equipment`

**Deprecated / superseded:**
- `user_challenge_progress` (replaced by `challenge_progress`)
- `user_progress` (created but never wired)

#### Columns Dropped (1)
- `sessions.equipment_id` (FK to equipment, all 402 rows NULL)

#### Functions Dropped (3)
- `process_smartcoach_progress`
- `get_plan_item_for_machine`
- `load_day_template_into_program`

#### Files Deleted (49)
- 13 DEBUG_*.sql, 26 VERIFY_*.sql, 3 FIX_*.sql
- 2 DIAGNOSE_*.sql, 1 EXPLAIN_*.sql, 1 AUDIT_*.sql
- 1 OPT_*.sql, 1 DATABASE_AUDIT_REPORT.md, 1 repair.sh

#### Intentionally Kept
- `workout_plans`, `workout_plan_items`, `active_subscriptions` (used by mobile + admin)
- `gyms.smartcoach_enabled` (feature flag, referenced in app code)
- `drop_limits` (config table, may be read by tokenomics)

#### Impact on Frontend
- **Mobile App (Faza 2):** SmartCoach screens (`smartcoach.tsx`, `gym-plans.tsx`, `plan-detail.tsx`)
  can be removed or left feature-gated. `get_plan_item_for_machine` RPC no longer exists — any
  SmartCoach workout flow will fail if enabled. Remove or guard accordingly.
- **Admin Panel (Faza 2):** `WorkoutPlansManager`, `SmartCoachToggle`, `SmartCoachOverview`,
  `workout-plan-actions.ts`, `smartcoach-progress.ts` can be removed.

#### Rollback
Re-run original creation migrations to restore tables if needed.
Data was dev-only (0-75 rows, no production users).

---

### [2026-03-29] - P0: Reconcile award_drops — Happy Hour + Soft Tiers + Anti-Split Merge

**Migration:** `20260329000002_reconcile_award_drops_happy_hour_with_soft_tiers.sql`

#### Problem

Migration `20260327000005_happy_hour_drop_boost_rules.sql` added Happy Hour boost to
`award_drops` but **completely overwrote** the sophisticated version from
`20260325000016_fair_session_soft_threshold_policy.sql`. Production `award_drops` was
MISSING: session soft tiers, anti-split merge, cap modes, restart grace reconciliation.

The mobile `live-drops-estimator.ts` still applied soft tiers, causing visible mismatch:
users saw one number during workout and received a different (lower) number from backend.

#### What Changed

`award_drops(p_session_id UUID)` rewritten to include ALL features from both migrations:

| Feature | Source Migration | Status |
|---------|-----------------|--------|
| Raw drops calculation (v2 + legacy) | 270010 | Kept |
| Happy Hour boost | 270005 | Restored |
| Rewarded sessions count + restart reconciliation | 250016 | Restored |
| Rewarded sessions cap modes (off/soft/hard) | 250016 | Restored |
| Anti-split merge accounting | 250016 | Restored |
| Piecewise soft session threshold | 250016 | Restored |
| Daily/weekly hard caps | Both | Kept |
| Balance updates, transactions, challenges, arenas | 270005 | Kept |

**Order of operations:**
1. Load session, profile, tokenomics_config (ALL columns)
2. Short session guard (<120s)
3. Calculate raw drops via `calculate_session_drops_v2` (or legacy)
4. **Happy Hour boost** on `v_raw_drops`
5. Rewarded sessions count + restart reconciliation
6. Rewarded sessions cap mode (off/soft/hard)
7. Anti-split merge accounting
8. **Piecewise soft session tiers** on boosted+merged amount
9. Daily hard cap
10. Weekly hard cap
11. Balance updates, transactions, challenges, arenas, checkin, streak

**Key principle:** Happy hour boost multiplies `v_raw_drops` BEFORE soft tiers.
So 1.5x HH on 100 raw = 150, which then goes through soft-tier curve.

#### Telemetry (raw_metrics.drop_calc_v2)

New structured blocks:
- `happy_hour`: active, multiplier, rule_id, rule_name, pre/post_boost_drops
- `soft_session`: threshold, tier1_end, tier factors, merged_prior, combined, adjusted, marginal_credit
- `rewarded_sessions`: count, effective_count, restart_merged, mode, grace_sec
- `caps`: day_remaining, week_remaining, final_drops, merge_window_sec
- `reasons`: array of reason codes

#### Impact on Frontend

- **Mobile App:** No changes needed. `live-drops-estimator.ts` already implements soft tiers.
  Backend now matches mobile's math — users will see consistent numbers.
- **Admin Panel:** No changes needed. `get_user_drop_limits` already returns soft-tier columns.

#### Rollback

Re-apply the `award_drops` body from `20260327000005` to revert to hard-cap-only behavior.

#### Verification Results (threshold=150, t1=0.40, t2=0.15, span=0.50)

| Scenario | Raw | Combined | Soft Adjusted | Marginal |
|----------|-----|----------|---------------|----------|
| Below threshold (80) | 80 | 80 | 80 | 80 |
| In tier1 (180) | 180 | 180 | 162 | 162 |
| In tier2 (270, HH 1.5x) | 270 | 270 | 187 | 187 |
| Split 1/2 (90+0) | 90 | 90 | 90 | 90 |
| Split 2/2 (90+90) | 90 | 180 | 162 | 72 |
| Continuous (180+0) | 180 | 180 | 162 | 162 |
| Anti-split total: 90+72=162 = continuous 162 | - | - | - | Equal |

---

### [2026-03-28] - Mobile Listing Rename + Verified Check-in Referral Trigger

**Migration:** `20260328000002_mobile_listing_and_verified_checkin_referral.sql`

#### A) Mobile Listing Rename (non-breaking)

**Schema Change: `gyms` table**
- Added `is_mobile_listed BOOLEAN NOT NULL DEFAULT true`
- Backfilled from `is_pilot_enabled` (all gyms synced)
- Index: `idx_gyms_mobile_listed` on `(is_mobile_listed, is_active) WHERE both true`

**Updated RPC: `get_public_gyms_for_mobile(p_pilot_only, p_listed_only)`**
- Old 1-param overload dropped; replaced with 2-param version
- `p_listed_only` (default `true`) — filters by `is_mobile_listed`
- `p_pilot_only` (default `false`) — preserved for backward compat
- Returns `is_mobile_listed` column in results

**Frontend Impact:**
- **Mobile App:** Update `useAvailableArenas`/gym list to use `p_listed_only` param instead of `p_pilot_only`. Old callers still work (both params default safely).
- **Admin Panel:** Can now toggle `is_mobile_listed` per gym (independent of pilot flag).

#### B) Referral: Verified Check-in Trigger (replaces workout trigger)

**Schema Change: `referrals` table**
- Added `qualified_verified_at TIMESTAMPTZ NULL` — timestamp when invitee's identity was verified AND had a check-in

**Updated RPCs:**

| Function | Change |
|---|---|
| `evaluate_referral_qualification(UUID)` | Reward trigger = first check-in + `gym_member_identities.is_verified=true` (was: first workout). Returns `qualified_verified_at` and `is_identity_verified` in active-state response. |
| `get_referral_timeline(UUID)` | Steps: `invited → joined → first_checkin → verified_checkin → rewarded`. New step `verified_checkin` replaces `first_workout`. |
| `get_my_referrals(UUID)` | `current_status` includes `verified_checkin` state. Returns `qualified_verified_at` per referral. |
| `get_referral_stats(UUID)` | Counts `verified` (identity-verified invitees). All stats now reflect verified-checkin flow. |

**Reward Logic:**
- Invitee bonus: +100 drops (once, on verified qualification)
- Referrer reward: +150 drops (monthly cap of 5, configurable via `app_runtime_flags`)
- Cap exceeded: `reward_block_reason = 'monthly_cap_reached'`

**Anti-Abuse (preserved):**
- Self-referral blocked
- Duplicate invitee protection
- Expiry enforcement (30 days default)

**Frontend Impact:**
- **Mobile App:** Timeline stepper should show `verified_checkin` step (not `first_workout`). `evaluate_referral_qualification` now returns `is_identity_verified` boolean for progress UI.
- **Admin Panel:** Member identity verification flow (`gym_member_identities`) is now the reward trigger for referrals.

**Rollback:**
```sql
ALTER TABLE public.gyms DROP COLUMN IF EXISTS is_mobile_listed;
ALTER TABLE public.referrals DROP COLUMN IF EXISTS qualified_verified_at;
-- Restore previous RPC versions from 20260328000001 migration
```

---

### [2026-03-28] - Pilot: Referral Lifecycle Hardening + H2H Feature Gate

**Migration:** `20260328000001_pilot_referral_h2h_gate.sql`

**New Table: `app_runtime_flags`**
- Key-value feature flag store (JSONB values). RLS: public read, superadmin write.
- Seeded flags: `friend_challenges_enabled=false`, `referral_invites_enabled=true`, reward amounts, monthly cap, expiry days.

**Extended `referrals`:**
- `qualified_first_workout_at TIMESTAMPTZ NULL` — first completed workout (reward trigger)
- `qualified_first_workout_id UUID NULL` — FK to sessions
- `invitee_reward_tx_id UUID NULL` — FK to drops_transactions (invitee bonus audit)
- `reward_block_reason TEXT NULL` — e.g. `monthly_cap_reached`

**New RPCs:**

| Function | Purpose |
|---|---|
| `get_runtime_flag(TEXT)` | Read any feature flag value (mobile H2H gate) |
| `get_referral_stats(UUID)` | Referrer KPI cards: total, joined, workout_completed, rewarded, cap_blocked, monthly_remaining |

**Patched RPCs:**

| Function | Changes |
|---|---|
| `create_referral_invite` | Returns `join_url`, `deep_link`, `expires_at` (30-day default) |
| `apply_referral_code` | Returns `message`, `joined_at`; enforces expiry; blocks expired codes |
| `evaluate_referral_qualification` | Trigger is now first workout (not checkin+redemption). Invitee gets +100 drops (one-time). Referrer gets +150 drops (monthly cap 5). Cap-blocked referrals marked `reward_block_reason='monthly_cap_reached'`. |
| `get_referral_timeline` | Added `first_checkin` and `first_workout` steps. `reward_block_reason` in response. |
| `get_my_referrals` | Added `first_workout` current_status, `reward_block_reason`, `monthly_rewarded/cap/remaining`. |

**Reward Logic:**
- Invitee bonus: +100 drops on first workout (one-time, always paid)
- Referrer reward: +150 drops per qualified referral (monthly cap of 5 paid referrals)
- Over-cap referrals still mark as `rewarded` but with `reward_block_reason='monthly_cap_reached'` and referrer gets 0

**Timeline `current_status` values:** `invited`, `joined`, `first_checkin`, `first_workout`, `rewarded`, `expired`, `blocked`

**Frontend Impact:**
- **Mobile App:** Read `get_runtime_flag('friend_challenges_enabled')` to hide H2H. Use `get_referral_stats` for invite screen KPIs. `create_referral_invite` now returns `join_url` and `deep_link` for sharing. `evaluate_referral_qualification` triggers on first workout, not checkin+redemption.
- **Landing Page:** Use `join_url` from create_referral_invite for `/join/<code>` routes.
- **Admin Panel:** Optional read-only referral KPI card using `get_referral_stats`.

**Rollback:**
```sql
DROP TABLE IF EXISTS public.app_runtime_flags;
DROP FUNCTION IF EXISTS public.get_runtime_flag(TEXT);
DROP FUNCTION IF EXISTS public.get_referral_stats(UUID);
ALTER TABLE public.referrals DROP COLUMN IF EXISTS qualified_first_workout_at;
ALTER TABLE public.referrals DROP COLUMN IF EXISTS qualified_first_workout_id;
ALTER TABLE public.referrals DROP COLUMN IF EXISTS invitee_reward_tx_id;
ALTER TABLE public.referrals DROP COLUMN IF EXISTS reward_block_reason;
-- Then restore previous RPC versions from 20260327160000 migration.
```

---

### [2026-03-27] - Referral Timeline Support (UX Hotfix)

**Migration:** `20260327160000_referral_timeline_support.sql`

**Schema Changes:**

Extended `referrals`:
- `joined_at TIMESTAMPTZ NULL` — explicit timestamp when invitee applies code (was only derivable from `updated_at`)
- `expires_at TIMESTAMPTZ NULL` — optional invite code expiry

Status CHECK widened: `pending | active | rewarded | blocked | expired`

Backfill: existing `active`/`rewarded` rows had `joined_at` set from `updated_at`.

**Patched RPCs:**
- `apply_referral_code` — now sets `joined_at = NOW()` and returns it; also respects `expires_at`

**New RPCs:**

| Function | Purpose |
|---|---|
| `get_referral_timeline(p_referral_id UUID DEFAULT NULL)` | Returns computed timeline steps array + `current_status`. Auth-scoped to referrer, invitee, or superadmin. |
| `get_my_referrals(p_gym_id UUID)` | Referrer list view with derived `current_status` per row. |

**Timeline `current_status` values:** `invited`, `joined`, `qualified_checkin`, `qualified_redemption`, `rewarded`, `expired`, `blocked`

**Indexes Added:**
- `idx_referrals_invitee` — `(invitee_user_id, created_at DESC)` partial
- `idx_referrals_expires` — `(expires_at)` partial where pending + expires_at set

**Frontend Impact:**
- **Mobile App:** Use `get_referral_timeline()` for status stepper/timeline. Use `get_my_referrals()` for referrer list. `joined_at` now explicit in apply response.
- **Admin Panel:** No changes needed.

**Rollback:**
```sql
DROP FUNCTION IF EXISTS public.get_referral_timeline(UUID);
DROP FUNCTION IF EXISTS public.get_my_referrals(UUID);
ALTER TABLE public.referrals DROP COLUMN IF EXISTS joined_at;
ALTER TABLE public.referrals DROP COLUMN IF EXISTS expires_at;
ALTER TABLE public.referrals DROP CONSTRAINT IF EXISTS referrals_status_check;
ALTER TABLE public.referrals ADD CONSTRAINT referrals_status_check
  CHECK (status IN ('pending', 'active', 'rewarded', 'blocked'));
```

---

### [2026-03-27] - Referrals (A3) + friend 1v1 challenges (A4) MVP

**Migration:** `20260327150000_referrals_and_friend_challenges_mvp.sql`

**Tables (additive):**
- `referrals` — gym-scoped referral rows: `referrer_user_id`, `invitee_user_id`, `invite_code`, `status` (`pending` | `active` | `rewarded` | `blocked`), qualification timestamps, `reward_tx_id`
- `friend_challenges` — gym-scoped 1v1: `challenger_user_id`, `opponent_user_id`, `challenge_type` (`drops_race` | `streak_race` | `sessions_race`), `duration_days` (3/7/14), `status`, `tie_mode` (`no_winner` | `split`), optional `reward_drops_per_user` (0–100), window `starts_at`/`ends_at`, invite TTL `pending_expires_at`
- `friend_challenge_progress` — `(challenge_id, user_id)` scores + `last_computed_at`

**Referral RPCs (authenticated, `SECURITY DEFINER`):**
| RPC | Purpose |
|-----|---------|
| `create_referral_invite(p_gym_id)` | Creates or returns existing **pending** invite for caller at gym; blocks if another `pending`/`active` row exists for same referrer+gym |
| `apply_referral_code(p_invite_code, p_gym_id)` | Links caller as invitee; requires membership at `gym_id`; blocks self-referral (`blocked` + reason); one referral lifetime per invitee (`invitee_user_id` unique) |
| `evaluate_referral_qualification(p_referral_id default null)` | **Invitee:** sets `qualified_*` from first qualifying `gym_checkins` (same `gym_id`, `drops_earned > 0`) and first `redemptions` with `status = 'confirmed'` and `source_type = 'reward_store'`; then pays referrer (constant **50** drops, capped ≤200 in function), `drops_transactions.transaction_type = 'referral_reward'`. **Referrer / gym staff / superadmin:** read-only JSON snapshot (no mutation). |

**Friend challenge RPCs (authenticated, `SECURITY DEFINER`):**
| RPC | Purpose |
|-----|---------|
| `create_friend_challenge(p_opponent_user_id, p_gym_id, p_challenge_type, p_duration_days, p_reward_drops_per_user default 0, p_tie_mode default 'no_winner')` | Both users must be `gym_memberships` at `p_gym_id`; pending invite expires in **48h** |
| `respond_friend_challenge(p_challenge_id, p_accept)` | Opponent accepts (sets `starts_at`/`ends_at`) or declines |
| `cancel_friend_challenge(p_challenge_id)` | Challenger cancels while `pending` |
| `refresh_friend_challenge_scores(p_challenge_id)` | Recomputes scores; when `now() >= ends_at`, completes challenge, sets `winner_user_id` (tie + `split` + reward → both paid; tie + `no_winner` → no winner); optional rewards use `friend_challenge_reward` transactions |

**RLS:**
- **referrals:** `SELECT` for superadmin, gym staff (same patterns as `gym_checkins`), referrer, invitee; no direct client writes
- **friend_challenges / friend_challenge_progress:** `SELECT` for superadmin, gym staff, both participants; progress readable by **both** participants for the same challenge

**Internal helpers:** `_referral_generate_code`, `_friend_challenge_compute_score`, `_friend_challenge_credit_winner` — `REVOKE` from `PUBLIC` (not client-callable).

**Verify script:** `backend/supabase/VERIFY_REFERRALS_AND_FRIEND_CHALLENGES_MVP.sql`

**Frontend impact:**
- **Mobile:** Use RPCs with user session; always pass pilot/home `gym_id` aligned with membership. After check-in and staff-confirmed redemption, invitee should call `evaluate_referral_qualification()` (e.g. app resume or post-redemption).
- **Admin:** Optional `referrals` reads for desk/support; no migration changes to admin actions required.

**MVP limitations (by design):**
- Referrer reward amount is fixed in SQL (not per-gym config yet).
- Phone / device loop fraud not in DB (no `phone` on `profiles`); self-referral and one-invitee-per-lifetime enforced.
- `streak_race` score = distinct local session days at the gym in the window (MVP proxy, not “longest streak”).

---

### [2026-03-27] - Profiles: email verification + legal acknowledgment (auth / release hardening)

**Migration:** `20260327140000_profiles_email_verified_and_release_compliance.sql`

**Schema changes (additive):**
- `profiles.email_verified_at TIMESTAMPTZ NULL` — mirrors Auth confirmation for server/client checks; backfilled from `auth.users.email_confirmed_at` where set
- `profiles.terms_privacy_acknowledged_at TIMESTAMPTZ NULL` — in-app Terms + Privacy acknowledgment timestamp
- `profiles.terms_privacy_document_version TEXT NULL` — version key/slug for the legal bundle shown

**Index:**
- `idx_profiles_email_pending_verification` — partial on `profiles(created_at DESC)` where `email IS NOT NULL` and `email_verified_at IS NULL`

**Behavior notes:**
- Non-destructive: no drops, no RLS policy changes; existing `profiles` policies apply to new columns.
- Backfill does **not** overwrite non-null `email_verified_at` (safe for manual corrections).
- Dev/prod isolation remains two Supabase **projects** + app env vars (see `docs/plans/production_env_split_dev_prod_runbook.md`); no extra env table required.

**Frontend impact:**
- **Mobile:** Use `email_verified_at` (and/or Auth `user.email_confirmed_at`) for email-provider gate per plan A1; set legal columns when user accepts published Terms/Privacy (plan H2).
- **Admin:** Optional read for support; no required change.

**DB documentation:**
- MVP surface audit (keep / deprecate / remove candidates): `backend/supabase/docs/MVP_ACTIVE_DB_SURFACE_AUDIT.md`

**Verify script:** `backend/supabase/VERIFY_PROFILES_AUTH_RELEASE_COLUMNS.sql`

---

### [2026-03-11] - Pilot gym visibility flag + public listing RPC

**Migration:** `20260311130000_add_pilot_gym_visibility_flag.sql`

**Schema changes:**
- Added `gyms.is_pilot_enabled BOOLEAN NOT NULL DEFAULT true`
- Added index `idx_gyms_is_pilot_enabled`

**New RPC:**
- `get_public_gyms_for_mobile(p_pilot_only BOOLEAN DEFAULT false)`
  - Returns active gyms for mobile listing
  - If `p_pilot_only=true`, returns only `is_pilot_enabled=true` gyms

**Behavior notes:**
- Migration is additive and non-destructive.
- Existing gyms are preserved and marked visible by default.
- Intended for staged pilot rollout (e.g. Vortex-only listing) without removing multi-gym architecture.

**Frontend impact:**
- Mobile uses `is_mobile_listed` semantics for public gym listing.
- If listing columns/functions are not available yet, mobile fallback path can still list gyms.

---

### [2026-03-27] - perform_checkin: lenient full checkin_drops + RPC diagnostics

**Migration:** `20260327120000_perform_checkin_lenient_full_drops_hotfix.sql`

**Behavior change:**

- **Before:** In lenient `checkin_verification_mode`, if GPS was not verified, drops were capped with `LEAST(v_drops, 1)` (members saw 1 drop when the gym had e.g. 5 configured).
- **After:** Lenient + unverified GPS awards the full configured `checkin_drops`. **Strict** mode is unchanged: missing GPS, missing gym coordinates, out-of-radius, or failed verification still returns `success: false` with the same `error` codes; no check-in reward is applied.

**RPC `perform_checkin` JSONB payload (additive):**

| Key | Type | Notes |
|-----|------|--------|
| `configured_checkin_drops` | int / null | Gym `checkin_drops` when known |
| `awarded_checkin_drops` | int | Mirrors `drops_earned` on success; `0` on failure |
| `drops_earned` | int | Unchanged semantics on success |
| `gps_verified` | bool | Whether coordinates were within radius |
| `verification_mode` | text / null | `lenient` or `strict` (null if not authenticated / gym missing) |
| `cap_reason` | text / null | Examples: `gps_unverified_lenient` (informational: full award without GPS proof), `gps_required_strict`, `too_far_strict`, `gps_verification_failed`, `daily_cap_reached` (already checked in today for this gym) |

**Daily limit:** One successful check-in per user per gym per calendar day (Europe/Belgrade) is still enforced via `gym_checkins` + `already_checked_in` / unique violation; no change to that logic.

**Frontend impact:**

- **Mobile:** Optional — use `configured_checkin_drops`, `awarded_checkin_drops`, `cap_reason`, and `verification_mode` on `/checkin-result` (or logs) to explain awards. Existing `drops_earned` remains the primary success value.
- **Admin:** No schema change; gym `checkin_drops` and `checkin_verification_mode` are unchanged.

**Verify script:** `backend/supabase/VERIFY_PERFORM_CHECKIN_LENIENT_FULL_AWARD.sql`

---

### [2026-03-27] - Happy Hour Visibility + Reminder Backend

**Migration:** `20260327000007_happy_hour_user_visibility_and_reminders.sql`

**Schema Changes:**

Extended `gym_drop_boost_rules`:
- `is_visible_to_members BOOLEAN NOT NULL DEFAULT true` — controls member-facing visibility
- `display_label TEXT NULL` — optional marketing name (fallback: `name`)

Extended `profiles`:
- `happy_hour_reminders_enabled BOOLEAN NOT NULL DEFAULT true`
- `happy_hour_reminder_offset_min INT NOT NULL DEFAULT 30` — CHECK (0, 10, 30)

New table: `happy_hour_reminder_logs`
- Dedupe table for push reminder delivery
- Unique constraint: `(user_id, rule_id, window_start_at, offset_min)`
- RLS: superadmin full, gym staff read own gym, user read own

**New RPCs:**

| Function | Purpose |
|---|---|
| `get_upcoming_happy_hours(p_gym_id, p_limit DEFAULT 3)` | Returns next visible windows (label, multiplier, start/end, minutes_until_start, is_today) |
| `set_happy_hour_reminder_pref(p_enabled, p_offset_min)` | Auth-scoped user preference update |
| `get_happy_hour_schedule_preview(p_gym_id, p_days DEFAULT 7)` | Admin preview of all windows (includes hidden), gym-scoped |

**Indexes Added:**
- `idx_boost_rules_gym_visible` — partial index on active+visible rules
- `idx_hh_reminder_logs_gym_sent` — `(gym_id, sent_at DESC)`
- `idx_hh_reminder_logs_dedupe` — `(user_id, rule_id, window_start_at, offset_min)`

**Frontend Impact:**
- **Mobile App:** Call `get_upcoming_happy_hours` for home card. Call `set_happy_hour_reminder_pref` from settings. Localization keys needed for upcoming/live states.
- **Admin Panel:** Boost rule form needs `is_visible_to_members` toggle + `display_label` field. Schedule preview panel calls `get_happy_hour_schedule_preview`.

**Rollback:**
```sql
DROP FUNCTION IF EXISTS public.get_upcoming_happy_hours(UUID, INT);
DROP FUNCTION IF EXISTS public.set_happy_hour_reminder_pref(BOOLEAN, INT);
DROP FUNCTION IF EXISTS public.get_happy_hour_schedule_preview(UUID, INT);
DROP TABLE IF EXISTS public.happy_hour_reminder_logs;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS happy_hour_reminders_enabled;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS happy_hour_reminder_offset_min;
ALTER TABLE public.gym_drop_boost_rules DROP COLUMN IF EXISTS is_visible_to_members;
ALTER TABLE public.gym_drop_boost_rules DROP COLUMN IF EXISTS display_label;
```

---

### [2026-03-27] - Engagement Campaigns + Happy Hour Boosts + Realtime (Phase C+D+E)

**Migrations:**
- `20260327000004_member_engagement_campaigns.sql` — campaign tables + at-risk RPC + create/queue RPCs
- `20260327000005_happy_hour_drop_boost_rules.sql` — boost rules table + resolution RPC + award_drops integration
- `20260327000006_realtime_publication_coverage.sql` — 5 tables added to `supabase_realtime`

**Workstream C: Engagement Campaigns**

New tables:
- `engagement_campaigns` — campaign definition (gym, type, title, body, deep_link, audience, status, counts)
- `engagement_campaign_targets` — resolved recipients per campaign (user_id, push_token)
- `engagement_campaign_deliveries` — per-delivery status tracking (status, provider_id, error, retry_count)

New RPCs:
- `get_members_at_risk(p_gym_id, p_days_inactive) → JSONB`
  - Returns at-risk members with last checkin, days inactive, push token status
- `create_engagement_campaign(...) → JSONB`
  - Creates campaign + auto-resolves targets from inactive segment or custom user list
  - Rate-limited: max 5 campaigns per gym per day
- `queue_engagement_delivery(p_campaign_id) → JSONB`
  - Creates delivery records for targets with push tokens, transitions to 'queued'

RLS: Campaigns accessible by gym_owner/gym_admin + superadmin. Users cannot access.

**Workstream D: Happy Hour Boost Rules**

New table `gym_drop_boost_rules`:
- `gym_id`, `name`, `is_active`, `days_of_week INT[]`, `start_time_local TIME`, `end_time_local TIME`, `timezone`
- `multiplier NUMERIC(4,2)` — CHECK: 1.0–3.0
- `machine_types TEXT[]` (optional filter), `priority INT`, `created_by`

New RPCs:
- `get_active_drop_boost(p_gym_id, p_timestamp, p_machine_type) → JSONB`
  - Resolves highest-priority matching rule for the local time/day
  - Returns `{active, multiplier, rule_id, rule_name, start_time, end_time, timezone}`
- `admin_upsert_drop_boost_rule(...) → JSONB`
  - Create or update boost rules with validation

**award_drops integration:**
- After `calculate_session_drops_v2` returns, the boost multiplier is applied to `v_raw_drops`
- This happens BEFORE session/day/week hard caps — caps still enforce maximum boundaries
- Boost metadata persisted in `sessions.raw_metrics.drop_calc_v2.happy_hour`
- Drop transaction description includes boost info when active

**Workstream E: Realtime Publication**

Tables now in `supabase_realtime`:
- `machines` (already was)
- `sessions` (already was)
- `gym_checkins` ← NEW
- `redemptions` ← NEW
- `staff_invitations` ← NEW
- `engagement_campaign_deliveries` ← NEW
- `gym_member_identities` ← NEW

**Frontend Impact (admin-coder):**
- Campaign UI: Use `get_members_at_risk` for segment picker, `create_engagement_campaign` + `queue_engagement_delivery` for send flow
- Happy Hour: Economy/Promotions page to create/edit time windows with `admin_upsert_drop_boost_rule`
- Realtime: Subscribe to `postgres_changes` on check-ins, redemptions, invites, deliveries
- Edge function needed: `send-engagement-push` to process queued deliveries via Expo push

**Frontend Impact (mobile-coder):**
- Call `get_active_drop_boost` to show "Happy Hour x1.5 active" badge
- Subscribe to wallet/checkin realtime updates for foreground freshness

**Rollback:**
- Drop tables: `engagement_campaign_deliveries`, `engagement_campaign_targets`, `engagement_campaigns`, `gym_drop_boost_rules`
- Revert `award_drops` to remove boost integration (redeploy from `20260325000010`)
- Remove tables from `supabase_realtime` publication

---

### [2026-03-27] - Staff Invite Email Delivery + Member Identity Linking (Phase A+B)

**Migrations:**
- `20260327000001_staff_invite_email_delivery.sql` — invite delivery tracking columns + RPCs
- `20260327000002_member_identity_linking.sql` — identity table + RLS + verification RPCs
- `20260327000003_identity_rpc_ext_id_conflict_guard.sql` — friendly error on duplicate card number

**Workstream A: Staff Invite Email Delivery**

New columns on `staff_invitations`:
- `email_delivery_status TEXT DEFAULT 'pending'` — CHECK (`pending`, `sent`, `failed`)
- `email_sent_at TIMESTAMPTZ NULL`
- `email_failure_reason TEXT NULL`
- `last_email_provider_id TEXT NULL`
- `resend_count INT DEFAULT 0` — CHECK (>= 0)

New indexes:
- `idx_staff_inv_gym_status_created` — `(gym_id, status, created_at DESC)`
- `idx_staff_inv_email_status` — `(email, status)`
- `idx_staff_inv_delivery_status` — `(email_delivery_status, created_at DESC)`

New RPCs:
- `resend_staff_invitation_email(p_invitation_id UUID) → JSONB`
  - SECURITY DEFINER, gym-scoped
  - Increments `resend_count`, resets delivery to `pending`
  - Rate-limits at 5 resends max
  - Auto-extends expiry if expired
  - Returns invitation payload for email dispatch
- `mark_staff_invitation_email_delivery(p_invitation_id, p_provider_id, p_status, p_error_text) → JSONB`
  - Atomically updates delivery columns
  - `p_status` must be `sent` or `failed`

**Workstream B: Member Identity Linking**

New table `gym_member_identities`:
- `id`, `gym_id`, `user_id`, `is_verified`, `full_name_verified`, `external_membership_id`
- `verified_by`, `verified_at`, `verification_notes`, `created_at`, `updated_at`
- Unique constraint: `(gym_id, user_id)`
- Partial unique index: `(gym_id, external_membership_id)` WHERE NOT NULL

RLS policies:
- `gmi_superadmin_all` — full access for superadmin
- `gmi_gym_staff_all` — gym owner/admin/receptionist scoped to their gym
- `gmi_user_own_select` — users can read their own identity row

New RPCs:
- `get_checkin_identity_candidates(p_gym_id, p_user_id) → JSONB`
  - Returns merged profile + membership + identity + checkin stats snapshot
  - SECURITY DEFINER, gym-scoped
- `upsert_physical_member_identity(p_gym_id, p_user_id, full_name, ext_id, notes) → JSONB`
  - Creates or updates identity row
  - Returns friendly error on duplicate `external_membership_id`
- `verify_member_identity(p_gym_id, p_user_id, full_name, ext_id, notes) → JSONB`
  - Marks member as verified with `verified_by`, `verified_at` audit fields
  - Returns `identity_id`, `verified_by`, `verified_at`

**Frontend Impact (admin-coder):**
- TeamManager: Show `email_delivery_status` badge (pending/sent/failed), resend button calling `resend_staff_invitation_email`, failure reason tooltip
- CheckinStatsModule: Show identity status chip (Verified/Needs verification), add quick verify drawer using `get_checkin_identity_candidates` + `verify_member_identity`
- Member profile: Add "Physical identity" block showing verification status, card number, verified-by info
- Edge function needed: `send-staff-invitation-email` that dispatches email and calls `mark_staff_invitation_email_delivery`

**Frontend Impact (mobile-coder):**
- Profile screen: Can read `gym_member_identities` for own identity status
- Show "Gym identity verified" / "Ask front desk to verify" CTA

**Rollback:**
- Drop table `gym_member_identities`
- Drop columns from `staff_invitations`: `email_delivery_status`, `email_sent_at`, `email_failure_reason`, `last_email_provider_id`, `resend_count`
- Drop functions: `resend_staff_invitation_email`, `mark_staff_invitation_email_delivery`, `get_checkin_identity_candidates`, `upsert_physical_member_identity`, `verify_member_identity`

---

### [2026-03-26] - Dashboard V3 + Activity Log with Workout Events

**Migrations:**
- `20260326000001_dashboard_v3_rpc.sql` — initial V3 (metric fixes + activity log)
- `20260326000002_dashboard_v3_activity_workouts.sql` — supersedes _0001, adds workout events

**Bug Fixes in `get_gym_dashboard_overview`:**
- `activeRatePct` clamped to 0–100 with `LEAST(100, ...)` — was exceeding 100%
- `completionRatePct` computed from real `challenge_progress` data — was hardcoded to 0
- Top Performers uses `SUM(drops_transactions.amount) WHERE amount > 0` (earned drops) — was using `local_drops_balance` (wallet balance)
- Top Performers filters to `role = 'user'` only — was including staff/owner
- `dropsIssued7d.deltaPct` returns NULL when prev < 50 (frontend shows absolute instead)
- `dropsIssued7d.deltaAbsolute` always returned
- Economy section returns `health='gray'`, `healthLabel='No data'` when no snapshot exists
- Economy includes `totalMembers` for Top1 hide logic (hide when <= 3)

**New Features:**
- `topPerformers` array (top 5 by earned drops, role='user') included in dashboard response
- `deskFeed` now includes `workout_finished` and `workout_auto_finished` events (excludes `workout_started` for noise control)
- New RPC: `get_gym_activity_log(p_gym_id, p_kind, p_search, p_page, p_per_page)` — paginated activity feed merging checkins + redemptions + workouts
  - `p_kind` supports: `'all'`, `'checkin'`, `'redemption'`, `'workout'`
  - Workout kinds: `workout_started`, `workout_finished`, `workout_auto_finished`
  - Details include machine name and drops earned where available

**Workout Event Classification (current heuristic):**
- `workout_finished`: session with `is_active = false` and no `auto_cancel_reason`
- `workout_auto_finished`: session with `raw_metrics->'security'->>'auto_cancel_reason' IS NOT NULL`
- `workout_cancelled`: not yet reliably classifiable — TODO: add `sessions.end_reason` column

**New Indexes:**
- `idx_gym_checkins_gym_checked_at` — `gym_checkins(gym_id, checked_in_at DESC)`
- `idx_redemptions_gym_created_at` — `redemptions(gym_id, created_at DESC)`
- `idx_sessions_gym_started_at` — `sessions(gym_id, started_at DESC)`
- `idx_sessions_gym_active_updated` — `sessions(gym_id, is_active, updated_at DESC)`
- `idx_drops_tx_user_gym_positive` — `drops_transactions(user_id, gym_id) WHERE amount > 0`

**Frontend Impact (admin-coder):**
- Update `DashboardOverview` type: add `topPerformers`, `dropsIssued7d.deltaAbsolute`, `economy.totalMembers`, `'gray'` health
- Add workout kind handling to `deskFeed` rendering (`workout_finished`, `workout_auto_finished`)
- Remove separate `getTopPerformers` call from dashboard — data now in main RPC
- Create Activity Log page at `gym/[id]/activity` using `get_gym_activity_log` RPC
- Activity Log needs `Workouts` tab filter (maps to `p_kind='workout'`)
- Workout items have compound IDs (`{session_id}_start`, `{session_id}_end`)
- Fix drops delta display: show absolute when `deltaPct` is null (prev < 50)
- Fix economy display: handle `'gray'` health state

**Follow-up TODO:**
- Add `sessions.end_reason TEXT` column for normalized workout end classification
- Once added, support `workout_cancelled` kind in activity log

**Rollback:** Redeploy previous `get_gym_dashboard_overview` (pre-V3). Drop `get_gym_activity_log`.

---

### [2026-03-25] - Dashboard Premium V2 Command Center RPC

**Migration Files:**
- `backend/supabase/migrations/20260325000026_gym_dashboard_overview_rpc.sql`

**Agent:** supabase-dba

**Changes:**
- New RPC: `get_gym_dashboard_overview(p_gym_id UUID, p_window_days INT DEFAULT 7) RETURNS JSONB`
- Returns full dashboard in a single call with sections:
  - `kpis`: members, checkins, storeDesk, economy, dropsIssued7d, risk
  - `machineOps`: liveSummary, usageTrend7d, typeSplit, peakHour
  - `deskFeed`: last 10 checkins/redemptions interleaved
  - `challengeSnapshot`: active, completionRatePct, mostPopular
  - `setupStatus`: complete flag + blockers array
- Performance indexes added for dashboard query paths

**Performance:**
- Execution time: 207ms on production data (target: <300ms)
- All core scans use Index Only Scan

**Indexes Added:**
- `idx_sessions_gym_started` (sessions: gym_id, started_at DESC)
- `idx_fraud_events_gym_unresolved` (fraud_events: gym_id, created_at DESC WHERE resolved_at IS NULL)
- `idx_economy_snapshots_gym_date` (economy_snapshots_daily: gym_id, snapshot_date DESC)
- `idx_challenge_progress_gym` (challenge_progress: gym_id)
- `idx_drops_transactions_gym_created` (drops_transactions: gym_id, created_at DESC)

**Impact:**
- **Admin Panel:** Call this single RPC for dashboard. Replaces multiple fragmented queries.
- **Mobile App:** No changes.

**Breaking Changes:** None (additive).

**Rollback:** Drop function `get_gym_dashboard_overview(UUID, INT)`.

---

### [2026-03-25] - Admin Panel Paginated List RPCs + Performance Indexes

**Migration Files:**
- `backend/supabase/migrations/20260325000021_admin_paginated_list_rpcs.sql`
- `backend/supabase/migrations/20260325000022_fix_admin_list_clamp_call.sql`

**Agent:** supabase-dba

**Changes:**
- 7 new JSONB-returning RPCs for admin panel server-side pagination + search + sort:
  - `admin_list_members(p_gym_id, p_search, p_page, p_limit, p_sort_by, p_sort_dir)`
  - `admin_list_redemptions(p_gym_id, p_search, p_status, p_page, p_limit, p_sort_by, p_sort_dir)`
  - `admin_list_rewards(p_gym_id, p_search, p_is_active, p_page, p_limit, p_sort_by, p_sort_dir)`
  - `admin_list_machines(p_gym_id, p_search, p_type, p_page, p_limit, p_sort_by, p_sort_dir)`
  - `admin_list_team(p_gym_id, p_search, p_page, p_limit, p_sort_by, p_sort_dir)`
  - `admin_list_challenges(p_gym_id, p_search, p_is_active, p_page, p_limit, p_sort_by, p_sort_dir)`
  - `admin_list_arenas(p_gym_id, p_search, p_is_active, p_page, p_limit, p_sort_by, p_sort_dir)`
- Helper function `_admin_check_gym_access(p_gym_id)` for auth enforcement
- Performance indexes added on search/sort/filter paths for all domains
- All RPCs return consistent JSONB: `{ items, total_count, page, limit, total_pages }`
- Bounded queries: `p_limit` clamped to [1,100], `p_page` to [1,∞], `p_sort_dir` to asc/desc
- Sort columns whitelisted per domain to prevent injection

**Contract Shape:**
```json
{
  "items": [...],
  "total_count": 42,
  "page": 1,
  "limit": 25,
  "total_pages": 2
}
```

**Validation Results:**
- All 7 domains return data with correct pagination → PASS
- Search filtering works (members, machines) → PASS
- Sort ascending/descending works → PASS
- Unauthorized user gets `{"error": "Unauthorized"}` → PASS
- Limit clamping (999→100, 0→1) → PASS

**Impact:**
- **Admin Panel:** Replace unbounded list fetches with these RPCs. Each returns items + pagination metadata in one call.
- **Mobile App:** No changes needed.

**Breaking Changes:** None (additive only, new RPCs).

**Rollback Notes:**
Drop all `admin_list_*` functions and `_admin_check_gym_access`.

---

### [2026-03-25] - Reward Band Enforcement Policy (Soft Default, Optional Hard)

**Migration File:** `backend/supabase/migrations/20260325000019_reward_band_enforcement_policy.sql`

**Agent:** supabase-dba

**Changes:**
- Added `reward_band_enforcement_mode TEXT NOT NULL DEFAULT 'warn'` to `tokenomics_config`
  - Values: `warn` (allow redemption, log event) or `enforce` (block redemption)
  - CHECK constraint: `chk_reward_band_enforcement_mode`
- Added `reward_band_ignore_until TIMESTAMPTZ NULL` to `tokenomics_config`
  - Temporary override: if set and in the future, skips band check entirely
- Updated `claim_reward(p_user_id, p_reward_id, p_gym_id)`:
  - **Hard safety rails** (always active): block zero/negative/null `price_drops`
  - **Band compliance** now respects `reward_band_enforcement_mode`:
    - `warn`: out-of-band reward is redeemable; logs `reward_out_of_band_redeemed` fraud event with full metadata
    - `enforce`: out-of-band reward is blocked with business-safe message `"This reward is temporarily unavailable."`
  - Function signature unchanged (backward compatible)

**Validation Results:**
1. **Warn mode, out-of-band (coffee price=50, band 180–220):** success=true, fraud event logged → PASS
2. **Enforce mode, out-of-band:** success=false, message="This reward is temporarily unavailable." → PASS
3. **Hard safety, zero price, warn mode:** success=false, message="Invalid reward pricing" → PASS
4. **Hard safety, zero price, enforce mode:** success=false, message="Invalid reward pricing" → PASS

**Fraud Event Metadata (warn mode):**
```json
{
  "reward_id": "...",
  "reward_name": "...",
  "reward_type": "coffee",
  "price_drops": 50,
  "band_min": 180,
  "band_max": 220,
  "enforcement_mode": "warn",
  "price_calc_mode": "manual_drops",
  "discount_percent": 0
}
```

**Impact:**
- **Mobile App:** Default behavior changes from hard block to soft allow. Users can now redeem out-of-band rewards unless gym owner enables `enforce` mode. No signature changes needed.
- **Admin Panel:** New toggle in economy settings: `reward_band_enforcement_mode` (warn/enforce). Optional `reward_band_ignore_until` for temporary overrides.

**Breaking Changes:** None. Default mode `warn` is more permissive than previous hard block. Existing `claim_reward` signature unchanged.

**Rollback Notes:**
1. Revert `claim_reward()` to previous definition (restore hard block behavior).
2. Drop columns: `reward_band_enforcement_mode`, `reward_band_ignore_until` from `tokenomics_config`.

---

### [2026-03-25] - Leaderboard Earned Score Fix + 90-Day Expiry Hardening + User Transparency

**Migration File:** `backend/supabase/migrations/20260325000018_fix_leaderboard_earned_score_and_expiry_transparency.sql`

**Agent:** supabase-dba

**Changes:**

**1. Leaderboard Score Semantics Fix:**
- Fixed `get_leaderboard()` gym `all_time` score source:
  - **Before:** used `gym_memberships.local_drops_balance` (wallet balance — decreases on spend/expiry)
  - **After:** uses earned-only score = `SUM(drops_transactions.amount)` where `amount > 0` and `transaction_type IN ('session','checkin','workout','challenge')`
- Gym `weekly`/`monthly` unchanged (already uses sessions + checkins earned data)
- Global scope unchanged (uses `profiles.total_drops` / `weekly_drops` / `monthly_drops`)
- Added helper: `get_user_earned_drops_gym(p_user_id UUID, p_gym_id UUID, p_period TEXT DEFAULT 'all_time')` — returns earned-only score

**2. 90-Day Expiry Contract Hardening:**
- Backfilled `expires_at = created_at + 90 days` for all positive `checkin` and `workout` transactions that were missing it
- Refactored `expire_stale_drops()`:
  - Now covers `session`, `checkin`, `workout` types (was only `session`)
  - Deducts from both `profiles.available_drops` AND `gym_memberships.local_drops_balance`
  - Creates `expiry_deduction` audit trail transactions with `reference_id` pointing to original mint tx
  - Each expiry deduction includes descriptive text with source type and original description

**3. User Transparency RPCs:**
- `get_user_expiring_drops(p_gym_id UUID DEFAULT NULL)`:
  - Returns: `expiring_in_7d`, `expiring_in_30d`, `next_expiry_date`
  - Auth: `auth.uid()` enforced, user-scoped only
  - Optional gym filter (NULL = all gyms)
- `get_user_drops_ledger_summary(p_gym_id UUID DEFAULT NULL)`:
  - Returns: `wallet_balance`, `earned_score_weekly`, `earned_score_monthly`, `earned_score_all_time`
  - Auth: `auth.uid()` enforced, user-scoped only
  - Optional gym filter (NULL = global)

**Validation Results:**
1. **Leaderboard fix:** User earned 2279, spent 1900, wallet=800, leaderboard score=2279 → PASS
2. **Expiry backfill:** All session/checkin/workout positive tx now have `expires_at`, 0 missing → PASS
3. **RPCs:** All 3 new functions created with correct signatures → PASS

**Impact:**
- **Mobile App:**
  - Leaderboard gym `all_time` now reflects earned score, not spendable wallet. No RPC signature change needed.
  - New RPCs available: `get_user_expiring_drops()` for expiry card, `get_user_drops_ledger_summary()` for wallet/earned split.
  - Add UX: "Leaderboard ranks by earned drops, not current wallet balance."
  - Add expiry card: "X drops expire in 7/30 days, next expiry: DATE"
- **Admin Panel:**
  - Same leaderboard semantics change (no action required unless displaying all_time gym scores separately).
  - New KPI opportunity: upcoming expiry pressure via `get_user_expiring_drops()`.

**Breaking Changes:** None (function signatures unchanged, new RPCs added).

**Rollback Notes:**
1. Revert `get_leaderboard()` to use `gm.local_drops_balance` for gym all_time.
2. Revert `expire_stale_drops()` to Phase 3.0 version (session-only, no audit trail).
3. Drop new functions: `get_user_earned_drops_gym`, `get_user_expiring_drops`, `get_user_drops_ledger_summary`.

---

### [2026-03-25] - Fair Session Soft Threshold + Anti-Split Stitching

**Migration File:** `backend/supabase/migrations/20260325000016_fair_session_soft_threshold_policy.sql`

**Agent:** supabase-dba

**Changes:**
- Extended `tokenomics_config` with session-tier policy:
  - `session_soft_tier_1_factor NUMERIC(6,4) DEFAULT 0.40` — earning rate after threshold
  - `session_soft_tier_2_factor NUMERIC(6,4) DEFAULT 0.15` — earning rate after tier1 span
  - `session_soft_tier_1_span_ratio NUMERIC(6,4) DEFAULT 0.50` — tier1 width as fraction of threshold
  - `split_merge_window_sec INTEGER DEFAULT 900` — anti-split merge window
  - Constraints: factors in [0,1], span ratio in (0,2], merge window 0..3600
  - Widened `session_restart_grace_sec` constraint to 0..3600
- Refactored `award_drops()`:
  - `max_drops_per_session` is now a **soft threshold** with piecewise tiers (not hard cutoff)
  - Segment A (0→threshold): 100% rate
  - Segment B (threshold→threshold+threshold×span_ratio): tier1_factor (40%)
  - Segment C (above): tier2_factor (15%)
  - Anti-split merge: aggregates drops from recent adjacent sessions in merge window, applies piecewise to combined total so split sessions cannot earn more than continuous
  - Day/week caps remain hard limits
  - Rewarded sessions cap mode (off/soft/hard) preserved with full reason code telemetry
- Extended `get_user_drop_limits()` with 4 new OUT columns: tier factors, span ratio, merge window

**Piecewise formula example (threshold=120, span_ratio=0.50):**
- 50 raw drops → 50 adjusted
- 120 raw drops → 120 adjusted (exactly at threshold)
- 150 raw drops → 132 adjusted
- 200 raw drops → 147 adjusted
- 250 raw drops → 155 adjusted

**Validation results:**
1. Continuous fairness: 1×150 drops = 132, 3×50 split = 50+50+32 = 132 → PASS (equal)
2. Soft mode: signal logged, reward not blocked → PASS
3. Hard mode: block still works → PASS
4. Day/week hard stop overrides everything → PASS
5. Restart stitching within grace window → PASS

**Impact:**
- **Mobile App:** `get_user_drop_limits` returns tier factors + merge window. Show "reduced earning" instead of hard block after session threshold.
- **Admin Panel:** new economy settings for tier factors and merge window.

**Breaking Changes:** None. Function signature unchanged. Defaults produce softer behavior than old hard cap.

**Rollback Notes:**
Revert to migration 000014 definition of `award_drops` to restore old hard session cap behavior.

---

### [2026-03-25] - Economy RSD Calibration + Discount Pricing Model

**Migration File:** `backend/supabase/migrations/20260325000015_add_economy_currency_calibration.sql`

**Agent:** supabase-dba

**Changes:**
- Extended `tokenomics_config` with gym-level currency calibration:
  - `drops_per_rsd NUMERIC(10,4) DEFAULT 2.0000` — persisted conversion rate
  - `currency_code TEXT DEFAULT 'RSD'` — local currency reference
  - `calibration_version INTEGER DEFAULT 1` — version counter for auditing
  - `calibration_meta JSONB DEFAULT '{}'` — anchors and assumptions
  - Constraint: `drops_per_rsd > 0.05 AND drops_per_rsd < 1000`
- Extended `rewards` with discount pricing model:
  - `base_price_rsd NUMERIC(10,2) NULL` — full regular price in local currency
  - `discount_percent NUMERIC(5,2) DEFAULT 0` — discount (0–95%)
  - `price_calc_mode TEXT DEFAULT 'manual_drops'` — `'manual_drops'` or `'discount_from_rsd'`
  - `final_price_rsd_snapshot NUMERIC(10,2) NULL` — computed effective RSD at save time
  - `drops_per_rsd_snapshot NUMERIC(10,4) NULL` — conversion rate used at save time
- Created function: `compute_reward_price_drops(p_gym_id UUID, p_base_price_rsd NUMERIC, p_discount_percent NUMERIC)`
  - Returns: `effective_rsd`, `effective_drops`, `drops_per_rsd`
  - Formula: `effective_rsd = base * (1 - discount/100)`, `effective_drops = round(effective_rsd * drops_per_rsd)`
  - SECURITY DEFINER, granted to `authenticated`
- Created trigger: `trg_rewards_discount_price_sync`
  - On INSERT/UPDATE of rewards in `discount_from_rsd` mode: auto-recomputes `price_drops`, `final_price_rsd_snapshot`, `drops_per_rsd_snapshot`
  - Manual mode rewards are untouched

**Validation results:**
- Coffee 200 RSD, 20% off → effective_rsd=160, effective_drops=320, rate=2.0 ✓
- Coffee 200 RSD, 50% off → effective_rsd=100, effective_drops=200, rate=2.0 ✓
- Membership 4000 RSD, 50% off → effective_rsd=2000, effective_drops=4000, rate=2.0 ✓
- Existing rewards unchanged (manual_drops mode, base_price_rsd=null) ✓
- Constraint rejects drops_per_rsd < 0.05 ✓
- Constraint rejects discount_percent > 95 ✓

**Impact:**
- **Admin Panel:**
  - Economy settings should read/persist `drops_per_rsd` and `currency_code` from tokenomics_config.
  - Reward create/edit can use `discount_from_rsd` mode: set `base_price_rsd` + `discount_percent`, trigger auto-fills `price_drops`.
  - Calibration wizard inputs map to `calibration_meta` + `drops_per_rsd`.
- **Mobile App:**
  - No immediate changes. `price_drops` remains the redemption field.
  - Optionally: read `drops_per_rsd` for informational RSD display.

**Breaking Changes:** None. Existing rewards stay `price_calc_mode='manual_drops'`.

**Rollback Notes:**
1. Drop trigger: `DROP TRIGGER trg_rewards_discount_price_sync ON rewards;`
2. Drop function: `DROP FUNCTION compute_reward_price_drops;`
3. Remove columns (safe, all nullable or have defaults).

---

### [2026-03-25] - Admin Economy Controls Contract + Drop Preview RPC

**Migration Files:**
- `backend/supabase/migrations/20260325000007_admin_drop_model_config_contract.sql`
- `backend/supabase/migrations/20260325000008_preview_drop_calculation_rpc.sql`
- `backend/supabase/migrations/20260325000009_fix_preview_drop_calculation_explanation_array.sql`

**Agent:** supabase-dba

**Changes:**
- Added persistent admin-facing drop model table: `public.drop_model_config`
  - Columns: `gym_id`, diminishing thresholds (`full_rate_until_min`, `reduced_rate_until_min`, `low_rate_until_min`), `post_limit_factor`, `machine_base_json`, timestamps.
  - Constraints: threshold ordering and factor bounds.
  - Single global row support (`gym_id IS NULL`) + one row per gym (`gym_id IS NOT NULL` unique).
- Added RLS policies on `drop_model_config` aligned with tokenomics access model:
  - superadmin full
  - gym_owner/gym_admin scoped to their gym
  - scoped read of global row
- Added RPC: `public.preview_drop_calculation(...) RETURNS jsonb`
  - Returns contract payload keys:
    - `expectedRawDrops`
    - `adjustedDrops`
    - `reducedByDiminishing`
    - `appliedCap`
    - `finalDrops`
    - `explanation`
  - Implements machine-specific logic (bike/treadmill/elliptical/stepper/generic), anti-spike simulation mode, diminishing returns, and session cap preview.
  - Auth scope enforcement:
    - superadmin global
    - gym_owner only own gyms
    - gym_admin only `admin_gym_id`
- Added verification scripts:
  - `backend/supabase/VERIFY_DROP_PREVIEW_BIKE_SPIKE.sql`
  - `backend/supabase/VERIFY_DROP_PREVIEW_TREADMILL.sql`
  - `backend/supabase/VERIFY_DROP_PREVIEW_LONG_SESSION.sql`
  - `backend/supabase/VERIFY_DROP_PREVIEW_SESSION_CAP.sql`

**Impact:**
- **Admin Panel:**
  - Fallback adapter can be removed once frontend points to `preview_drop_calculation`.
  - Economy settings can persist drop model controls via `drop_model_config`.
- **Mobile App:**
  - No immediate contract change required.
  - Existing `award_drops()` signature unchanged.

**Backward Compatibility Contract:**
- `tokenomics_config` remains source of truth for economic caps and feature flags (`use_drop_model_v2`).
- `drop_model_config` is new persistent source of truth for calculator-specific machine and diminishing configuration.
- This is a dual-read model until admin UI migrates fully to `drop_model_config`.

**Breaking Changes:**
- None for existing mobile/admin RPC call signatures.

**Rollback Notes:**
1. Disable preview usage in admin (fallback adapter).
2. Keep `tokenomics_config` as operational source for runtime award path.
3. If needed, revert `preview_drop_calculation` and `drop_model_config` migrations; legacy runtime paths remain intact.

---

### [2026-03-25] - Runtime Wiring to New Drop Model Contract

**Migration File:** `backend/supabase/migrations/20260325000010_wire_award_drops_to_new_drop_model_config.sql`

**Agent:** supabase-dba

**Changes:**
- Updated `calculate_session_drops_v2(...)` to read calculator policy from new `public.drop_model_config` contract:
  - uses `machine_base_json` machine entry (`bike`, `treadmill`, `elliptical`, `stepper`, `generic`)
  - uses diminishing thresholds (`full_rate_until_min`, `reduced_rate_until_min`, `low_rate_until_min`, `post_limit_factor`)
- Updated `award_drops(uuid)` to consume new `calculate_session_drops_v2(...)` behavior while keeping same RPC signature.
- Preserved existing tokenomics cap flow (`tokenomics_config`) and idempotency semantics.

**Impact:**
- **Mobile App:** no RPC signature changes.
- **Admin Panel:** values edited in `drop_model_config` now affect runtime v2 drop calculation path (when `tokenomics_config.use_drop_model_v2 = true`).

**Breaking Changes:** None (function signatures unchanged).

**Validation:**
- Smoke test `award_drops_v2_smoke_idempotent` passed:
  - first award: `27`
  - repeat award: `27`
  - transaction rows for same session: `1`

---

### [2026-03-03] - Phase 3.0: Bug Fixes + Schema Prep for Sweat Arenas

**Migration File:** `backend/supabase/migrations/20260303100000_phase3_bugfixes_and_redemptions_prep.sql`

**Agent:** supabase-dba

**Changes:**
- **Bug Fix #1:** Drop `idx_redemptions_unique_pending`, create `idx_redemptions_unique_claimed` with `WHERE status = 'claimed'`
- **Bug Fix #2:** Verified `claim_reward()` already has `GREATEST(0, ...)` guard (no change needed)
- **Bug Fix #3:** Update `expire_stale_drops()` to also deduct from `gym_memberships.local_drops_balance`
- **Schema Prep:** Make `redemptions.reward_id` NULLABLE (for arena/leaderboard prizes)
- **Schema Prep:** Add `redemptions.description` column (TEXT)
- **Schema Prep:** Add `redemptions.source_type` column (CHECK: 'reward_store' | 'arena_prize' | 'leaderboard_prize')
- **Update:** `find_redemption_by_code()` with LEFT JOIN for nullable `reward_id`, returns `source_type` and `description`

**Impact:**
- Mobile App: Will need to handle `source_type` in redemptions
- Admin Panel: Will need to filter/display `source_type` for redemptions
- Reception Desk: `find_redemption_by_code()` now works for all redemption types (reward store, arena prizes, leaderboard prizes)

**Breaking Changes:**
- `redemptions.reward_id` is now NULLABLE (backward compatible)
- New columns added (backward compatible)

**Next Steps:**
1. Run: `supabase gen types typescript --local > backend/types/database.types.ts`
2. Proceed to Phase 3.1: Unified Leaderboard System

---

### [2026-03-03] - Phase 3.1: Unified Leaderboard System

**Migration Files:**
- `backend/supabase/migrations/20260303100001_unified_leaderboard_system.sql`
- `backend/supabase/migrations/20260303100002_schedule_leaderboard_prize_distribution.sql`
- `backend/supabase/functions/distribute-leaderboard-prizes/index.ts`

**Agent:** supabase-dba

**Changes:**
- **Create `get_leaderboard()` generic RPC:** Supports 'gym', 'global', 'challenge', 'arena' types
- **Rewrite `get_local_leaderboard()` and `get_global_leaderboard()`:** Thin wrappers around `get_leaderboard()` for backward compatibility
- **Create `leaderboard_snapshots` table:** Stores snapshots at period end for prize distribution history
- **Create `distribute_leaderboard_prizes()` function:** Awards prizes to top 3, inserts into `public.redemptions` with `source_type = 'leaderboard_prize'`
- **Create `distribute-leaderboard-prizes` edge function:** Processes all active gyms, sends push notifications
- **Schedule cron jobs:** Weekly (Sunday 22:55 UTC) and monthly (last day 22:55 UTC) prize distribution

**Impact:**
- Mobile App: Switch to `get_leaderboard()` RPC with `p_type` parameter
- Admin Panel: Use `get_leaderboard()` for all leaderboard views
- Leaderboard prizes: Top 3 winners get redemption entries automatically

**Breaking Changes:**
- `get_local_leaderboard()` and `get_global_leaderboard()` now return different columns (added `avatar_url`, `score_label`, `gym_name`). Old code may break.

**Next Steps:**
- Mobile agent: Refactor leaderboard screen to use `get_leaderboard()`
- Admin agent: Update leaderboard views
- Proceed to Phase 3.2: Sweat Arenas Schema

---

### [2026-03-03] - Phase 3.2: Sweat Arenas System

**Migration Files:**
- `backend/supabase/migrations/20260303100003_sweat_arenas_system.sql`
- `backend/supabase/migrations/20260303100004_update_award_drops_for_arenas.sql`
- `backend/supabase/migrations/20260303100005_schedule_arena_finalization.sql`
- `backend/supabase/functions/finalize-arena/index.ts`

**Agent:** supabase-dba

**Changes:**
- **Create `sweat_arenas` table:** Brand-sponsored competitions with scope (local/regional/network), scoring model, sponsor info, prizes JSONB
- **Create `arena_gyms` table:** Participating gyms for each arena
- **Create `arena_participants` table:** Member opt-in with live scores
- **Create `arena_results` table:** Finalized rankings with `redemption_id` FK to `public.redemptions`
- **Create `opt_into_arena()` RPC:** Validates and opts user into arena
- **Create `get_available_arenas()` RPC:** Returns arenas available to user with opt-in status, rank, score
- **Create `update_arena_scores()` helper:** Real-time updates for `total_drops` and `streak_days` arenas
- **Create `update_arena_scores_periodic()` function:** Recalculates `days_visited` and `variety_score` (called by cron every 15 min)
- **Create `finalize_arena()` RPC:** Calculates final rankings, inserts winners into `public.redemptions` with `source_type = 'arena_prize'`
- **Update `award_drops()`:** Add step 13b calling `update_arena_scores()` for real-time arena score updates
- **Create `finalize-arena` edge function:** Processes ended arenas, sends push notifications to winners
- **Schedule cron jobs:**
  - `update-arena-scores-periodic`: Every 15 minutes
  - `finalize-arena-check`: Daily at 00:30 UTC

**Impact:**
- Mobile App: Arena cards on home screen, opt-in flow, arena leaderboards
- Admin Panel: Arena CRUD, participant management, finalization
- `award_drops()` now also updates arena scores (backward compatible)

**Breaking Changes:**
- `award_drops()` now also updates arena scores (backward compatible, no breaking changes)

**Next Steps:**
- Mobile agent: Implement arena UI (cards, opt-in, leaderboards)
- Admin agent: Implement arena management (CRUD, participants, finalization)
- Update TypeScript types: `backend/types/sweatdrop.ts`

---

### [2025-01-28] - Create RLS Policies for Global Achievement Badges Storage Bucket

**Migration File:** `backend/supabase/migrations/20250128000006_create_global_achievement_badges_bucket.sql`

**Agent:** supabase-dba

**Problem:**
- Upload failed: Permission denied for bucket 'global-achievement-badges'
- Bucket exists but RLS policies are missing

**IMPORTANT: Bucket must be created manually before running this migration!**

**To create the bucket:**
1. Go to Supabase Dashboard → Storage → Create a new bucket
2. Name: `global-achievement-badges`
3. Public: Yes (for public read access)
4. File size limit: 1MB (or as needed)
5. Allowed MIME types: `image/png`, `image/jpeg`, `image/jpg`, `image/webp`, `image/svg+xml`

**Changes:**
- Added RLS policies for `global-achievement-badges` bucket:
  - "Anyone can view global badges" (SELECT) - public read access
  - "Superadmin can upload global badges" (INSERT) - only superadmin
  - "Superadmin can update global badges" (UPDATE) - only superadmin
  - "Superadmin can delete global badges" (DELETE) - only superadmin
- Bucket configuration:
  - Public: true (badges should be publicly accessible)
  - File size limit: 1MB per file
  - Allowed MIME types: image/png, image/jpeg, image/jpg, image/webp, image/svg+xml

**Impact:**
- **Backend:**
  - Superadmin can now upload badge images to global-achievement-badges bucket
  - Public URLs are accessible for mobile app and admin panel
- **Admin Panel:**
  - Superadmin can upload badge images when creating/editing global achievements
  - Images are accessible via public URLs
- **Mobile App:**
  - Can access badge images via public URLs
  - No authentication required for viewing badges

**Breaking Changes:** None (new bucket)

**Next Steps:**
1. ⏳ **Create bucket manually** in Supabase Dashboard (see instructions above)
2. ⏳ Run: `supabase db reset` (or apply migration) to create RLS policies
3. ⏳ Test: Upload badge image as superadmin
4. ⏳ Verify: Public URL access works
4. ⏳ Update admin panel to use bucket for badge uploads

**Public URL Format:**
```
https://{supabase_project_id}.supabase.co/storage/v1/object/public/global-achievement-badges/{achievement_code}-badge.png
```

**Path Structure:**
```
global-achievement-badges/
  ├── first_workout-badge.png
  ├── thousand_drops-badge.png
  ├── ten_day_streak-badge.png
  └── ...
```

---

### [2025-01-28] - Faza 1: Data Modeling - Hybrid Gamification System

**Migration Files:**
- `backend/supabase/migrations/20250128000001_create_global_achievements.sql`
- `backend/supabase/migrations/20250128000002_rename_challenges_to_gym_challenges.sql`
- `backend/supabase/migrations/20250128000003_add_criteria_to_gym_challenges.sql`
- `backend/supabase/migrations/20250128000004_create_user_progress.sql`
- `backend/supabase/migrations/20250128000005_update_user_badges_polymorphic.sql`

**Agent:** supabase-dba

**Plan Reference:** `docs/plans/hybrid_gamification_system_plan.md` - Faza 1: Data Modeling

**Changes:**

**Korak 1.1: Global Achievements Table**
- Created `global_achievements` table for fixed global badges defined by SweatDrop team
- Added columns: `code` (unique), `name`, `description`, `badge_image_url`, `criteria` (JSONB), `reward_drops`, `is_active`, `display_order`
- Added indexes: `idx_global_achievements_code`, `idx_global_achievements_is_active`, `idx_global_achievements_display_order`
- Added RLS policies: Anyone can view active achievements, Superadmin can manage achievements

**Korak 1.2: Rename Challenges to Gym Challenges**
- Renamed table: `challenges` → `gym_challenges`
- Renamed indexes: `idx_challenges_*` → `idx_gym_challenges_*`
- PostgreSQL automatically updates foreign key references

**Korak 1.3: Add Criteria JSONB to Gym Challenges**
- Added `criteria` JSONB column to `gym_challenges` for flexible challenge conditions
- Migrated existing data: `challenge_type + target_drops` → `criteria` JSONB format
- Added GIN index: `idx_gym_challenges_criteria` for JSONB queries
- Old columns (`challenge_type`, `target_drops`, `streak_days`, `milestone_threshold`) kept for backward compatibility

**Korak 1.4: Create User Progress Table**
- Created `user_progress` table for unified progress tracking (global achievements + gym challenges)
- Added polymorphic references: `global_achievement_id` OR `gym_challenge_id` (exactly one must be set)
- Added `progress_data` JSONB column for flexible progress metrics
- Added indexes: `idx_user_progress_*`, `idx_user_progress_progress_data` (GIN)
- Added RLS policies: Users can view own progress, Global achievement progress, Gym admins can view gym challenge progress, Backend can manage progress

**Korak 1.5: Update User Badges for Polymorphic References**
- Added columns: `global_achievement_id`, `gym_challenge_id` to `user_badges`
- Migrated existing data: `challenge_id` → `gym_challenge_id`
- Added constraint: `user_badges_exactly_one_reference` (exactly one reference must be set)
- Updated unique constraint: `user_badges_unique_per_user_and_achievement`
- Added indexes: `idx_user_badges_global_achievement_id`, `idx_user_badges_gym_challenge_id`
- Old `challenge_id` column kept for backward compatibility (will be dropped in future migration)

**Impact:**
- **Backend:**
  - New tables and columns support hybrid gamification system
  - Polymorphic references allow unified tracking of global achievements and gym challenges
  - Criteria JSONB enables flexible challenge conditions
  - All existing data is migrated to new structure
- **Mobile App:**
  - Will need to update queries to use `gym_challenges` instead of `challenges`
  - Will need to handle both `global_achievement_id` and `gym_challenge_id` in badges
  - Will need to use `criteria` JSONB instead of `challenge_type`/`target_drops`
- **Admin Panel:**
  - Will need to update challenge creation form to use `criteria` JSONB
  - Will need to handle polymorphic references in badge queries
  - Superadmin will need UI to manage global achievements

**Breaking Changes:**
- Table name changed: `challenges` → `gym_challenges` (all code must be updated)
- New `criteria` JSONB column (old columns deprecated but kept for backward compatibility)
- `user_badges` now uses polymorphic references (old `challenge_id` kept for backward compatibility)

**Next Steps:**
1. ⏳ Run: `supabase gen types typescript --local > backend/types/database.types.ts`
2. ⏳ Update all code references:
   - Mobile App: Update all queries from `challenges` to `gym_challenges`
   - Admin Panel: Update challenge creation form to use `criteria` JSONB
   - Backend Functions: Update `update_challenge_progress()` and other functions to use `gym_challenges`
3. ⏳ Proceed to Faza 2: Criteria System (Koraci 2.1-2.2)
4. ⏳ Proceed to Faza 3: Storage Strategy (Koraci 3.1-3.2)
5. ⏳ Proceed to Faza 4: Edge Worker Strategy (Koraci 4.1-4.4)
6. ⏳ Proceed to Faza 5: Multi-tenant Security (Koraci 5.1-5.2)

**Migration Notes:**
- All migrations are backward compatible (old columns kept)
- Data migration is performed automatically
- Foreign key references are automatically updated by PostgreSQL
- RLS policies are updated for new structure
- Old `challenge_id` column in `user_badges` will be dropped in a future migration

---

### [2025-01-27] - Fix Ambiguous Column Reference in user_badges INSERT

**Migration File:** `backend/supabase/migrations/20250127230000_rewrite_update_challenge_progress_with_strict_upsert.sql` (updated)

**Agent:** supabase-dba

**Problem:**
- Error: `column reference "challenge_id" is ambiguous` in `user_badges` INSERT ON CONFLICT clause
- PostgreSQL couldn't distinguish between PL/pgSQL variable `v_challenge.id` and table column `challenge_id`

**Changes:**
- Changed `VALUES (p_user_id, v_challenge.id, NOW())` to `VALUES (p_user_id, v_challenge_id_val, NOW())`
- Changed `ON CONFLICT (user_id, challenge_id)` to `ON CONFLICT ON CONSTRAINT user_badges_user_id_challenge_id_key`
- Uses explicit variable `v_challenge_id_val` (already defined earlier in function) instead of `v_challenge.id`

**Impact:**
- **Backend:**
  - Badge awarding now works without ambiguous reference errors
  - ON CONFLICT clause explicitly references constraint name
  - No breaking changes - same functionality, just different syntax

**Breaking Changes:** None (bug fix)

**Next Steps:**
1. ⏳ Run: `supabase gen types typescript --local > backend/types/database.types.ts`
2. ⏳ Testing: Verify badge awarding works correctly
   - Test challenge completion (should award badge)
   - Test duplicate badge attempt (should be prevented by ON CONFLICT)
   - Check Supabase logs for any errors

**Migration Notes:**
- Using constraint name `user_badges_user_id_challenge_id_key` (PostgreSQL default naming)
- Uses `v_challenge_id_val` variable (defined earlier in function) to avoid ambiguity
- To check constraint name: `SELECT conname FROM pg_constraint WHERE conrelid = 'public.user_badges'::regclass AND contype = 'u';`

---

### [2025-01-27] - Fix All Ambiguous Column References in update_challenge_progress

**Migration File:** `backend/supabase/migrations/20250127230000_rewrite_update_challenge_progress_with_strict_upsert.sql` (updated)

**Agent:** supabase-dba

**Problems:**
1. Error: `column reference "challenge_id" is ambiguous` in ON CONFLICT clause
2. Error: `column reference "is_completed" is ambiguous` in RETURNING clause
3. PostgreSQL couldn't distinguish between PL/pgSQL variables and table columns

**Changes:**
1. **ON CONFLICT clause:**
   - Changed all `ON CONFLICT (user_id, challenge_id)` to `ON CONFLICT ON CONSTRAINT challenge_progress_user_id_challenge_id_key`
   - Used constraint name instead of column names to avoid ambiguity
   - All 4 challenge types (daily, weekly/monthly, streak, milestone) now use constraint name

2. **RETURNING clause:**
   - Changed all `RETURNING id, current_drops, is_completed` to use table-qualified names: `challenge_progress.current_drops`, `challenge_progress.is_completed`
   - Changed all `RETURNING id, current_streak_days, is_completed` to use table-qualified names: `challenge_progress.current_streak_days`, `challenge_progress.is_completed`

3. **Variable renaming:**
   - Renamed `v_was_completed` to `v_was_completed_val` to avoid ambiguity with column name `is_completed`
   - Added explicit variable `v_challenge_id_val` to store `v_challenge.id` value
   - Updated all references to use new variable names

**Impact:**
- **Backend:**
  - Function now compiles without ambiguous reference errors
  - ON CONFLICT clause explicitly references constraint name
  - RETURNING clause uses table-qualified column names
  - No breaking changes - same functionality, just different syntax

**Breaking Changes:** None (bug fix)

**Next Steps:**
1. ⏳ Run: `supabase gen types typescript --local > backend/types/database.types.ts`
2. ⏳ Testing: Verify function executes without errors
   - Test with new user (should create progress records)
   - Test with existing user (should update existing records)
   - Check Supabase logs for any errors

**Migration Notes:**
- Using constraint name `challenge_progress_user_id_challenge_id_key` (PostgreSQL default naming)
- All RETURNING clauses use table-qualified column names (`challenge_progress.column_name`)
- Variable names avoid conflicts with column names (`v_was_completed_val` instead of `v_was_completed`)
- To check constraint name: `SELECT conname FROM pg_constraint WHERE conrelid = 'public.challenge_progress'::regclass AND contype = 'u';`

---

### [2025-01-27] - Rewrite update_challenge_progress with Strict UPSERT Logic

**Migration File:** `backend/supabase/migrations/20250127230000_rewrite_update_challenge_progress_with_strict_upsert.sql`

**Agent:** supabase-dba

**Problem:**
- `challenge_progress` table is empty for users because logic uses UPDATE instead of UPSERT
- Progress records are never initialized for new users
- Function doesn't create records if they don't exist

**Changes:**
- **Completely rewrote `update_challenge_progress()` function with STRICT UPSERT logic**
- **All challenge types now use atomic UPSERT:**
  - `INSERT INTO public.challenge_progress (...) VALUES (...) ON CONFLICT (user_id, challenge_id) DO UPDATE SET ...`
  - Always creates record if it doesn't exist
  - Updates record if it exists

**Challenge Type Logic:**

**Streak Challenges:**
- `last_activity_date IS NULL` (first training) → `current_streak_days = 1`
- `last_activity_date == CURRENT_DATE` → Don't change streak (already recorded today)
- `last_activity_date == CURRENT_DATE - 1` → `current_streak_days = current_streak_days + 1`
- Otherwise (gap > 1 day) → `current_streak_days = 1`
- `completed_now = true` ONLY when `current_streak_days >= streak_days` and challenge was just completed

**Daily Challenges:**
- `last_activity_date < CURRENT_DATE` → Reset `current_drops = p_drops_earned`
- Otherwise (same day) → `current_drops = current_drops + p_drops_earned`
- `completed_now = true` ONLY when `current_drops >= target_drops` and challenge was just completed

**Weekly/Monthly Challenges:**
- Just sum: `current_drops = current_drops + p_drops_earned`
- `completed_now = true` ONLY when `current_drops >= target_drops` and challenge was just completed

**Milestone Challenges:**
- Query `gym_memberships.local_drops_balance` for all-time balance
- `completed_now = true` ONLY when `local_drops_balance >= milestone_threshold` and challenge was just completed

**Security:**
- Uses `SECURITY DEFINER` to bypass RLS
- Uses `set_config('row_security', 'off', true)` to disable RLS during execution

**Debug Logging:**
- Added `RAISE NOTICE 'Streak update for user %: current value %'` for streak updates
- Comprehensive `RAISE LOG` statements throughout function

**Impact:**
- **Backend:**
  - Progress records are now always created for new users
  - All challenge types use consistent UPSERT pattern
  - Streak logic correctly handles all edge cases
  - `completed_now` only returns `true` when threshold is actually reached
- **Mobile App:**
  - Challenge progress will now be initialized automatically
  - Progress tracking will work for all users (new and existing)
  - Completion status will be accurate

**Breaking Changes:** None (function rewrite, same interface)

**Next Steps:**
1. ⏳ Run: `supabase gen types typescript --local > backend/types/database.types.ts`
2. ⏳ Testing: Verify challenge progress is created for new users
   - Test with new user (should create progress records)
   - Test with existing user (should update existing records)
   - Test streak logic (first time, consecutive, gap)
   - Test daily reset logic
   - Test completion detection
3. ⏳ Check Supabase logs for `RAISE NOTICE` and `RAISE LOG` messages
   - Verify progress records are being created
   - Verify streak values are correct
   - Verify completion detection works

**Migration Notes:**
- Function now uses STRICT UPSERT for all challenge types
- Progress records are always created if they don't exist
- This fixes the issue where `challenge_progress` table was empty

---

### [2025-01-27] - Fix Streak Logic in update_challenge_progress Function

**Migration File:** `backend/supabase/migrations/20250127220000_fix_streak_logic_in_update_challenge_progress.sql`

**Agent:** supabase-dba

**Problem:**
- Challenge progress not updating even though `add_drops()` works
- Streak logic not handling NULL `last_activity_date` (first time)
- `completed_now` not returned correctly when streak reaches target

**Changes:**
- Fixed streak logic in `update_challenge_progress()` function:
  - **NULL (first time):** Set `current_streak_days = 1`
  - **Same day (`last_activity_date == p_session_date`):** Don't change (already recorded today)
  - **Next day (`last_activity_date == p_session_date - 1`):** Increment `current_streak_days` by 1
  - **Gap (`last_activity_date < p_session_date - 1`):** Reset `current_streak_days` to 1
- Added `RAISE NOTICE` for streak updates: `'Streak update for user %: current value %'`
- Fixed `completed_now` return value: Returns `true` when `current_streak_days >= streak_days` and challenge was just completed
- All challenge types use UPSERT pattern: `INSERT ... ON CONFLICT (user_id, challenge_id) DO UPDATE`

**Impact:**
- **Backend:**
  - Streak challenges now correctly track consecutive days
  - First-time streak tracking works (NULL handling)
  - `completed_now` correctly indicates when streak reaches target
  - Debug logging helps diagnose issues
- **Mobile App:**
  - Challenge progress should now update correctly
  - Streak challenges will show correct progress
  - Completion status will be accurate

**Breaking Changes:** None (bug fix)

**Next Steps:**
1. ⏳ Run: `supabase gen types typescript --local > backend/types/database.types.ts`
2. ⏳ Testing: Verify streak challenge progress updates
   - Test first-time streak (should set to 1)
   - Test consecutive days (should increment)
   - Test same-day multiple workouts (should not increment)
   - Test gap in days (should reset to 1)
   - Test completion when streak reaches target
3. ⏳ Check Supabase logs for `RAISE NOTICE` messages:
   - Look for `'Streak update for user %: current value %'` messages
   - Verify streak values are correct

**Migration Notes:**
- Function uses UPSERT pattern for all challenge types
- Streak logic now properly handles all edge cases (NULL, same day, next day, gap)
- `completed_now` is returned correctly when streak reaches target

---

### [2025-01-27] - Fix Challenge Progress Insert Issue with Debug Logging

**Migration File:** `backend/supabase/migrations/20250127200000_add_debug_logging_and_fix_challenge_progress.sql`

**Agent:** supabase-dba

**Changes:**
- Added comprehensive debug logging using `RAISE LOG` throughout `update_challenge_progress()` function
- Added input validation to prevent NULL or invalid values
- Added gym_id verification to ensure challenges match the provided gym_id
- Added challenge count logging to see how many challenges are found
- Added per-challenge logging to track processing of each challenge
- Added summary logging at the end of function execution
- Function already uses `INSERT ... ON CONFLICT` (UPSERT) correctly - no changes needed
- Function already handles `is_completed` correctly - only updates if not already completed

**Debug Logging Added:**
- Function call parameters (user_id, gym_id, drops_earned, session_date)
- Input validation errors (NULL values, invalid drops)
- Challenge count (how many active challenges found)
- Per-challenge processing (challenge ID, type, name)
- Progress updates (progress_id, current_drops, was_completed)
- Challenge completion status
- Badge awarding
- Summary (processed vs found challenges)

**Impact:**
- **Backend:**
  - Debug logging will help diagnose why challenge progress is not updating
  - Check Supabase Dashboard -> Logs for `RAISE LOG` messages
  - Look for messages starting with `update_challenge_progress`
  - No breaking changes - only adds logging and validation

**Breaking Changes:** None (additive only - logging and validation)

**Next Steps:**
1. ⏳ Run: `supabase gen types typescript --local > backend/types/database.types.ts`
2. ⏳ Testing: Check Supabase Dashboard -> Logs after workout completion
   - Look for `update_challenge_progress called:` messages
   - Check if challenges are found: `Found X active challenges`
   - If 0 challenges found, check:
     - Are there active challenges for this gym? (`is_active = true`)
     - Is session date within challenge date range? (`start_date <= session_date <= end_date`)
     - Is `gym_id` correct in the session?
   - Verify challenge processing: `Processing challenge X for user Y`
   - Check progress updates: `Daily challenge updated:` etc.
   - Verify completion: `Daily challenge X completed!`

**Debugging Guide:**
- **If you see "No active challenges found":**
  - Check `challenges` table: `SELECT * FROM challenges WHERE gym_id = ? AND is_active = true`
  - Verify date range: `SELECT * FROM challenges WHERE start_date <= ? AND end_date >= ?`
  - Check if `gym_id` in session matches `gym_id` in challenges
  
- **If you see "Processing challenge X" but no updates:**
  - Check RLS policies: `SELECT * FROM pg_policies WHERE tablename = 'challenge_progress'`
  - Verify `set_config('row_security', 'off', true)` is working
  - Check for constraint violations in logs
  
- **If you see "ERROR: p_user_id is NULL" or "ERROR: p_gym_id is NULL":**
  - Check `add_drops()` function call - verify parameters are passed correctly
  - Check session data - verify `user_id` and `gym_id` are set in sessions table

**Migration Notes:**
- Function already uses `INSERT ... ON CONFLICT` correctly - creates new records if they don't exist
- Function already handles `is_completed` correctly - only marks as completed if not already completed
- Debug logging will help identify the root cause of the issue

---

### [2025-01-27] - Fix Challenge Progress INSERT RLS Policy (400 Error)

**Migration File:** `backend/supabase/migrations/20250127210000_fix_challenge_progress_insert_rls.sql`

**Agent:** supabase-dba

**Problem:**
- 400 error on POST to `/rest/v1/challenge_progress`
- RLS policy was blocking INSERT operations
- Possible causes: missing `gym_id`, `gym_id` doesn't match challenge's `gym_id`, or RLS policy too restrictive

**Changes:**
- Updated INSERT RLS policy to validate `gym_id` matches challenge's `gym_id`
- Policy now requires:
  - `auth.uid() = user_id` (user must match)
  - `gym_id IS NOT NULL` (gym_id must be provided)
  - `gym_id` must match the challenge's `gym_id` (referential integrity)
- Still allows SECURITY DEFINER functions to insert (for `update_challenge_progress()`)

**Impact:**
- **Backend:**
  - INSERT operations now validate `gym_id` matches challenge's `gym_id`
  - Prevents invalid data from being inserted
  - SECURITY DEFINER functions still work correctly
- **Frontend:**
  - If frontend tries to INSERT directly, it must provide valid `gym_id` that matches challenge's `gym_id`
  - **Recommendation:** Frontend should NOT insert directly - use `update_challenge_progress()` RPC function instead

**Breaking Changes:** None (policy update only)

**Next Steps:**
1. ⏳ Run: `supabase gen types typescript --local > backend/types/database.types.ts`
2. ⏳ Testing: Verify INSERT operations work correctly
   - Test direct INSERT with valid `gym_id` (should work)
   - Test direct INSERT without `gym_id` (should fail with clear error)
   - Test direct INSERT with wrong `gym_id` (should fail with RLS error)
3. ⏳ Frontend: Review code that inserts into `challenge_progress`
   - Remove direct INSERT operations if any
   - Use `update_challenge_progress()` RPC function instead
   - Ensure `gym_id` is provided if direct INSERT is necessary

**Common Causes of 400 Error:**
- Missing `gym_id` field (NOT NULL constraint violation)
- `gym_id` doesn't match challenge's `gym_id` (RLS policy violation)
- Duplicate `user_id + challenge_id` (UNIQUE constraint violation)
- Invalid `challenge_id` (Foreign key constraint violation)

**Migration Notes:**
- This fixes RLS policy to properly validate `gym_id` matching
- Frontend should use `update_challenge_progress()` RPC function instead of direct INSERT
- Direct INSERT will only work if all constraints are met (user_id, gym_id, challenge_id validation)

---

### [2025-01-27] - Fix add_drops() Session Date for Challenge Progress

**Migration File:** `backend/supabase/migrations/20250127170000_fix_add_drops_session_date.sql`

**Agent:** supabase-dba

**Changes:**
- Updated `add_drops()` function to use session date instead of `CURRENT_DATE` when updating challenge progress
- For `transaction_type = 'session'`, function now queries `sessions.started_at` to get the correct date
- Falls back to `CURRENT_DATE` if session not found or for non-session transactions
- Updated challenge completion check to use `completed_at >= NOW() - INTERVAL '1 second'` for more reliable detection

**Impact:**
- **Mobile App:**
  - Challenge progress now correctly tracks drops based on when workout was performed
  - Daily challenges will correctly reset based on workout date, not current date
  - Streak challenges will correctly track consecutive days based on workout date
- **Backend:**
  - Challenge progress updates now use correct session date
  - No breaking changes - existing functionality preserved

**Breaking Changes:** None (bug fix)

**Next Steps:**
1. ⏳ Run: `supabase gen types typescript --local > backend/types/database.types.ts`
2. ⏳ Testing: Verify challenge progress updates correctly after workout completion
   - Test daily challenge reset based on workout date
   - Test streak challenge tracking with workouts on different days
   - Test weekly/monthly challenge progress accumulation

**Migration Notes:**
- This fixes a bug where challenge progress was not updating correctly
- Challenge progress now correctly uses session date instead of current date
- This ensures daily challenges reset correctly and streak challenges track consecutive days properly

---

### [2025-01-27] - Add Debug Logging to update_challenge_progress

**Migration File:** `backend/supabase/migrations/20250127170001_add_debug_logging_to_update_challenge_progress.sql`

**Agent:** supabase-dba

**Changes:**
- Added `RAISE NOTICE` logging throughout `update_challenge_progress()` function
- Logs function call parameters, challenge processing, and completion status
- Added input validation to prevent NULL or invalid values
- Logs summary of how many challenges were processed

**Impact:**
- **Backend:**
  - Debug logging will help diagnose why challenge progress is not updating
  - Check Supabase logs for `RAISE NOTICE` messages to see what's happening
  - No breaking changes - only adds logging

**Breaking Changes:** None (additive only)

**Next Steps:**
1. ⏳ Run: `supabase gen types typescript --local > backend/types/database.types.ts`
2. ⏳ Testing: Check Supabase logs after workout completion
   - Look for `update_challenge_progress called:` messages
   - Check if challenges are found: `Processing challenge:` or `No active challenges found`
   - Verify challenge updates: `Daily challenge updated:` etc.

**Debugging:**
- To view logs: `supabase logs` or check Supabase dashboard logs
- Look for messages starting with `update_challenge_progress`
- If you see "No active challenges found", check:
  - Are there active challenges for this gym? (`is_active = true`)
  - Is session date within challenge date range? (`start_date <= session_date <= end_date`)
  - Is `gym_id` correct in the session?

---

## Recent Migrations

### [2025-01-27] - Leaderboard RPC Functions

**Migration File:** `backend/supabase/migrations/20250127120000_leaderboard_rpc_functions.sql`

**Agent:** supabase-dba

**Changes:**
- Added RPC function: `get_local_leaderboard(p_gym_id UUID, p_period leaderboard_period DEFAULT 'monthly', p_limit INTEGER DEFAULT 100)`
  - Returns: `user_id`, `username`, `drops`, `rank` for gym-specific leaderboard
  - Orders by `gym_memberships.local_drops_balance DESC`
- Added RPC function: `get_global_leaderboard(p_period leaderboard_period DEFAULT 'monthly', p_limit INTEGER DEFAULT 100)`
  - Returns: `user_id`, `username`, `drops`, `rank` for global leaderboard
  - Orders by `profiles.total_drops DESC`
- Both functions use `SECURITY DEFINER` and calculate rank using `ROW_NUMBER()`
- Period parameter is reserved for future filtering (currently returns all-time)

**Impact:**
- **Mobile App:** 
  - Replace direct queries to `gym_memberships` and `profiles` with RPC calls
  - Use `get_local_leaderboard()` for gym leaderboard in `app/leaderboard.tsx`
  - Use `get_global_leaderboard()` for global leaderboard
  - Add leaderboard preview widget to home screen (top 3 users)
- **Admin Panel:**
  - Use `get_local_leaderboard()` for leaderboard widget in dashboard
  - Display top 3 users with their drops balances

**Breaking Changes:** None (additive only)

**Next Steps:**
1. ⏳ Run: `supabase gen types typescript --local > backend/types/database.types.ts`
2. ⏳ Mobile-coder: Update `app/leaderboard.tsx` to use RPC functions (Phase 2.3)
3. ⏳ Mobile-coder: Add leaderboard preview to `app/home.tsx` (Phase 2.3)
4. ⏳ Admin-coder: Add leaderboard widget to dashboard (Phase 3.1)

---

### [2025-01-27] - Disable SmartCoach Feature Per Gym

**Migration File:** `backend/supabase/migrations/20250127130000_disable_smartcoach_per_gym.sql`

**Agent:** supabase-dba

**Changes:**
- Added column: `gyms.smartcoach_enabled BOOLEAN DEFAULT false NOT NULL`
  - Controls SmartCoach feature availability per gym
  - Defaults to `false` (disabled) for MVP
- Added index: `idx_gyms_smartcoach_enabled` (partial index for enabled gyms)

**Impact:**
- **Mobile App:**
  - Check `gym.smartcoach_enabled` before showing SmartCoach features
  - Hide workout plans, subscriptions, and live session features if disabled
  - Query: `SELECT smartcoach_enabled FROM gyms WHERE id = ?`
- **Admin Panel:**
  - Add toggle in gym settings to enable/disable SmartCoach
  - Update gym settings page to allow gym admins to toggle this flag
  - File: `app/dashboard/gym/[id]/settings/page.tsx` (if exists)

**Breaking Changes:** None (additive only, defaults to disabled)

**Next Steps:**
1. ⏳ Run: `supabase gen types typescript --local > backend/types/database.types.ts`
2. ✅ Mobile-coder: Add SmartCoach feature flag check in mobile app
   - ✅ Updated `Gym` interface to include `smartcoach_enabled` field
   - ✅ SmartCoach card on home screen now conditionally renders based on `activeGym?.smartcoach_enabled`
   - ✅ Workout screen checks `smartcoach_enabled` before loading SmartCoach plan items
   - ✅ Added `smartcoach_enabled` to gym query in workout screen's `createSession` function
   - ⏳ Check before allowing SmartCoach subscriptions (if needed)
3. ⏳ Admin-coder: Add SmartCoach toggle in gym settings
   - Allow gym admins to enable/disable SmartCoach per gym
   - Show current status in gym dashboard

---

### [2025-01-27] - Challenges & Badges Integration (Phase 1)

**Migration Files:**
- `backend/supabase/migrations/20250127140000_add_badge_image_to_challenges.sql`
- `backend/supabase/migrations/20250127140001_create_user_badges_table.sql`
- `backend/supabase/migrations/20250127140002_add_badge_awarding_to_add_drops.sql`
- `backend/supabase/migrations/20250127140003_create_get_user_badges_rpc.sql`

**Agent:** supabase-dba

**Changes:**

**Step 1.1 - Badge Image URL:**
- Added column: `challenges.badge_image_url TEXT` (nullable, optional)
  - Stores URL to badge image/icon that users earn when completing challenge
  - Can be NULL (optional field)

**Step 1.2 - User Badges Table:**
- Created table: `public.user_badges`
  - Fields: `id`, `user_id`, `challenge_id`, `earned_at`, `created_at`
  - Unique constraint: `(user_id, challenge_id)` - user can only earn badge once per challenge
- Created indexes:
  - `idx_user_badges_user_id` on `user_id`
  - `idx_user_badges_challenge_id` on `challenge_id`
  - `idx_user_badges_earned_at` on `earned_at DESC` (for sorting)
- RLS policies:
  - Users can view own badges
  - Users can view other users' badges (for leaderboard/social)
  - Backend functions can insert badges (via SECURITY DEFINER)

**Step 1.3 - Badge Awarding Logic:**
- Modified function: `public.add_drops()`
  - Automatically awards badge when challenge is completed
  - Inserts into `user_badges` table after marking challenge as completed
  - Uses `ON CONFLICT DO NOTHING` to prevent duplicate badges
  - Badge is awarded only once per challenge (enforced by unique constraint)

**Step 1.4 - RPC Functions:**
- Added function: `public.get_user_badges(p_user_id UUID)`
  - Returns: `badge_id`, `challenge_id`, `challenge_name`, `badge_image_url`, `earned_at`
  - Sorted by `earned_at DESC` (most recent first)
  - JOINs `user_badges` with `challenges` to get badge image URL
- Added function: `public.get_badge_statistics(p_challenge_id UUID)`
  - Returns: `total_earned INTEGER` (number of users who earned badge)
  - Used for admin panel statistics

**Impact:**
- **Mobile App:**
  - Call `get_user_badges(user_id)` RPC to fetch user's badges
  - Display badges in Trophy Room component
  - Show badge animation in session summary when badge is earned
  - Filter badges by `earned_at` to show newly earned badges (last 5 minutes)
  - Example RPC call:
    ```typescript
    const { data, error } = await supabase.rpc('get_user_badges', {
      p_user_id: userId
    });
    ```
- **Admin Panel:**
  - Add `badge_image_url` field to challenges form (upload or URL input)
  - Call `get_badge_statistics(challenge_id)` RPC to show badge statistics
  - Display badge statistics in challenges management page
  - Show badge thumbnail in challenges list
  - Example RPC call:
    ```typescript
    const { data, error } = await supabase.rpc('get_badge_statistics', {
      p_challenge_id: challengeId
    });
    ```

**Breaking Changes:** None (additive only)

**Next Steps:**
1. ⏳ Run: `supabase gen types typescript --local > backend/types/database.types.ts`
2. ⏳ Mobile-coder: Implement Trophy Room component (Phase 2.3)
   - Use `get_user_badges()` RPC to fetch badges
   - Display badges in grid layout with images
   - Show badge count in home screen header
3. ⏳ Mobile-coder: Add badge animation in session summary (Phase 2.2)
   - Check for newly earned badges (earned_at in last 5 minutes)
   - Show `BadgeEarnedModal` with animation
4. ⏳ Admin-coder: Add badge image upload to challenges form (Phase 3.1)
   - Add `badge_image_url` field to form
   - Upload badge image to Supabase Storage (or use URL input)
5. ⏳ Admin-coder: Add badge statistics to challenges page (Phase 3.2)
   - Use `get_badge_statistics()` RPC to show statistics
   - Display badge preview in challenges list

**Integration Notes:**
- Badges are automatically awarded when `add_drops()` marks challenge as completed
- No manual badge awarding needed - happens automatically via workout completion
- Badge remains in `user_badges` even if challenge is deactivated
- Badge image URL is optional - challenges can exist without badge images

---

### [2025-01-27] - Challenge Engine Refinement (Phase 1: Schema Unification)

**Migration Files:**
- `backend/supabase/migrations/20250127150000_unify_challenge_types.sql`
- `backend/supabase/migrations/20250127150001_unify_challenge_progress.sql`
- `backend/supabase/migrations/20250127150002_update_challenges_schema.sql`

**Agent:** supabase-dba

**Changes:**

**Step 1.1 - Unified Challenge Type Enum:**
- Dropped old `challenge_type` ENUM and `frequency` TEXT field
- Created new unified `challenge_type` ENUM with 5 types:
  - `daily` - Sum of drops in a single day
  - `weekly` - Cumulative drops in a week (fixed date range)
  - `monthly` - Cumulative drops in a month (fixed date range)
  - `streak` - Consecutive days of training (min 1 drop per day)
  - `milestone` - All-time drops in a specific gym
- Migrated existing data:
  - `frequency = 'daily'` → `challenge_type = 'daily'`
  - `frequency = 'weekly'` → `challenge_type = 'weekly'`
  - `frequency = 'streak'` → `challenge_type = 'streak'`
  - `frequency = 'one-time'` → `challenge_type = 'monthly'`
- Single `challenge_type` column now replaces both old fields

**Step 1.2 - Unified Challenge Progress Table:**
- Added `gym_id` column to `challenge_progress` table (required, NOT NULL)
  - Migrated from `challenges.gym_id` for all existing records
  - Required for milestone challenges and gym-specific filtering
- Added streak tracking columns:
  - `current_streak_days INTEGER DEFAULT 0 NOT NULL` - tracks consecutive days
  - `last_activity_date DATE` - last date when user earned drops
- Created indexes:
  - `idx_challenge_progress_gym_id` on `gym_id`
  - `idx_challenge_progress_last_activity_date` on `last_activity_date`
- Deprecated `user_challenge_progress` table:
  - Marked as DEPRECATED in comments
  - **NOT deleted** - kept for data preservation
  - New challenges should use `challenge_progress` only

**Step 1.3 - Updated Challenges Schema:**
- Marked minutes-based fields as DEPRECATED (kept for backward compatibility):
  - `required_minutes` → use `target_drops` instead
  - `drops_bounty` → use `reward_drops` instead
  - `machine_type` → no longer used (challenges are drops-based)
- Added `milestone_threshold INTEGER` field:
  - For milestone challenges only
  - Must be set when `challenge_type = 'milestone'`
- Added constraint `challenges_target_drops_check`:
  - Milestone challenges must use `milestone_threshold`
  - All other challenge types must use `target_drops`
- Updated documentation comments for `target_drops` and `reward_drops`

**Impact:**
- **Mobile App:**
  - Update challenge queries to use unified `challenge_type` enum
  - Remove references to `frequency` field
  - Use `challenge_progress` table only (not `user_challenge_progress`)
  - Handle new challenge types: `monthly` and `milestone`
  - For milestone challenges, check `milestone_threshold` instead of `target_drops`
- **Admin Panel:**
  - Update challenge form to use unified `challenge_type` enum
  - Remove `frequency` field from form
  - Add `monthly` and `milestone` options to challenge type selector
  - For milestone challenges, show `milestone_threshold` field instead of `target_drops`
  - Update challenge queries to use `challenge_type` only
  - Stop using `user_challenge_progress` table

**Breaking Changes:**
- ⚠️ **Breaking:** `frequency` field removed from `challenges` table
  - All code using `challenges.frequency` must be updated to use `challenges.challenge_type`
- ⚠️ **Breaking:** `challenge_type` enum values changed
  - Old: `('daily', 'weekly', 'streak')`
  - New: `('daily', 'weekly', 'monthly', 'streak', 'milestone')`
- ⚠️ **Breaking:** `user_challenge_progress` table deprecated
  - New challenges must use `challenge_progress` table
  - Old data preserved but table should not be used for new features
- ✅ **Non-breaking:** `challenge_progress` table extended
  - Added `gym_id`, `current_streak_days`, `last_activity_date` columns
  - Existing data migrated automatically

**Next Steps:**
1. ⏳ Run: `supabase gen types typescript --local > backend/types/database.types.ts`
2. ⏳ Mobile-coder: Update challenge queries to use `challenge_type` enum
   - Remove `frequency` field references
   - Handle new `monthly` and `milestone` challenge types
   - Use `challenge_progress` table only
3. ⏳ Admin-coder: Update challenge form and management
   - Replace `frequency` field with `challenge_type` enum selector
   - Add `monthly` and `milestone` options
   - Show `milestone_threshold` field for milestone challenges
   - Update all challenge queries
4. ⏳ Backend: Implement Phase 2 (Logic Refinement)
   - Create `update_challenge_progress()` function
   - Refactor `add_drops()` to use new function
   - Implement proper streak tracking logic

**Migration Notes:**
- All existing challenge data is preserved and migrated
- `user_challenge_progress` table is NOT deleted (kept for data preservation)
- Minutes-based fields are marked as DEPRECATED but kept for backward compatibility
- New challenge types (`monthly`, `milestone`) are now available

---

### [2025-01-27] - Challenge Engine Refinement (Phase 2: Logic Refinement)

**Migration Files:**
- `backend/supabase/migrations/20250127160000_create_update_challenge_progress_function.sql`
- `backend/supabase/migrations/20250127160001_refactor_add_drops_challenge_logic.sql`
- `backend/supabase/migrations/20250127160002_create_daily_reset_function.sql`

**Agent:** supabase-dba

**Changes:**

**Step 2.1 & 2.3 - Unified Challenge Progress Function:**
- Created function: `public.update_challenge_progress(p_user_id UUID, p_gym_id UUID, p_drops_earned INTEGER, p_session_date DATE)`
  - Handles all 5 challenge types: `daily`, `weekly`, `monthly`, `streak`, `milestone`
  - Returns progress information: `challenge_id`, `challenge_name`, `challenge_type`, `current_progress`, `target_progress`, `is_completed`, `completed_now`, `reward_drops`
  - Automatically awards badges when challenges are completed (Step 2.5)
- **Daily Challenges:**
  - Only counts drops earned on `p_session_date`
  - Resets `current_drops` to 0 if last update was not today
  - Completes when `current_drops >= target_drops`
- **Weekly/Monthly Challenges:**
  - Cumulative drops in date range (`start_date` to `end_date`)
  - Completes when cumulative `current_drops >= target_drops`
- **Streak Challenges:**
  - Tracks consecutive days with at least 1 drop
  - Atomic streak tracking using `ON CONFLICT DO UPDATE`:
    - Same day: don't increment (already counted)
    - Next day: increment `current_streak_days` by 1
    - Gap (more than 1 day): reset `current_streak_days` to 1
  - Completes when `current_streak_days >= streak_days`
- **Milestone Challenges:**
  - Queries `gym_memberships.local_drops_balance` for total all-time drops in gym
  - Completes when `local_drops_balance >= milestone_threshold`

**Step 2.2 - Refactored add_drops() Function:**
- Simplified `add_drops()` function by removing old challenge progress logic
- Replaced with single call to `update_challenge_progress()`
- **Result:** `add_drops()` is now much simpler and easier to maintain
- Still handles:
  - Global and local balance updates
  - Transaction recording
  - Challenge reward drops awarding
  - Badge awarding (via `update_challenge_progress()`)

**Step 2.4 - Daily Reset Function:**
- Created function: `public.reset_daily_challenges()`
  - Resets `current_drops` to 0 for daily challenges
  - Marks challenges as incomplete (`is_completed = false`)
  - Only resets challenges that haven't been updated today
  - Should be called daily at 00:00:00 via cron job or scheduled task

**Step 2.5 - Automatic Badge Awarding:**
- Integrated into `update_challenge_progress()` function
- Automatically inserts badge into `user_badges` table when `is_completed` changes to `true`
- Uses `ON CONFLICT DO NOTHING` to prevent duplicate badges
- Badge is awarded only once per challenge (enforced by unique constraint)

**Impact:**
- **Backend:**
  - `add_drops()` is now simpler and more maintainable
  - All challenge logic is centralized in `update_challenge_progress()`
  - No breaking changes - existing code continues to work
  - Badge awarding is automatic (no manual intervention needed)
- **Mobile App:**
  - No changes required - `add_drops()` RPC call remains the same
  - Challenge progress updates automatically when drops are earned
  - Badges are awarded automatically when challenges are completed
- **Admin Panel:**
  - No changes required - challenge management remains the same
  - Can schedule `reset_daily_challenges()` via cron job

**Breaking Changes:** None (backward compatible)

**Next Steps:**
1. ⏳ Run: `supabase gen types typescript --local > backend/types/database.types.ts`
2. ⏳ Backend: Schedule `reset_daily_challenges()` function
   - Set up cron job or scheduled task to call function daily at 00:00:00
   - Can use pg_cron extension if available, or external cron service
3. ⏳ Testing: Verify all challenge types work correctly
   - Test daily challenge reset
   - Test streak tracking (consecutive days, gaps, same-day multiple workouts)
   - Test milestone challenges (all-time balance tracking)
   - Test badge awarding for all challenge types

**Migration Notes:**
- `add_drops()` function is now much simpler and ready for sensor integration
- All challenge logic is unified in `update_challenge_progress()` function
- Badge awarding is automatic - no manual intervention needed
- Daily reset function should be scheduled via cron job

**Key Improvement:**
- ✅ **`add_drops()` is now "lighter" and ready for sensor integration**
  - Removed complex challenge progress logic
  - Single call to unified `update_challenge_progress()` function
  - Easier to maintain and extend
  - All challenge types handled consistently

---

### [2026-04-24] - Create user-avatars Storage Bucket RLS Policies

**Migration File:** `backend/supabase/migrations/20260424000000_create_user_avatars_storage_bucket.sql`

**Agent:** supabase-dba

**Changes:**
- Added RLS policies on `storage.objects` scoped to `bucket_id = 'user-avatars'`:
  - `"Anyone can view user avatars"` — SELECT open to anon + authenticated
  - `"Superadmin can upload user avatars"` — INSERT restricted to `role = 'superadmin'`
  - `"Superadmin can update user avatars"` — UPDATE restricted to `role = 'superadmin'`
  - `"Superadmin can delete user avatars"` — DELETE restricted to `role = 'superadmin'`

**Important — Manual bucket creation required:**
The `user-avatars` bucket must be created manually via Supabase Dashboard before the policies take effect (same caveat as `global-achievement-badges`):
1. Dashboard → Storage → New bucket
2. Name: `user-avatars` | Public: ✅ | File size limit: 512 KB | MIME types: `image/png, image/webp, image/svg+xml`

**Impact:**
- **Mobile App:** Phase 3 onboarding avatar picker will read 48 sport avatar PNGs from this bucket
- **Admin Panel:** No direct changes; superadmin uploads via Phase 2 generation script

**Breaking Changes:**
- None

**Next Steps:**
1. [ ] Create `user-avatars` bucket manually in Supabase Dashboard (see above)
2. [ ] Verify bucket visible: Dashboard → Storage → `user-avatars`
3. [ ] Phase 2: `pnpm avatars:generate` → visual review → `pnpm avatars:upload`
4. [ ] Phase 3: mobile-coder refactors `apps/mobile-app/app/(onboarding)/avatar.tsx`
5. [ ] Phase 4: backfill migration (after Phase 2 upload confirmed live)

---

## Migration Template

Use this template when adding new migration notes:

```markdown
### [YYYY-MM-DD] - [Migration Name]

**Migration File:** `backend/supabase/migrations/YYYYMMDDHHMMSS_name.sql`

**Agent:** supabase-dba

**Changes:**
- [List of changes: tables, columns, functions, policies]

**Impact:**
- **Mobile App:** [What mobile app needs to update]
- **Admin Panel:** [What admin panel needs to update]

**Breaking Changes:**
- [List any breaking changes, or "None"]

**Next Steps:**
1. [ ] Run: `supabase gen types typescript --local`
2. [ ] Mobile-coder: [Specific task]
3. [ ] Admin-coder: [Specific task]
```

---

## Archive

Migrations older than 30 days will be archived here.

---

**Note:** This file is maintained by `supabase-dba` agent. Frontend agents should check this file before starting work.
