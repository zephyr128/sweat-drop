# Feature: NFC Tag Scanning via OS-Level Universal Links

**Status:** Planning (zero-code; verification + sticker QA only)
**Owner:** Architect
**Target Release:** Vortex pilot (concurrent with QR sticker rollout)
**Created:** 2026-05-05
**Revised:** 2026-05-05 — dropped in-app NFC reader; OS-level routing is sufficient.

---

## Context

Each physical sticker installed in a partner gym carries **both** a QR code and an embedded NFC chip. Both encode the **same** HTTPS Universal Link URL:

| Sticker type | Encoded URL (identical for QR and NFC) |
|--------------|----------------------------------------|
| Machine      | `https://sweat-drop.com/m/<qr_uuid>[?s=csc]` |
| Check-in     | `https://sweat-drop.com/c/<gym_id>` |

Example provided by ops: `https://sweat-drop.com/m/45f885d1-81b3-42a4-8187-afbf0566eef6`

### Why this is zero code

The QR Universal Links plan (`docs/plans/feature_qr_universal_links_stable_print_redirect.md`, **already implemented**) shipped:

- `apps/mobile-app/app/m/[uuid].tsx` and `apps/mobile-app/app/c/[gymId].tsx` — expo-router targets.
- `apps/mobile-app/lib/qr/handleQrDeepLink.ts` — `parseQrPayload()` + `handleQrDeepLink()` shared business logic.
- AASA components claim `/m/*` and `/c/*` on `sweat-drop.com` and `www.sweat-drop.com`.
- Android `intent-filter` with `autoVerify=true` for those path prefixes (see `app.config.js` lines 111–122).
- Landing-page `app/m/[uuid]` and `app/c/[gymId]` server-side redirect for "no app installed".

Because an NFC tag dispatches the same URL the QR encodes, every state below is already handled by the OS without any new app code:

| Device state | Behavior on NFC tap |
|---|---|
| App not installed | iOS Safari / Android Chrome opens the landing-page URL → smart redirect to TestFlight / App Store / Play Internal / Play Store per `STORE_REDIRECT_CHANNEL`. |
| App installed, backgrounded or closed (iPhone XS+, iOS 14+) | OS background NFC reader pops a system banner → tap → Universal Link routes to `app/m/[uuid].tsx` or `app/c/[gymId].tsx` → existing machine / check-in flow runs. |
| App installed, backgrounded or closed (Android with NFC enabled) | OS dispatches `ACTION_VIEW` for the URL → autoVerified App Link routes straight to the app activity. |
| App installed, foregrounded (user already inside SweatDrop) | iOS still surfaces the system NFC banner over the app — one tap routes to the deep-link screen. Android dispatches the URL intent into the running activity. |
| iPhone older than XS (no background NFC) | NFC silently does nothing. User scans the QR side of the same sticker with the camera. |
| Android with NFC toggled off | OS shows nothing. User scans the QR side or enables NFC. |

### Goals

1. **Tap an NFC sticker → workout/check-in starts.** Already true on every state where the OS is willing to read NFC.
2. **One sticker, two transports, identical destination.** Operations team prints once; users pick whichever transport is more convenient.

### Non-goals

- ❌ **No in-app NFC reader.** Earlier draft of this plan proposed a "Tap NFC" pill on `ScannerScreen` to handle the rare case of an iPhone older than XS or an Android with NFC disabled. Rejected because:
  - Marginal benefit: pre-XS iPhones are 8+ years old; NFC-disabled Android shows a system prompt to enable it.
  - The QR side of the same sticker is the universal fallback — works on any phone with a camera.
  - Adding `react-native-nfc-manager`, an iOS entitlement, an Apple Developer Portal capability flip, an Android permission, a usage-description string, and a localized UI is disproportionate to the cases it would cover.
- ❌ Tag-write workflow. Tags are pre-encoded by the manufacturer with the URL the admin panel displays. App stays read-only at the URL layer (i.e., it consumes URLs, doesn't program tags).
- ❌ Custom NDEF record types. Tags must encode a standard NDEF URI record (`Tnf.WellKnown` + `RtdType.U`) so OS readers handle them.
- ❌ Admin-panel UX changes. Same `qr_uuid` drives both transports.
- ❌ Backend changes. No DB columns, no new RPCs, no new RLS policies.

---

## Strategy Summary

```
NFC sticker → encoded HTTPS URL → OS NFC reader → Universal/App Link → existing app route → existing handler
                                       (already shipped — zero code in this plan)
```

The entire feature is encapsulated in three things ops controls:

1. The URL printed by the admin panel for each machine / gym.
2. The encoding service / vendor that writes that URL onto the NFC chip.
3. A pre-deploy QA check that confirms the encoded URL matches the printed URL.

---

## Dependencies

- [x] `apps/mobile-app/lib/qr/handleQrDeepLink.ts` exists and exports `parseQrPayload` + `handleQrDeepLink`.
- [x] `apps/mobile-app/app/m/[uuid].tsx` and `apps/mobile-app/app/c/[gymId].tsx` are registered routes.
- [x] AASA at `apps/landing-page/public/.well-known/apple-app-site-association` claims `/m/*` and `/c/*`.
- [x] `apps/landing-page/public/.well-known/assetlinks.json` lists both signing certificate SHA-256 fingerprints.
- [x] `apps/mobile-app/app.config.js` Android `intent-filter` with `autoVerify=true` covers `/m/` and `/c/` on both `sweat-drop.com` and `www.sweat-drop.com`.
- [x] `apps/landing-page/app/m/[uuid]/page.tsx` and `apps/landing-page/app/c/[gymId]/page.tsx` handle the "app not installed" redirect with `STORE_REDIRECT_CHANNEL`-aware platform detection.
- [x] NFC stickers physically delivered with HTTPS URLs (user confirmed: example `https://sweat-drop.com/m/45f885d1-81b3-42a4-8187-afbf0566eef6`).

**Out of scope:**

- Branch.io / Firebase Dynamic Links deferred deep-linking (carried over from the QR plan; same trade-off applies).
- Differentiating "user came in via NFC" vs "via QR" in analytics. Currently impossible because both transports route through the same URL → same `app/m/[uuid].tsx` handler. Adding a `?via=nfc` query param on a future sticker print run would let us measure transport preference — that is a sticker-encoding decision, not an app change.

---

## Execution Plan

### Step 1 — Smoke-Test the OS-Level Path on a Real Sticker (`mobile-coder` or QA)

**Owner:** `mobile-coder` (one-time, ~15 minutes)
**Files:** none

Pick one delivered NFC sticker. With a current dev build of the app installed:

| Test | Device | Expected |
|---|---|---|
| 1. App force-quit, tap sticker | iPhone XS+ on iOS 17+ | System NFC banner appears → tap banner → app launches at `/m/[uuid]` or `/c/[gymId]` → existing flow runs. |
| 2. App force-quit, tap sticker | Pixel/Samsung on Android 13+, NFC enabled | App opens directly via App Link autoVerify → existing flow runs. |
| 3. App in foreground on `/home`, tap sticker | iPhone XS+ | System banner appears over the app → tap → deep link routes within the same app session. |
| 4. App in foreground on `/home`, tap sticker | Android | Intent fires into the running activity → routes to deep-link screen. |
| 5. App not installed, tap sticker | Either platform | Browser opens landing-page URL → server-side redirect to the right store channel per `STORE_REDIRECT_CHANNEL`. (This already works — verifying the QR plan didn't regress.) |
| 6. NFC disabled on Android | Pixel/Samsung | Nothing happens. User can use the QR side of the sticker. |

If all six pass, NFC is shipped. If anything fails, the failure is in the **already-shipped QR Universal Links plan** (AASA, assetlinks.json, intent-filter, or route file), not in NFC — diagnose and fix there. NFC introduces no new mobile-app surface.

### Step 2 — Per-Batch Sticker QA (`ops`)

**Owner:** ops, before deploying any new sticker batch to a partner gym
**Files:** none

Per delivered batch (sample ~5% of stickers, minimum three per batch):

1. Open the admin panel at `apps/admin-panel/app/print-qr/page.tsx` and copy the canonical URL the panel generated for the sticker's machine or gym. This is the single source of truth.
2. Tap the sticker's NFC chip with any third-party "NFC TagInfo" app (e.g. NXP TagInfo on Android, NFC Tools on iOS). Read the encoded URL.
3. Assert byte-equality: panel URL === chip URL. Trim whitespace; case-sensitive on the host and path; UUIDs are lowercased per the panel's output.
4. Scan the QR side of the same sticker with any QR reader. Assert the QR-decoded URL also equals the panel URL.
5. Tap the sticker with the SweatDrop dev or production app on a known-good device → confirm the in-app flow launches as expected.

**Reject the batch** if any of the following:
- A chip encodes a different URL than the QR (manufacturing transposition).
- A chip encodes the legacy `sweatdrop://` form instead of HTTPS (the admin panel hasn't generated `sweatdrop://` since the QR Universal Links rollout — if it appears, the manufacturer is using a stale spec).
- A chip encodes anything other than a single NDEF URI record (`Tnf.WellKnown` + `RtdType.U`) — custom record types may not be auto-handled by iOS / Android NFC dispatch.
- A chip is unreadable by the third-party reader (chemical / mechanical defect).

### Step 3 — Document Fallback for Pre-NFC Devices (`mobile-coder`, optional copy update)

**Owner:** `mobile-coder` (optional, ~5 minutes)
**Files:** at most one locale string update; no logic change

Add (or surface, if the copy already exists) one line on the empty-state for the scan screen, in EN and SR locale files, telling users they can scan the QR or tap the NFC sticker:

| Key | EN | SR |
|---|---|---|
| `scanner.tapOrScan` | `Scan the QR code or tap your phone to the sticker` | `Skenirajte QR kod ili prislonite telefon uz nalepnicu` |

This is a copy-only nudge so users on pre-XS iPhones / NFC-disabled Android know the QR is the universal fallback. Skip this step if a similar string already exists.

---

## Data Model Changes

**None.**

NFC is purely a transport-layer addition. The same `qr_uuid` and `gym_id` identifiers serve both QR and NFC interchangeably. No new columns, no new tables, no new RLS policies, no new RPCs.

---

## API Contracts

**None changed.**

The existing `get_machine_status` and `perform_checkin` RPCs serve both transports identically — they only ever see the URL after it has been routed into the app, by which point the transport is irrelevant.

---

## Testing Requirements

### Mobile (`mobile-coder`)

- The six-row matrix in Step 1, on at least one physical device per platform.
- No new automated tests required — there is no new code under test.
- Confirm `pnpm --filter sweatdrop-mobile-app type-check` and `lint` continue to pass (sanity, since no files changed).

### Sticker QA (`ops`)

- Step 2 per-batch checklist before any partner-gym deployment.

### Cross-stack acceptance

| Scenario | Pass criteria |
|---|---|
| Tap NFC sticker outside app, app installed | Existing `/m/[uuid]` or `/c/[gymId]` route mounts → check-in / workout flow runs. |
| Tap NFC sticker outside app, app NOT installed | Browser opens landing-page redirect → store install (per existing QR plan; nothing NFC-specific). |
| Scan the QR side of the same sticker | Identical outcome to the NFC tap (single-source URL). |
| Pre-XS iPhone or NFC-disabled Android | NFC silently fails; QR side works. Documented fallback. |

---

## Rollback

Nothing to roll back at the app layer — there is no app-layer change.

If a sticker batch is bad (encodes wrong URLs or wrong record type): reject the batch. The admin-panel URL is the single source of truth; encoding errors are a manufacturing problem.

---

## Why this is the minimal change

- **Zero new code.** Reuses every layer of the QR Universal Links plan.
- **Zero new dependencies.** No NFC library.
- **Zero new entitlements / permissions / capability flips.** No iOS Developer Portal change. No Android manifest change.
- **Zero data-model changes.** Same `qr_uuid` / `gym_id`.
- **Zero admin-panel / landing-page changes.**
- **Single-source URL.** What the admin panel prints is what gets etched on the QR and written to the NFC chip — three artifacts, one URL.
- **Total app-layer surface area: 0 files. Total dependency surface area: 0 packages.**

---

## Agent Dispatch Prompts

### → `mobile-coder` (smoke test only — ~15 minutes)

```
Read docs/plans/feature_nfc_tag_scanning.md (this file).

There is no code to write. Run the Step 1 device matrix on one
physical iPhone (XS or newer, iOS 17+) and one physical Android
(NFC-enabled) using a real NFC sticker provided by ops.

Pass: all six rows behave as documented.
Fail: open a regression issue against the QR Universal Links plan
(docs/plans/feature_qr_universal_links_stable_print_redirect.md) —
the failure is in AASA, assetlinks.json, the intent-filter, or one
of app/m/[uuid].tsx / app/c/[gymId].tsx, NOT in NFC.

Optional follow-up: add the EN/SR locale string per Step 3 if a
similar copy doesn't already exist on the scan screen.

Update CHANGELOG.md under [Unreleased] / Verified:
  "NFC stickers tap-to-open verified via OS-level Universal Links /
   App Links on iOS XS+ and Android. No app code changed —
   transport reuses the QR Universal Links plan."

DO NOT add react-native-nfc-manager. DO NOT add NFC entitlements,
permissions, or usage-description strings. DO NOT touch
apps/admin-panel/, apps/landing-page/, or backend/supabase/.
```

### → ops (per-batch sticker QA)

```
Per-batch NFC sticker QA, before deploying any new batch to a
partner gym:

1. In the admin panel, /print-qr/page.tsx for the sticker's machine
   or gym → copy the canonical URL string. This is the source of
   truth.

2. Tap the sticker with a third-party NFC reader (NXP TagInfo on
   Android, NFC Tools on iOS). Confirm:
   - Encoded payload is a single NDEF URI record (Tnf.WellKnown,
     RtdType.U).
   - The decoded URL is byte-identical to the admin-panel URL
     (case-sensitive on host and path).
   - URL form is HTTPS, not legacy sweatdrop://.

3. Scan the QR side of the same sticker with any QR reader.
   Confirm the QR-decoded URL also equals the admin-panel URL.

4. Tap the sticker with the SweatDrop app on a known-good device.
   Confirm the in-app flow launches.

Reject the batch if any of:
- QR URL ≠ NFC URL on any sticker.
- Encoded URL is sweatdrop:// (stale spec — manufacturer should
  use the HTTPS form the panel produces).
- Encoded payload is not a single NDEF URI record.
- Chip is unreadable.

Sample size: minimum three per batch, ~5% for batches over 60.
```

---

## Open Follow-ups (Out of Scope)

1. **Differentiate transport in analytics.** Add `?via=nfc` to the URL written onto NFC chips on a future print run; mobile app already preserves query params through `parseQrPayload`. Cheap to add when we want the data.
2. **Re-evaluate in-app NFC reader.** Only if pilot data shows a non-trivial cohort of users on pre-XS iPhones or with NFC disabled who can't fall back to QR for some reason. The bar for adding the dependency is real evidence of unmet need, not theoretical coverage.
3. **NFC for staff-side flows** (e.g. receptionist taps user's "membership" card to validate a redemption). Distinct UX, distinct security model — separate plan.

---

**End of Plan**
