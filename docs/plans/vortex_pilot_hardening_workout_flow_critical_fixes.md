# Plan: Vortex Pilot Hardening — BLE Workout Flow Critical Fixes

**Created:** 2026-05-07
**Author:** architect
**Trigger:** QA code review pre Vortex External Pilot release (`docs/plans/external_pilot_release_plan.md`).
**Severity Distribution:** 4× P0 (blockers), 9× P1 (mora raditi tokom pilota), 7× P2 (polish).

---

## Context

QA code review BLE workout flow-a (apps/mobile-app + backend cron sweep) je identifikovao 22 bug-a koji prete pre/tokom Vortex pilota. Prethodne iteracije (`bugfix_machine_busy_vs_user_session_conflict_and_qr_modal_occlusion.md` + migracija `20260507060000_cleanup_orphan_active_sessions.sql`) su pokrile **machine-busy deadlock** i **mid-workout disconnect escape**, ali ostalo je nekoliko klasa otvorenih problema:

1. **Android background BLE**: nema `FOREGROUND_SERVICE` u manifestu — Doze mode ubije BLE listener u 1-2 min, što razbija "background mode" pretpostavku u `workout.tsx:412`. Samsung S25 (One UI battery optimizer) je najagresivniji.
2. **QR loading UX**: `app/m/[uuid].tsx` vraća prazan `<View backgroundColor="#000000">` dok `handleQrDeepLink` chain trči (do **8s**: 800ms throttle + 5s GPS timeout + 1.5-2s RPC chain). Ovo je verovatni izvor "Samsung S25 5s delay-a".
3. **Recovery fallback gubi drops i ne unlock-uje mašinu**: `recoverStaleActiveSession.ts:174-208` postavlja `is_active=false` direktno (forfeitujući drops i izlazeći iz cron candidate set-a) i NE zove `unlock_machine`.
4. **Race-condition surface između 5 finalize putanja**: AppState background timer, manual End, inactivity, anti-piggyback, simulator complete — koriste različite guard ref-ove, mogu se sudariti.
5. **Reconnect sensor verification**: `verifySessionOwnership` proverava Supabase rekord ali ne `sensor_id` matching nakon reconnect-a — u krcatoj teretani moguće je da BLE peripheral preuzme tuđi deviceId.
6. **FTMS distance reset on machine restart**: client overwrite-uje `ftmsTotalDistanceRef` direktno → segmenti se gube.
7. **Inactivity fallback ne unlock-uje retry-em**: `unlock_machine` je best-effort, single attempt.
8. **Sleep callback false-positive**: 10s no-data triggeruje "Connection Lost" overlay umesto "no activity".
9. **Heartbeat blokira Sweep 1**: heartbeat traje dok god je workout mounted, čak i u connection-pause-u.

---

## Dependencies

- ✅ Migracija `20260507060000_cleanup_orphan_active_sessions.sql` već deployed (orphan sweep)
- ✅ Plan `bugfix_machine_busy_vs_user_session_conflict_and_qr_modal_occlusion.md` već implementiran (Bug 1-4c)
- ⚠️ **Pre starta plana:** verifikuj da `pg_cron` job `cleanup-abandoned-sessions` aktivno radi na production-u (`SELECT * FROM cron.job WHERE jobname = 'cleanup-abandoned-sessions';`)
- ⚠️ **Pre starta plana:** potvrdi da `apple-app-site-association` je deploy-ovan na `https://sweat-drop.com/.well-known/apple-app-site-association` (van scope-a ovog plana ali je preduslov za QR Universal Links na iOS)

---

## Out of Scope (eksplicitno)

- iOS push notifikacije (već flagged sa `EXPO_PUBLIC_PUSH_ENABLED`)
- Server-side `award_drops` tokenomics review (P3, posle pilota)
- RLS policy audit (P3, posle pilota)
- Stress test sa 5+ telefona u istoj prostoriji (zahteva fizičku setup; svrstano u QA test plan u Step 14)
- BUG-016, BUG-018, BUG-022 (P2 polish — adresirano kao TODO komentari, ne dio sprint scope-a)

---

## Workspace Map

| Step | Workspace | Agent | Estimirani effort |
|---|---|---|---|
| 1 | `backend/supabase/` | supabase-dba | 4h |
| 2 | `backend/supabase/` | supabase-dba | 2h |
| 3 | `apps/mobile-app/android/` + `app.config.js` | mobile-coder | 6h |
| 4 | `apps/mobile-app/lib/qr/` + `app/m/[uuid].tsx` + `app/machine/[uuid].tsx` | mobile-coder | 4h |
| 5 | `apps/mobile-app/lib/qr/recoverStaleActiveSession.ts` | mobile-coder | 2h |
| 6 | `apps/mobile-app/app/workout.tsx` | mobile-coder | 5h |
| 7 | `apps/mobile-app/lib/ble-service.ts` + `app/workout.tsx` | mobile-coder | 4h |
| 8 | `apps/mobile-app/app/workout.tsx` | mobile-coder | 3h |
| 9 | `apps/mobile-app/app/workout.tsx` | mobile-coder | 2h |
| 10 | `apps/mobile-app/app/workout.tsx` | mobile-coder | 2h |
| 11 | `apps/mobile-app/lib/supabase.ts` + `app/_layout.tsx` | mobile-coder | 1h |
| 12 | `apps/mobile-app/locales/{en,sr}/workout.json` | mobile-ui-ux-agent | 1h |
| 13 | `apps/mobile-app/tests/` | mobile-coder | 4h |
| 14 | manualni QA | reviewer | 4h |
| **TOTAL** | | | **~44h (5-6 dana posla)** |

**Admin panel:** nema izmena.

---

## Execution Plan

### Step 1: `start_session_safely` — idempotentno zatvori prethodnu user-ovu sesiju
**Workspace:** `backend/supabase/migrations/`
**Agent:** supabase-dba
**Bug:** BUG-004 (parcijalno već adresiran, ali UX fix)
**Migration file:** `YYYYMMDDHHMMSS_start_session_safely_idempotent_self_recover.sql`

**Goal:** Kada `start_session_safely` detektuje `user_active_session_conflict` ZA ISTOG korisnika (`s.user_id = auth.uid()`), funkcija interno zove `finalize_inactive_session('user_self_recover_on_new_scan')` i nastavlja sa novim insert-om — **bez vraćanja error code-a klijentu**.

**Rationale:**
- Klijentska "Close and retry" UX (već implementirana) zahteva 2 RPC round-trip-a: `start_session_safely` → modal → `finalize_inactive_session` → ponovo `start_session_safely`. Na sporoj mreži to je 3-5 sekundi.
- Konflikti za drugog korisnika (`machine_busy`) i dalje vraćaju error (jer je dovoljno mašinu pustiti da Sweep 1/2 cron-a izvuče).
- Konflikti za istog korisnika su definitivno bezbedni za auto-recover.

**Implementation outline (NEM PISATI KOD — supabase-dba implementira):**
- Read trenutnu definiciju `start_session_safely` u poslednjoj migraciji (`grep -r "start_session_safely" backend/supabase/migrations/`)
- Modifikuj branch koji vraća `user_active_session_conflict`:
  ```
  IF v_existing_session.user_id = v_actor_id THEN
    PERFORM public.finalize_inactive_session(v_existing_session.id, 'user_self_recover_on_new_scan');
    -- continue to insert new session
  ELSE
    -- existing behavior: return machine_busy
  END IF;
  ```
- Garantuj da `finalize_inactive_session` poziv ne pukne ceo RPC (try-except sa SQLERRM logged u `fraud_events`)

**Migration metadata:** SECURITY DEFINER, GRANT EXECUTE TO authenticated.

**Acceptance criteria:**
- Korisnik koji crash-uje workout i odmah skenira QR ne vidi "Previous workout open" modal — workout se startuje u 1 RPC pozivu.
- `fraud_events` ima audit row `user_self_recover_on_new_scan` za svaki ovakav incident.
- `machine_busy` (drugi korisnik) i dalje vraća error sa istim kod-om kao pre.

---

### Step 2: Smanji cron interval i Sweep 2 hard floor
**Workspace:** `backend/supabase/migrations/`
**Agent:** supabase-dba
**Bug:** BUG-004
**Migration file:** `YYYYMMDDHHMMSS_cleanup_abandoned_sessions_pilot_tightening.sql`

**Goal:**
- Smanji `cleanup_abandoned_sessions` cron interval sa `*/5 * * * *` na `*/1 * * * *` (1 min) za pilot period
- Smanji Sweep 2 hard floor sa **600s** na **180s**

**Rationale:**
- Worst-case orphan deadlock se smanjuje sa 15 min na 4 min
- 1-min cron je test workload (Vortex pilot ima ~9 mašina) — neće preopteretiti DB. Posle pilota vraćamo na 5 min ako monitoring pokaže pritisak.

**Implementation outline:**
- `CREATE OR REPLACE FUNCTION cleanup_abandoned_sessions()`: zameni `v_orphan_floor_sec CONSTANT INTEGER := 600` sa `v_orphan_floor_sec CONSTANT INTEGER := 180`
- `SELECT cron.unschedule('cleanup-abandoned-sessions'); SELECT cron.schedule('cleanup-abandoned-sessions', '*/1 * * * *', 'SELECT public.cleanup_abandoned_sessions();');`
- Note u migration header-u: "TEMPORARY for Vortex pilot. Revert to 5 min interval after pilot conclusion (target: 2026-06-30)."

**Acceptance criteria:**
- `SELECT * FROM cron.job WHERE jobname = 'cleanup-abandoned-sessions'` vraća schedule `*/1 * * * *`
- Funkcijska definicija ima `v_orphan_floor_sec := 180`
- Test: ručno `INSERT INTO sessions (...) VALUES (..., is_active=true, started_at=NOW() - interval '4 minutes')`; nakon 1 min cron tick-a → `is_active=false`

---

### Step 3: Android FOREGROUND_SERVICE za BLE workout
**Workspace:** `apps/mobile-app/`
**Agent:** mobile-coder
**Bug:** BUG-001 (CRITICAL)

**Files to modify:**
- `apps/mobile-app/app.config.js`
- `apps/mobile-app/android/app/src/main/AndroidManifest.xml` (regenerated by `expo prebuild`)
- `apps/mobile-app/lib/ble/foregroundService.ts` (NEW)
- `apps/mobile-app/app/workout.tsx`

**Library choice:** `@notifee/react-native` (već poznat i pouzdan) ili `expo-task-manager` + custom service. **Preporuka: `@notifee/react-native`** jer ima eksplicitan FGS API, nije eksperimentalan kao `expo-task-manager` na Androidu, i radi sa SDK 54.

**Subtask 3.1 — Permissions u app.config.js:**
- Dodaj u `android.permissions` array:
  - `'android.permission.FOREGROUND_SERVICE'`
  - `'android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE'` (Android 14+)
  - `'android.permission.POST_NOTIFICATIONS'` (Android 13+)
  - `'android.permission.WAKE_LOCK'`

**Subtask 3.2 — Install dependency:**
```bash
pnpm add @notifee/react-native --filter sweatdrop-mobile-app
cd apps/mobile-app && npx expo prebuild --clean
```

**Subtask 3.3 — Foreground service controller:**
Kreiraj `apps/mobile-app/lib/ble/foregroundService.ts` sa eksportima:
- `startWorkoutForegroundService(machineName: string, gymName: string): Promise<string>` — vraća notification ID
- `updateWorkoutForegroundService(notificationId: string, opts: { duration: number; drops: number; status: 'active'|'paused'|'connecting' }): Promise<void>`
- `stopWorkoutForegroundService(notificationId: string): Promise<void>`

Notifikacija konfiguracija:
- Channel ID: `sweatdrop_workout`
- Importance: `IMPORTANCE_HIGH`
- Category: `connectedDevice`
- Color: `branding.primary` (default `#00E5FF`)
- Title: `"SweatDrop trening u toku"` / `"SweatDrop workout in progress"`
- Body: dinamički — `"Mašina X • Y minuta • Z drops"` / `"Machine X • Y min • Z drops"`
- `ongoing: true`, `autoCancel: false`, `pressAction: { id: 'default', launchActivity: 'default' }`

**Subtask 3.4 — Integracija u workout.tsx:**
- Posle `setSession(loadedSession)` u sessionLoader-u: `startWorkoutForegroundService(...)` (samo ako `Platform.OS === 'android'` i `!isSimulator`)
- U cleanup-u (`useEffect` return + `_handleFinishWorkoutCore` exit + `cancelSessionForNoActivity` + `finalizeForInactivity`): `stopWorkoutForegroundService(...)`
- Update svakih 30s (svrstano u postojeći `setInterval` koji već postoji u workout.tsx — nema nov timer)
- iOS: ovaj kod NE-radi (no-op grane), iOS ima `bluetooth-central` mode

**Subtask 3.5 — Permission request flow:**
- Pre `startBLEMonitoring` u workout.tsx, pozovi `notifee.requestPermission()` (Android 13+ POST_NOTIFICATIONS)
- Ako korisnik odbije: nastavi workout ali bez FGS (degrade gracefully, nije blocker)
- Loguj `analytics: 'fgs_permission_denied'` za telemetriju

**Acceptance criteria:**
- Na Samsung S25 (Android 14+ One UI 6.x), workout pokrenut → app u background → posle 5 minuta BLE konekcija je još uvek aktivna i metrike teku
- Notifikacija "SweatDrop trening u toku" je prikazana, ne može se swipe-ovati
- Tap na notifikaciju vraća korisnika u workout screen
- iOS ponašanje nepromenjeno

---

### Step 4: QR loading state na `/m/[uuid]` i `/machine/[uuid]` rutama
**Workspace:** `apps/mobile-app/`
**Agent:** mobile-coder
**Bug:** BUG-002 (CRITICAL)

**Files to modify:**
- `apps/mobile-app/app/m/[uuid].tsx`
- `apps/mobile-app/app/machine/[uuid].tsx`
- `apps/mobile-app/components/qr/QrDeepLinkLoading.tsx` (NEW)
- `apps/mobile-app/lib/qr/handleQrDeepLink.ts`
- `apps/mobile-app/locales/{en,sr}/scanner.json`

**Subtask 4.1 — Loading komponenta:**
Kreiraj `QrDeepLinkLoading.tsx`:
- SafeAreaView + branding background
- Animated SweatDrop logo sa subtle pulse (`react-native-reanimated`)
- Status text koji se menja: prima `phase: 'machine'|'checkin'|'starting'` prop
  - `'machine'`: "Identifikujem mašinu..." / "Identifying machine..."
  - `'checkin'`: "Čekiram te..." / "Checking you in..."
  - `'starting'`: "Pokrećem trening..." / "Starting workout..."
- Cancel link na dnu, vidljiv tek nakon **3s** (timer): "Otkaži / Cancel" sa `Ionicons name="close-circle-outline"`
- Cancel handler: `router.replace('/home')` + `analytics: 'qr_loading_cancelled'`

**Subtask 4.2 — handleQrDeepLink phase callback:**
Modifikuj signaturu `HandleQrDeepLinkOptions`:
```typescript
export type HandleQrDeepLinkOptions = {
  router: MinimalRouter;
  session: Session | null;
  showModal: ...;
  updateHomeGym: ...;
  onPhaseChange?: (phase: 'machine' | 'checkin' | 'starting') => void; // NEW
};
```

`handleMachineFlow`:
- Pre `get_machine_status`: `options.onPhaseChange?.('machine')`
- Pre `perform_checkin`: `options.onPhaseChange?.('checkin')`
- Pre `start_session_safely`: `options.onPhaseChange?.('starting')`

**Subtask 4.3 — Smanji GPS timeout:**
U `handleQrDeepLink.ts:241`, smanji `setTimeout(() => resolve(null), 5000)` na **`2000`** (2s). `perform_checkin` već graceful handluje `lat: null, lng: null`. Samsung GPS na S25 fix-uje za <1s u 95% slučajeva.

**Subtask 4.4 — Update route files:**
`apps/mobile-app/app/m/[uuid].tsx` i `apps/mobile-app/app/machine/[uuid].tsx`:
- Lokalni state `[phase, setPhase] = useState<'machine'|'checkin'|'starting'>('machine')`
- Render `<QrDeepLinkLoading phase={phase} />` umesto praznog `<View>`
- Pozovi `handleQrDeepLink(payload, { ..., onPhaseChange: setPhase })`

**Subtask 4.5 — Cancel coordination:**
Cancel ne sme da prekine `start_session_safely` jer to bi moglo da kreira orphan. Cancel link je samo escape iz UI-ja:
- `useRef<boolean>(false)` `userCancelledRef`
- Cancel button: `userCancelledRef.current = true; router.replace('/home');`
- U `startSessionAndRoute` posle `start_session_safely` uspeha: `if (userCancelledRef.current) { void recoverStaleActiveSession(userId); return; }`

**Subtask 4.6 — Smanji 800ms delay u index.tsx:**
`apps/mobile-app/app/index.tsx:121`: smanji `setTimeout(..., 800)` na **`400`** ms. Throttle window je 600ms ali `router.replace` koristi različit slot od `router.push`, pa 400ms je dovoljan.

**Acceptance criteria:**
- Cold-start QR scan na S25: korisnik vidi loading screen sa progress message-om unutar 500ms
- Cancel dugme se pojavi tačno nakon 3s
- Pritisak Cancel-a vraća na home, i ako `start_session_safely` već uspeo, recover sweep zatvara orphan
- Total worst-case: 400ms + 1.5-2s RPCs = ~2-2.5s (pad sa 7-8s)

---

### Step 5: `recoverStaleActiveSession` — fallback čuva drops + unlock-uje mašinu
**Workspace:** `apps/mobile-app/`
**Agent:** mobile-coder
**Bug:** BUG-003 (CRITICAL)

**Files to modify:**
- `apps/mobile-app/lib/qr/recoverStaleActiveSession.ts`
- `apps/mobile-app/tests/recover-stale-active-session.test.ts`

**Subtask 5.1 — Fallback path savePendingFinalization:**
U bloku linije 174-208 (fallback `UPDATE sessions`):
- **PRE** UPDATE-a, pozovi `savePendingFinalization(sessionId)` (importovati iz `@/lib/workout/pendingFinalization`)
- Fallback i dalje postavlja `is_active=false` (UX prioritet — korisnik može odmah skenirati QR ponovo)
- Komentar update: "Drops nisu zauvek izgubljeni — pendingFinalization marker drainPendingFinalization na sledećem startu app-a će retry-ovati `award_drops` (idempotentan)."

**Subtask 5.2 — Unlock machine u fallback path-u:**
Posle uspešnog `UPDATE sessions`:
```typescript
if (stale.machine_id) {
  try {
    await client.rpc('unlock_machine', {
      p_machine_id: stale.machine_id,
      p_user_id: userId,
    });
  } catch (unlockErr) {
    log.warn('[Recovery] unlock_machine fallback failed:', unlockErr);
    // Non-fatal: cron Sweep 1 will catch within 1 minute
  }
}
```

**Subtask 5.3 — Dodaj `machine_id` u inicijalni SELECT:**
Linija 101-108: već select-uje `'id, machine_id, gym_id, started_at'` — OK.

**Subtask 5.4 — Test cases (`recover-stale-active-session.test.ts`):**
Dodaj 3 nova test case-a:
- "RPC fails, fallback saves pending finalization" — verifikuj da `savePendingFinalization` mock-uje pozvan sa pravim sessionId
- "RPC fails, fallback calls unlock_machine" — verifikuj da `client.rpc('unlock_machine', ...)` pozvan
- "RPC fails, unlock_machine also fails — recovery still returns closed=true" — non-fatal degrade

**Acceptance criteria:**
- Kada finalize_inactive_session RPC pukne (mock-ovan), fallback putanja:
  1. Save pending finalization marker
  2. UPDATE sessions is_active=false
  3. Call unlock_machine
- Sledeći app start: `drainPendingFinalization` u `_layout.tsx` retry-uje award_drops i drops se naplate (idempotency)
- Mašina je odmah dostupna za novi workout

---

### Step 6: Race condition guard između 5 finalize putanja
**Workspace:** `apps/mobile-app/app/workout.tsx`
**Agent:** mobile-coder
**Bug:** BUG-005 (CRITICAL)

**Goal:** Jedinstveni `isFinalizingRef` guard za sve finalize putanje. Ne sme se desiti da AppState background timer i manual End trče paralelno.

**Subtask 6.1 — Konsoliduj guards:**
Trenutno postoji:
- `isFinalizingRef` (manual + inactivity)
- `autoFinalizeFiredRef` (background timer)
- `inactivityFinalizeCoordinatorRef.current.tryStart()` (inactivity)
- (anti-piggyback nema guard)

Novi pristup: jedinstveni `isFinalizingRef` koji se čita iz svih putanja:
```typescript
// Pre svakog finalize-a:
if (isFinalizingRef.current) {
  log.debug('[Workout] Finalize already in progress, skipping', { caller: 'background_timer' });
  return;
}
isFinalizingRef.current = true;
```

**Subtask 6.2 — Update putanja:**

| Putanja | Linija (cca) | Akcija |
|---|---|---|
| `handleFinishWorkout` | 2569 | već OK |
| `finalizeForInactivity` | 2298 | već OK |
| AppState background timer | 437-460 | **dodaj `isFinalizingRef.current` u eligibility check + setuj na true pre RPC-a** |
| `cancelSessionForNoActivity` | 1373 | **dodaj guard na početku** |
| BLE simulator complete | 1130 | već zove `handleFinishWorkoutRef.current?.()` koji ima guard |

**Subtask 6.3 — Cleanup ref u finally:**
Sve putanje moraju da reset-uju `isFinalizingRef.current = false` u `finally` bloku — ali samo ako se navigacija nije već desila (jer ako smo navigirali na `/session-summary`, komponenta će biti unmounted i ref ne treba čistiti).

**Subtask 6.4 — Ukloni `autoFinalizeFiredRef`:**
Posle Subtask 6.1, `autoFinalizeFiredRef` postaje redundantan. Zameni sve reference sa `isFinalizingRef.current`.

**Acceptance criteria:**
- Test scenario: korisnik počne workout → ode u background → unutar 60s vrati se i pritisne End
  - Tačno jedan finalize_inactive_session ili award_drops poziv izvršen
  - `raw_metrics.security.finalize_reason` je konzistentan (bilo `manual_end` bilo `app_background_disconnect_autofinish`, ne mešavina)
- Sentry alarm za "double finalize attempted" se nikada ne trigger-uje u QA testu

---

### Step 7: BLE reconnect verifikuje `sensor_id` umesto `machine_id`
**Workspace:** `apps/mobile-app/`
**Agent:** mobile-coder
**Bug:** BUG-009 (HIGH)

**Files to modify:**
- `apps/mobile-app/lib/ble-service.ts`
- `apps/mobile-app/app/workout.tsx`

**Subtask 7.1 — Expose connected device id:**
U `ble-service.ts` dodaj public method:
```typescript
getConnectedDeviceId(): string | null {
  return this.isConnected ? this.deviceId : null;
}
```

**Subtask 7.2 — verifySessionOwnership extension:**
U `workout.tsx:737-754`, dopuni `verifySessionOwnership`:
```typescript
const verifySessionOwnership = async (): Promise<boolean> => {
  if (!session?.machine_id || !authSession?.user) return false;

  // 1. Verify Supabase ownership (existing)
  const { data: machineData } = await supabase
    .from('machines')
    .select('is_busy, current_user_id, sensor_id')
    .eq('id', session.machine_id)
    .single();

  if (!machineData?.is_busy || machineData.current_user_id !== authSession.user.id) {
    return false;
  }

  // 2. NEW: Verify BLE peripheral matches expected sensor_id
  const connectedSensorId = bleService.getConnectedDeviceId();
  const expectedSensorId = machineData.sensor_id;
  if (!expectedSensorId || !connectedSensorId || connectedSensorId !== expectedSensorId) {
    log.warn('[Workout] Reconnect peripheral mismatch', {
      connected: connectedSensorId,
      expected: expectedSensorId,
    });
    return false;
  }

  return true;
};
```

**Subtask 7.3 — On mismatch: hard disconnect + show error overlay:**
Ako `verifySessionOwnership` vrati `false` zbog peripheral mismatch-a:
- `bleService.disconnect()`
- `setBleStatus(t('reconnectWrongSensorError'))` — nova i18n ključ "Pogrešan senzor — reset BLE"
- `setIsReconnecting(true)` (ostavi user-u "End workout" path)

**Acceptance criteria:**
- Mock test: forsiraj `bleService.deviceId` na drugačiju vrednost od `machine.sensor_id` → `verifySessionOwnership` vraća `false` → BLE disconnect-uje
- Real test (zahteva 2 mašine u istoj prostoriji): user A na mašini X reconnects → BLE peripheral X.id i ne menja se → `verifySessionOwnership` ne false-positive

---

### Step 8: BLE Sleep callback razdvaja "no data" od "disconnect"
**Workspace:** `apps/mobile-app/`
**Agent:** mobile-coder
**Bug:** BUG-012 (HIGH)

**Files to modify:**
- `apps/mobile-app/lib/ble-service.ts`
- `apps/mobile-app/app/workout.tsx`

**Subtask 8.1 — Razlikuj events u ble-service:**
Trenutno `startHeartbeatMonitoring` (ble-service.ts:1298) trigger-uje `onSleepCallback` posle 10s bez paketa. Dodaj 2 callback-a:
```typescript
startMonitoring(
  onMeasurement: (m: CSCMeasurement) => void,
  onIdle: () => void,                    // NEW: 10s no data, connection still alive
  onPeripheralDisconnect: () => void,    // RENAMED from onSleepCallback (for true disconnects)
  onReconnect: () => Promise<boolean>,
  onSimulatorComplete?: () => void,
): Promise<void>
```

`onIdle` se trigger-uje iz heartbeat watchdog-a (10s bez merenja, ali `peripheral.isConnected === true`).
`onPeripheralDisconnect` se trigger-uje iz BLE plx/manager `onDisconnect` event handler-a (peripheral je stvarno otišao).

**Subtask 8.2 — Update workout.tsx callback handlers:**
Linija 1117-1124 (sada `onIdle`):
```typescript
// onIdle — 10s bez podataka, ali konekcija živa
() => {
  if (!isPausedRef.current) {
    setShowAutoPauseOverlay(true);
    setSignalStatus('lost');
    // NE postavljaj setBleConnected(false), NE postavljaj pauseReason='connection'
  }
},
```

Novi `onPeripheralDisconnect` callback:
```typescript
() => {
  setPauseReason('connection');
  setIsPaused(true);
  setBleConnected(false);
  setBleStatus(t('connectionLost'));
},
```

**Acceptance criteria:**
- Korisnik na bicikli stane 15s da pije vodu: signal indikator postaje "Lost" ali workout ne ide u "Connection Lost" overlay; auto-resume kada počne ponovo da pedalira
- Korisnik fizički ode iz BLE range-a: peripheral disconnect event → "Connection Lost" overlay sa Resume/End opcijama

---

### Step 9: Heartbeat staje kada BLE umire u connection-pause-u
**Workspace:** `apps/mobile-app/app/workout.tsx`
**Agent:** mobile-coder
**Bug:** BUG-008 (HIGH)

**Subtask 9.1 — Heartbeat condition update:**
Linija 1450-1481 — promenivaj `useEffect` dependency i guard:
```typescript
useEffect(() => {
  if (!session?.machine_id || !authSession?.user || !heartbeatAllowed) {
    /* clear */
    return;
  }
  
  // NEW: stop heartbeat when BLE is disconnected and we're in connection-pause
  if (!bleConnected && isPaused && pauseReason === 'connection') {
    /* clear */
    return;
  }
  
  // ... rest of existing impl
}, [session?.machine_id, authSession?.user, heartbeatAllowed, isPaused, bleConnected, pauseReason]);
```

**Acceptance criteria:**
- Korisnik startuje workout, BLE drop posle 30s (peripheral fizički ugašen). `pauseReason='connection'`. Sledećih 90s: ne emituje se `update_machine_heartbeat` RPC. Sweep 1 cron-a uhvati orphan unutar 90s + 60s = 150s (umesto 10 min).
- Healthy workout heartbeat continues nepromenjeno

---

### Step 10: FTMS distance reset detection
**Workspace:** `apps/mobile-app/app/workout.tsx`
**Agent:** mobile-coder
**Bug:** BUG-011 (HIGH)

**Subtask 10.1 — Baseline tracking:**
Posle line 281 (`ftmsTotalDistanceRef`), dodaj:
```typescript
const ftmsBaselineDistanceRef = useRef<number>(0); // accumulated across machine restarts
const ftmsLastSeenDistanceRef = useRef<number>(0); // last device-reported distance
```

**Subtask 10.2 — Reset detection logic:**
Zameni linije 827-830 i 879-883 sa:
```typescript
// Detect machine restart: device-reported distance jumped backwards by >50m
if (measurement.distance != null && measurement.distance >= 0) {
  const lastSeen = ftmsLastSeenDistanceRef.current;
  if (measurement.distance < lastSeen - 50) {
    log.warn('[Workout] FTMS distance reset detected', {
      previousDevice: lastSeen,
      newDevice: measurement.distance,
      cumulative: ftmsBaselineDistanceRef.current + lastSeen,
    });
    // Promote previous segment into baseline
    ftmsBaselineDistanceRef.current += lastSeen;
  }
  ftmsLastSeenDistanceRef.current = measurement.distance;
  ftmsTotalDistanceRef.current = ftmsBaselineDistanceRef.current + measurement.distance;
}
```

Isto razmatranje za `measurement.calories` (linija 842-844): tretiraj kao monotonic counter, akumuliraj baseline na backward jump.

**Subtask 10.3 — raw_metrics audit:**
U `_handleFinishWorkoutCore` (linija 2697-2703), dodaj:
```typescript
if (ftmsBaselineDistanceRef.current > 0) {
  rawMetrics.ftms_distance_segments = {
    baseline: Math.round(ftmsBaselineDistanceRef.current),
    final_device_value: ftmsLastSeenDistanceRef.current,
    cumulative: ftmsTotalDistanceRef.current,
  };
}
```

**Acceptance criteria:**
- Simulator test: pošalji distance 500, 1000, 1500 → reset → 0, 200 → očekivani total: 1700m
- raw_metrics.ftms_distance_segments prisutan kada je detektovan reset

---

### Step 11: getDeviceFingerprintHash warm-up + Network status guard
**Workspace:** `apps/mobile-app/`
**Agent:** mobile-coder
**Bug:** BUG-006 + BUG-015 (HIGH)

**Files to modify:**
- `apps/mobile-app/app/_layout.tsx`
- `apps/mobile-app/app/workout.tsx`

**Subtask 11.1 — Warm-up fingerprint:**
U `_layout.tsx` posle BLE Manager init (oko linije 541-555), dodaj:
```typescript
useEffect(() => {
  // Pre-warm device fingerprint cache so first Supabase RPC doesn't pay 100-200ms penalty
  void getDeviceFingerprintHash();
}, []);
```

**Subtask 11.2 — Network banner u workout.tsx:**
Importuj `useNetworkStatus` (postoji u `hooks/useNetworkStatus.ts`).
U workout.tsx render prefiks (oko linije 3082):
```typescript
const { isConnected: isOnline } = useNetworkStatus();
// ...
{!isOnline && (
  <View style={styles.offlineBanner}>
    <Ionicons name="cloud-offline-outline" size={14} color="#FDE68A" />
    <Text style={styles.offlineBannerText}>{t('offlineBannerText')}</Text>
  </View>
)}
```

Dodaj stilove u `workout.styles.ts`:
```typescript
offlineBanner: {
  position: 'absolute',
  top: 60,
  left: 16,
  right: 16,
  flexDirection: 'row',
  gap: 8,
  alignItems: 'center',
  paddingHorizontal: 12,
  paddingVertical: 8,
  borderRadius: 12,
  backgroundColor: 'rgba(245,158,11,0.15)',
  borderWidth: 1,
  borderColor: 'rgba(245,158,11,0.4)',
},
offlineBannerText: {
  color: '#FDE68A',
  fontSize: 12,
  fontWeight: '500',
},
```

**Acceptance criteria:**
- Cold-start app, prvi RPC ima latenciju 200-500ms (umesto 400-700ms na S25)
- Workout sa airplane mode ON: banner "Offline mode — drops će biti sinhronizovani" prikazan
- Workout sa airplane mode toggle off-on tokom workout-a: banner se pojavljuje/nestaje real-time

---

### Step 12: i18n strings
**Workspace:** `apps/mobile-app/locales/`
**Agent:** mobile-ui-ux-agent
**Files:** `apps/mobile-app/locales/{en,sr}/workout.json`, `apps/mobile-app/locales/{en,sr}/scanner.json`

**Subtask 12.1 — Workout namespace:**
Dodaj nove ključeve u `workout.json`:

| Key | EN | SR |
|---|---|---|
| `offlineBannerText` | "Offline — drops will sync when reconnected" | "Offline — drops će biti sinhronizovani kada se mreža vrati" |
| `reconnectWrongSensorError` | "Connected to wrong sensor. Please retry." | "Povezan pogrešan senzor. Pokušaj ponovo." |
| `signalLostHint` | "Signal lost — keep moving to resume" | "Signal izgubljen — nastavi pokret da nastaviš" |
| `fgs.title` | "Workout in progress" | "Trening u toku" |
| `fgs.body` | "{{machine}} • {{minutes}} min • {{drops}} drops" | "{{machine}} • {{minutes}} min • {{drops}} drops" |

**Subtask 12.2 — Scanner namespace:**
Dodaj u `scanner.json`:

| Key | EN | SR |
|---|---|---|
| `loading.machine` | "Identifying machine..." | "Identifikujem mašinu..." |
| `loading.checkin` | "Checking you in..." | "Čekiram te..." |
| `loading.starting` | "Starting workout..." | "Pokrećem trening..." |
| `loading.cancel` | "Cancel" | "Otkaži" |
| `loading.takingTooLong` | "Taking longer than usual..." | "Duže traje nego obično..." |

---

### Step 13: Tests
**Workspace:** `apps/mobile-app/tests/`
**Agent:** mobile-coder

**Subtask 13.1 — Unit tests za nove module:**
- `tests/recover-stale-active-session.test.ts` — proširi sa Subtask 5.4 test case-ima
- `tests/foreground-service.test.ts` — mock `@notifee/react-native`, verifikuj start/update/stop calls
- `tests/qr-deep-link-loading.test.ts` — verifikuj phase transitions, cancel handling, GPS timeout

**Subtask 13.2 — Workout finalize race condition test:**
- `tests/workout-finalize-race.test.ts` (NEW)
- Mock-uj sve 5 finalize putanja sa `vi.fn()` ili `node:test` mocks
- Forsiraj paralelno pokretanje: `Promise.all([handleFinishWorkout(), backgroundTimerFire()])`
- Verifikuj da je `award_drops` pozvan **tačno 1 put**

**Subtask 13.3 — FTMS distance segment test:**
- `tests/workout-ftms-distance-reset.test.ts` (NEW)
- Pošalji niz mock measurement objekata sa simulated reset (distance pada sa 1500 → 0)
- Verifikuj da `ftmsTotalDistanceRef` pravilno akumulira segmente

**Acceptance criteria:**
- Svi novi i postojeći testovi prolaze: `cd apps/mobile-app && npx tsx --test tests/*.test.ts`
- Coverage na novim modulima >= 80% (verify-uj manualno)

---

### Step 14: Manual QA test plan (reviewer agent ili manualan)
**Workspace:** Pilot teretana ili dev environment sa real BLE opremom
**Agent:** reviewer (test-automation-agent)

**Test matrix (svaki red mora proći pre Vortex pilot release-a):**

| # | Scenario | Expected |
|---|---|---|
| T1 | iPhone 13/14/15: Cold-start QR scan | ≤2.5s do workout screen; loading spinner sa progress message-om |
| T2 | Samsung S25 (One UI 6.x): Cold-start QR scan | ≤3s do workout screen (smanjenje sa 5-8s) |
| T3 | iPhone: workout 30 min + Lock screen | BLE konekcija živa, metrike teku po unlock-u |
| T4 | Samsung S25: workout pokrenut + app u background 5 min | FGS notifikacija prikazana; BLE živ; metrike akumulirane |
| T5 | Samsung S25: workout + Battery Saver ON | FGS preživljava; ako ne — log warning u Sentry |
| T6 | Force-kill app tokom workout-a (oba OS-a) | Sledeći otvor app-a: recovery banner za stare sesije; nova QR scan radi (ne "machine busy") |
| T7 | BLE drop 15s (legitimno stajanje) | Signal indikator "Lost" ali ne "Connection Lost" overlay |
| T8 | BLE drop 60s (peripheral off) | "Connection Lost" overlay; Save what I've got CTA pojavi se nakon 90s |
| T9 | BLE drop 5+ min (permanent) | Save what I've got vidljiv; Resume disabled posle 5 min |
| T10 | Mašina restartovana mid-workout | Total distance > 0 u summary (segments accumulated) |
| T11 | 2 telefona sa istim user-om scan-uju različite mašine paralelno | Drugi telefon dobija conflict modal; recovery na prvi telefon → drugi može start-ovati |
| T12 | Network off tokom End Workout | Banner "Offline — drops će biti sinhronizovani"; sledeći app start retry-uje award_drops; drops naplaćeni |
| T13 | 5 min idle u workout-u (cycling stop) | Inactivity warning na 60s; auto-finalize na 180s; mašina otključana |
| T14 | QR scan, korisnik pritisne Cancel za 2s | App se vraća na home; recovery cleanup orphan-a u background-u |
| T15 | Korisnik istek-ne JWT tokom 90 min workout-a | autoRefreshToken radi; ako fails → offline banner; nakon network-back drops sync |

**Acceptance criteria:**
- 14/15 testova prolaze pre pilot release-a
- T5 (Samsung Battery Saver) može biti soft-fail ako Sentry telemetrija pokazuje da <5% korisnika koristi tu opciju

---

## Data Model Changes

### `start_session_safely` (Step 1)
- **No new columns.** Behavior change only.
- Loguje `fraud_events` row sa `event_type = 'user_self_recover_on_new_scan'`, `severity = 'low'`

### `cleanup_abandoned_sessions` (Step 2)
- **No schema change.** Function body update + cron schedule update.

### `sessions.raw_metrics` (Step 10)
- **No schema change** (raw_metrics is JSONB).
- New optional key: `raw_metrics.ftms_distance_segments = { baseline, final_device_value, cumulative }`

---

## API Contracts

### `start_session_safely(p_machine_id, p_started_at, p_device_hash)` — UPDATED behavior
**Posle Step 1:**
- `success: true, action: 'created' | 'recovered_self_orphan'` — novi action vrednost
- `error_code: 'machine_busy'` (samo za druge korisnike — istog korisnika auto-recovers)
- `error_code: 'user_active_session_conflict'` — **NIKADA SE NE VRAĆA POSLE OVOG STEP-a** (fallback only ako finalize_inactive_session nije uspeo unutar funkcije)

**Mobile App impact:**
- `handleQrDeepLink.ts:516-531` "user_active_session_conflict" branch i dalje postoji za defense-in-depth ali se u praksi neće trigger-ovati. Ostavi modal kao fallback.

### `cleanup_abandoned_sessions()` — UPDATED schedule
**Posle Step 2:**
- Cron: `*/1 * * * *` (1 min) — privremeno za pilot
- Sweep 2 floor: 180s

---

## Testing Requirements

### Unit Tests (Step 13)
- `recover-stale-active-session.test.ts`: 10 cases (postojećih 7 + 3 nova)
- `foreground-service.test.ts`: 5 cases (start, update, stop, permission denied, iOS no-op)
- `workout-finalize-race.test.ts`: 4 cases (manual+timer, manual+inactivity, timer+anti-piggyback, simulator+manual)
- `workout-ftms-distance-reset.test.ts`: 3 cases (no reset, single reset, multiple resets)
- `qr-deep-link-loading.test.ts`: 6 cases (phase transitions, cancel, GPS timeout, RPC error, success, recovery on cancel-after-start)

### Integration Tests
- Manual matrix iz Step 14

### Telemetrija (Sentry / log channels)
Dodaj sledeće events:
- `workout.fgs.started` (Android)
- `workout.fgs.permission_denied` (Android)
- `workout.finalize.race_detected` (multiple paths attempted)
- `workout.ble.peripheral_mismatch` (Step 7)
- `workout.ftms.distance_reset` (Step 10)
- `qr.loading.cancelled_by_user` (Step 4)
- `recovery.fallback.unlock_failed` (Step 5)

---

## Rollout Strategy

### Phase A — Backend (Step 1, 2)
1. Deploy migracije u staging (Supabase local + dev project)
2. Verifikuj cron job aktivnost
3. Smoke test: ručno INSERT orphan session, čekaj 2 min, verifikuj cleanup
4. Deploy u production posle verifikacije

### Phase B — Mobile (Step 3-12)
1. Implementiraj sve changes u feature branch-u `vortex-pilot-hardening`
2. Lokalno test (iOS sim + Android emulator)
3. EAS build dev profil → distribute na test uređaje (S25, iPhone 13)
4. Run Step 14 QA matrix
5. Build numbers bump:
   - `app.config.js`: `ios.buildNumber: '20'`, `android.versionCode: 46`
6. EAS production build → TestFlight + Play Internal Testing
7. Vortex pilot starts after 48h soak na TestFlight

### Phase C — Monitoring (post-deploy)
- Watch Sentry alerts: `workout.finalize.race_detected`, `recovery.fallback.unlock_failed`, `workout.fgs.permission_denied`
- Watch DB metrics: `cleanup_abandoned_sessions` execution time (mora ostati <500ms na 1-min cron)
- Posle 1 nedelje pilot-a: review STEP 2 cron interval — ako je workload prihvatljiv, vrati na `*/5` ili ostavi `*/1`

---

## Files Touched (sumirano)

### `backend/supabase/migrations/`
- `YYYYMMDDHHMMSS_start_session_safely_idempotent_self_recover.sql` (NEW)
- `YYYYMMDDHHMMSS_cleanup_abandoned_sessions_pilot_tightening.sql` (NEW)

### `apps/mobile-app/app/`
- `app/m/[uuid].tsx` (MODIFIED — Step 4)
- `app/machine/[uuid].tsx` (MODIFIED — Step 4)
- `app/workout.tsx` (MODIFIED — Steps 3, 6, 7, 8, 9, 10, 11)
- `app/workout.styles.ts` (MODIFIED — Step 11)
- `app/_layout.tsx` (MODIFIED — Step 11)
- `app/index.tsx` (MODIFIED — Step 4 Subtask 4.6)

### `apps/mobile-app/lib/`
- `lib/ble/foregroundService.ts` (NEW — Step 3)
- `lib/ble-service.ts` (MODIFIED — Steps 7, 8)
- `lib/qr/handleQrDeepLink.ts` (MODIFIED — Step 4)
- `lib/qr/recoverStaleActiveSession.ts` (MODIFIED — Step 5)

### `apps/mobile-app/components/`
- `components/qr/QrDeepLinkLoading.tsx` (NEW — Step 4)

### `apps/mobile-app/locales/`
- `locales/en/workout.json` (MODIFIED — Step 12)
- `locales/sr/workout.json` (MODIFIED — Step 12)
- `locales/en/scanner.json` (MODIFIED — Step 12)
- `locales/sr/scanner.json` (MODIFIED — Step 12)

### `apps/mobile-app/tests/`
- `tests/recover-stale-active-session.test.ts` (MODIFIED — Step 13)
- `tests/foreground-service.test.ts` (NEW — Step 13)
- `tests/workout-finalize-race.test.ts` (NEW — Step 13)
- `tests/workout-ftms-distance-reset.test.ts` (NEW — Step 13)
- `tests/qr-deep-link-loading.test.ts` (NEW — Step 13)

### `apps/mobile-app/`
- `app.config.js` (MODIFIED — Step 3 + build numbers bump)
- `package.json` (MODIFIED — `@notifee/react-native` dependency)

---

## Open Questions / Risk Register

| # | Risk | Mitigation |
|---|---|---|
| R1 | `@notifee/react-native` SDK 54 compat | Test EAS build na lokalnom Android device pre push-a; fallback je `expo-task-manager` kao alternativa |
| R2 | `expo prebuild --clean` poništava custom Manifest izmene | Sve izmene u manifestu rade preko `app.config.js` plugin sistema, ne ručno |
| R3 | `start_session_safely` self-recover može logovati previše `fraud_events` rows ako neki korisnici često crash-uju | Posle 1 nedelje pilot-a, review event count po user_id; ako je >10/week → istraži zašto user crash-uje |
| R4 | Cron `*/1 * * * *` može preopteretiti DB sa 50+ teretana | Vortex pilot je samo 1 teretana; production rollout treba reverzuj na `*/5` ili dodaj index na `sessions(is_active, updated_at)` ako još ne postoji |
| R5 | FTMS distance reset detection (Step 10) može false-positive na FTMS bug-ove gde device counter glitch-uje | Threshold 50m je relativno bezbedan; ako FTMS device pošalje distance=0 randomly, baseline ide 0+0=0 (nije destruktivno) |
| R6 | Android `POST_NOTIFICATIONS` permission denial → no FGS notifikacija → still potential for OS to kill | Implementiran graceful degrade (Step 3.5); Sentry telemetrija će pokazati frequency |

---

## Sign-off Checklist

- [ ] Architect review (ovaj plan)
- [ ] supabase-dba: Steps 1, 2 implementirani i tested
- [ ] mobile-coder: Steps 3-11 implementirani; sve testove prolaze
- [ ] mobile-ui-ux-agent: Step 12 i18n keys dodati EN+SR
- [ ] reviewer: Step 14 QA matrix izveden, ≥14/15 testova prolaze
- [ ] DevOps: Production deploy plan potvrđen (Phase A pre Phase B)
- [ ] STATE_OF_THE_APP.md updated sa pilot status-om
- [ ] CHANGELOG.md updated sa svim Step references
- [ ] MIGRATION_NOTES.md updated sa Step 1 + Step 2 migracijama

---

**Estimated calendar time:** 5-6 radnih dana sa paralelnim radom (supabase-dba radi Step 1+2 dok mobile-coder radi Step 3 paralelno; ostali stepovi su sequential u mobile-app workspace-u zbog file shared-a).

**Target Vortex Pilot Date:** 2026-05-15 (8 dana od plan kreacije, omogućava 48h TestFlight soak).
