# Bugfix: machine-lock UX — disconnect recovery, abandoned-session restore, error-code split, modal occlusion

## Context

Production incidents (Vortex gym, 2026-05-07). All four bugs share one underlying theme: **once a session row is `is_active = true` for any reason, the mobile UX has no in-app recovery path** — users are told to wait, close/reopen the app, or just lose their workout entirely.

Reported symptoms:
- **NFC scan** → "Machine busy" modal, even though `machines.is_busy = false` for every treadmill in the DB.
- **QR scan** → indefinite "scanner loading" overlay, modal never appears.
- **Mid-workout abandonment** (high priority): user finishes treadmill run, walks to locker room without tapping Finish; BLE drops; app shows "Reconnecting…" forever; killing and relaunching the app silently abandons the workout (no resume prompt, no summary, no in-app finalize affordance) — the machine stays locked for the next user and the workout's drops are only credited later by the 5-minute cron.

The DB-side root cause is fixed by `backend/supabase/migrations/20260507060000_cleanup_orphan_active_sessions.sql` (orphan `sessions.is_active = true` rows now self-heal via the existing 5-min cron). This plan addresses the **mobile-side UX bugs** that turn each DB inconsistency into a user dead-end:

1. **Two different errors are mapped to one modal.** `start_session_safely()` returns either `machine_busy` ("a different user is on this machine") or `user_active_session_conflict` ("you have a stale active session somewhere"). Both currently route to the same `t('machineBusy')` modal in `apps/mobile-app/components/ScannerScreen.tsx:626` and `apps/mobile-app/lib/qr/handleQrDeepLink.ts:502`. Users with an orphan session of their own are told the *machine* is busy and have no in-app recovery path — they must close and reopen the app, switch accounts, or wait for the cron.
2. **QR scanner modal is invisible on iOS.** `/scan` is registered with `presentation: 'transparentModal'` (`apps/mobile-app/app/_layout.tsx:116`). The global `AppModal` (`apps/mobile-app/components/AppModal.tsx`) is mounted as a sibling of `StackNavigator` in `_layout.tsx:690`. On iOS native-stack, a transparentModal screen lives in its own `UIViewController` and can overlay root-level sibling overlays, so the modal rendered by `showModal(...)` is occluded by the camera screen. The user only sees the in-screen `ActivityIndicator` and waits forever. NFC works because `/m/[uuid]` is a plain card screen and the global modal renders above it cleanly.
3. **No `finally` reset of `isProcessing`** in the QR scanner's `proceedWithWorkout` and `autoCheckinThenStartWorkout` early-return paths. If the modal is occluded (point 2) or otherwise never reaches the user, `setIsProcessing(false)` is never called and the loader is permanent.
4. **HIGH PRIORITY — Mid-workout disconnect / app-kill recovery.** Three concrete failures along this single path:
   - **4a. "Reconnecting…" overlay is a dead end without user input.** `apps/mobile-app/app/workout.tsx:3216-3252`. The paused-overlay's "End workout" affordance (`showForceFinishOption`) only appears after **`resumeFailCountRef.current >= 3`** — and that counter is *only* incremented inside `resumeWorkout()` (line 2252), which only runs when the user actively taps Resume. A user who walks away without tapping anything sees the overlay forever; no automatic escape kicks in. The 60-second `showConnectingCancel` timeout (`workout.tsx:1092-1118`) only covers the *initial* connect path, not post-connect disconnects.
   - **4b. No active-session restoration on app launch.** Cold/warm starts go straight to `/home` with zero check for an in-flight `sessions WHERE user_id = auth.uid() AND is_active = true` row. There is no `recoverActiveWorkout`, no resume banner, no recovery deep link. After the user kills the app, the only way back into the workout is to scan the same machine again — which is now blocked by `user_active_session_conflict`.
   - **4c. No in-app finalize-from-disconnect affordance.** Even if the user finds the paused overlay's "End workout" button (after 3 manual Resume taps), it calls `handleFinishWorkout()` which goes through the normal `award_drops` + `unlock_machine` path. That works without BLE, but the path is hidden behind the manual fail-counter. Users who walk away without interacting never reach it; the row sits orphaned until the 5-minute cron's *next* tick — worst case ~8 minutes of "machine busy" for the next user, plus a confused first user who thinks their workout was lost.

## Dependencies

- [x] `backend/supabase/migrations/20260507060000_cleanup_orphan_active_sessions.sql` deployed (DB-side orphan healing). Mobile recovery RPC (`finalize_inactive_session`) already exists and is owner-callable.
- [ ] No new schema changes required for Bugs 1–3.
- [ ] No new RPC required — `finalize_inactive_session(p_session_id, p_reason)` is already SECURITY DEFINER and gated to `auth.uid() = session.user_id` (or superadmin/service_role). See `backend/supabase/migrations/20260325000002_inactivity_autofinish_and_lock_starvation.sql:75-99`.
- [ ] **Bug 4 only:** also no schema changes. Reuses `finalize_inactive_session` for finalize, `award_drops` (called transitively) for drops crediting, and the existing `loadSession()` path in `workout.tsx:1795` for resume-after-restart rehydration.

## Workspace Assignment

- `mobile-coder` → `apps/mobile-app/` (all code changes)
- `mobile-ui-ux-agent` → consistency/polish pass after `mobile-coder`
- `reviewer` → QA + regression sweep (modal occlusion on iOS, finalize-and-retry happy path, drops integrity)

`backend/` and `apps/admin-panel/` are **out of scope** for this bugfix.

## Data Model Changes

None.

## API Contracts

### Existing RPC reused (no changes)

`public.finalize_inactive_session(p_session_id UUID, p_reason TEXT)` — owner-callable; closes the session, calls `award_drops` so any earned drops are credited, unlocks the machine if any, logs a `fraud_events` audit row.

```ts
const { data, error } = await supabase.rpc('finalize_inactive_session', {
  p_session_id: '<uuid>',
  p_reason: 'user_initiated_recovery',
});
// data: { success, already_finalized, drops_earned, message }
```

### Existing query reused (RLS-safe)

```ts
const { data: stale } = await supabase
  .from('sessions')
  .select('id, machine_id, gym_id, started_at')
  .eq('user_id', currentUser.id)
  .eq('is_active', true)
  .order('started_at', { ascending: false })
  .limit(1)
  .maybeSingle();
```

RLS already permits a user to read their own session rows.

## Execution Plan

### Step 1: Helper module — recover stale active session (mobile-coder)

Create a small shared helper so both `ScannerScreen.tsx` and `handleQrDeepLink.ts` use the same logic.

- **New file:** `apps/mobile-app/lib/qr/recoverStaleActiveSession.ts`
- **Exports:** `recoverStaleActiveSession(userId: string): Promise<{ closed: boolean; sessionId: string | null; dropsRecovered: number; error?: string }>`
- **Behavior:**
  1. Query `sessions` for the user's most recent `is_active = true` row.
  2. If none found, return `{ closed: false, sessionId: null, dropsRecovered: 0 }`.
  3. Call `supabase.rpc('finalize_inactive_session', { p_session_id, p_reason: 'user_initiated_recovery' })`.
  4. Return result. On RPC error, fall back to a direct `update` of `sessions` (the same fallback the existing simulator-bypass path uses at `ScannerScreen.tsx:931-939`) so recovery cannot fail silently.
- Add `log.debug` / `log.warn` traces with the `[Recovery]` prefix for production observability.

### Step 2: Localization keys — split error copy (mobile-coder)

Add new keys to `apps/mobile-app/locales/en/scanner.json` AND `apps/mobile-app/locales/sr/scanner.json`. Keep existing `machineBusy` / `machineBusyDesc` for the genuine "different user is on this machine" case.

**EN (`apps/mobile-app/locales/en/scanner.json`):**
```json
"machineBusyOther": "Machine in use",
"machineBusyOtherDesc": "Someone else is using this machine right now. Please use another machine.",
"previousWorkoutOpen": "Previous workout still open",
"previousWorkoutOpenDesc": "It looks like a previous workout didn't finish. Close it to start a new one — any drops you earned will still be credited.",
"closeAndRetry": "Close and retry",
"recovering": "Closing previous workout…",
"recoveryFailed": "Couldn't close previous workout",
"recoveryFailedDesc": "Please try again. If the problem persists, restart the app."
```

**SR (`apps/mobile-app/locales/sr/scanner.json`):** equivalent translations (e.g. `previousWorkoutOpen: "Prethodni trening još otvoren"`, `closeAndRetry: "Zatvori i pokušaj ponovo"`, etc.). Match the existing tone in this file (informal `ti`).

The existing `machineBusy` / `machineBusyDesc` keys remain — used only when the lock is genuinely held by another user.

### Step 3: ScannerScreen — split error handling and add recovery (mobile-coder)

File: `apps/mobile-app/components/ScannerScreen.tsx`

Two call sites today (lines ~624–632 in `proceedWithWorkout` and ~736–744 in `autoCheckinThenStartWorkout`) use the conflated branch:

```tsx
if (errorCode === 'machine_busy' || errorCode === 'user_active_session_conflict') {
  showModal({ title: t('machineBusy'), body: t('machineBusyDesc'), buttons: [{ label: t('common:ok'), onPress: resetScan }] });
  return;
}
```

Replace each with:

```tsx
if (errorCode === 'machine_busy') {
  showModal({
    title: t('machineBusyOther'),
    body: t('machineBusyOtherDesc'),
    buttons: [{ label: t('common:ok'), onPress: resetScan }],
  });
  return;
}
if (errorCode === 'user_active_session_conflict') {
  showModal({
    title: t('previousWorkoutOpen'),
    body: t('previousWorkoutOpenDesc'),
    buttons: [
      { label: t('common:cancel'), style: 'cancel', onPress: resetScan },
      { label: t('closeAndRetry'), onPress: () => handleRecoverAndRetry(machine) },
    ],
  });
  return;
}
```

Add a new handler:

```tsx
const handleRecoverAndRetry = async (machine: MachineStatus) => {
  // Local progress overlay (not the global AppModal — see Step 4 for why)
  setIsProcessing(true);
  try {
    const userId = sessionRef.current?.user?.id;
    if (!userId) { resetScan(); return; }
    const result = await recoverStaleActiveSession(userId);
    if (!result.closed) {
      // Nothing to close — proceed straight to workout retry
      await proceedWithWorkout(machine);
      return;
    }
    // Brief success haptic, then retry the same machine
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await proceedWithWorkout(machine);
  } catch (err) {
    log.error('[Scanner] recover-and-retry failed:', err);
    showModal({
      title: t('recoveryFailed'),
      body: t('recoveryFailedDesc'),
      buttons: [{ label: t('common:ok'), onPress: resetScan }],
    });
  }
};
```

### Step 4: ScannerScreen — fix iOS transparentModal occlusion (mobile-coder)

The global `AppModal` mounted in `_layout.tsx:690` is occluded by `/scan` on iOS because `/scan` is registered with `presentation: 'transparentModal'` at `_layout.tsx:116` and native-stack puts the screen in its own `UIViewController`.

Two acceptable fixes (pick one — mobile-coder decides based on iOS verification):

**Option A (preferred, minimal-blast-radius):** Render a local instance of `AppModal` *inside* `ScannerScreen` so the modal lives within the same `UIViewController` as the camera. Keep the global `AppModal` mounted at root for every other screen.

- Import: `import { AppModal } from '@/components/AppModal';`
- Mount: add `<AppModal />` as the last child of the outermost `<View style={styles.cameraContainer}>` in `ScannerScreen.tsx`.
- The Zustand store is a singleton — both instances read the same `visible/title/body/buttons` state. The local one renders ABOVE the camera; the root one is occluded. Both call `hideModal()` on dismiss; React's reconciliation handles the duplicate render correctly because each render is identical.
- **Edge case:** if the user navigates away from `/scan` while the modal is visible, the root instance keeps it on-screen as expected.

**Option B (only if A has visual artifacts):** Change `/scan` from `presentation: 'transparentModal'` to a plain card screen at `_layout.tsx:113-121`. Replace the `slide_from_bottom` animation with `slide_from_bottom` via the plain-card `animation` option (still supported). Verify that the home screen back-stack still works correctly (this is the one risk — the back swipe behavior changes).

If Option A has artifacts (e.g. modal renders twice, dismissal lag), fall back to Option B with a regression sweep on the home → scan → home navigation.

### Step 5: ScannerScreen — defensive `finally` on every async early-return path (mobile-coder)

Three async functions today have `setIsProcessing(true)` at the top but rely solely on `resetScan` (called from modal `onPress`) to reset it. If the modal is ever occluded (Step 4), preempted, or fails to render, the loader strands the user.

Add a `finally` to each of:

- `handleQRCodeScanned` (`ScannerScreen.tsx:434`)
- `proceedWithWorkout` (`ScannerScreen.tsx:693`)
- `autoCheckinThenStartWorkout` (`ScannerScreen.tsx:592`)
- `handleCheckin` (`ScannerScreen.tsx:315`)

```tsx
} finally {
  // Defensive: never strand the loader. resetScan() also fires from modal
  // onPress callbacks and is idempotent.
  if (!hasNavigatedAwayRef.current) {
    setIsProcessing(false);
  }
}
```

Add a small `hasNavigatedAwayRef` guard that flips to `true` immediately before `router.replace(...)` calls inside these functions, so we don't briefly clear the loader on a screen that's about to unmount (avoids flicker). Alternative: just always clear; an unmounting `setState` is harmless thanks to React 19's auto-cleanup.

### Step 6: Apply identical split + recovery to `handleQrDeepLink.ts` (mobile-coder)

File: `apps/mobile-app/lib/qr/handleQrDeepLink.ts`

This file handles NFC and HTTPS Universal Link entry. The same split must happen at line ~502 (`startSessionAndRoute`):

- Replace the single conflated branch with two: `machine_busy` → `t('machineBusyOther')`, `user_active_session_conflict` → `t('previousWorkoutOpen')` with a "Close and retry" action that calls `recoverStaleActiveSession` and retries `startSessionAndRoute`.
- The recovery callback here uses the same `recoverStaleActiveSession` helper from Step 1.
- `errorModal` already routes through the global `AppModal`. NFC entry routes (`/m/[uuid]`, `/machine/[uuid]`) are plain card screens, NOT transparentModal — so no occlusion fix is needed here.

### Step 7: Disambiguate `lockFailed` legacy keys (mobile-coder, optional)

The `scanner.json` files still contain `lockFailed: "Machine busy"` / `lockFailedDesc: "Unable to lock the machine. It may already be in use."`. Audit whether these are still referenced. If yes, point them at `t('machineBusyOther')`. If no (the `lock_machine` legacy path was superseded by `start_session_safely`), delete the keys.

This step is non-blocking — flag if dead.

---

### Step 8 (Bug 4a): Auto-escape from "Reconnecting…" overlay (mobile-coder, HIGH PRIORITY)

File: `apps/mobile-app/app/workout.tsx`

The paused overlay (lines `3216-3252`) is the user's primary failure mode when they walk away mid-workout. Today, "End workout" only appears after the user manually taps Resume three times and each fails. A user who never interacts is stranded.

**Required changes:**

- **Auto-attempt reconnect while paused-on-connection.** Add a new `useEffect` that fires when `isPaused && pauseReason === 'connection'`. Every 30s (matching the existing heartbeat cadence in this state), call `bleService.reconnect()` and increment `resumeFailCountRef.current` on failure. After **3 auto-fails OR 90 seconds total** (whichever comes first), set `setShowForceFinishOption(true)` so the red "End workout" button appears without any user interaction.
- **Add a second affordance: "Save what I've got" / "Finish & save".** Today the only red button reads `t('endWorkout')` and calls `handleFinishWorkout()`. That path warns about short workouts (<2 min, see `workout.tsx:2292`) but the user is in an *involuntary* end state — gate the warning behind `pauseReason !== 'connection'`. For BLE-disconnect endings, finish silently and show session-summary; the user has already left the machine, the duration is whatever was last synced.
- **Always show the affordance after a hard threshold.** Bypass `resumeFailCountRef` entirely and force `setShowForceFinishOption(true)` after **5 minutes** of `isPaused && pauseReason === 'connection'` regardless of reconnect attempts (reconnects could be silently failing for hardware reasons; we still want the user to escape if they ever come back to the app). Use a single `connectionPausedSinceRef = useRef<number | null>(null)` set at pause-time and cleared on resume; the 30s reconnect interval also checks it for the 5-min cap.
- **Add an "I'm done" inline button to the bleConnectionOverlay** (initial-connect path, lines `3267-3284`). The 60s `showConnectingCancel` already gates this — keep that — but rename the i18n key from `cancelWorkout` to `cantConnectFinish` and have it call `handleFinishWorkout()` instead of `cancelWorkout` semantics if the session has any synced duration > 0 (so users credit drops instead of throwing the workout away). For zero-duration sessions, keep cancel behavior.
- **i18n keys (EN + SR):**
  - `connectionLostTitle`: "Connection lost"
  - `connectionLostBody`: "We can't reach the sensor. We're trying to reconnect…"
  - `connectionLostSaveAction`: "Save what I've got"
  - `connectionLostKeepTryingAction`: "Keep trying"
  - `connectionAutoFinishExplain`: "If you've already left the machine, tap Save — your drops for {{duration}} will be credited."

### Step 9 (Bug 4b): Active-session detection and recovery on app launch (mobile-coder, HIGH PRIORITY)

**New file:** `apps/mobile-app/lib/workout/useActiveSessionRecovery.ts` — a hook that runs once after auth is ready and queries the user's most recent `is_active = true` session row.

- **Behavior:**
  1. Run on `_layout.tsx` post-auth, gated by `useAuthStore(s => s.isInitialized && !!s.session)`.
  2. Skip on routes already in the workout flow (`/scan`, `/workout`, `/workout-sim`, `/checkin-result`, `/session-summary`, `/m/*`, `/c/*`, `/machine/*`, `/checkin/*`).
  3. Query: `sessions` joined with `machine` and `gym`, `WHERE user_id = auth.uid() AND is_active = true ORDER BY started_at DESC LIMIT 1`.
  4. If found AND `NOW() - started_at > 60s` (so we don't race with a fresh session that just got created in another tab/device), set state on the new Zustand store `useActiveSessionRecovery` (file `apps/mobile-app/lib/stores/useActiveSessionRecovery.ts`).
  5. The store exposes `{ pendingSession, dismiss(), recover('resume' | 'finish' | 'discard'), isRecovering }`.
- **New component:** `apps/mobile-app/components/ActiveSessionRecoveryBanner.tsx` — premium glass card pinned to the top of `/home` (and `/scan` after dismissal of any current modal). Three actions:
  - **Resume** → `router.push({ pathname: '/workout', params: { sessionId, machineId, gymId, machineType, sensorId, bleProtocol } })`. Existing `loadSession()` (`workout.tsx:1795`) already rehydrates `duration_seconds` and `calories` from the row, so the screen picks up where it left off.
  - **Finish & save** → call `recoverStaleActiveSession(userId)` (Step 1), then navigate to `/session-summary?sessionId=<id>` so the user sees their drops. The summary screen already handles a finalized session ID gracefully via `loadPendingFinalization` semantics — extend it to also accept a direct `sessionId` param and re-fetch the row.
  - **Discard** → confirm modal: "Your last workout will be closed and saved with whatever duration was already recorded. Drops earned so far will be credited." (DB-side, `finalize_inactive_session` always credits drops via `award_drops` — there's no actual "discard without crediting" because drops belong to the user; the button label communicates the user's intent to dismiss the banner, not to forfeit drops.) Action: same as Finish & save but skip the navigation to summary and just close the banner.
- **i18n keys (EN + SR):**
  - `recovery.banner.title`: "Unfinished workout"
  - `recovery.banner.body`: "You started a {{machineType}} session at {{gymName}} {{minutesAgo}} min ago and never finished it."
  - `recovery.banner.resume`: "Resume"
  - `recovery.banner.finish`: "Finish & save"
  - `recovery.banner.dismiss`: "Close"
  - `recovery.confirmDiscard.title`: "Close this workout?"
  - `recovery.confirmDiscard.body`: "We'll save what we have and credit any drops you earned."

### Step 10 (Bug 4c): Auto-finalize on app background timeout (mobile-coder)

When the user **kills the app while in `/workout`**, trigger an immediate finalize attempt — don't wait 5 min for the cron.

- In `workout.tsx`, register an `AppState` listener (already exists for `isAppInBackgroundRef` — extend it). On `state === 'background'`:
  - If `bleConnected === false` (i.e. user already walked away) AND `isPaused === true && pauseReason === 'connection'` AND `duration > 60` (so we don't kill a freshly-started workout the user just minimized), schedule a 60-second **soft-finalize** timer:
    - After 60s, if app is still backgrounded and BLE is still gone, call `recoverStaleActiveSession(userId)` (or directly `supabase.rpc('finalize_inactive_session', { p_session_id, p_reason: 'app_background_disconnect_autofinish' })`).
    - This finalizes via `award_drops` so drops are credited, unlocks the machine, and transitions the session to closed *before* the user even relaunches.
  - On `state === 'active'` while the timer is pending: cancel the timer (user came back).
- On `state === 'active'` AFTER finalize fired: the recovery banner from Step 9 will *not* trigger (session is already closed). Instead, surface a one-shot `<AppModal>` on first navigation: "Your last workout was finalized automatically — {{drops}} drops credited." Use a tiny AsyncStorage flag (`@sweatdrop/last_autofinalize_session_id`) so we only show this once per session.

This makes the worst case `<2 min` from disconnect to machine being available for the next user, instead of the current ~8 min cron worst case.

### Step 11 (Bug 4 — server-side hardening, supabase-dba, optional)

**Out-of-scope unless mobile heuristics aren't enough.** If telemetry after rollout shows we're still seeing >2 min orphan windows, two follow-ups:

- **Add `finalize_my_active_session(p_reason TEXT) RETURNS finalize_inactive_session_result`** wrapper RPC. Internally calls `finalize_inactive_session` after locating the caller's own active session — saves the mobile a round-trip and removes the small RLS edge case where the SELECT and the RPC see different states. File: `backend/supabase/migrations/YYYYMMDDHHMMSS_finalize_my_active_session_rpc.sql`. Pure additive; no breaking changes.
- **Run `cleanup_abandoned_sessions` every 1 minute instead of 5.** Update the pg_cron schedule from `*/5 * * * *` to `* * * * *`. With the SKIP LOCKED + timestamp pre-filter from `20260409200003` and the 10-min hard floor on Sweep 2 from `20260507060000`, the per-tick cost stays bounded. Worst-case orphan window drops from ~8 min to ~4 min.

Both items are flagged optional and gated on production telemetry from the mobile recovery banner — no point optimizing the cron if Step 10's auto-finalize already nukes the orphan rate.

## UX Detail: Recovery Modal Flow

```
Scan QR / NFC tap
    ↓
start_session_safely → returns user_active_session_conflict
    ↓
Show modal:
    Title:  "Previous workout still open"
    Body:   "It looks like a previous workout didn't finish. Close it to
             start a new one — any drops you earned will still be credited."
    Buttons: [Cancel] [Close and retry]
    ↓
User taps "Close and retry"
    ↓
Local processing overlay (no global modal, so it works inside transparentModal)
    ↓
recoverStaleActiveSession(userId)
    → SELECT id FROM sessions WHERE user_id = auth.uid() AND is_active = true
    → RPC finalize_inactive_session(<id>, 'user_initiated_recovery')
       (credits any earned drops via award_drops, unlocks machine, audit logs)
    ↓
Retry start_session_safely on the originally-scanned machine
    ↓
Either:
    - Success → navigate to /workout (normal happy path)
    - machine_busy now (different user grabbed it in the gap)
        → modal "Machine in use" (no recovery action)
    - any other error → generic error modal with "OK"
```

## Testing Requirements

### Manual — Bugs 1–3 (scanner)

- **iOS device, transparentModal modal visibility:** Stub `start_session_safely` to return `user_active_session_conflict`. Open `/scan`, scan a valid QR. The "Previous workout still open" modal must be **fully visible** on top of the camera. Repeat with `machine_busy` and verify the "Machine in use" modal appears. Reproduce the original bug by reverting just Step 4 to confirm the fix is necessary.
- **Recovery happy path:** Insert a fake `sessions` row (`is_active = true`, with non-zero `duration_seconds`) for the test user. Scan a treadmill. Tap "Close and retry". Verify:
  - The previous session's `award_drops` runs (drops_earned > 0 if duration warrants it).
  - The new session is created and `/workout` opens normally.
  - `fraud_events` has an `inactivity_autofinish` row with `reason = 'user_initiated_recovery'`.
- **Recovery cancel:** Same as above but tap "Cancel". Verify scanner returns to camera idle state, the previous session is still active in DB, `isProcessing = false`.
- **NFC parity:** Same matrix on NFC-tap entry (`/m/[uuid]`).
- **Genuine machine-busy:** Two test users; user A starts a workout on machine X; user B scans X. User B must see "Machine in use" with NO recovery button.
- **Loader strand regression:** Force-quit during processing, reopen. Verify the loader does not persist on the next scan.

### Manual — Bug 4 (HIGH PRIORITY, mid-workout disconnect)

Run on a real Vortex treadmill with FTMS so BLE behaviour matches production.

- **4a — Walk-away with no input:** Start a workout. After 30s, walk far enough away that BLE drops naturally (do not tap anything). Verify within ~90s the paused overlay shows the "Save what I've got" affordance without user interaction. Tap it. Confirm `/session-summary` opens with the synced `duration_seconds` and credited drops.
- **4a — Hard-cap auto-affordance:** Start a workout, force airplane mode on phone, leave the screen visible without interacting. After 5 minutes the red "End workout" button must be visible regardless of the auto-reconnect counter (some hardware never reports a clean disconnect).
- **4a — Initial-connect timeout:** Open `/workout` with a sensor that never advertises (e.g. unplugged treadmill). After 60s, the bleConnectionOverlay must show the "I'm done" / "Save what I've got" button. For zero-duration sessions, label and behaviour stay as cancel.
- **4b — App-kill recovery:** Start a workout, run for ≥2 min, force-quit the app. Reopen → cold-start home screen. Verify `<ActiveSessionRecoveryBanner>` appears within 1s with the gym name + minutes-ago. Tap **Resume** → `/workout` reopens with the prior duration/calories preloaded. Tap **Finish & save** → `/session-summary` opens with credited drops. Tap **Close** → confirm modal → row finalizes and banner dismisses; verify on the next /scan attempt that there is no `user_active_session_conflict`.
- **4b — Banner gating:** Verify the banner does NOT appear if a session row younger than 60s exists (race protection). Verify it does NOT appear on `/workout` itself, `/scan`, or any deep-link route.
- **4c — Background auto-finalize:** Start a workout, walk away (BLE drops, paused overlay shows). With overlay visible, background the app (don't kill — just go to home screen). Wait 90s. Bring the app forward. Verify the session has been finalized (`is_active = false`, drops credited) and the one-shot "Workout finalized — N drops credited" modal appears once. Verify the recovery banner from 4b does NOT also fire (the session is already closed).
- **4c — User returns within timeout:** Same as above but bring the app back to foreground after 30s (before the 60s soft-finalize fires). Verify finalize did NOT run; the workout is still resumable; tapping Resume reconnects normally if BLE is back in range.
- **Cross-bug interaction:** Walk-away → app kill → reopen → home shows recovery banner (Bug 4b). Tap **Finish & save**. Then go to `/scan` and scan a different machine. Verify `start_session_safely` succeeds (Bug 1's `user_active_session_conflict` no longer fires because Bug 4b cleared the row).
- **Concurrency:** While user A walks away from machine X, user B should see "Machine in use" (genuine `machine_busy`) on machine X for at most 90s (Step 10 auto-finalize) or 5 min (Step 8 hard-cap if Step 10 didn't fire because A's app stayed foregrounded). Confirm the orphan window is bounded.

### Automated

- Unit tests for `recoverStaleActiveSession` (`apps/mobile-app/lib/qr/__tests__/recoverStaleActiveSession.test.ts`):
  - No active session → returns `{ closed: false }`.
  - Active session present, RPC succeeds → returns `{ closed: true, dropsRecovered }`.
  - RPC fails, fallback `update` succeeds → returns `{ closed: true, dropsRecovered: 0 }`.
  - RPC and fallback fail → returns `{ closed: false, error }`.
- Snapshot/regression test for the new modal copy keys in both `en/scanner.json` / `sr/scanner.json` (Bugs 1–3) and `en/workout.json` / `sr/workout.json` (Bug 4).
- Unit tests for `useActiveSessionRecovery` hook (`apps/mobile-app/lib/workout/__tests__/useActiveSessionRecovery.test.ts`):
  - No active session → store stays empty.
  - Active session > 60s old → store populates with payload.
  - Active session < 60s old → store stays empty (race protection).
  - On gated route (e.g. `/workout`) → hook short-circuits, no Supabase call.

### Negative

- `start_session_safely` returns an unknown `error_code` → generic error modal (existing behavior, must not regress).
- User cancels recovery mid-RPC → no orphaned client state.
- Recovery RPC succeeds but the immediate retry of `start_session_safely` returns `machine_busy` (a third user grabbed the machine in the gap) → modal switches to "Machine in use", no infinite loop.
- Bug 4c: app backgrounded → soft-finalize fires → user returns and the recovery banner mistakenly also fires → **must not happen** (banner gates on `is_active = true`, soft-finalize already flipped it).
- Bug 4c: soft-finalize RPC fails (network gone) → don't retry indefinitely in background; one attempt at the 60s mark, then fall back to the 5-min cron. The recovery banner picks it up on next foreground.

## Rollout Notes

- **Backward-compatible:** Older app builds keep working — the DB-side migration (`20260507060000`) self-heals orphans within 5 minutes regardless of client version. The mobile fixes shorten the window from ~8 min to ~90s on the new build.
- **No feature flag required.** The split is local UX; the underlying RPC contract is unchanged. Recovery banner gates itself on a Supabase query result, so old/new builds coexist cleanly during phased rollout.
- **Bump `ios.buildNumber` and `android.versionCode`** in `apps/mobile-app/app.config.js` so QA can verify the fix is the build under test.
- **Telemetry suggestion (out of scope, follow-up):** add `mixpanel.track('scanner_recovery_attempted', { outcome })`, `mixpanel.track('workout_disconnect_autofinalize', { reason, duration_s })`, and `mixpanel.track('workout_recovery_banner_action', { action })` so we can monitor how often each path fires post-launch and confirm the orphan rate trends to zero.

## Sequencing & Priority

Ship in this order (each step is independently shippable):

1. **(already shipped) DB migration `20260507060000`** — heals existing orphans, baseline safety net.
2. **Step 8 (Bug 4a)** — auto-escape from "Reconnecting…". Smallest, highest-impact mobile change. Closes the visible user dead-end.
3. **Step 10 (Bug 4c)** — background auto-finalize. Reduces the orphan window for *every other user* of the same machine.
4. **Step 9 (Bug 4b)** — recovery banner. Makes accidental kills survivable.
5. **Steps 1–6 (Bugs 1–3)** — scanner UX split + iOS modal fix. Lower priority now that 4a/4b/4c eliminate the most common path that creates the conflict in the first place.
6. **Step 7** — legacy `lockFailed` cleanup. Cosmetic.
7. **Step 11** — server-side hardening. Optional; gate on telemetry.

## Out of Scope

- Server-side changes beyond Step 11's optional follow-ups (already shipped baseline in `20260507060000`).
- Admin-panel surfacing of stuck sessions (could be a follow-up: a "Stuck active sessions" admin widget that lists rows where `sessions.is_active = true` but `machines.is_busy = false` and offers a one-click finalize). Not blocking.
- Refactoring the global `AppModal` to a portal-based implementation that automatically escapes any presentation context — bigger change, separate plan.
- True offline-first workout recording (queueing FTMS samples on-device when network is gone). Big architectural change; separate plan if/when product asks for it.
