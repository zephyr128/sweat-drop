# Plan: P0 Production Bugfix — Pause Auto-Resume Defeats Manual Pause + BLE Machine Cross-Talk

**Created:** 2026-05-08
**Author:** architect
**Severity:** **P0 — CRITICAL PRODUCTION INCIDENT** (Vortex pilot, 2 reported users, ≥305 fraud events combined)
**Pilot impact:** Drops are being awarded against **the wrong machine's metrics**. Pause is non-functional on FTMS treadmills. Risk dashboard shows two distinct fraud-event signatures originating from the same root cause.

---

## Context

Dva produkcijska bug-a + jedna risk-events serija prijavljeni iz Vortex teretane (real FTMS treadmills, real users).

### Bug A — Pause se ne drži na treadmill-u
> "I'm on treadmill, walking. I hit pause, the pause screen appears for a second and then disappears. The workout actually gets paused, but the gauge is displayed and the animation is on. I need to press the pause button again and quickly catch resume button before it disappears in order to resume the workout."

**Reprodukcija:** Korisnik na FTMS treadmill-u → klikne `Pause` → pauza overlay se pojavi i odmah nestane. `isPaused` ide na `true` pa se odmah vraća na `false` zbog auto-resume-a iz BLE callback-a.

**Root cause (potvrđen čitanjem koda — `apps/mobile-app/app/workout.tsx:1000-1007`):**

```typescript
// PRO-FITNESS: Auto-Resume - if crankRevolutions started growing again, auto-resume
if (currentRevolutions > lastCrankRevolutionsForAutoResumeRef.current && isPausedRef.current && isMountedRef.current) {
  runOnJS(setIsPaused)(false);
  runOnJS(setShowAutoPauseOverlay)(false);
}
lastCrankRevolutionsForAutoResumeRef.current = currentRevolutions;
```

FTMS treadmill emituje **kumulativni** stride/distance counter na ~1 Hz. Belt traka ima fizičku inerciju — kada korisnik pritisne `Pause` na app-u, **treadmill traka i dalje radi** (ručno mora da se zaustavi na samoj mašini). Zato `currentRevolutions` raste i posle `setIsPaused(true)`, i unutar **~1 sekunde** auto-resume vrati `isPaused=false`. Bez razlikovanja `pauseReason === 'manual'` od `'inactivity'`, korisnik **ne može** ručno da pauzira FTMS treadmill dok god se traka ne zaustavi.

Razlog što "the gauge is displayed and the animation is on": auto-resume vrati `isPaused=false`, gauge animacija nastavlja da renderuje (`useDerivedValue`-ovi i `useAnimatedReaction`-i nisu paused-aware ovde), ali korisnikov `pausedTime` je `null` jer setovan na `null` u `pauseWorkout`-u tek bi se setovao na resume-u; rezultat je nedefinisano stanje gde duration timer možda jeste možda nije pauziran.

### Bug B — BLE cross-talk: app šalje merenja sa **druge mašine**
> "The machine was off. I turned the machine [on], scanned the NFC with a fresh new account. First, the workout wouldn't start — verifying activity label. I ended the workout and started again and the app connected but the metrics were showing 8.5 instead of 2.3. It looked like the data was received from another machine. This shouldn't happen!!!!"

**Reprodukcija:**
1. Mašina X (npr. treadmill br. 2.3) je **ugašena**
2. Korisnik se ulogovao sa svežim nalogom, skenirao NFC za mašinu X (ili QR)
3. Prva sesija: stuck na "verifying activity" jer mašina X ne emituje BLE i nema RPM podataka → korisnik završi sesiju
4. Druga sesija: app se "connect"-uje (ali ne na X — već na **najbližu drugu mašinu**, npr. Y koja je susedni treadmill koji radi 8.5 km/h)
5. Korisnik vidi 8.5 km/h iako je on lično mirno stoji ispred ugašenog X-a → drops se nakuplja na osnovu **tuđih metrika**

**Root cause (potvrđen čitanjem koda — `apps/mobile-app/lib/ble-service.ts:448-491`):**

```typescript
// Check if sensorId is a base64 string (from Web Bluetooth API)
const isBase64 = /^[A-Za-z0-9+/=]+$/.test(sensorId) && sensorId.length > 20;

if (isBase64) {
  // ... scan ...
  const devices = await this.scanForDevices(5000);
  // Sort by RSSI (strongest signal first)
  const sortedDevices = devices.sort((a, b) => (b.rssi || -100) - (a.rssi || -100));
  // Try to connect to the first available device (strongest signal)
  // Device name is more reliable than ID for matching     ← LIE. We never check name vs sensorId.
  const targetDevice = sortedDevices[0];
  // ...
  return await this.connectToDeviceById(targetDevice.id);
}
```

Komentar u kodu (`Device name is more reliable than ID for matching`) **laže** — kod nikad ne poredi `targetDevice.name` ili `targetDevice.id` sa `sensorId`. Algoritam je: "skeniraj sve FTMS/CSC peripherale u dometu, sortiraj po RSSI, konektuj se na najjači." Ovo radi po dizajnu **samo kada je tvoja mašina jedini upaljen FTMS uređaj u dometu**. U Vortex-u sa 9 treadmill-ova jedna pored druge, ovo je deterministički cross-talk:

- Mašina X (tvoja paired) ugašena → tvoj `sensorId` (base64 paired iz admin panel-a) ne matchuje ništa u advertising-u
- Najjači signal ide u susednu mašinu Y koja istovremeno radi za drugog korisnika
- App misli da je konektovan na X i šalje X-ove `update_machine_rpm`, `update_machine_heartbeat` na backend
- Backend `update_machine_rpm` proverava da je mašina X locked-by-current-user (TVOJA sesija), upisuje RPM u X-ov `last_rpm` field — i nastavlja da računa drops kao da je ta brzina TVOJA

Ovaj bug je **direktan uzrok** Bug C ispod.

### Bug C — Risk events u admin panel-u za 2 korisnika

| User | Email | Total events | Event types | Frozen |
|---|---|---|---|---|
| Nenad Prahovljanovic | symfony123@gmail.com | **225** | `unlock_machine_lock_mismatch` · `heartbeat_without_lock` · `machine_lock_starvation` · `inactivity_autofinish` · `rpm_without_lock` | **31** |
| Aleksandar Markovic | aleksandarmark.97@gmail.com | **80** | `unlock_machine_lock_mismatch` · `heartbeat_without_lock` | **0** |

**Hipoteza (verifikuje supabase-dba u Step 0a):** ~95% ovih events su **downstream simptomi Bug B-a**, ne genuine fraud:

- `unlock_machine_lock_mismatch`: app pokušava da unlock-uje mašinu X koja u međuvremenu već unlock-ovana od strane sweep cron-a (jer heartbeat za X dolazio off-and-on dok je BLE bila konektovana na Y) — ili ne drži current_user_id više
- `heartbeat_without_lock`: heartbeat za X dolazi dok mašina X već nije više `is_busy = true` (zato što je njen pravi user davno unlock-ovao, ili sweep cron je pokupio orphan)
- `machine_lock_starvation`: mašina X je bila locked >5 min bez heartbeat-a (jer app je slao heartbeat-ove iz Y-konekcije u pogrešnom session contextu, X-ova zapravo lock je odavno expired)
- `rpm_without_lock`: RPM update za X dolazi iako X ne pripada tom user-u u tom trenutku
- `inactivity_autofinish`: legitimni cron sweep — auto-finalize sesije koju je app napustio bez explicit `unlock_machine`-a

Razlog zašto Nenad ima 31 freeze-a (admin freeze flag) a Aleksandar nema: iste signature, samo se Nenad više puta vraćao u istu situaciju i admin sistem ga je zamrznuo zbog kvantiteta.

**Risk:** ako su ove dvije osobe i drugi pilot korisnici dobili **drops na osnovu tuđih metrika** (npr. konektovani na treadmill koji je radio 12 km/h dok su lično stajali), onda:
- (a) economy je iskrivljena (nezaslužena drops)
- (b) drugi user-i čije se metrike "kradu" gube nešto (njihova mašina je locked-by-someone-else, što može da im blokira start)
- (c) Vortex pilot kao prvi external pilot baca senku na proizvod

---

## Dependencies

- ✅ Migracija `20260507060000_cleanup_orphan_active_sessions.sql` deployed (orphan sweep) — koristi se za Step 7 cleanup
- ✅ `fraud_events` tabela postoji (`backend/supabase/migrations/20260324000014_fraud_events_and_logging.sql`)
- ✅ Plan `vortex_pilot_hardening_workout_flow_critical_fixes.md` u radu — **OVAJ plan ima viši prioritet**, dodaje 2 nova steps (Step 1, Step 2 below) koji moraju da se merge-uju u taj plan ako još nije completed
- ⚠️ Pre Step 7 (drops reverse): supabase-dba mora pokrenuti **Step 0a forensicss** i dobiti zeleno svetlo od product-a pre bilo kakvog refunda/oduzimanja drops-a
- ⚠️ Pre Step 1 deployment: mobile-coder mora da verifikuje na real Vortex hardware-u jer ovo direktno utiče na BLE pairing UX

---

## Out of Scope

- BLE pairing redesign u admin panel-u (sensor_id base64 vs MAC vs UUID — odložiti za posle pilota)
- Magene S3+ legacy CSC fallback (ne koristi se u Vortex-u, svi su FTMS)
- Yesoul proprietary protokol cross-talk (Vortex nema Yesoul mašine)
- Genuine fraud detection (cross-talk first, fraud detection later)

---

## Workspace Map

| Step | Workspace | Agent | Effort |
|---|---|---|---|
| 0a | `backend/supabase/` (read-only SQL) | supabase-dba | 2h forensics + report |
| 0b | `apps/mobile-app/` (read-only review) | reviewer | 1h |
| 1 | `apps/mobile-app/lib/ble-service.ts` + workout.tsx peripheral check | mobile-coder | 6h |
| 2 | `apps/mobile-app/app/workout.tsx` (auto-resume guard) | mobile-coder | 2h |
| 3 | `apps/mobile-app/app/workout.tsx` (mid-session peripheral guard) | mobile-coder | 3h |
| 4 | `backend/supabase/migrations/` (server-side defensive check) | supabase-dba | 3h |
| 5 | `apps/mobile-app/lib/telemetry.ts` + workout.tsx Sentry events | mobile-coder | 2h |
| 6 | `apps/admin-panel/app/dashboard/risk/` (forensics drill-down) | admin-coder | 4h |
| 7 | `backend/supabase/migrations/` (one-shot remediation block) | supabase-dba | 2h |
| 8 | manual QA na Vortex hardware-u | reviewer + product | 4h |
| 9 | i18n + UX polish za nove modal-e | mobile-ui-ux-agent | 1h |
| **TOTAL** | | | **~30h (3-4 dana)** |

**Admin panel:** Step 6 only (forensics dashboard).

---

## Execution Plan

### Step 0a: Forensic SQL Investigation (READ-ONLY)
**Workspace:** `backend/supabase/` (no migrations — pure investigation)
**Agent:** supabase-dba
**Output:** Markdown forensics report committed to `docs/forensics/2026-05-08_vortex_crosstalk_forensics.md`

#### Agent Prompt (copy-paste ready)

> You are the supabase-dba. Your task is **read-only forensic investigation**. Do NOT write migrations. Do NOT modify any data. Do NOT freeze/unfreeze any users.
>
> **Goal:** Confirm or refute the hypothesis that the fraud events for users `symfony123@gmail.com` (Nenad Prahovljanovic) and `aleksandarmark.97@gmail.com` (Aleksandar Markovic) are downstream symptoms of BLE machine cross-talk (Bug B in `docs/plans/bugfix_pause_auto_resume_and_ble_machine_crosstalk_vortex_production.md`), not genuine fraud.
>
> **Method:**
> 1. Query `auth.users` to resolve emails → user_ids. Cache them as `:nenad_id` and `:aleks_id` for the rest of the queries.
> 2. For each user, pull `fraud_events` rows in last 30 days, grouped by `event_type`, `severity`, and `created_at::date`. Look for **temporal clustering** (e.g., 50 events within 30 minutes = signature of one stuck session, not 50 fraud attempts).
> 3. For each `fraud_events.metadata->>'machine_id'`, JOIN to `machines` and to `sessions` (by user_id + time window). Build a per-event timeline:
>    - Was the machine `is_busy = true` AND `current_user_id = <user>` at the moment of the event?
>    - What was the machine's `last_heartbeat` and `last_rpm` at the time?
>    - Was there an active session for that user pointing to that machine?
> 4. Cross-reference with `sessions.raw_metrics` for the same user in the same time window. Look for the cross-talk signature:
>    - **`raw_metrics->>'sensor_id'` differs from `machines.sensor_id` for the linked `machine_id`** — direct evidence that the BLE peripheral the app was reading from was NOT the machine the session was logged against. (If `sensor_id` is not in raw_metrics today, log this as a Step 5 telemetry gap.)
>    - **Average RPM / distance / drops out of proportion** for `sessions.duration_sec` — e.g., 5-min session with 8.5 km/h average for someone who reported "I was just standing".
> 5. Build a **classification** per event_type. For each, classify as:
>    - **CROSS_TALK** (signal of Bug B): mismatch in expected machine context
>    - **CRON_ARTIFACT** (legitimate cleanup): `inactivity_autofinish`, late `unlock_machine_lock_mismatch` after sweep already closed
>    - **GENUINE_ANOMALY** (true suspicious): user behavior pattern that doesn't fit either above
> 6. Run the same classification for ALL Vortex pilot users from the same gym (use `_admin_check_gym_access` or `gym_checkins` to filter). This tells us whether cross-talk is endemic or isolated to these 2.
>
> **Output deliverable:** Markdown report `docs/forensics/2026-05-08_vortex_crosstalk_forensics.md` with:
> - Executive summary (1 paragraph): how many events are CROSS_TALK vs CRON_ARTIFACT vs GENUINE_ANOMALY
> - Table per user: event_type breakdown with timestamps and machine context
> - Top 5 sessions per user where `raw_metrics` shape is anomalous (avg RPM × duration vs distance × calories)
> - List of distinct `machines.id` whose `last_rpm` was updated by these users — flag any case where machine.id was locked by user A but RPM came in for user B in the same minute
> - Recommendation for Step 7: estimated number of sessions whose drops should be reversed
>
> **Constraints:**
> - Read-only. No `INSERT`, `UPDATE`, `DELETE`, or migration files.
> - Do not include raw user PII in the committed markdown — anonymize emails to `user_a`, `user_b`. Keep a separate `forensics_user_map.csv` outside git (in `~/.sweatdrop/forensics/`).
> - Use `EXPLAIN ANALYZE` on slow queries (>500ms) and report which indexes are missing.
>
> **Tools available:**
> - `psql` against production via connection pooler (read-only role: `analyst_readonly` — request from infra if you don't have it)
> - Or local `supabase` CLI with prod database snapshot (`supabase db dump --data-only --schema public --table sessions --table fraud_events`) — preferred for offline analysis without touching prod
>
> Acceptance: Report is committed, classification table is reproducible (queries embedded in report), and product team gets one Slack message: "{N} of {M} fraud events are cross-talk artifacts — Step 7 will reverse drops on {K} sessions."

**Acceptance criteria:**
- Report exists at `docs/forensics/2026-05-08_vortex_crosstalk_forensics.md`
- Report contains classification per event_type per user
- Report identifies count of sessions to remediate in Step 7

---

### Step 0b: Code Review of BLE Service & Pause Flow (READ-ONLY)
**Workspace:** `apps/mobile-app/`
**Agent:** reviewer
**Output:** Markdown review report `docs/reviews/2026-05-08_ble_service_pause_flow_review.md`

#### Agent Prompt

> You are the reviewer. Your task is **read-only code audit** to confirm or refute the architect's root-cause hypotheses for two production bugs. Do NOT write code. Do NOT modify files. Produce a markdown review with line-citations.
>
> **Hypothesis 1 (Pause auto-resume defeats manual pause on FTMS treadmill):**
> Architect claims `apps/mobile-app/app/workout.tsx:1001-1006` triggers auto-resume immediately after manual pause because FTMS treadmill belt has mechanical inertia and keeps reporting incrementing `crankRevolutions` for several seconds after user hits Pause. Architect claims `pauseReason` is not consulted before auto-resume, so manual pause cannot be distinguished from inactivity pause.
>
> **Audit task:**
> - Read `apps/mobile-app/app/workout.tsx` lines 950-1130 (BLE measurement callback)
> - Read `apps/mobile-app/lib/ble-ftms.ts` to confirm whether FTMS treadmill `parseTreadmillData` returns cumulative or delta strides
> - Confirm or refute: (a) auto-resume fires on `pauseReason='manual'`, (b) no debounce window after manual pause, (c) `lastCrankRevolutionsForAutoResumeRef` is updated even when paused (prevents simple "freeze ref on pause" workaround)
> - Identify any other auto-resume side-channels: e.g., FTMS speed > 0 might also trigger something elsewhere
> - Look at `setShowAutoPauseOverlay`, `autoPauseTimerRef`, and any `resume`-like setter calls outside `resumeWorkout`. List them.
>
> **Hypothesis 2 (BLE service connects to strongest-RSSI device when target sensor is unreachable):**
> Architect claims `apps/mobile-app/lib/ble-service.ts:448-491` (the base64 sensorId branch) silently falls back to "strongest signal in scan results" without verifying the discovered peripheral matches the requested sensor identity. Architect claims `targetDevice.name` is logged but never compared. Architect claims this causes deterministic cross-talk in a gym with multiple FTMS machines when one is off.
>
> **Audit task:**
> - Read `apps/mobile-app/lib/ble-service.ts` lines 200-500 (scan + connect)
> - Confirm or refute: (a) no `targetDevice.id === sensorId` check, (b) no `targetDevice.name === expectedName` check, (c) if `devices.length === 0` we throw, but if `devices.length === 1` and it's wrong device we still connect
> - Trace through: when admin panel pairs sensor in `apps/admin-panel/`, what format is stored in `machines.sensor_id`? (web bluetooth base64? mac address? device name?). This determines what comparison is even possible client-side.
> - Look at iOS path (`bleManagerIOS!.connectToDevice`) and Android path (`BleManager.connect`). Are they symmetric?
> - Check the non-base64 branch (`return await this.connectToDeviceById(sensorId)` line 491). On Android, BLE peripheral IDs are MAC addresses; on iOS, they are CBPeripheral UUIDs (per-device, ephemeral). So if `sensorId` was paired on iOS and we're on Android (or vice versa), this branch silently fails too.
>
> **Output:** Markdown review with:
> - One section per hypothesis: VERIFIED / PARTIALLY VERIFIED / REFUTED with line citations
> - Edge cases architect missed (if any)
> - Recommended scope tightening for Step 1 + Step 2
>
> Acceptance: Report committed at `docs/reviews/2026-05-08_ble_service_pause_flow_review.md`. mobile-coder reads it before starting Step 1.

---

### Step 1: BLE peripheral identity verification (CRITICAL FIX FOR BUG B)
**Workspace:** `apps/mobile-app/`
**Agent:** mobile-coder
**Files to modify:**
- `apps/mobile-app/lib/ble-service.ts`
- `apps/mobile-app/app/workout.tsx`

#### Subtask 1.1 — Replace "strongest RSSI" fallback with strict identity match

In `connectToDevice(sensorId)` (`ble-service.ts:418-500`), the base64 fallback branch must **never** silently connect to a non-matching peripheral.

**New behavior:**
1. Decode `sensorId` to multiple candidate forms: hex (via `base64ToHex`), reversed-byte hex, UUID-formatted, plain string. (Different admin pairing flows produce different formats — be tolerant, but explicit.)
2. After scan, **filter** discovered devices by:
   - Exact match on `device.id` (works on Android MAC and iOS UUID if same platform paired)
   - Hex prefix match on `device.id` (handles base64 hex encoding)
   - Exact match on `device.name` if the admin panel stored a name as part of pairing
3. If 0 matches: throw `BleError.PeripheralNotFound(sensorId)` — UI shows "Mašina nije u dometu — proverite da li je upaljena"
4. If 1 match: connect to it (success path)
5. If >1 matches (rare; multiple devices broadcasting same id — should be impossible but defensive): pick highest RSSI **among matches only** and log Sentry warning `ble.peripheral_id.multiple_matches`

**File:** `apps/mobile-app/lib/ble-service.ts`

```typescript
// Replace lines 448-491 (the entire isBase64 branch) with:
const candidateIds = this.deriveCandidatePeripheralIds(sensorId);
log.debug(`[BLE] Looking for peripheral matching one of:`, candidateIds);

const devices = await this.scanForDevices(5000);
if (devices.length === 0) {
  throw new BlePeripheralNotFoundError(sensorId, 'No BLE devices in range');
}

const matches = devices.filter(d => this.peripheralMatchesSensorId(d, candidateIds));

if (matches.length === 0) {
  log.warn(`[BLE] Sensor ${sensorId} not found among ${devices.length} discovered devices.`,
    { discovered: devices.map(d => ({ id: d.id, name: d.name, rssi: d.rssi })) });
  throw new BlePeripheralNotFoundError(sensorId,
    `Expected sensor not in range. Found ${devices.length} other devices.`);
}

const targetDevice = matches.length === 1
  ? matches[0]
  : matches.sort((a, b) => (b.rssi ?? -100) - (a.rssi ?? -100))[0];

if (matches.length > 1) {
  log.warn('[BLE] Multiple peripherals match sensorId', { matches: matches.length, picked: targetDevice.id });
  // Sentry: ble.peripheral_id.multiple_matches (Step 5)
}

return await this.connectToDeviceById(targetDevice.id);
```

Add helper methods:

```typescript
private deriveCandidatePeripheralIds(sensorId: string): string[] {
  const candidates = new Set<string>([sensorId]);
  const hex = this.base64ToHex(sensorId);
  if (hex) {
    candidates.add(hex);
    candidates.add(hex.toUpperCase());
    // MAC address format (XX:XX:XX:XX:XX:XX) — common Android peripheral.id form
    if (hex.length === 12) {
      candidates.add(hex.match(/.{2}/g)!.join(':').toUpperCase());
    }
    // Reversed-byte hex (some pairing flows store little-endian)
    if (hex.length % 2 === 0) {
      const reversed = hex.match(/.{2}/g)!.reverse().join('');
      candidates.add(reversed);
      candidates.add(reversed.toUpperCase());
    }
  }
  return Array.from(candidates);
}

private peripheralMatchesSensorId(device: BLEDevice, candidates: string[]): boolean {
  const normalize = (s: string) => s.replace(/[:\-]/g, '').toLowerCase();
  const normalizedCandidates = candidates.map(normalize);
  const deviceIdNorm = normalize(device.id);
  const deviceNameNorm = device.name ? normalize(device.name) : null;
  return normalizedCandidates.some(c =>
    c === deviceIdNorm ||
    c === deviceNameNorm ||
    deviceIdNorm.includes(c) ||  // hex prefix match
    (deviceNameNorm && deviceNameNorm.includes(c))
  );
}
```

Add new error class at top of file:

```typescript
export class BlePeripheralNotFoundError extends Error {
  constructor(public readonly requestedSensorId: string, public readonly detail: string) {
    super(`Sensor ${requestedSensorId} not found: ${detail}`);
    this.name = 'BlePeripheralNotFoundError';
  }
}
```

#### Subtask 1.2 — Capture verified peripheral id at connection time

After `connectToDeviceById` succeeds, store the **actual** peripheral.id used (not the requested sensorId):

```typescript
// In connectToDeviceById, after successful connection:
this.verifiedPeripheralId = device.id; // iOS: CBPeripheral UUID, Android: MAC
this.verifiedPeripheralName = device.name ?? null;
```

Add public getter:

```typescript
getConnectedPeripheralId(): string | null {
  return this.isConnected ? this.verifiedPeripheralId : null;
}

getConnectedPeripheralName(): string | null {
  return this.isConnected ? this.verifiedPeripheralName : null;
}
```

#### Subtask 1.3 — Workout.tsx surfaces "wrong machine" error to user

In `apps/mobile-app/app/workout.tsx` around line 660 (BLE connection in workout effect):

```typescript
try {
  const connected = await bleService.connectToDevice(activeSensorId);
  // ...
} catch (connectError: any) {
  if (connectError instanceof BlePeripheralNotFoundError) {
    // NEW BRANCH — explicit "machine not in range" path, not generic reconnect
    setBleStatus(t('machineNotInRange'));
    setIsReconnecting(false);
    setShowMachineNotInRangeOverlay(true);
    // Unlock machine immediately so it doesn't appear busy to others
    await unlockMachineSafely();
    // Don't enter reconnect loop — user must rescan QR after powering machine on
    return;
  }
  // existing fallback path for generic connection errors
  // ...
}
```

Add new overlay component `<MachineNotInRangeOverlay>` (in same file or `components/workout/MachineNotInRangeOverlay.tsx`) that explains:
- "Mašina nije u dometu — proverite da li je upaljena"
- "Idi nazad i ponovo skeniraj kod"
- One CTA: `End workout and rescan` → `unlock_machine` → `router.replace('/scan')`

#### Acceptance criteria

- Real-world test in Vortex (or simulated by powering off treadmill X and trying to scan its QR): app shows clear "machine not in range" error within 5s, NOT a connection to neighboring treadmill
- Unit test: mock `scanForDevices` returns 5 devices with sensor X NOT among them → `connectToDevice('<sensor_X_base64>')` throws `BlePeripheralNotFoundError`
- Unit test: mock returns 5 devices, one of which has hex-derived id matching sensor X → connects to that one (not strongest RSSI)
- Unit test: mock returns 0 devices → throws `BlePeripheralNotFoundError` with "No BLE devices in range" message
- No Sentry events of type `ble.peripheral_id.multiple_matches` should fire in normal pilot operation; if they do, indicates duplicate sensor pairing in admin panel that needs investigation

---

### Step 2: Pause auto-resume guard (CRITICAL FIX FOR BUG A)
**Workspace:** `apps/mobile-app/app/workout.tsx`
**Agent:** mobile-coder

#### Subtask 2.1 — Track manual pause timestamp + guard auto-resume

Add ref to track when manual pause was last set:

```typescript
const manualPausedAtRef = useRef<number | null>(null);
const AUTO_RESUME_GUARD_MS = 5000;
```

In `pauseWorkout()` (line 2452), set the timestamp:

```typescript
const pauseWorkout = () => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  setPauseReason('manual');
  setPausedTime(new Date());
  setIsPaused(true);
  manualPausedAtRef.current = Date.now();   // NEW
  pausedOverlayOpacity.value = withSpring(1, { damping: 15, stiffness: 100, mass: 1 });
  setShowAutoPauseOverlay(false);
};
```

In `resumeWorkout()` (line 2461), clear the timestamp on successful resume:

```typescript
// after successful resume (line 2510-2515):
manualPausedAtRef.current = null;
```

#### Subtask 2.2 — Suppress auto-resume during manual pause

Replace the auto-resume block at line 1000-1007 with:

```typescript
// PRO-FITNESS: Auto-Resume — but ONLY for inactivity pause, NOT manual pause.
// Manual pause means user explicitly stopped; FTMS treadmill belt has mechanical
// inertia and keeps emitting incrementing strides for several seconds, which
// would otherwise auto-resume immediately and defeat manual pause.
const isManualPause = pauseReasonRef.current === 'manual';
const isWithinManualGuard = manualPausedAtRef.current !== null
  && (Date.now() - manualPausedAtRef.current) < AUTO_RESUME_GUARD_MS;

if (
  currentRevolutions > lastCrankRevolutionsForAutoResumeRef.current &&
  isPausedRef.current &&
  isMountedRef.current &&
  !isManualPause &&             // NEW: never auto-resume from manual pause
  !isWithinManualGuard           // NEW: 5s safety window even if reason flipped to inactivity
) {
  runOnJS(setIsPaused)(false);
  runOnJS(setShowAutoPauseOverlay)(false);
}
lastCrankRevolutionsForAutoResumeRef.current = currentRevolutions;
```

#### Subtask 2.3 — Defense-in-depth: ensure pauseWorkout doesn't get clobbered

Add verification log in dev mode:

```typescript
useEffect(() => {
  if (__DEV__ && pauseReason === 'manual' && !isPaused && pausedTime !== null) {
    log.warn('[Workout] Suspicious state: pauseReason=manual but isPaused=false. Auto-resume bug?');
  }
}, [isPaused, pauseReason, pausedTime]);
```

#### Acceptance criteria

- On Vortex treadmill with belt running at any speed: pressing `Pause` keeps the pause overlay visible until user explicitly taps `Resume`. Belt inertia (which can take 5-10s to fully stop) does NOT auto-resume the workout
- `pauseReason === 'inactivity'` still auto-resumes when user starts moving again (existing UX preserved for hands-free workflow)
- Unit test: mock BLE measurement stream with monotonically increasing `crankRevolutions`. Set `pauseReason='manual'`, `isPaused=true`, simulate 10 measurements at 1 Hz. Assert `setIsPaused(false)` is never called.
- Unit test: same setup but `pauseReason='inactivity'` → assert auto-resume fires after first measurement

---

### Step 3: Mid-session peripheral guard (DEFENSE FOR BUG B AFTER RECONNECT)
**Workspace:** `apps/mobile-app/app/workout.tsx`
**Agent:** mobile-coder

After Step 1 prevents the initial wrong-machine connection, this step prevents wrong-machine reconnection mid-session (e.g., after a disconnect-reconnect cycle, the peripheral that was connected initially might no longer match — Step 1's `connectToDevice` is only called on initial connect; reconnect goes through a different path).

#### Subtask 3.1 — Extend `verifySessionOwnership`

In `apps/mobile-app/app/workout.tsx` around line 737-754:

```typescript
const verifySessionOwnership = async (): Promise<boolean> => {
  if (!session?.machine_id || !authSession?.user) return false;

  // 1. Verify Supabase ownership (existing logic)
  const { data: machineData, error } = await supabase
    .from('machines')
    .select('is_busy, current_user_id, sensor_id')
    .eq('id', session.machine_id)
    .single();
  if (error || !machineData?.is_busy || machineData.current_user_id !== authSession.user.id) {
    log.warn('[Workout] Session ownership lost', { machineData, error });
    return false;
  }

  // 2. NEW: Verify BLE peripheral identity matches expected sensor
  const connectedPeripheralId = bleService.getConnectedPeripheralId();
  if (connectedPeripheralId === null) {
    log.warn('[Workout] No connected peripheral; cannot verify');
    return false;
  }

  const candidates = bleService.deriveCandidatePeripheralIds?.(machineData.sensor_id) ?? [];
  const isMatch = candidates.length > 0 && candidates.some(c => {
    const norm = (s: string) => s.replace(/[:\-]/g, '').toLowerCase();
    const cn = norm(c);
    const pn = norm(connectedPeripheralId);
    return cn === pn || pn.includes(cn) || cn.includes(pn);
  });

  if (!isMatch) {
    log.error('[Workout] PERIPHERAL MISMATCH — session is on wrong machine!', {
      sessionMachineId: session.machine_id,
      expectedSensorId: machineData.sensor_id,
      connectedPeripheralId,
    });
    // Telemetry: workout.ble.peripheral_mismatch (Step 5)
    return false;
  }

  return true;
};
```

#### Subtask 3.2 — On peripheral mismatch: hard disconnect + safety modal

When `verifySessionOwnership` returns false specifically for peripheral mismatch (not for Supabase ownership):

- `await bleService.disconnect()`
- `setShowPeripheralMismatchModal(true)` — new modal explaining: "Veza sa drugom mašinom — ne možemo da nastavimo bezbedno. Trening biće završen."
- `setBleConnected(false)`
- Force-finalize via `finalize_inactive_session('peripheral_mismatch_safety')` so user's machine X is unlocked and any earned drops are awarded based on whatever was in `raw_metrics` BEFORE the mismatch was detected

This is a **safety brake** — even if Step 1 had a bug, Step 3 catches the residual case.

#### Acceptance criteria

- Mock test: bleService.getConnectedPeripheralId() returns 'AA:BB:CC:DD:EE:FF' but `machines.sensor_id` decodes to '11:22:33:44:55:66' → `verifySessionOwnership` returns false, peripheral mismatch modal shows
- Mock test: legitimate case where peripheral.id matches sensor_id (in any acceptable format) → `verifySessionOwnership` returns true; no modal
- Real test on Vortex: scan machine X, normal workout → no mismatch modal ever shows during 30-min session

---

### Step 4: Server-side defensive check (BELT-AND-SUSPENDERS)
**Workspace:** `backend/supabase/migrations/`
**Agent:** supabase-dba
**Migration file:** `YYYYMMDDHHMMSS_machine_rpc_observed_peripheral_id_check.sql`

#### Goal

Add a new optional parameter `p_observed_peripheral_id TEXT DEFAULT NULL` to:
- `update_machine_heartbeat`
- `update_machine_rpm`

The mobile client passes the BLE peripheral.id it's currently reading from on every heartbeat. The function compares against `machines.sensor_id` (with the same loose-match logic as client-side: hex / mac / base64 prefix). On mismatch:
- Log a NEW `fraud_event_type` called `peripheral_id_server_mismatch` with severity `high`
- Mark the session as compromised in `sessions.raw_metrics->'security'->'peripheral_id_mismatch'`
- **Still update the heartbeat** (don't break the workout — but server now has audit trail to short-circuit drops at finalize-time)

In `award_drops`, add a guard: if `raw_metrics->'security'->'peripheral_id_mismatch' = 'true'`, award **0 drops** and log `fraud_event` with severity `high`. (This is the actual mitigation — the user can't earn drops from cross-talk even if client-side checks fail.)

#### Migration outline

```sql
-- Add hex-derive helper (immutable, can be called from RPC)
CREATE OR REPLACE FUNCTION public.peripheral_id_matches_sensor(
  p_observed TEXT,
  p_expected_sensor_id TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_obs_norm TEXT;
  v_exp_norm TEXT;
  v_exp_hex TEXT;
BEGIN
  IF p_observed IS NULL OR p_expected_sensor_id IS NULL THEN
    RETURN TRUE; -- backward compat: NULL means "client didn't send observation"
  END IF;
  v_obs_norm := lower(regexp_replace(p_observed, '[:\-]', '', 'g'));
  v_exp_norm := lower(regexp_replace(p_expected_sensor_id, '[:\-]', '', 'g'));
  IF v_obs_norm = v_exp_norm THEN RETURN TRUE; END IF;
  -- Try base64 → hex
  BEGIN
    v_exp_hex := encode(decode(p_expected_sensor_id, 'base64'), 'hex');
    IF v_obs_norm = lower(v_exp_hex) THEN RETURN TRUE; END IF;
    IF position(lower(v_exp_hex) in v_obs_norm) > 0 THEN RETURN TRUE; END IF;
    IF position(v_obs_norm in lower(v_exp_hex)) > 0 THEN RETURN TRUE; END IF;
  EXCEPTION WHEN OTHERS THEN
    -- ignore decode errors (sensor_id wasn't base64)
    NULL;
  END;
  RETURN FALSE;
END;
$$;

-- Update update_machine_heartbeat
CREATE OR REPLACE FUNCTION public.update_machine_heartbeat(
  p_machine_id UUID,
  p_user_id UUID,
  p_observed_peripheral_id TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gym_id UUID;
  v_expected_sensor_id TEXT;
  v_session_id UUID;
BEGIN
  SELECT gym_id, sensor_id INTO v_gym_id, v_expected_sensor_id
  FROM public.machines WHERE id = p_machine_id;

  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    PERFORM public.log_fraud_event(auth.uid(), v_gym_id, 'heartbeat_unauthorized', 'high',
      jsonb_build_object('machine_id', p_machine_id, 'requested_user_id', p_user_id));
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- NEW: peripheral identity check
  IF p_observed_peripheral_id IS NOT NULL AND v_expected_sensor_id IS NOT NULL
     AND NOT public.peripheral_id_matches_sensor(p_observed_peripheral_id, v_expected_sensor_id)
  THEN
    PERFORM public.log_fraud_event(p_user_id, v_gym_id, 'peripheral_id_server_mismatch', 'high',
      jsonb_build_object(
        'machine_id', p_machine_id,
        'expected_sensor_id', v_expected_sensor_id,
        'observed_peripheral_id', p_observed_peripheral_id
      ));
    -- Mark current active session as compromised
    SELECT id INTO v_session_id FROM public.sessions
    WHERE user_id = p_user_id AND machine_id = p_machine_id AND is_active = true
    ORDER BY started_at DESC LIMIT 1;
    IF v_session_id IS NOT NULL THEN
      UPDATE public.sessions
      SET raw_metrics = jsonb_set(
        COALESCE(raw_metrics, '{}'::jsonb),
        '{security,peripheral_id_mismatch}',
        '"true"'::jsonb,
        true
      )
      WHERE id = v_session_id;
    END IF;
    -- Heartbeat NOT updated (don't extend lock for compromised session)
    RETURN FALSE;
  END IF;

  -- existing heartbeat update logic
  UPDATE public.machines
  SET last_heartbeat = NOW()
  WHERE id = p_machine_id AND current_user_id = p_user_id AND is_busy = true;

  IF NOT FOUND THEN
    PERFORM public.log_fraud_event(p_user_id, v_gym_id, 'heartbeat_without_lock', 'medium',
      jsonb_build_object('machine_id', p_machine_id));
  END IF;

  RETURN FOUND;
END;
$$;
```

Same pattern for `update_machine_rpm`.

In `award_drops` (find via `grep -r "CREATE OR REPLACE FUNCTION.*award_drops" backend/supabase/migrations/`):

```sql
-- Near the top of award_drops, after loading the session:
IF (v_session.raw_metrics #>> '{security,peripheral_id_mismatch}') = 'true' THEN
  PERFORM public.log_fraud_event(
    v_session.user_id, v_session.gym_id, 'drops_zeroed_peripheral_mismatch', 'high',
    jsonb_build_object('session_id', v_session.id, 'duration_sec', v_session.duration_sec)
  );
  -- Set drops to 0, still finalize the session
  UPDATE public.sessions SET drops_earned = 0 WHERE id = p_session_id;
  RETURN jsonb_build_object('success', true, 'drops_awarded', 0, 'reason', 'peripheral_mismatch');
END IF;
```

#### Mobile client coordination

`apps/mobile-app/app/workout.tsx` heartbeat call (around line 1469):

```typescript
const observedPeripheralId = bleService.getConnectedPeripheralId();
await supabase.rpc('update_machine_heartbeat', {
  p_machine_id: session.machine_id,
  p_user_id: authSession.user.id,
  p_observed_peripheral_id: observedPeripheralId, // NEW
});
```

Same for `update_machine_rpm`. Backward compatible: server treats `NULL` as "client doesn't send observation" (older builds).

#### Acceptance criteria

- New migration applied; `peripheral_id_matches_sensor` function returns true for known-good pairs (smoke test in migration with 3 example pairs)
- Mobile heartbeat sends peripheral_id; server logs `peripheral_id_server_mismatch` if observed != expected
- `award_drops` returns 0 drops on compromised session; logs `drops_zeroed_peripheral_mismatch`
- Older mobile clients (without Step 1) still work (NULL observed_peripheral_id passes through)

---

### Step 5: Telemetry & Sentry events
**Workspace:** `apps/mobile-app/`
**Agent:** mobile-coder
**Files:** `apps/mobile-app/lib/telemetry.ts` (or wherever Sentry is wrapped), `app/workout.tsx`

Add Sentry breadcrumbs/events for:
- `ble.peripheral_id.multiple_matches` — Step 1 (multiple matching peripherals during scan; investigate admin pairing)
- `ble.peripheral_not_found` — Step 1 (target sensor not in range; user UX path validated)
- `workout.pause.auto_resume_suppressed` — Step 2 (manual pause guard fired; verify guard works in production)
- `workout.ble.peripheral_mismatch` — Step 3 (mid-session detection; should be 0 in healthy fleet)
- `workout.ble.connect_wrong_device_legacy` — for old build users still hitting strongest-RSSI fallback (these are pre-Step-1 builds we should force-update)

Each event includes:
- `gym_id`
- `machine_id`
- `expected_sensor_id` (anonymized: last 4 chars only)
- `observed_peripheral_id` (anonymized: last 4 chars only)
- `app_version`, `build_number`
- Sampling: 100% (these are critical, low-volume)

#### Acceptance criteria
- Sentry dashboard has new tags filterable by `gym_id`
- After Step 1+2+3 deploy, expect `ble.peripheral_id.multiple_matches` ≈ 0/day, `ble.peripheral_not_found` > 0 (legitimate user behavior of scanning off machines), `workout.pause.auto_resume_suppressed` > 0 in healthy fleet, `workout.ble.peripheral_mismatch` ≈ 0/day

---

### Step 6: Admin panel risk dashboard forensics drill-down
**Workspace:** `apps/admin-panel/`
**Agent:** admin-coder
**Files:**
- `apps/admin-panel/app/dashboard/risk/page.tsx` (or wherever risk events are listed today)
- `apps/admin-panel/app/dashboard/risk/[userId]/page.tsx` (NEW — drill-down page)
- `apps/admin-panel/lib/actions/risk.ts` (NEW server action helpers)

#### Goal

Today the risk dashboard shows aggregate counts (`Event: rpm_without_lock × 31`). Support has no way to know **which machine and which session** triggered each event. Add per-event drill-down that surfaces:
- `machine_id` from `metadata->>'machine_id'`
- Linked session (closest in time, same user, same gym) — clickable to session detail page if exists
- Inferred classification (`CROSS_TALK | CRON_ARTIFACT | UNKNOWN`) from rules:
  - Event type ∈ `(unlock_machine_lock_mismatch, heartbeat_without_lock, rpm_without_lock)` AND user has another `peripheral_id_server_mismatch` event within 1h on same machine_id → `CROSS_TALK`
  - Event type ∈ `(inactivity_autofinish, machine_lock_starvation)` → `CRON_ARTIFACT`
  - Else → `UNKNOWN`

Only **superadmin and gym_admin** can see the drill-down (existing RLS).

#### Component design

```typescript
// apps/admin-panel/app/dashboard/risk/[userId]/page.tsx
import { getRiskEventsForUser, classifyEvents } from '@/lib/actions/risk';

export default async function UserRiskPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const events = await getRiskEventsForUser(userId);
  const classified = classifyEvents(events);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Risk events: {events[0]?.user_email}</h1>
      <div className="grid grid-cols-3 gap-4">
        <SummaryCard label="Cross-talk artifacts" count={classified.crossTalk.length} variant="info" />
        <SummaryCard label="Cron artifacts" count={classified.cronArtifact.length} variant="success" />
        <SummaryCard label="Unknown" count={classified.unknown.length} variant="warning" />
      </div>
      <RiskEventTable events={classified.all} />
    </div>
  );
}
```

`RiskEventTable` columns: timestamp, event_type, severity, machine (link to machine detail), classification badge, raw metadata (collapsed JSON).

Add a "Reverse drops on cross-talk sessions" superadmin-only button at top of page that triggers Step 7 remediation **for this user only** (with a confirmation modal listing affected sessions).

#### Acceptance criteria
- Risk dashboard rows for symfony123@gmail.com / aleksandarmark.97@gmail.com are clickable → drill-down page opens
- Drill-down shows machine_id and inferred classification per event
- Filter chips: "Cross-talk only", "Cron artifacts only", "Unknown only"
- "Reverse drops" button calls Step 7 RPC, shows toast on success, disables itself after one successful run

---

### Step 7: One-shot remediation block for affected sessions (drops reversal)
**Workspace:** `backend/supabase/migrations/`
**Agent:** supabase-dba
**Migration file:** `YYYYMMDDHHMMSS_remediate_vortex_crosstalk_drops.sql`

⚠️ **DO NOT WRITE THIS MIGRATION UNTIL Step 0a forensics report is complete and product team approves the remediation list.**

#### Goal

For each session identified in Step 0a as cross-talk-affected:
1. Reverse `drops_earned` to 0
2. Insert compensating row in `drops_transactions` with `type = 'crosstalk_remediation_refund'`
3. Recompute user's `total_drops` cache
4. Log `fraud_events` row with severity `info` and `event_type = 'crosstalk_remediation_applied'`

#### Migration outline

```sql
-- Migration applied AFTER product approval and forensics report
-- Affected session IDs come from forensics report; embed as a UUID array

DO $$
DECLARE
  v_session_id UUID;
  v_user_id UUID;
  v_gym_id UUID;
  v_drops_to_refund INTEGER;
  v_session_ids UUID[] := ARRAY[
    -- placeholder; supabase-dba inserts the actual list from forensics report
    '00000000-0000-0000-0000-000000000000'::uuid
  ];
BEGIN
  FOREACH v_session_id IN ARRAY v_session_ids
  LOOP
    SELECT user_id, gym_id, drops_earned INTO v_user_id, v_gym_id, v_drops_to_refund
    FROM public.sessions WHERE id = v_session_id FOR UPDATE;

    IF NOT FOUND OR v_drops_to_refund = 0 THEN CONTINUE; END IF;

    UPDATE public.sessions
    SET drops_earned = 0,
        raw_metrics = jsonb_set(
          COALESCE(raw_metrics, '{}'::jsonb),
          '{security,crosstalk_remediation}',
          jsonb_build_object('original_drops', v_drops_to_refund, 'refunded_at', NOW()::text),
          true
        )
    WHERE id = v_session_id;

    INSERT INTO public.drops_transactions (user_id, gym_id, amount, type, source_id, metadata)
    VALUES (v_user_id, v_gym_id, -v_drops_to_refund, 'crosstalk_remediation_refund', v_session_id,
      jsonb_build_object('reason', 'BLE peripheral cross-talk root-caused 2026-05-08'));

    PERFORM public.log_fraud_event(v_user_id, v_gym_id, 'crosstalk_remediation_applied', 'info',
      jsonb_build_object('session_id', v_session_id, 'drops_reversed', v_drops_to_refund));
  END LOOP;
END $$;

-- Recompute user totals (call existing helper or recompute via aggregate)
SELECT public.recompute_user_total_drops(user_id)
FROM (
  SELECT DISTINCT user_id FROM public.sessions
  WHERE id = ANY(ARRAY[/*same uuid array*/]::uuid[])
) t;
```

#### Acceptance criteria
- Affected user's `wallet.balance` decreases by exactly the sum of refunded drops
- Each affected session has `raw_metrics.security.crosstalk_remediation` populated
- `fraud_events` has one `crosstalk_remediation_applied` row per session
- Mobile app's redemptions UI doesn't break (negative-balance prevention is enforced by existing `award_drops` floor checks)
- Notification to affected users (manually composed by product, not part of this migration): "We detected an issue with your sensor data and refunded N drops as part of fixing it. Apologies for the inconvenience."

---

### Step 8: Manual QA test plan (Vortex hardware required)
**Workspace:** Real Vortex teretana with at least 3 FTMS treadmills + 1 cycling bike
**Agent:** reviewer + product

#### Test matrix

| # | Scenario | Expected behavior |
|---|---|---|
| T1 | All 9 treadmills off, scan QR for treadmill #2 | App shows "Mašina nije u dometu" within 5s; no metrics displayed; rescan flow |
| T2 | Treadmill #2 off, treadmills #1 and #3 on. Scan QR for #2 | Same as T1 — does NOT silently connect to #1 or #3 |
| T3 | Treadmill #2 on. Scan QR for #2 | Connects to #2; metrics from #2 sensor; pause works |
| T4 | T3 + walk on belt at 5 km/h. Press Pause | Overlay stays visible; belt inertia does not auto-resume; user explicitly taps Resume to continue |
| T5 | T3 + walk at 8 km/h. App in background for 2 min. Foreground app | BLE still connected; metrics in sync; no peripheral mismatch alarm |
| T6 | T3 + cause BLE drop (wrap phone in foil for 10s) | Reconnect overlay; on reconnect, peripheral identity verified; if matches, normal; if mismatches (impossible in single-machine test), safety modal |
| T7 | Two phones with two different users, both scan QR for treadmill #2 | First phone wins; second phone shows "machine busy"; no cross-talk |
| T8 | Phone with user A on treadmill #2. Power off treadmill #2 mid-workout | Connection lost overlay (existing behavior); peripheral_not_found on reconnect; force-finalize flow; drops awarded for legitimate portion |
| T9 | Treadmill #2 was paired with sensor X in admin panel. Replace BLE sensor with new physical unit (sensor Y). Don't re-pair. Scan QR | App shows "Mašina nije u dometu" — Step 1 doesn't accept Y because admin panel still has X paired |
| T10 | Inactivity for 5 min on bike (sit still) | Auto-pause kicks in; standing up and pedaling auto-resumes (this is `pauseReason='inactivity'`, NOT manual; should still auto-resume per Step 2) |
| T11 | Risk dashboard for a user who completed 5 normal sessions in pilot | Drill-down shows zero events or only `inactivity_autofinish` artifacts; no `CROSS_TALK` flags |
| T12 | Repeat T1-T3 on **iPhone** (any model, iOS 17+) | All pass identically |
| T13 | Repeat T1-T3 on **Samsung S25 (Android)** | All pass identically; Step 1 hex-derived match works on Android MAC peripheral.id format |

**Acceptance:** 12/13 tests pass before re-deploying to TestFlight / Play Internal Testing. T9 is informational — if it fails, product decides whether to add admin-side re-pair UX flow.

---

### Step 9: i18n + UX polish for new modals
**Workspace:** `apps/mobile-app/locales/`
**Agent:** mobile-ui-ux-agent

Add to `apps/mobile-app/locales/{en,sr}/workout.json`:

| Key | EN | SR |
|---|---|---|
| `machineNotInRangeTitle` | "Machine not in range" | "Mašina nije u dometu" |
| `machineNotInRangeBody` | "Make sure the machine is powered on, then scan the QR code again." | "Proverite da li je mašina upaljena, pa ponovo skenirajte QR kod." |
| `machineNotInRangeAction` | "End and rescan" | "Završi i skeniraj ponovo" |
| `peripheralMismatchTitle` | "Connected to wrong machine" | "Povezan na pogrešnu mašinu" |
| `peripheralMismatchBody` | "We detected your phone connected to a different machine than the one you scanned. Workout ended for safety. Drops awarded for your verified activity." | "Tvoj telefon se povezao sa drugom mašinom umesto sa onom koju si skenirao. Trening je završen radi bezbednosti. Drops su dodeljeni za potvrđenu aktivnost." |
| `peripheralMismatchAction` | "OK" | "U redu" |
| `pauseSuppressBelt` | "Pause active. Stop the belt to fully stop the workout." | "Pauza je aktivna. Zaustavi traku da bi se trening potpuno zaustavio." |

**Acceptance:** All keys present in EN + SR; mobile-ui-ux-agent verifies tone matches existing keys (formal-casual mix).

---

## Data Model Changes

### `machines` table
- **No schema change.** `sensor_id` semantics clarified in `peripheral_id_matches_sensor` helper function.

### `sessions.raw_metrics` JSONB
- New keys (no schema change):
  - `raw_metrics.security.peripheral_id_mismatch = 'true'` (set by `update_machine_heartbeat` on mismatch)
  - `raw_metrics.security.crosstalk_remediation = { original_drops, refunded_at }` (set by Step 7 migration)

### `fraud_events` table
- New `event_type` values (no schema change — column is TEXT):
  - `peripheral_id_server_mismatch` (severity high)
  - `drops_zeroed_peripheral_mismatch` (severity high)
  - `crosstalk_remediation_applied` (severity info)

### `drops_transactions` table
- New `type` value: `crosstalk_remediation_refund` (negative amount)

---

## API Contracts

### `update_machine_heartbeat(p_machine_id, p_user_id, p_observed_peripheral_id?)`
**Posle Step 4:**
- New optional param `p_observed_peripheral_id TEXT DEFAULT NULL`
- Returns FALSE if peripheral mismatch detected; logs `peripheral_id_server_mismatch`
- Backward compatible: NULL observed_peripheral_id behaves as before

### `update_machine_rpm(p_machine_id, p_user_id, p_rpm, p_observed_peripheral_id?)`
**Posle Step 4:** Same as heartbeat.

### `award_drops(p_session_id)` (existing function)
**Posle Step 4:**
- New early-exit: if session has `raw_metrics.security.peripheral_id_mismatch = 'true'`, returns `{ success: true, drops_awarded: 0, reason: 'peripheral_mismatch' }`
- Logs `drops_zeroed_peripheral_mismatch` event

### `bleService.getConnectedPeripheralId(): string | null` (NEW client method)
**Posle Step 1:**
- Returns the actual BLE peripheral id used for current connection (iOS UUID or Android MAC)
- Returns null if not connected

### `bleService.connectToDevice(sensorId)` (existing, signature unchanged)
**Posle Step 1:**
- Now throws `BlePeripheralNotFoundError` if scanned peripherals don't include any matching the sensorId
- Previously returned a connection to the strongest-RSSI device (silent cross-talk)

---

## Testing Requirements

### Unit Tests (Step 1 + Step 2 + Step 3)
- `apps/mobile-app/tests/ble-service-peripheral-identity.test.ts` (NEW)
  - `connectToDevice` with no devices in range → throws `BlePeripheralNotFoundError`
  - `connectToDevice` with 5 devices, none matching → throws
  - `connectToDevice` with 1 matching device → connects
  - `connectToDevice` with 2 matching devices → connects to highest RSSI of matches
  - `deriveCandidatePeripheralIds` with various sensor_id formats (base64, hex, MAC)
- `apps/mobile-app/tests/workout-pause-auto-resume-guard.test.ts` (NEW)
  - Simulate measurement stream with rising crankRevolutions, isPaused=true, pauseReason='manual' → setIsPaused(false) never called
  - Same setup with pauseReason='inactivity' → setIsPaused(false) called on first delta
  - Manual pause → 6 seconds elapsed → guard expires → auto-resume allowed (only if pauseReason flips to inactivity in real flow; in test we verify the AUTO_RESUME_GUARD_MS check)
- `apps/mobile-app/tests/workout-peripheral-mismatch.test.ts` (NEW)
  - `verifySessionOwnership` returns false on peripheral mismatch
  - Mismatch triggers safety modal + force-finalize

### Integration Tests
- Manual matrix from Step 8 on Vortex hardware

### Telemetry verification (Step 5)
- After 24h of pilot: Sentry dashboard shows expected event distribution
- After 7 days: review `peripheral_id_server_mismatch` count — should be 0 in healthy fleet (any non-zero = investigate)

---

## Rollout Strategy

### Phase A — Investigation (Day 1, 2-3 hours)
1. Step 0a (supabase-dba) → forensics report
2. Step 0b (reviewer) → code audit
3. Product reviews both, signs off on remediation scope before Step 7 is even drafted

### Phase B — Mobile fix (Day 1-2, ~12 hours)
1. Steps 1, 2, 3, 5 (mobile-coder) in parallel branches → merged into `vortex-crosstalk-hotfix`
2. Step 9 (mobile-ui-ux-agent) once Step 1+3 are stable
3. Local + simulator testing → EAS dev build → distribute to 2-3 internal test devices

### Phase C — Backend fix (Day 2, ~5 hours)
1. Step 4 (supabase-dba) → migration applied to staging
2. Smoke test: heartbeat with mismatched observed_peripheral_id → verify fraud_event row, raw_metrics flag
3. Apply to production after Step 1 mobile build is in TestFlight

### Phase D — Admin forensics (Day 2-3, ~4 hours)
1. Step 6 (admin-coder) — risk dashboard drill-down
2. Deploy to admin panel (Vercel preview → main)

### Phase E — Remediation (Day 3, ~2 hours)
1. Step 7 (supabase-dba) — only after Phase A/B/C deployed and at least 24h of observability data confirms cross-talk is no longer occurring
2. Apply remediation migration with the explicit list of session IDs from Step 0a forensics
3. Notify affected users via email (composed by product)

### Phase F — Vortex pilot continuation (Day 4+)
1. Re-onboard the 2 frozen users (lift admin freeze) after remediation
2. 7-day soak with intensive Sentry monitoring
3. Weekly forensics rerun (supabase-dba runs Step 0a queries weekly until 0 cross-talk events for 4 consecutive weeks)

### Build numbers
- `apps/mobile-app/app.config.js`: `ios.buildNumber: '21'`, `android.versionCode: 47`
- Force-update prompt for any user on `< 21` / `< 47` (existing force-update infrastructure if any; otherwise add server-truth `min_supported_build` check on app cold-start)

---

## Files Touched (sumirano)

### `backend/supabase/migrations/`
- `YYYYMMDDHHMMSS_machine_rpc_observed_peripheral_id_check.sql` (NEW — Step 4)
- `YYYYMMDDHHMMSS_remediate_vortex_crosstalk_drops.sql` (NEW — Step 7, after forensics)

### `apps/mobile-app/lib/`
- `lib/ble-service.ts` (MODIFIED — Step 1: new error class, candidate matching, peripheral id capture)
- `lib/telemetry.ts` (MODIFIED — Step 5: new Sentry events, may not exist yet — create if needed)

### `apps/mobile-app/app/`
- `app/workout.tsx` (MODIFIED — Steps 1, 2, 3, 5: BlePeripheralNotFoundError handling, manual pause guard, peripheral mismatch modal, observed_peripheral_id in heartbeat/RPM calls)

### `apps/mobile-app/components/`
- `components/workout/MachineNotInRangeOverlay.tsx` (NEW — Step 1)
- `components/workout/PeripheralMismatchModal.tsx` (NEW — Step 3)

### `apps/mobile-app/locales/`
- `locales/en/workout.json` (MODIFIED — Step 9)
- `locales/sr/workout.json` (MODIFIED — Step 9)

### `apps/mobile-app/tests/`
- `tests/ble-service-peripheral-identity.test.ts` (NEW)
- `tests/workout-pause-auto-resume-guard.test.ts` (NEW)
- `tests/workout-peripheral-mismatch.test.ts` (NEW)

### `apps/admin-panel/`
- `app/dashboard/risk/[userId]/page.tsx` (NEW — Step 6)
- `lib/actions/risk.ts` (NEW — Step 6 server actions)

### `apps/mobile-app/`
- `app.config.js` (MODIFIED — build numbers)

### `docs/forensics/` (NEW directory)
- `2026-05-08_vortex_crosstalk_forensics.md` (Step 0a output)

### `docs/reviews/` (NEW directory)
- `2026-05-08_ble_service_pause_flow_review.md` (Step 0b output)

---

## Risk Register

| # | Risk | Mitigation |
|---|---|---|
| R1 | Step 1 hex-match logic is too strict — legitimate users on iOS or Android can't connect because format mismatch | Step 8 T12+T13 verification on real hardware before merge; fallback to "log + connect anyway" debug mode behind `EXPO_PUBLIC_BLE_STRICT_IDENTITY=false` env var if pilot reveals issues |
| R2 | Step 4 server-side check breaks older app versions that don't send observed_peripheral_id | Param is optional with NULL default → no behavior change for older clients; verify with deliberate downgrade test |
| R3 | Step 2 manual pause guard breaks "raise from sit" auto-resume on bikes | Step 2 explicitly only suppresses `pauseReason='manual'`; inactivity auto-resume preserved. T10 verifies. |
| R4 | Step 7 reverses drops on user who legitimately earned them (false positive in forensics classification) | Product reviews Step 0a report before Step 7; Step 0a includes manual review of top 5 anomalous sessions per user; Step 6 admin UI lets superadmin selectively un-reverse if needed |
| R5 | After Step 1, users with off-machines see "machine not in range" and can't do anything because the machine truly is off | Step 1 UX explicitly tells user to power on machine; this is correct behavior — silent connection to wrong machine is the actual bug |
| R6 | Two users with same-named treadmills (e.g., generic FTMS broadcast names "Treadmill") confuse the matcher | Step 1 prefers `device.id` over `device.name`; admin panel pairing flow already stores unique sensor_id per machine; if collision exists, that's an admin pairing bug to fix separately |
| R7 | `peripheral_id_matches_sensor` SQL function false negatives (legitimate peripheral, formatting differs) | Step 4 logs the (observed, expected) pair into fraud_events for any mismatch — supabase-dba reviews first 24h of mismatches and tunes match logic before Step 7 |
| R8 | Force-update prompt for `< build 47` clients drives churn | Don't enforce hard block; show banner "Update required for security fix"; soft-deprecate after 7 days; force after 14 days |

---

## Sign-off Checklist

- [ ] Architect plan reviewed (this document)
- [ ] supabase-dba: Step 0a forensics report committed
- [ ] reviewer: Step 0b code audit committed
- [ ] mobile-coder: Steps 1, 2, 3, 5 implemented; unit tests passing
- [ ] supabase-dba: Step 4 migration applied to staging; smoke test passes
- [ ] mobile-coder: EAS dev build distributed; Step 8 manual QA matrix executed
- [ ] mobile-ui-ux-agent: Step 9 i18n keys added EN+SR
- [ ] admin-coder: Step 6 risk drill-down deployed to admin panel
- [ ] product: Reviewed Step 0a report and approved Step 7 scope
- [ ] supabase-dba: Step 7 remediation migration applied; affected users notified
- [ ] CHANGELOG.md updated with Step references
- [ ] MIGRATION_NOTES.md updated with Step 4 + Step 7 migrations
- [ ] STATE_OF_THE_APP.md updated: Vortex pilot status note about cross-talk fix
- [ ] Build numbers bumped in `app.config.js`
- [ ] TestFlight + Play Internal Testing distribution complete
- [ ] 24h Sentry observability check confirms `peripheral_id_server_mismatch ≈ 0` in healthy fleet

---

## Cross-References

- Earlier hardening plan (do not duplicate work): `docs/plans/vortex_pilot_hardening_workout_flow_critical_fixes.md` — already covers BUG-009 (BLE reconnect verifies sensor_id) at high level. **THIS plan supersedes BUG-009** with deeper sensor identity logic.
- Production anti-abuse plan: `docs/plans/production_anti_abuse_hardening_plan.md` — fraud_event taxonomy
- Original incident reports: from architect's input on 2026-05-08 (user `symfony123@gmail.com` 225 events / 31 freezes; user `aleksandarmark.97@gmail.com` 80 events / 0 freezes)

---

**Estimated calendar time:** 3-4 working days assuming parallel execution of Phases A/B/C/D. Phase E (remediation) gated by Phase A approval, can start in parallel with Phase D once forensics report is signed off.

**Target deploy date:** 2026-05-12 (4 days from plan creation), assuming forensics on Day 1 doesn't reveal a wider problem requiring scope expansion.
