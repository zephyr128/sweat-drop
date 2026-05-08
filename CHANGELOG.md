# Changelog

All notable changes to the SWEATDROP project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Fixed
- **Backend: BLE machine identity architecture — name + serial replaces opaque sensor_id (P0 Vortex cross-talk root cause fix).** The original `machines.sensor_id` stored a Web Bluetooth `device.id` opaque per-origin hash that is irrecoverably different on every iOS device (CoreBluetooth hides MAC addresses). The mobile client silently fell back to strongest-RSSI selection, causing 97 confirmed cross-talk events across 2 Vortex pilot users. This migration bundle replaces the identity architecture:
  - **`20260508210000_machine_rpc_observed_peripheral_id_check.sql` → renamed to `.skipped`.** The `peripheral_id_matches_sensor()` approach was generated but never applied to production. It is superseded.
  - **`20260509060000_machines_ble_identity_name_and_serial.sql` (Step 1):**
    - `public.machines` gains three columns: `ble_device_name TEXT` (BLE Local Name, cross-device-stable), `ble_serial_number TEXT` (DIS Serial Number 0x2A25, hardware-bound), `ble_pairing_verified BOOLEAN DEFAULT false`.
    - Per-gym uniqueness trigger `trg_machines_ble_device_name_unique` — factory firmware defect catcher.
    - `cache_machine_ble_identity(p_machine_id, p_observed_name, p_observed_serial)` RPC — called by mobile client post-connect to auto-backfill or verify identity. Anti-spoofing: caller must hold machine lock. Mismatch on already-verified machine logs `ble_identity_post_connect_mismatch` fraud event.
  - **`20260509070000_machine_rpc_observed_ble_identity_check.sql` (Step 5):**
    - `ble_identity_matches_machine()` immutable helper — compares observed vs. expected name+serial with strict/loose/legacy-open modes.
    - `update_machine_heartbeat` / `update_machine_rpm` gain optional `p_observed_name` + `p_observed_serial` params (DEFAULT NULL, backward-compat). Mismatch → `ble_identity_server_mismatch` fraud event + session flagged + returns FALSE.
    - `award_drops` gains early-exit guard: sessions flagged `ble_identity_mismatch` receive 0 drops unconditionally + `drops_zeroed_ble_identity_mismatch` fraud event.
  - **Remaining Steps (other agents):** Step 2 (admin-coder — Web BT pairing captures name+serial), Steps 3+4 (mobile-coder — `connectToMachine`, DIS read, error classes, workout.tsx wiring), Step 6 (admin-coder — backfill UI), Steps 7+8+9 (tests, i18n, manual QA). See `docs/plans/feature_ble_machine_identity_name_and_serial_redesign.md`.
- **Backend: Step 0a forensics confirmed cross-talk root cause; zero drops require reversal.** Forensic investigation (`docs/forensics/2026-05-08_vortex_crosstalk_forensics.md`) run against production DB confirmed: 97 actual fraud events (not 305 as estimated), 79% classified CROSS_TALK, 6% CRON_ARTIFACT, 15% unrelated GPS check-in events. Critical finding: **no drops were awarded from cross-talk sessions** — every wrong-machine session was < 120 s (the `award_drops` minimum threshold). user_a's 31 session drops (27+4) on 2026-05-08 are legitimate. Step 7 drops-reversal migration is not needed. Cross-talk is isolated to 2 users; no other Vortex users were affected.
- **Backend: server-side BLE peripheral identity guard prevents cross-talk drops.** P0 production incident at Vortex (2026-05-08): `ble-service.ts` was connecting to the strongest-RSSI FTMS treadmill in range rather than the paired sensor, causing RPM/heartbeat data from a neighbouring machine to accumulate against a user's session. 305 fraud_events were generated across 2 pilot users (~95% cross-talk artefacts). Server-side belt-and-suspenders fix (Step 4 of `docs/plans/bugfix_pause_auto_resume_and_ble_machine_crosstalk_vortex_production.md`):
  - **`peripheral_id_matches_sensor()`** — new immutable helper; compares observed BLE peripheral.id against `machines.sensor_id` tolerating base64, hex, MAC, and reversed-byte encodings. Returns `TRUE` for `NULL` (backward compat).
  - **`update_machine_heartbeat()`** — new optional `p_observed_peripheral_id TEXT DEFAULT NULL`. On mismatch: logs `peripheral_id_server_mismatch` fraud event (high), marks `sessions.raw_metrics.security.peripheral_id_mismatch = 'true'`, returns `FALSE` without extending the heartbeat. Older builds omit the param and see no behaviour change.
  - **`update_machine_rpm()`** — same as heartbeat. Mismatch prevents `machines.last_rpm` from being overwritten with cross-talk data.
  - **`award_drops()`** — new early-exit guard: sessions flagged `peripheral_id_mismatch` receive 0 drops unconditionally; logs `drops_zeroed_peripheral_mismatch` fraud event. Session still finalised so machine lock is released.
  - (`backend/supabase/migrations/20260508210000_machine_rpc_observed_peripheral_id_check.sql`)
  - Mobile-coder Step 1 (BLE identity fix in `ble-service.ts`) and Step 2 (pause auto-resume guard in `workout.tsx`) are the next required steps before deploying to Vortex.
- **Backend + mobile: push tokens are now environment-isolated; dev cron can no longer deliver to prod installs (and vice versa).** Production incident: a Vortex Happy Hour reminder was authored by the **dev** `send-happy-hour-reminders` cron but delivered to a phone running the **prod** build, opening `/gym-detail` with a `gym_id` that doesn't exist in prod ("gym not found"). Root cause: `profiles.expo_push_token` had no environment tag, so every scheduler dispatched whatever token string sat in its row — and dev DB had picked up prod-issued tokens (typical when dev is seeded from prod). Fix bundle:
  - **Migration 20260508140000.** `profiles` gains `expo_push_token_env` (CHECK production|preview|development), `expo_push_token_bundle`, `expo_push_token_updated_at`, and a partial index on `expo_push_token_env WHERE expo_push_token IS NOT NULL`. One-shot backfill marks every existing non-null token as `'production'`; dev/preview installs auto-correct the tag on next foreground sync.
  - **Mobile:** `app.config.js` exposes `appEnv` and `bundleId` via `Constants.expoConfig.extra`. `lib/notifications.ts` stamps both onto `profiles.expo_push_token_env` / `_bundle` whenever it writes a token, and re-writes the row when only the env changes (not just the token string) so backfilled-as-`production` rows on dev/preview builds correct themselves. `getDeepLinkFromNotification` now refuses to route any push whose `data.app_env` differs from the install's APP_ENV — defense-in-depth against tokens that slip past the server filter. (`apps/mobile-app/app.config.js`, `apps/mobile-app/lib/notifications.ts`)
  - **`send-push` edge function (centralized gate).** Reads `APP_ENV` Supabase function secret (default `'production'`); for every input token it looks up `profiles.expo_push_token_env` and drops the token if env != `APP_ENV`, logging `skipped_env_mismatch`. Stamps `data.app_env = APP_ENV` on every outbound Expo message and inbox row. Response body gains `skipped_env_mismatch` + `app_env`; structured log line + `compactSendPushMetrics` updated to match. Existing schedulers (happy-hour, streak, re-engagement, drops-expiry, finalize-arena, leaderboard-prizes, notify-arena-participants, send-prize-ready-push, process-campaigns) need no changes — the gate is single-source. (`backend/supabase/functions/send-push/index.ts`, `backend/supabase/functions/_shared/expo-push.ts`)
  - **Operational requirement (documented).** Dev Supabase project MUST set `APP_ENV=development` (preview: `'preview'`); prod can leave the default. See `docs/plans/production_env_split_dev_prod_runbook.md` §5a + verification checklist additions.
  - Plan reference: review thread; runbook updates in `docs/plans/production_env_split_dev_prod_runbook.md` and `docs/plans/production_push_notifications_runbook.md`.
- **Mobile app: machine-busy vs. user-session conflicts and mid-workout disconnects no longer trap the user.** Production incident at Vortex (2026-05-07): users got stuck either on the scanner ("machine busy" with no path forward when the orphan was their *own* previous session) or mid-workout ("Reconnecting…" overlay with no way out after BLE drop), and force-quitting the app left an `is_active = true` session row that broke their next scan for ~8 minutes until the cron sweep healed it. Fix bundle:
  - **`recoverStaleActiveSession()` helper** — closes the caller's most recent stale active session via `finalize_inactive_session('user_initiated_recovery')` with a defensive fallback to a direct `UPDATE sessions` if the RPC errors. Drops are credited via the cron sweep on the fallback path. (`apps/mobile-app/lib/qr/recoverStaleActiveSession.ts`)
  - **Scanner error split (Bugs 1–3).** `start_session_safely()` returning `machine_busy` now shows "Machine in use" (no recovery action — someone else holds it). Returning `user_active_session_conflict` now shows "Previous workout still open" with a "Close and retry" action that fires `recoverStaleActiveSession` then retries the same machine. Same split applied to the QR/NFC deep-link handler `handleQrDeepLink.ts`. (`apps/mobile-app/components/ScannerScreen.tsx`, `apps/mobile-app/lib/qr/handleQrDeepLink.ts`)
  - **iOS `transparentModal` occlusion fix.** `<AppModal />` is now also rendered inside `ScannerScreen` so dialogs (`machine_busy`, recovery prompts, BLE errors) sit in the same `UIViewController` as the camera. The global modal at root layout is occluded on iOS by the scanner's `transparentModal` presentation, leaving users with no way to acknowledge errors and forcing the app-restart that creates the orphan session in the first place. (`apps/mobile-app/components/ScannerScreen.tsx`)
  - **Defensive `finally` on every async early-return path.** `handleQRCodeScanned`, `proceedWithWorkout`, and `handleRecoverAndRetry` now never strand the loader if the dismissal modal is preempted; a `hasNavigatedAwayRef` guards against flicker on screens about to unmount. (`apps/mobile-app/components/ScannerScreen.tsx`)
  - **Auto-escape from "Reconnecting…" overlay (Bug 4a).** Workout screen now auto-retries `bleService.reconnect()` every 30s while paused on a connection drop. After 3 failures (or 90s) it reveals a "Save what I've got" affordance that finalises the session with whatever drops were earned. After 5 minutes the affordance is shown unconditionally. The "short workout" warning is suppressed when the disconnect is involuntary. (`apps/mobile-app/app/workout.tsx`)
  - **Background auto-finalize (Bug 4c).** When the user backgrounds the app while paused on a connection drop with `duration ≥ 60s`, a 60s timer fires `finalize_inactive_session` so a different user can use the same machine within ~90s instead of waiting for the 5-min cron sweep. A one-shot AsyncStorage flag (`@sweatdrop/last_autofinalize_session_id`) surfaces the credited drops on next launch. (`apps/mobile-app/app/workout.tsx`)
  - **Active-session recovery banner (Bug 4b).** New `<ActiveSessionRecoveryBanner />` on `/home` (driven by `useActiveSessionRecovery` Zustand store + `useActiveSessionRecoveryWatch` hook) detects unfinished `is_active = true` sessions and lets the user resume, finish-and-save, or dismiss them. Race-protected against freshly-started sessions (<60s old) and gated off the workout-flow routes. Also drains the auto-finalize one-shot flag set by Bug 4c. (`apps/mobile-app/lib/stores/useActiveSessionRecovery.ts`, `apps/mobile-app/lib/workout/useActiveSessionRecovery.ts` + `.helpers.ts`, `apps/mobile-app/components/ActiveSessionRecoveryBanner.tsx`, `apps/mobile-app/app/home.tsx`, `apps/mobile-app/app/_layout.tsx`)
  - **i18n.** New keys: `scanner.{machineBusyOther,machineBusyOtherDesc,previousWorkoutOpen,previousWorkoutOpenDesc,closeAndRetry,recovering,recoveryFailed,recoveryFailedDesc}` and `workout.{connectionLostTitle,connectionLostBody,connectionLostKeepTryingAction,connectionLostSaveAction,connectionAutoFinishExplain,cantConnectFinish,autoFinalizedTitle,autoFinalizedBody,recovery.banner.*,recovery.confirmDiscard.*,recovery.machineType.*}` in `en` + `sr`. The dead `lockFailed` / `lockFailedDesc` keys (legacy `lock_machine` RPC superseded by `start_session_safely`) were removed. (`apps/mobile-app/locales/{en,sr}/{scanner,workout}.json`)
  - **Build numbers bumped.** `ios.buildNumber: 19`, `android.versionCode: 45` so QA can verify the fix. (`apps/mobile-app/app.config.js`)
  - **Tests.** New unit tests for `recoverStaleActiveSession` (7 cases: input validation, no-session, query error, RPC success, RPC fallback path, both-fail) and `useActiveSessionRecovery.helpers` (13 cases covering route gating, race protection, machine-type normalisation, and auto-finalize flag freshness). Pure helpers extracted to `useActiveSessionRecovery.helpers.ts` so they can be tested with `node:test` without dragging in RN-only modules. (`apps/mobile-app/tests/recover-stale-active-session.test.ts`, `apps/mobile-app/tests/active-session-recovery.test.ts`)
  - Plan: `docs/plans/bugfix_machine_busy_vs_user_session_conflict_and_qr_modal_occlusion.md`.
- **Backend: `cleanup_abandoned_sessions` now sweeps orphan active sessions.** Production incident at Vortex gym (9 FTMS treadmills, 2026-05-07): every scan failed with "Machine busy" while `machines.is_busy = false` for every treadmill. Root cause: `start_session_safely()` checks `sessions.is_active` (not `machines.is_busy`), and the cron-driven `cleanup_abandoned_sessions()` only iterated over `machines WHERE is_busy = true` — so any session left `is_active = true` after `unlock_machine()` already succeeded (failed `award_drops()`, app crash mid-finalize, network timeout on final sync, simulator-bypass with `machine_id = NULL`) became a permanent orphan and blocked every future scan with `machine_busy` or `user_active_session_conflict`. The function is now extended with a second sweep over `sessions WHERE is_active = true AND (machine_id IS NULL OR machine.is_busy = false OR machine.current_user_id != session.user_id)` AND last activity older than `GREATEST(gym.session_inactivity_autofinish_sec, 600)` — closes orphans via `finalize_inactive_session('orphan_session_cleanup')` so drops are still awarded and audit-logged. Includes a one-shot run at deploy time so existing orphans heal immediately. (`backend/supabase/migrations/20260507060000_cleanup_orphan_active_sessions.sql`)

### Added
- **Admin Print Studio: combined QR + NFC sticker — v2 two-zone redesign.** `ComboArtwork` rebuilt to a symmetric two-zone layout (NFC zone | QR zone for landscape; stacked NFC over QR for portrait) with a feathered cyan divider between them. No "OR" pill, no corner registration brackets, no "Powered by SweatDrop" footer — premium minimal styling matching the print proof. Sticker outline now uses rounded corners (`borderRadius` on the artwork frame); the print-shop honours those corners as the die-cut profile. Combo print runs flip the printed page background to white so the rounded corners are visible in the PDF. The TapMark center renders the rounded SweatDrop app icon image (same brand mark embedded inside QR codes via `BrandedQRCode`) instead of the line-art glyph, anchoring both zones to the same identity. Tap-first headline copy `TAP HERE / EARN DROPS` is the new default (`DEFAULT_COMBO_CTA_ID`). The `MethodSeparator` "OR" pill component has been removed. (`apps/admin-panel/components/print-studio/shared.tsx`, `apps/admin-panel/app/print-qr/page.tsx`, `apps/admin-panel/app/print-qr/batch/page.tsx`)
- **Admin Print Studio: QR side caption picker.** New combo-only `QR caption` section under the side panel (replaces the v1 `Tap label` section, which conflated tap copy with QR copy). Curated single-line entries — `SCAN QR` (default), `OR SCAN`, `POINT CAMERA`, `OR SCAN HERE`, `NO APP? SCAN.`, `BACKUP` — plus a `Custom…` form with an advisory char-count badge (`qrCaptionCharCap`). Operator-typed copy persists in `localStorage` under `sweatdrop:print:qr-caption:{type}` and `sweatdrop:print:custom-qr-caption:{type}`. The legacy "if NFC doesn't work" subtitle is gone — the QR caption is now a single line, matching the v2 design. (`shared.tsx` — `QR_CAPTIONS`, `QR_CAPTION_CUSTOM_OPTION`, `resolveQRCaption`)
- **Admin Print Studio: combined QR + NFC sticker family.** `COMBO_PRESETS` (machine-scale, metric: 6×4.1 / 8×5.5 / 10×6.9 cm landscape and 3×4.3 / 4×5.8 / 5×7.2 cm portrait) render a premium single-piece sticker that carries both transports — the existing `BrandedQRCode` on the QR side and a new `NfcTapMark` registration target on the NFC side. Combo design is the default for new machine print runs; QR-only legacy presets remain available as a "Legacy" group. The TapMark's outer ring doubles as the print-partner's NFC inlay registration mark, eliminating the v1 two-piece "QR sticker + separate NFC dot" installer flow.
- **Admin Print Studio: custom headline copy.** New `Custom…` option in the Headline picker (single-sticker and batch flows). Expands to inline Line 1 / required + Line 2 / optional inputs with advisory char-count badges per preset (`ctaCharCap`); operator-typed copy persists across sessions in `localStorage` under `sweatdrop:print:custom-cta:{type}`. Auto-uppercase on render; non-printable / non-Latin-Extended characters are stripped at input time. (`shared.tsx` — `CUSTOM_CTA_OPTION`, `resolveCta`, `ctaCharCap`)
- **Plan: combined NFC + QR sticker premium design.** Architect plan covering layered construction spec, custom-copy UX, metric-cm presets, per-batch QC handoff to the print partner, and a future standalone `/print-nfc` round-dot route. (`docs/plans/feature_nfc_qr_combined_sticker_premium_design.md`)
- Landing page: `/m/[uuid]` and `/c/[gymId]` env-aware platform-aware redirects so QR stickers route to TestFlight / App Store / Play Internal Testing / Play Store based on `STORE_REDIRECT_CHANNEL` without sticker reprints. AASA `components` extended to include `/m/*` and `/c/*`. (`apps/landing-page/lib/store-redirect.ts`, `apps/landing-page/app/m/[uuid]/page.tsx`, `apps/landing-page/app/c/[gymId]/page.tsx`, `apps/landing-page/components/qr/QrRedirectPage.tsx`)
- **Mobile app:** Dedicated deep-link route handlers for all QR URL formats:
  - `app/m/[uuid].tsx` — HTTPS Universal / App Link machine QR codes (`https://sweat-drop.com/m/<uuid>`)
  - `app/c/[gymId].tsx` — HTTPS Universal / App Link check-in QR codes (`https://sweat-drop.com/c/<gymId>`)
  - `app/machine/[uuid].tsx` — backward-compat alias for legacy `sweatdrop://machine/<uuid>` stickers
  - `app/checkin/[gymId].tsx` — backward-compat alias for legacy `sweatdrop://checkin/<gymId>` stickers
  - `lib/qr/handleQrDeepLink.ts` — shared `parseQrPayload()` + `handleQrDeepLink()` module; replicates machine-scan and check-in flows from ScannerScreen without modifying it
  - `app.config.js` Android `intentFilters` extended with `autoVerify=true` intent filter claiming `/m/` and `/c/` path prefixes on both `sweat-drop.com` and `www.sweat-drop.com` hosts (Android App Links); `ios.buildNumber` bumped to `18`, `android.versionCode` bumped to `38`

### Removed
- **Admin Print Studio: v1 `Tap label` picker.** The under-TapMark single-word label control is retired — superseded by the v2 two-line NFC zone caption (which reuses the curated headline library) and the new single-line QR side caption picker. The `TAPMARK_LABELS`, `DEFAULT_TAPMARK_LABEL_ID`, and `resolveTapMarkLabel` exports remain in `shared.tsx` flagged `@deprecated` for back-compat with any external imports; the artwork no longer references them and the studio sidebar no longer surfaces them. localStorage key `sweatdrop:print:tapmark-label` is no longer read or written.
- **`StickerArtwork` v1 prop:** `tapMarkLabelId` removed; replaced with `qrCaption: QRCaptionOption` (combo-only). QR-only and NFC-circle preset rendering paths are unchanged.
- **Mobile app:** Dropped the in-app NFC reader pill on `/scan` and the `useNfcReader` hook. Per the revised `docs/plans/feature_nfc_tag_scanning.md`, OS-level Universal Links / App Links handle every state where the OS is willing to dispatch NFC (iPhone XS+, NFC-enabled Android), and the QR side of the same sticker is the universal fallback for older devices. The custom Core NFC session, `react-native-nfc-manager` dependency, iOS `NFCReaderUsageDescription` + NDEF entitlement, Android `android.permission.NFC`, and `scanner.nfc.*` locale keys (EN + SR) have been removed. (`apps/mobile-app/lib/nfc/useNfcReader.ts` deleted, `apps/mobile-app/components/ScannerScreen.tsx`, `apps/mobile-app/app.config.js`, `apps/mobile-app/ios/SweatDrop/Info.plist`, `apps/mobile-app/ios/SweatDrop/SweatDrop.entitlements`, `apps/mobile-app/locales/{en,sr}/scanner.json`, `apps/mobile-app/package.json`)

### Changed
- **Mobile app:** QR/NFC deep-link route handlers (`/m/[uuid]`, `/c/[gymId]`, `/machine/[uuid]`, `/checkin/[gymId]`) are no longer presented as `transparentModal`. Foreground NFC taps and warm-launch HTTPS deep links previously caused `/workout` and `/checkin-result` to inherit iOS modal presentation context after `router.replace`, surfacing the workout in a stacked-modal frame instead of full-screen. They are now plain card screens with a 200ms fade so the brief mount stays invisible while `handleQrDeepLink` routes onto the real destination. (`apps/mobile-app/app/_layout.tsx`)

### Fixed
- **Closing the in-app scanner after entering via a QR deep link no longer surfaces `[...unmatched]`.** Real route files now exist for every QR deep-link path (`/m/`, `/c/`, `/machine/`, `/checkin/`); expo-router can no longer fall through to the unmatched route handler.
- **Warm-launch `sweatdrop://machine/` and `sweatdrop://checkin/` URLs now route through the new route files** (`/machine/[uuid]`, `/checkin/[gymId]`) instead of pushing `/scan?autoQR=`.
- **Cold-start pending QR replay** in `index.tsx` now routes directly to `/m/[uuid]` or `/c/[gymId]` (with `/home` pushed beneath) instead of `/scan?autoQR=`. Inter-call delay bumped from 400ms to 800ms to clear the 600ms `useThrottledRouter` window so the second navigation actually fires.
- **Unauthenticated cold-start of a deep-link route** (`/m/[uuid]`, `/c/[gymId]`, `/machine/[uuid]`, `/checkin/[gymId]`) now explicitly redirects to `/(onboarding)/welcome` instead of leaving the user on a blank black screen — there is no global no-session guard in `_layout.tsx` that would otherwise rescue them.

### Changed
- Admin panel: QR generation now emits HTTPS Universal/App Link URLs (`https://sweat-drop.com/m/<uuid>`, `/c/<gymId>`) routed through `apps/admin-panel/lib/qr-urls.ts`. Replaces legacy `sweatdrop://` custom-scheme payloads across all six surfaces: `MachineDetailView`, `MachinesManager`, `CheckinSettingsModule`, `print-qr/page`, `print-qr/batch/page`, `MachineFloor`. Host is configurable via `NEXT_PUBLIC_QR_PUBLIC_HOST` (defaults to `https://sweat-drop.com`).
- Mobile gym discovery (onboarding + home empty state) routed through `get_public_gyms_for_mobile` RPC for demo-gym gating. (`apps/mobile-app/app/(onboarding)/home-gym.tsx`, `apps/mobile-app/app/home.tsx`)

### Added
- `gyms.is_demo_gym` flag + demo-aware `get_public_gyms_for_mobile()` RPC: SweatDrop test gym hidden from non-demo users at the server level; demo users (Apple reviewers, internal QA) continue to see it. Superadmin-only mutation guard enforced via BEFORE UPDATE trigger (mirrors `profiles.is_demo` pattern). Cleanup migration drops the legacy 2-arg `get_public_gyms_for_mobile(boolean, boolean)` overload left over from `20260328000002`. (`20260427120000_gyms_is_demo_gym_and_rpc_demo_filter.sql`, `20260427121500_drop_get_public_gyms_for_mobile_2arg_overload.sql`)
- Agent communication protocol (`docs/AGENT_COMMUNICATION.md`)
- Changelog file for tracking all changes
- Migration notes system for database changes
- Landing page coder agent (`.cursor/rules/landing-page-coder.mdc`)
  - Professional marketing website builder
  - SEO-optimized, conversion-focused landing pages
  - Next.js 15 with App Router
- External pilot demo-gate backend hardening:
  - `profiles.is_demo` flag added with superadmin-only mutation guard
  - `get_my_profile()` now includes `is_demo` for server-truth simulator gating (single-row RPC contract preserved)
  - `machines.is_demo_machine` and `get_my_demo_machine()` added to bind demo sessions to explicitly marked machines

### Fixed
- **"Results not available yet" stuck on already-finalized arenas**
  (`20260425280000_get_user_arena_result_always_return_row_for_finalized.sql`
  + mobile `apps/mobile-app/app/arena/[id]/index.tsx`):
  `get_user_arena_result` was anchored on `arena_results` and returned
  zero rows when the calling user had no entry. So a finalized arena that
  the user did not opt in to — or one where nobody opted in (the
  finalize_arena() cron still flips `is_finalized = true`) — looked
  identical to an arena still pending finalization, and the mobile
  rendered the "Rezultati još nisu dostupni" placeholder. The RPC now
  anchors on `sweat_arenas` (LEFT JOIN to results), so it returns one row
  for every finalized arena with `total_participants` and
  `top_participants` always populated and user-level fields nullable. The
  arena detail screen now distinguishes four ended states: pending
  finalization, finalized-no-participants, finalized-DNP (with full
  leaderboard), and finalized-with-personal-result. New i18n keys
  `noParticipants` and `didNotParticipate` added.
- **Arenas missing from mobile while admin shows them**
  (`20260425270000_get_available_arenas_show_ended_and_unfinalized.sql`):
  `get_available_arenas` previously hid arenas whose `end_date < today AND
  is_finalized = false` (an arena that ended but hadn't been finalized
  yet) and silently dropped finalized arenas after 30 days. Gym owners
  saw "1 live + 1 finished" in the admin panel while the mobile app
  showed an empty arenas tab. The function now returns every linked,
  `is_active = true` arena whose `end_date` is within the last 90 days,
  regardless of finalization. Status is computed from dates so
  ended-but-not-finalized arenas correctly render as "Ended" in the UI.
- **Home gauge bleeding across gyms** (`20260425260000_backfill_drops_transactions_gym_id.sql` + mobile):
  Legacy `drops_transactions` rows minted by the deprecated `add_drops()`
  function had `gym_id IS NULL`, so per-gym home dashboards either hid
  them entirely (correct, post `20260425181000`) or — when that filter
  hadn't shipped — showed identical totals in every gym. Backfilled
  legacy `gym_id` from `sessions` / `gym_checkins` / `gym_challenges` /
  `arena_participants` / `redemptions`. Mobile hooks `useHomeStats`,
  `useDropLimitStatus` and `useCompeteStats` now reset state on `gymId`
  change and drop stale RPC responses via an `activeGymRef` sentinel,
  so switching gym1 → gym2 instantly flips the gauge / "+N bonus" pill
  to gym2's values instead of holding gym1's totals during the RPC
  round-trip.

---

## [2026-04-20] - Reception Reward Flow

### Overview
Complete end-to-end flow for physical prize handling (arena_prize, leaderboard_prize) made
operational for receptionists, with no database schema or mobile app changes.

### Added (Admin Panel)
- **`fulfilled_at` in Desk queue** — `admin_list_redemptions` RPC now returns `fulfilled_at`;
  `RedemptionRow` type extended with `fulfilled_at` and `pending_verification` status.
- **Two-action modal in `RedemptionsList`**:
  - `pending_verification` → locked with identity-verification info banner.
  - Physical prize + `fulfilled_at IS NULL` → **"Mark as received"** button only (calls `markRedemptionFulfilled`).
  - Physical prize + `fulfilled_at IS NOT NULL` or store reward → **"Confirm & Hand Over"** button (calls `confirmRedemption`).
- **Five-state `StatusBadge`**: Pending verification · Awaiting shipment · Ready to collect · Confirmed · Cancelled.
- **Fulfillment sub-filter chips** in `RedemptionsList`: "Awaiting shipment" / "Ready to collect" client-side filter.
- **Two new KPI cards in `DeskShell`**: *Awaiting shipment* (blue) and *Ready to collect* (green), derived from a single `getRedemptionKpiCounts` server action call.
- **Arena prizes in receptionist sidebar** — `receptionistGroups` now includes a "PRIZES" group with an "Arena prizes" link to `/dashboard/arenas`.
- **Middleware updated** — receptionist role allowed through `/dashboard/arenas` and `/dashboard/arenas/*` routes (RLS already scopes data to assigned gym via `_admin_check_gym_access`).

### Added (Backend)
- **Migration `20260420130000_admin_list_redemptions_add_fulfilled_at.sql`** — updates `admin_list_redemptions` function to include `r.fulfilled_at` in the SELECT; no schema change.

### RPC mapping
| Reception duty | RPC | Trigger |
|---|---|---|
| Job A — prize arrival | `mark_redemption_fulfilled` | "Mark as received" button on Desk |
| Job B — hand over | `confirm_redemption` | "Confirm & Hand Over" button on Desk |
| Arena manifest | `get_arena_fulfillment_manifest` | Arena prizes page (fulfillment tab) |

---

## [2026-03-30] - Pre-Production Dead Feature Cleanup

### Removed
- **16 dead tables** from database: SmartCoach programs stack (`coach_profiles`, `coach_gym_affiliations`, `live_sessions`, `smartcoach_user_progress`, `workout_day_templates`, `day_template_items`, `workout_programs`, `program_days`, `program_items`, `user_active_programs`, `workout_plan_progress`, `completed_exercises`, `plan_session_history`, `equipment`) + deprecated (`user_challenge_progress`, `user_progress`)
- **3 dead functions**: `process_smartcoach_progress`, `get_plan_item_for_machine`, `load_day_template_into_program`
- **1 dead column**: `sessions.equipment_id`
- **49 debug/temp SQL files** from `backend/supabase/` (DEBUG_*, VERIFY_*, FIX_*, DIAGNOSE_*, etc.)

---

## [2026-03-29] - P0: Reconcile award_drops

### Fixed
- **award_drops** regression: Migration `20260327000005` (Happy Hour) overwrote the soft-tier award_drops from `20260325000016`, dropping session soft tiers, anti-split merge, cap modes, and restart grace reconciliation
- Backend/mobile mismatch: `live-drops-estimator.ts` applied soft tiers but backend used hard session cap — users saw inconsistent drop counts
- Reconciled function now includes: Happy Hour boost → soft tiers → anti-split merge → daily/weekly hard caps (in correct order)

---

## [2026-03-29] - App Store Launch UX — Gym Discovery & Onboarding

### Overview

Complete UX overhaul for App Store / Play Store launch with Vortex as the sole partner gym. Frames the single-gym reality as an "exclusive founding partner" launch. Prevents negative reviews by setting expectations clearly.

### Added (New Files)

- **`backend/supabase/migrations/20260329000001_add_gym_detail_fields.sql`** — Adds `description`, `working_hours` (JSONB), `phone`, `email`, `website`, `instagram`, `latitude`, `longitude`, `is_founding_partner` to `gyms` table
- **`apps/mobile-app/app/gym-detail.tsx`** — Full gym profile screen with hero image, address (Open in Maps), working hours, about, contact, rewards preview, sticky "Set as Home Gym" CTA
- **`apps/mobile-app/components/GymCard.tsx`** — Reusable rich gym card with logo, name, founding partner badge, address, hours, action buttons. Used in onboarding and home screen
- **`docs/plans/app_store_launch_ux.md`** — Comprehensive UX plan document

### Changed

- **`apps/mobile-app/app/(onboarding)/welcome.tsx`** — Transformed from single-screen to 3-slide carousel (Turn Sweat Into Rewards → How It Works → Now Available at Partner Gyms). Pagination dots, swipe, persistent CTA
- **`apps/mobile-app/app/(onboarding)/home-gym.tsx`** — Full redesign from flat radio list to rich "Discover Partner Gyms" page with GymCard components, founding partner badge, "Coming Soon" dashed card, "Details" → gym-detail navigation
- **`apps/mobile-app/app/home.tsx`** — Three distinct states:
  - **No Gym State:** Shows "Ready to Start Earning?" hero + available gyms list + "How It Works" stepper (QR FAB hidden)
  - **Welcome Banner:** Dismissible "Welcome to [Gym]!" banner for first-time users (stored in AsyncStorage)
  - **Normal Dashboard:** Existing behavior preserved
- **`apps/mobile-app/app/_layout.tsx`** — Registered `gym-detail` route
- **`apps/mobile-app/lib/stores/useGymStore.ts`** — Extended `Gym` interface with new fields: `description`, `working_hours`, `phone`, `email`, `website`, `instagram`, `latitude`, `longitude`, `is_founding_partner`
- **`backend/types/sweatdrop.ts`** — Added `GymDayHours`, `GymWorkingHours` types. Extended `Gym` interface with all new detail fields

### Impact on Other Agents

- **supabase-dba:** Migration `20260329000001` must be applied. Seed Vortex data with real description, working hours, address, phone, Instagram, `is_founding_partner = true`
- **admin-coder:** May want to add gym detail fields (description, hours, contact) to admin panel gym edit form
- **reviewer:** Verify: no-gym home state renders correctly, gym-detail screen loads rewards, welcome carousel swipes, founding partner badge shows for Vortex

### Changed
- SmartCoach card on home screen now conditionally renders based on `gym.smartcoach_enabled` flag
  - Card is hidden when SmartCoach is disabled for the active gym
  - Updated `Gym` interface in `useGymStore.ts` to include `smartcoach_enabled` field
- Workout screen now checks `smartcoach_enabled` before loading SmartCoach plan items
  - SmartCoach mode is disabled if the gym doesn't have SmartCoach enabled
  - Added `smartcoach_enabled` to gym query in `createSession` function
  - Added check in `loadPlanItem` to prevent SmartCoach mode when feature is disabled

---

## [2025-03-02] - mobile-coder: Complete Mobile App UI/UX Redesign

### Overview

Full redesign of every screen in the mobile app to establish a **premium fitness app** aesthetic with:
- **Dynamic gym branding** — primary/secondary colors from `currentGym` propagate across the entire UI
- **Glassmorphism** — `BlurView` (intensity 50) + semi-transparent dark background on all cards
- **Staggered entrance animations** — `react-native-reanimated` `FadeInDown` on all screens
- **Consistent design language** — unified border radius, color system, spacing, and typography

### Design System Established

**Core Visual Principles:**
- Background: `ImageBackground` from `activeGym.background_image_url` when available, else `LinearGradient` dark fallback (`#000000` → `#0A0E1A`)
- Card treatment: `BlurView intensity={50} tint="dark"` + `backgroundColor: 'rgba(20, 20, 30, 0.75)'` + `borderColor: hexToRgba(branding.primary, 0.12–0.15)` + `borderWidth: 1`
- Branding colors: `branding.primary` for interactive accents, progress bars, icons, active states, CTAs
- Original SweatDrop colors preserved for: difficulty levels (green/yellow/red), status indicators, base text hierarchy
- Animations: `FadeInDown` from `react-native-reanimated` with staggered delays per card/row

**Key Hooks & Contexts:**
- `useBranding()` — derives `primary`, `primaryLight`, `primaryDark`, `onPrimary` from `activeGym.primary_color`
- `useTheme()` — provides animated theme values via `ThemeContext`
- `useHomeStats()` — fetches streak, today's drops, last workout, closest reward, weekly activity

### Added (New Components)

- **`apps/mobile-app/components/HeroDropsRing.tsx`** — Dual-progress SVG circle (outer: global drops, inner: local drops), dynamic branding, press-to-navigate to wallet, pulsating glow
- **`apps/mobile-app/components/QuickStatsRow.tsx`** — Row of 3 glassmorphic pills (streak, today's drops, last workout)
- **`apps/mobile-app/components/ClosestRewardBanner.tsx`** — Banner showing nearest redeemable reward with progress
- **`apps/mobile-app/components/WeeklyActivityChart.tsx`** — 7-day sparkline bar chart (SVG + animated bars)
- **`apps/mobile-app/hooks/useHomeStats.ts`** — Hook fetching home screen stats from Supabase

### Changed (Redesigned Screens — 12 files)

| # | File | Key Changes |
|---|------|-------------|
| 1 | `apps/mobile-app/app/home.tsx` | Dynamic `ImageBackground`, dual-progress `HeroDropsRing`, `QuickStatsRow`, `WeeklyActivityChart`, `ClosestRewardBanner`, Trophy Room card replacing Leaderboards, skeleton loader for challenges, BlurView on all cards |
| 2 | `apps/mobile-app/components/UserSettingsSheet.tsx` | Complete redesign: profile hero, quick stats pills, inline editable username, home gym display, notifications toggle, app version, delete account, all glassmorphic cards, dynamic branding |
| 3 | `apps/mobile-app/app/wallet.tsx` | `ImageBackground`, BlurView on balance & transaction cards, branding colors replacing hardcoded `#00E5FF`, staggered `FadeInDown` |
| 4 | `apps/mobile-app/app/store.tsx` | `ImageBackground`, BlurView on reward cards, branded progress bars & accents |
| 5 | `apps/mobile-app/app/leaderboard.tsx` | `ImageBackground`, BlurView on items & sticky footer, branded tab/button states |
| 6 | `apps/mobile-app/app/challenges.tsx` | `ImageBackground`, BlurView on challenge cards, branded progress fill & type badges |
| 7 | `apps/mobile-app/app/challenge-detail.tsx` | BlurView replacing inner gradient, branded icons & progress |
| 8 | `apps/mobile-app/app/redemptions.tsx` | `ImageBackground`, BlurView on redemption cards, branded drops icons |
| 9 | `apps/mobile-app/app/session-summary.tsx` | BlurView on stat/equipment/badge cards, branded "Collect & Close" button |
| 10 | `apps/mobile-app/app/smartcoach.tsx` | BlurView on gym cards, branded icons replacing hardcoded cyan |
| 11 | `apps/mobile-app/app/gym-plans.tsx` | BlurView on plan cards, branded plan count & icons, difficulty colors preserved |
| 12 | `apps/mobile-app/app/plan-detail.tsx` | BlurView on info card & exercise items, branded number badges, rest badges, start button gradient, staggered animations |

### Changed (Redesigned Components — 4 files)

| # | File | Key Changes |
|---|------|-------------|
| 1 | `apps/mobile-app/components/TrophyRoom.tsx` | BlurView on search & filter buttons, branded section titles & icons |
| 2 | `apps/mobile-app/components/LeaderboardPreview.tsx` | BlurView intensity increased to 50, dark backgroundColor added |
| 3 | `apps/mobile-app/components/ProgressWidget.tsx` | BlurView intensity increased to 50, dark backgroundColor added |
| 4 | `apps/mobile-app/components/BackButton.tsx` | Dynamic branding border color via `hexToRgba(branding.primary, 0.15)` |

### Fixed
- **Card visibility on dark backgrounds** — Increased `BlurView` intensity from 15–20 to 50 and added `backgroundColor: 'rgba(20, 20, 30, 0.75)'` across all glassmorphic cards (resolves issue when gym has black background + white primary color)
- **Border visibility** — Increased border opacity from `0.08` to `0.12–0.25` across all branded borders
- **Home screen flickering** — Added skeleton loader for challenges section to prevent layout jump during data loading
- **ProgressWidget hooks order** — Moved early return after all hooks to prevent React hook order errors
- **ProgressWidget easing** — Replaced custom easing with `Easing.out(Easing.ease)` from reanimated to fix worklet error

### Breaking Changes
- None (all changes are UI-only within `apps/mobile-app/`)

### Impact on Other Agents

- **architect:** Mobile app now has a complete design system. Future screens should follow the glassmorphism + dynamic branding pattern documented in this entry. Consider adding a `docs/plans/mobile_design_system.md` reference.
- **admin-coder:** No impact. Admin panel uses separate Tailwind-based design.
- **supabase-dba:** No impact. No database changes required.
- **reviewer:** All screens now use `useBranding()` hook for colors. When reviewing, verify:
  - No hardcoded `#00E5FF` remains (should use `branding.primary`)
  - All `BlurView` uses `intensity={50}` and has `backgroundColor: 'rgba(20, 20, 30, 0.75)'`
  - All cards have `borderColor: hexToRgba(branding.primary, 0.12)` minimum
  - `ImageBackground` conditional on `activeGym.background_image_url`

### Data Dependencies (Supabase Queries Used)

- `profiles.total_drops` — Global drops count for HeroDropsRing outer ring
- `gym_memberships.local_drops_balance` — Local drops for HeroDropsRing inner ring
- `drops_transactions` — Today's drops, weekly activity chart
- `sessions` — Last workout info, streak calculation
- `rewards` — Closest reward banner
- `gym_challenges` — Active challenges display
- `gyms.primary_color`, `gyms.secondary_color`, `gyms.logo_url`, `gyms.background_image_url` — Dynamic branding

---

## [2025-01-27] - Initial Setup

### Added
- Multi-agent workflow system with 5 agent personas
- Architecture documentation (`ARCHITECTURE.md`)
- State of the app tracking (`STATE_OF_THE_APP.md`)
- Cursor rules for context-aware development (`.cursorrules`)
- Agent persona rules (`.cursor/rules/*.mdc`)

### Documentation
- System architecture documentation
- State tracking documentation
- Agent communication protocol

---

**Note:** This changelog is maintained by all agents. Each agent should add entries when making significant changes.
