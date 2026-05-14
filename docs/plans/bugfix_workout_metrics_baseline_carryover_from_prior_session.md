# Bugfix: Workout metrics carry over from the prior session (FTMS cumulative distance & calories must be baselined per-session)

**Owner:** mobile-coder
**Workspaces touched:** `apps/mobile-app/` ONLY (no admin-panel, no backend/supabase)
**Severity:** P0 — pollutes workouts, badges, distance challenges, calorie challenges, leaderboards
**Affected machines:** every FTMS-capable machine (treadmill 0x2ACD, indoor bike 0x2AD2, cross-trainer 0x2ACE)
**Reproduced on:** Vortex pilot (production), treadmills

---

## 1. Context — The Bug

User reproduction (verbatim from production):

> "I trained on the treadmill for 1h, the data from the treadmill synced to the mobile app. It shows for example 5 km, 40 kcal, etc. I finish the workout in the app, the workout is saved. I then scan again while still on the treadmill, the app connects, the **drops start from 0** but the other metrics like **km, kcal are picked up from the machine** and now I got a new workout with a couple of minutes but **5 km and 40 kcal**."

What this means in plain terms:
- FTMS treadmills (and every other FTMS profile we support) emit **cumulative-since-machine-power-on** values for `total_distance` and `total_energy` (kcal). Per the Bluetooth SIG FTMS 1.0 spec, these are running totals — the machine does NOT zero them when our app disconnects, finishes a session, or starts a new BLE connection. The treadmill only resets these counters when the **user physically presses Stop on the treadmill console long enough for the firmware to clear the run**, or the machine reboots.
- Our drop calculation already handles this correctly for **crank revolutions** (CSC/Magene + FTMS RPM) — it captures a "first measurement baseline" and only counts the **delta** going forward (see `lastCrankRevolutionsRef` initialization in `apps/mobile-app/app/workout.tsx:1156-1164`).
- Distance and calories do **not** have an equivalent baseline. The BLE callback blindly assigns the device's cumulative value:

```283:312:apps/mobile-app/app/workout.tsx
  const ftmsTotalDistanceRef = useRef<number>(0);
  const ftmsMaxPowerRef = useRef<number>(0);
  const ftmsPowerHistoryRef = useRef<number[]>([]);
  const ftmsDeviceCaloriesRef = useRef<number>(0);
```

```959:976:apps/mobile-app/app/workout.tsx
  // Distance tracking (meters) - use device total directly
  if (measurement.distance != null && measurement.distance > 0) {
    ftmsTotalDistanceRef.current = measurement.distance;
  }
  …
  // Device calories (kcal) - authoritative from machine
  if (measurement.calories != null && measurement.calories > 0) {
    ftmsDeviceCaloriesRef.current = measurement.calories;
  }
```

```1010:1031:apps/mobile-app/app/workout.tsx
  // Distance: use device value if available, otherwise accumulate from speed
  if (measurement.distance != null && measurement.distance > 0) {
    ftmsTotalDistanceRef.current = measurement.distance;
  } else if (spd > 0.3 && validDt) {
    ftmsTotalDistanceRef.current += (spd / 3.6) * dtSec;
  }
  …
  // Calories: device value (authoritative) or speed-based MET estimation
  if (measurement.calories != null && measurement.calories > 0) {
    caloriesShared.value = measurement.calories;
  } else if (spd > 0.3 && validDt) {
    treadmillCalAccRef.current += (spd / 60) * dtSec;
    caloriesShared.value = Math.floor(treadmillCalAccRef.current);
  }
```

These values then flow to **`raw_metrics.total_distance`** and **`sessions.calories`** at finalize:

```2873:2904:apps/mobile-app/app/workout.tsx
    // Distance: prefer FTMS device-reported, fallback to revolution estimate
    if (ftmsProtocolActiveRef.current && ftmsTotalDistanceRef.current > 0) {
      rawMetrics.total_distance = Math.round(ftmsTotalDistanceRef.current);
    } else if (totalRevolutions > 0) {
      rawMetrics.total_distance = Math.round(totalRevolutions * 2.1);
    }
    …
    if (ftmsDeviceCaloriesRef.current > 0) {
      rawMetrics.device_calories = ftmsDeviceCaloriesRef.current;
    }
```

Result: brand-new session inherits 5 km and 40 kcal from the **previous user's run on the same treadmill** the moment the first FTMS notification arrives.

### Why it's worse than it looks

`sessions.raw_metrics->>'total_distance'` is the **only** distance source for:

- Distance-based challenges (e.g. weekly 10 km challenge — `backend/supabase/migrations/20260302000008_phase1_core_award_drops.sql:270, 524`)
- Distance-based achievement progress (`Kilometer Club`, `Marathoner` — see `20260423100001_seed_production_global_achievements.sql`)
- Workout history distance column (`apps/mobile-app/app/workout-history.tsx`)
- User progress aggregates (`apps/mobile-app/hooks/useUserProgress.ts`)
- Challenge completion logic (`20260304100012_fix_challenge_completion_logic.sql:87`)

So a 2-minute session that inherits a prior 5 km **awards the user 5 km of credit toward a Kilometer Club badge and toward weekly distance challenges**. Likewise for kcal challenges. This is also a fraud vector if discovered: rescan after any prior user's run and harvest their distance.

### Why drops are NOT affected (and why this fix is purely about distance + kcal)

Drops are driven by `revolutionDelta = currentRevolutions - lastRevolutions`, and `lastCrankRevolutionsRef` is captured on the **first** measurement of the session (see `workout.tsx:1156-1164`). The very first packet returns early with `return;` so no drops are counted. Subsequent packets compute deltas. That is the exact pattern this fix transplants to distance and calories.

The other cumulative-on-machine FTMS fields (`stepCount`, `strideCount`, `positiveElevation`, `negativeElevation`, `elapsedTime`) are **not** read by `workout.tsx` today, so they don't need a fix in this PR. If we ever start consuming them, they must use the same baselining helper introduced here.

---

## 2. Root Cause (one sentence)

`workout.tsx` treats FTMS fields `measurement.distance` and `measurement.calories` as if they were **session-scoped**, but the FTMS spec defines them as **machine-scoped cumulative totals** that survive across our app's connect/disconnect cycle.

---

## 3. Goal of the Fix

Establish a per-session baseline for every cumulative FTMS metric so that:

1. **New session on a "dirty" machine** (prior workout left 5 km / 40 kcal showing on the treadmill console) → adjusted distance and calories start at **0** the moment we connect, regardless of what the device emits.
2. **Same session across BLE drop/reconnect** → no double-counting and no rewind; baselined math survives a `bleService.reconnect()`.
3. **Machine reset mid-session** (user presses Stop/Reset on the treadmill while our session is still active, machine zeroes its own counters) → previously earned distance/calories are preserved via a `carryOver` accumulator, and we re-baseline from the new (lower) device value.
4. **Speed-based fallback unchanged** for treadmills that don't emit FTMS distance/calories — that path is already delta-correct.
5. **No regression** in `raw_metrics.total_distance`, `raw_metrics.device_calories`, `sessions.calories`, `rawMetrics.calories_source`, or the displayed distance/kcal animated text.

---

## 4. Design

### 4.1 Pattern — "first-packet baseline with carry-over"

For every cumulative-on-machine FTMS scalar (`distance`, `calories`), we keep three pieces of state per session:

| Ref | Purpose | Initial |
| --- | --- | --- |
| `*BaselineRef` | The device's reading on the **first** non-null/non-zero packet of this session, OR the device's reading immediately after a detected machine reset. | `null` (sentinel: not yet baselined) |
| `*CarryOverRef` | Cumulative work already credited from earlier baseline epochs (only nonzero if the device reset mid-session). | `0` |
| `ftmsTotalDistanceRef` / `ftmsDeviceCaloriesRef` | The **session-adjusted** running total. This is the value used by the UI and at finalize. | `0` |

On every FTMS packet with a non-null cumulative reading `device`:

```
if baseline is null:
  // First packet of this baseline epoch — anchor here, do not count.
  baseline = device
  adjusted = carryOver
else if device < baseline:
  // The machine reset its own counter (firmware reset, console Stop hold,
  // power blip). Roll forward: keep the credit we have, re-anchor.
  carryOver = adjusted   // freeze what we earned so far
  baseline = device       // re-anchor at the new low value
  adjusted = carryOver    // unchanged this packet
else:
  adjusted = (device - baseline) + carryOver
```

That single rule covers:

- **Cross-session "dirty machine" carry-over** (the user's bug). First packet anchors at `device = 5000m`; `adjusted = 0`. Next packet at `device = 5020m` → `adjusted = 20m`. ✓
- **BLE drop within session.** Refs survive (`useRef` persists across re-renders), so on reconnect the next packet is just another normal packet — no anchor change, no double count. ✓
- **Machine reset mid-session.** Device jumps from 5020 → 0 → 30. We detect `device < baseline`, freeze `carryOver = 20m`, re-anchor at `baseline = 0`. Next packet at 30 → `adjusted = (30 - 0) + 20 = 50m`. ✓
- **Bogus zero pulse.** The existing `> 0` guard already skips zeroes, so a single `device = 0` packet doesn't trigger a false reset. We only treat the value as a reset when it's a **positive** value that's lower than the baseline.

### 4.2 Where to apply

Two metrics × two callsites each = 4 patch points, but they should all go through one tiny helper to keep them honest.

#### 4.2.1 Helper: `applyCumulativeBaseline`

Add a pure helper to `apps/mobile-app/lib/ble/cumulativeBaseline.ts` (new file). Signature:

```ts
export interface BaselineState {
  baseline: number | null;
  carryOver: number;
  adjusted: number;
}

/**
 * Map a machine-cumulative reading to a session-scoped adjusted total.
 * Pure function; the caller stores `next` back on its refs.
 *
 * `device` must be the raw FTMS cumulative value (meters or kcal).
 * Returns the next state and whether a machine reset was detected.
 */
export function applyCumulativeBaseline(
  prev: BaselineState,
  device: number
): { next: BaselineState; resetDetected: boolean };
```

Behavior:

- If `prev.baseline === null` → anchor: `next.baseline = device`, `next.adjusted = prev.carryOver`, `resetDetected = false`.
- If `device < prev.baseline` → reset: `next.carryOver = prev.adjusted`, `next.baseline = device`, `next.adjusted = prev.carryOver`, `resetDetected = true`.
- Else → normal: `next.baseline = prev.baseline`, `next.carryOver = prev.carryOver`, `next.adjusted = (device - prev.baseline) + prev.carryOver`, `resetDetected = false`.
- `next.adjusted` is clamped at `≥ prev.adjusted` (monotonic non-decreasing) to defend against jitter where the device decrements by a few cm between packets without truly resetting (some firmware does this on a paused belt).

This helper goes in `lib/ble/` not `lib/` to make room for the BLE module refactor already happening (no other files in `lib/ble/` yet — that's fine, create the folder).

#### 4.2.2 Replace the four direct assignments

State to introduce in `apps/mobile-app/app/workout.tsx` next to the existing FTMS refs (around line 297-309):

```ts
// FTMS cumulative-metric baselines (per-session). These ride alongside
// ftmsTotalDistanceRef / ftmsDeviceCaloriesRef which now hold the *adjusted*
// (session-scoped) totals; the raw device values live behind these baselines.
//
// AGENT NOTE: cumulative FTMS scalars (distance, total energy) survive across
// our BLE connect/disconnect cycle — they only reset when the user resets
// the machine itself. Without a per-session baseline, a fresh session inherits
// the prior user's distance and kcal the moment the first packet arrives.
// See docs/plans/bugfix_workout_metrics_baseline_carryover_from_prior_session.md
const ftmsDistanceBaselineRef = useRef<number | null>(null);
const ftmsDistanceCarryOverRef = useRef<number>(0);
const ftmsCaloriesBaselineRef = useRef<number | null>(null);
const ftmsCaloriesCarryOverRef = useRef<number>(0);
```

Then refactor the four assignment sites to flow through the helper. **Pseudocode pattern** for distance (apply identically to calories):

```ts
// inside FTMS measurement handler, replacing the existing
// `ftmsTotalDistanceRef.current = measurement.distance;` lines
if (measurement.distance != null && measurement.distance > 0) {
  const { next, resetDetected } = applyCumulativeBaseline(
    {
      baseline: ftmsDistanceBaselineRef.current,
      carryOver: ftmsDistanceCarryOverRef.current,
      adjusted: ftmsTotalDistanceRef.current,
    },
    measurement.distance
  );
  ftmsDistanceBaselineRef.current = next.baseline;
  ftmsDistanceCarryOverRef.current = next.carryOver;
  ftmsTotalDistanceRef.current = next.adjusted;
  if (resetDetected) {
    log.debug('[Workout] FTMS distance device reset detected', {
      device: measurement.distance,
      carryOver: next.carryOver,
    });
  }
}
```

The four sites:

1. `apps/mobile-app/app/workout.tsx:960-962` — generic FTMS distance branch (bike + cross-trainer + treadmill fallback).
2. `apps/mobile-app/app/workout.tsx:974-976` — generic FTMS calories branch.
3. `apps/mobile-app/app/workout.tsx:1011-1015` — treadmill display branch with speed-based fallback. **Critical:** when the device reports distance, run through the helper as above. When it doesn't, the existing `ftmsTotalDistanceRef.current += (spd / 3.6) * dtSec;` accumulator stays exactly as-is (it's already a delta). The speed-fallback branch should **not** touch the baseline ref — it just adds to `ftmsTotalDistanceRef.current` like before.
4. `apps/mobile-app/app/workout.tsx:1026-1031` — treadmill display branch for calories. Same shape as #3. The `treadmillCalAccRef` speed-fallback path is already delta-based and stays untouched; the device-reported branch goes through the helper, and the helper's output (`adjusted`) is what we push to `caloriesShared.value` and to `ftmsDeviceCaloriesRef.current` — keep both in sync (they currently diverge: line 1027 writes only to `caloriesShared`, line 975 writes only to `ftmsDeviceCaloriesRef`; after this fix both should be set from the same adjusted number on every device-reported packet so the finalize-time `raw_metrics.device_calories` matches what the UI showed the user).

After the change, `ftmsTotalDistanceRef.current` and `ftmsDeviceCaloriesRef.current` are **always session-adjusted** values. Nothing downstream of these refs needs to change:

- The finalize block at `workout.tsx:2873-2904` keeps reading the same refs — it now picks up adjusted values automatically.
- The `calories_source` decision at `workout.tsx:2859-2860` stays correct because `ftmsDeviceCaloriesRef.current > 0` still means "the device reported calories at least once" (just zero-relative-to-baseline).
- The `finalCalories` selection at `workout.tsx:2921-2923` likewise picks the right (adjusted) number.

### 4.3 Defensive guards

1. **Sanity ceiling on first packet.** If the *very first* FTMS distance packet of a session has `device > 100_000` (100 km — far more than any plausible single-machine accumulator) it almost certainly indicates a malformed/wrapping value. Log a warn (`[Workout] FTMS distance baseline exceeds sanity ceiling, ignoring packet`) and **return without anchoring**, so the next packet is the real baseline. Same ceiling for calories: `device > 20_000` kcal. These ceilings should be exported constants from the helper so we can tune them.

2. **Wrap-around on the 24-bit FTMS distance field** (max raw value 16_777_215 = 16,777 km). At ~10 km/h that takes ~70 days of continuous running, so wrap-around in a single session is impossible. No special handling needed; the existing `device < baseline` "reset" branch would handle it safely if it ever fired.

3. **Idempotency on session-create.** If `applyLiveDropsEstimate` runs an early session restore that writes `caloriesShared.value = data.calories` (see `workout.tsx:2229-2235`), we don't want it to also seed the baseline. Keep the restore path untouched — it only restores the *adjusted* UI number, not the device baseline. New packets after restore will anchor against the live device value as expected.

4. **No-op when machineType is null or non-FTMS.** Already guaranteed by the `measurement.protocol === 'ftms'` guard at line 947.

### 4.4 What we explicitly are NOT changing

- `lastCrankRevolutionsRef` / drop calculation — already correct.
- `treadmillCalAccRef` / `treadmillLastMeasureTimeRef` — speed-based fallback accumulators, already delta-based and correct.
- `ftmsSpeedHistoryRef`, `ftmsMaxSpeedRef`, `ftmsPowerHistoryRef`, `ftmsMaxPowerRef` — instantaneous values (current speed, current power), not cumulative. No baseline needed.
- `award_drops()` and any other server function. This is a 100% client-side fix.
- The auto-finalize / recovery / cross-talk logic — orthogonal.
- `ble-service.ts` — the parser doesn't change. Cumulative semantics are correctly preserved in the measurement payload; baselining is a workout-screen concern, not a transport-layer concern.

---

## 5. Execution Plan — for `mobile-coder`

> Execute these steps in order. Stop at the end of each step and run typecheck before moving on.

### Step 1 — Create the helper

- **File (new):** `apps/mobile-app/lib/ble/cumulativeBaseline.ts`
- Export `BaselineState` interface and `applyCumulativeBaseline` per §4.1 / §4.2.1.
- Export sanity ceilings: `MAX_FTMS_DISTANCE_BASELINE_M = 100_000`, `MAX_FTMS_CALORIES_BASELINE = 20_000`. Callers consult these before anchoring; the helper itself stays a pure delta calculator.
- Add file header `AGENT NOTE` linking back to this plan and the user-reported scenario.
- No React, no Expo, no Supabase imports — pure TS so it's trivially unit-testable with `node:test`.

### Step 2 — Wire baselines into the BLE measurement callback

- **File:** `apps/mobile-app/app/workout.tsx`
- Add the four new refs declared in §4.2.2 next to the existing FTMS refs (around line 297-309).
- Replace the four direct assignments at `workout.tsx:960-962`, `974-976`, `1011-1015`, `1026-1031` with the helper-driven pattern shown in §4.2.2.
- Wire the sanity ceilings from §4.3.1 around the *first-anchor* case only (when `prev.baseline === null`). On a normal-running packet the ceiling is irrelevant.
- Keep the treadmill speed-based fallback accumulator branches exactly as they are — they bypass the helper.
- On `bleService.disconnect()` and on the workout-mount cleanup path **do not** touch the baseline refs. Within a single session, BLE drop + reconnect must NOT cause a re-baseline (refs survive, machine still has the cumulative value, math stays correct). The only thing that resets baselines is unmounting the workout screen (because then we get a fresh set of refs on the next mount).

### Step 3 — Sync calories writeback

- In the treadmill device-calories branch (post-helper), also assign `ftmsDeviceCaloriesRef.current = next.adjusted` alongside `caloriesShared.value = next.adjusted`. This guarantees the finalize-time `calories_source: 'device'` branch (`workout.tsx:2859-2860`, `2901-2903`, `2921-2923`) sees the same value the user saw on the workout screen.
- Same pattern in the generic FTMS calories branch — already wires `ftmsDeviceCaloriesRef.current`; just route through the helper.

### Step 4 — Structured logging

- Add a `log.debug('[Workout] FTMS distance baseline anchored', { device, sessionId })` on the *first* anchor (when `prev.baseline === null`). Same for calories.
- Add a `log.debug('[Workout] FTMS distance device reset detected', { device, carryOver, adjusted })` whenever the helper returns `resetDetected: true`. Same for calories.
- These help us spot misbehaving machines in the field (especially the "machine resets at random" failure mode some treadmills exhibit on auto-pause).

### Step 5 — Unit tests

- **File (new):** `apps/mobile-app/tests/cumulative-baseline.test.ts`
- Use `node:test` (matches the existing pattern in `apps/mobile-app/tests/recover-stale-active-session.test.ts`).
- Cases to cover:
  1. **Fresh anchor.** `baseline=null, carryOver=0`, device=5000 → `next.baseline=5000`, `adjusted=0`, `resetDetected=false`.
  2. **Normal increment.** `baseline=5000, carryOver=0, adjusted=0`, device=5020 → `adjusted=20`.
  3. **Cross-session inheritance.** Re-run case (1) → confirms the user's exact bug stops at the helper boundary.
  4. **Machine reset mid-session.** `baseline=5000, carryOver=0, adjusted=20`, device=10 (firmware reset) → `carryOver=20`, `baseline=10`, `adjusted=20`, `resetDetected=true`. Next call with device=40 → `adjusted = (40-10)+20 = 50`.
  5. **Sub-baseline jitter.** `baseline=5000, adjusted=20`, device=4999 (single-meter rewind, not a real reset). Confirm helper *does* re-anchor at 4999 (it satisfies `device < baseline`) but `carryOver` becomes 20, so the next normal packet `device=5005` yields `(5005-4999)+20 = 26` — the user does not lose credit. **This is the design tradeoff: any reverse motion counts as a reset.** Confirm via test that the monotonic clamp prevents `adjusted` from ever decreasing.
  6. **Monotonic clamp.** Construct a sequence where `(device - baseline) + carryOver` would decrease below `prev.adjusted`; assert helper clamps to `prev.adjusted`.
  7. **Zero device value.** Caller filters these (`device > 0` guard); the helper itself is undefined-behavior on `device <= 0`. Add a TS assertion / runtime guard if you want belt-and-suspenders, but the existing call sites all gate on `> 0`.

### Step 6 — Manual QA matrix

Run these against the actual production-build APK on a real FTMS treadmill (Vortex pilot floor):

| # | Setup | Action | Expected |
| --- | --- | --- | --- |
| 1 | Fresh-booted treadmill (console shows 0.0 km, 0 kcal). | Start workout. Run 0.5 km. Finish. | `raw_metrics.total_distance ≈ 500`, `sessions.calories ≈ correct`, drops awarded. |
| 2 | **The user's exact reproduction.** Console already shows 5 km / 40 kcal from a prior run. | Scan, start session. Run 0.2 km. Finish. | New session: `raw_metrics.total_distance ≈ 200` (NOT 5200), `sessions.calories` corresponds to ~0.2 km of work (NOT 40+). Kilometer-club / distance-challenge progress increments by 0.2 km only. |
| 3 | Same as #2, but force-quit the app between finish and rescan. | After rescan and 0.2 km run. | Same as #2 — refs are fresh on remount so the baseline correctly anchors. |
| 4 | BLE drop mid-session at 0.3 km / 25 kcal. | App auto-reconnects within 30s; user keeps running to 0.5 km. Finish. | `raw_metrics.total_distance ≈ 500` (NOT 800, NOT 200). No double-count, no rewind. |
| 5 | User presses Stop on treadmill console hard enough for it to reset (some Vortex Life Fitness units zero the display when held >3s) while our session is still active at 0.4 km / 30 kcal. User restarts the belt, runs another 0.3 km. Finish. | `raw_metrics.total_distance ≈ 700` (carryOver=400 + new 300). `[Workout] FTMS distance device reset detected` log present. |
| 6 | Treadmill that does NOT emit FTMS distance (speed-fallback path). 0.5 km run. | Finish. | `raw_metrics.total_distance ≈ 500` from speed-fallback (unchanged behavior; this fix doesn't regress the fallback). |
| 7 | Indoor bike (FTMS 0x2AD2) with kcal already at 12 from prior user. New 5-minute session, 2 kcal of actual work. | Finish. | `sessions.calories ≈ 2` (NOT 14). |

### Step 7 — Regression sweeps

After Steps 1-6, manually validate that none of these flows degraded:

- Workout history list shows distance and calories correctly (`apps/mobile-app/app/workout-history.tsx`).
- Home dashboard distance/kcal aggregates correct (`apps/mobile-app/hooks/useUserProgress.ts`).
- Kilometer Club / Marathoner achievement progress correct.
- Weekly distance challenge progress correct.
- Calorie-based challenges correct.
- Session summary screen post-workout shows the same numbers as the live workout screen (no last-second jump from cumulative correction).

### Step 8 — i18n / UI

No new strings. Logs are debug-only. No UI changes needed; the only user-visible difference is that the displayed distance and kcal on the workout screen now start at 0 and increase monotonically from there.

### Step 9 — Version bump

- Bump `ios.buildNumber` and `android.versionCode` in `apps/mobile-app/app.config.js`.
- Add a CHANGELOG entry under `[Unreleased] → Fixed` with the heading: **"Mobile app: workout metrics no longer inherit distance and calories from the prior session on the same FTMS machine."** Cite this plan and the four patch points.

---

## 6. Acceptance Criteria

A change is **complete** when ALL of the following hold:

1. ✅ All 7 unit-test cases in Step 5 pass via `pnpm --filter sweatdrop-mobile-app test` (or however the existing test runner is invoked — see `apps/mobile-app/tests/`).
2. ✅ Manual QA matrix rows 1-7 all pass on the Vortex pilot floor against a real treadmill *and* a real bike (or simulator equivalent if hardware unavailable, but at least one real-machine row 2 must pass).
3. ✅ `pnpm --filter sweatdrop-mobile-app type-check` is clean.
4. ✅ `pnpm --filter sweatdrop-mobile-app lint` is clean for the files touched.
5. ✅ Regression sweep (Step 7) shows no degradation in workout history, home dashboard, achievement progress, or challenge progress.
6. ✅ CHANGELOG and version bump applied.
7. ✅ No files outside `apps/mobile-app/` were modified.

---

## 7. Out of Scope (Don't Do These)

- ❌ Server-side distance/calorie reconciliation. The data is wrong at the source; no SQL function can rescue it. This is a client-only fix.
- ❌ Backfilling existing polluted sessions. Polluted sessions already wrote `raw_metrics.total_distance = 5200` to the DB; that data is irrecoverable. Optionally a follow-up plan can author a one-shot SQL migration to flag suspicious sessions (`duration_seconds < 600 AND total_distance > 3000m AND machine_id IS NOT NULL`), but that's a separate `bugfix_polluted_session_distance_backfill.md`.
- ❌ Refactoring `ble-service.ts` parsers. The parsers correctly preserve FTMS cumulative semantics — they shouldn't be changed.
- ❌ Adding NativeWind / new UI libraries.
- ❌ Touching admin-panel, backend/supabase, or shared types.

---

## 8. Risks & Mitigations

| Risk | Mitigation |
| --- | --- |
| Helper mis-fires on a quirky firmware that emits noisy decreasing distances during paused belt → loss of distance credit. | Monotonic clamp on `adjusted` (Step 5 case 6) + treat any decrease as a reset that **freezes carryOver to current adjusted** — user never loses earned credit, only loses uncredited "future" delta. |
| First packet legitimately reports a huge baseline (e.g. machine left at 50 km from prior gym day). | Sanity ceiling (Step 1) discards the first packet and re-anchors on the next one. Worst case: user loses the first ~1-second of distance, which is negligible vs the prior 50 km contamination this prevents. |
| BLE reconnect mid-session causes refs to be reset by some unrelated code path. | The refs are declared at component scope in `workout.tsx`. They're only reset on unmount (new workout) or by explicit assignment. Step 2 specifies "do not touch the baseline refs on disconnect/reconnect" — easy to enforce by inspection. |
| Helper has a bug that under-counts. | Unit tests (Step 5) cover all branches. Manual QA row 1 (clean machine) is the integration-level confirmation. |
| `calories_source: 'device'` decision flips to `'estimated'` for a session where the baseline anchor happened to land below 1 kcal. | The decision predicate is `ftmsDeviceCaloriesRef.current > 0`. After this fix, `ftmsDeviceCaloriesRef.current` starts at 0 (the adjusted value) for at least the first packet. **Fix:** change the predicate to also check that a baseline has been established. Suggested: `ftmsDeviceCaloriesRef.current > 0 || ftmsCaloriesBaselineRef.current !== null`. Document this in Step 3's instructions and add a unit test that confirms `calories_source` is `'device'` even when the user did <1 kcal of work but the device did report. |

---

## 9. File Touch List

```
apps/mobile-app/
├── lib/
│   └── ble/
│       └── cumulativeBaseline.ts          [NEW]
├── app/
│   └── workout.tsx                         [EDIT — §4.2.2 four patch points + §4.3.1 ceilings + Step 3 calories writeback + Step 4 logs + Step 9 build numbers also live in app.config.js]
├── app.config.js                           [EDIT — versionCode + buildNumber bump]
└── tests/
    └── cumulative-baseline.test.ts         [NEW]
```

Plus repo root:

```
CHANGELOG.md                                [EDIT — Unreleased / Fixed entry]
```

---

## 10. Hand-off Prompt to `mobile-coder`

> You are the **mobile-coder** for SWEATDROP. Execute the plan in `docs/plans/bugfix_workout_metrics_baseline_carryover_from_prior_session.md` end-to-end.
>
> **Constraints:**
> - Touch only files in `apps/mobile-app/` (and `CHANGELOG.md` at the repo root).
> - Do not modify `apps/admin-panel/`, `backend/supabase/`, or `backend/types/`.
> - Do not change the FTMS parsers in `apps/mobile-app/lib/ble-ftms.ts` or the transport in `apps/mobile-app/lib/ble-service.ts`. This bug lives entirely in `apps/mobile-app/app/workout.tsx`'s consumption of the parser output.
> - Drops, average RPM, max speed, max power, peripheral-identity checks, and auto-resume must continue to behave exactly as today — only `ftmsTotalDistanceRef` and `ftmsDeviceCaloriesRef` (and the values they feed) change semantically.
>
> **Order of operations:**
> 1. Read this plan in full.
> 2. Execute Step 1 (create the helper).
> 3. Execute Step 5 (unit tests) BEFORE Step 2, so you confirm the helper's correctness in isolation before wiring it into the workout screen.
> 4. Execute Step 2 (wire into workout.tsx), then Step 3 (calories writeback sync), then Step 4 (logs).
> 5. Run `pnpm --filter sweatdrop-mobile-app type-check`.
> 6. Run the test suite. All 7 unit-test cases must pass.
> 7. Execute Step 9 (version bumps + CHANGELOG entry).
> 8. Stop. Report back with:
>    - Diff summary per file.
>    - Unit test output.
>    - Confirmation that no files outside `apps/mobile-app/` (except CHANGELOG.md) were touched.
>    - The QA matrix from Step 6 with a column for the reviewer to fill in after on-floor testing at Vortex.
>
> **If you discover the bug is also present in a code path I missed,** stop and add a follow-up section to this plan rather than silently expanding scope. Likely-but-unverified additional callsites: any new FTMS field consumption added since 2026-05-09. Use `rg "measurement\\.distance|measurement\\.calories" apps/mobile-app/` to enumerate.
>
> **Leave an AGENT NOTE** at the top of `cumulativeBaseline.ts` and inside `workout.tsx` near the new refs, citing this plan filename and the user-reported scenario, so the next agent reading the code understands why a "pass-through assignment" became baseline math.

---

**End of plan.**
