# Feature: Stable QR Codes with Universal Links + Env-Aware Store Redirect

**Status:** Planning
**Owner:** Architect
**Target Release:** Before first external pilot QR sticker print run (Vortex)
**Created:** 2026-04-28

---

## Context

### Problem

Today's QR codes encode a custom URL scheme:

| QR type   | Encoded payload |
|-----------|-----------------|
| Machine   | `sweatdrop://machine/<qr_uuid>[?sensor=csc]` |
| Check-in  | `sweatdrop://checkin/<gymId>` |

Three concrete problems flow from this:

1. **Custom-scheme dead end if app is missing.** Native iOS / Android camera apps cannot resolve `sweatdrop://` to anything when the SweatDrop app is not installed. The user gets a silent failure, a "no app to open this link" toast, or — worst case — Safari's `sweatdrop://` error page. There is no path to the App Store / Play Store.

2. **Beta → Production switch forces sticker reprints.** Once we move from TestFlight + Play Internal Testing to App Store + Play Store production builds, anyone scanning with no app installed must be sent to the live store, not the beta channel. If the QR encodes a static destination, every gym sticker has to be reprinted on launch day.

3. **Closing the in-app scanner after a deep-link cold/warm start lands on `[...unmatched]`.** Reproduction (today):
   1. Native iOS camera scans `sweatdrop://machine/<uuid>` → app opens.
   2. expo-router's default linking treats `sweatdrop://machine/<uuid>` as a route resolution → tries to mount `app/machine/[uuid].tsx`. That file does not exist → `app/[...unmatched].tsx` mounts on the stack.
   3. `_layout.tsx`'s `Linking.addEventListener('url', …)` ALSO fires and pushes `/scan?autoQR=…`. Stack is now `[unmatched] → [/scan]`.
   4. User finishes / cancels the scan → `router.back()` → unmatched route screen surfaces.

### Goals

- **One sticker, forever.** A QR printed in 2026 must keep working on production app two years later without reprinting. Destination changes happen server-side.
- **Graceful "no app" path.** A user with no app scans → lands on a SweatDrop-branded page that hands them off to the right store channel based on platform AND environment.
- **Installed app intercepts at OS level.** With the app installed, the QR must open the right in-app surface (check-in or machine workout) without ever showing a browser tab.
- **Scanner exits cleanly.** Closing the scanner after a deep-link entry returns to `/home`, never to an unmatched route.

### Why HTTPS Universal Links + App Links (not custom schemes)

| Capability | `sweatdrop://` custom scheme | `https://sweat-drop.com/...` Universal/App Link |
|---|---|---|
| Works when app installed | ✅ | ✅ (OS hands URL straight to the app) |
| Falls back to web when app missing | ❌ silent failure | ✅ landing page renders, can redirect |
| Single QR works pre-launch and post-launch | ❌ requires reprint to change handler | ✅ destination resolved server-side per request |
| Supported by native camera apps universally | ⚠️ inconsistent | ✅ both iOS Camera + Android Camera |
| Verified against domain (anti-spoof) | ❌ | ✅ AASA + assetlinks.json |

We already have the substrate: `applinks:sweat-drop.com` and `applinks:www.sweat-drop.com` are in `apps/mobile-app/app.config.js`. Android intent filters are already wired with `autoVerify=true` against the same hosts. AASA + `assetlinks.json` are already published from `apps/landing-page/public/.well-known/`. We are **adding two new path scopes** to that existing configuration — not introducing a new domain.

---

## Strategy Summary

**New QR payload format (for all stickers printed from now on):**

| QR type  | Encoded payload (HTTPS Universal/App Link) |
|----------|--------------------------------------------|
| Machine  | `https://sweat-drop.com/m/<qr_uuid>[?s=csc]` |
| Check-in | `https://sweat-drop.com/c/<gym_id>` |

Short paths (`/m/`, `/c/`) keep the QR code dense (fewer modules → easier scan from across the gym floor). The query param `?s=csc` mirrors the existing `?sensor=csc` machine-type hint for bikes; renamed to `s` for compactness, parsed with backward compat.

**Behavior matrix:**

| User state | iOS native camera scan | Android native camera scan |
|---|---|---|
| App installed (verified Universal Link / App Link) | OS routes to app → `app/m/[uuid].tsx` or `app/c/[gymId].tsx` mounts → executes the same machine/check-in flow as the in-app scanner | OS routes to app (autoVerify confirmed) → same routes mount |
| App NOT installed | Safari opens `https://sweat-drop.com/m/<uuid>` → server-side smart redirect to TestFlight (beta) or App Store (prod) based on env flag | Chrome opens same URL → smart redirect to Play Internal Testing (beta) or Play Store (prod) |
| Anything else (desktop, scanner-only, etc.) | Same URL → renders a "Get the app" page with both store buttons | Same |

**Beta → Production cutover** is a single env var flip on the landing-page Vercel project: `STORE_REDIRECT_CHANNEL=beta` → `production`. Stickers don't change.

**In-app scanner** continues to work for ALL three formats so we never strand existing prints:
- Old: `sweatdrop://machine/<uuid>` and `sweatdrop://checkin/<gymId>` (legacy stickers)
- New: `https://sweat-drop.com/m/<uuid>` and `https://sweat-drop.com/c/<gymId>`
- Plain UUID (already supported as a legacy path inside the scanner)

**Unmatched-route bug** is fixed by adding the four route files the URL paths actually hit — `app/m/[uuid].tsx`, `app/c/[gymId].tsx`, `app/machine/[uuid].tsx`, `app/checkin/[gymId].tsx` — each delegating to a single shared handler module (`lib/qr/handleQrDeepLink.ts`). The legacy `Linking.addEventListener('url', …)` path in `_layout.tsx` is reduced to a thin shim that hands cold-start URLs to the same handler.

---

## Dependencies

- [x] `applinks:sweat-drop.com` and `applinks:www.sweat-drop.com` in `app.config.js` (iOS associatedDomains)
- [x] Android intent filters claiming `https://sweat-drop.com/...` paths (already partially configured for `/auth/confirm`, `/auth/reset`, `/join`)
- [x] AASA published at `apps/landing-page/public/.well-known/apple-app-site-association`
- [x] `assetlinks.json` published at `apps/landing-page/public/.well-known/assetlinks.json` with both signing certificate SHA-256 fingerprints
- [x] Landing page middleware preserves `/.well-known/*` on `www.sweat-drop.com` (no redirect to apex) — required for AASA fetch by iOS
- [x] `machines.qr_uuid` (UUID) primary identifier exists; `get_machine_status(p_qr_uuid UUID)` RPC already takes UUID
- [x] `gyms.id` (UUID) used as check-in payload identifier
- [x] Mobile app already has a working `Linking.addEventListener('url', …)` handler in `app/_layout.tsx` covering custom-scheme QR URLs and a `usePendingQRStore` for cold-start coordination — we are reusing both

**Out of scope:**
- Deferred deep-linking (capture QR target during web flow, replay after install). Accepted UX trade-off for MVP: the web landing offers Store install; user opens app once, then re-scans the QR. The second scan goes through Universal/App Link directly. Add Branch.io / Firebase Dynamic Links only if pilot data shows install→re-scan friction is meaningful.
- TestFlight public-beta acquisition (no App Store listing required for TestFlight public link). We use Apple's TestFlight invite link `https://testflight.apple.com/join/<code>` and Google's internal/closed-testing opt-in URL.
- Changing the existing `qr_uuid` schema or `get_machine_status` RPC.
- Reprinting already-deployed legacy stickers — they continue to work via the in-app scanner's multi-format parser.

---

## Execution Plan

### Step 1 — Landing Page: Smart Redirect Routes (`landing-page-coder`)

**Owner:** `landing-page-coder`
**Files:** 3 new, 1 modified

#### 1.1 Add server-side route `app/m/[uuid]/page.tsx`

Behavior:
1. Server component receives `params.uuid` and optional `searchParams.s` (sensor hint).
2. **No DB lookup at this layer** — we don't validate the UUID exists. The mobile app does that on the in-app side via `get_machine_status` once the deep link routes through. Web landing only needs to redirect.
3. Choose store URL based on env + user-agent:
   - `process.env.STORE_REDIRECT_CHANNEL === 'beta'` → TestFlight or Play Internal Testing
   - else → App Store / Play Store
4. Detect platform from `headers().get('user-agent')` (server-side; Next.js 15 dynamic rendering).
5. **iOS path:** return a small HTML page with:
   - `<meta http-equiv="refresh" content="0; url=<store_url>">` as fallback.
   - `<script>window.location.replace(<store_url>);</script>` for instant redirect.
   - **DO NOT** attempt `window.location = 'sweatdrop://machine/...'`. iOS Universal Links handle the install case automatically: if the app is installed, the OS intercepts BEFORE this page loads. If we reach this page, the app is missing.
   - A visible "Open SweatDrop" button + "Get the app" CTA so non-redirecting browsers (rare embedded WebViews) still work.
6. **Android path:** identical pattern with Android-appropriate store URL.
7. **Desktop / unknown:** render a SweatDrop-branded "Get the app" page with both store buttons, the QR target preserved as a URL fragment so users can bookmark it.

**Why server-side, not middleware:** middleware on Next.js Vercel can't return HTML with a `<meta refresh>` cleanly; server components can. Also, the existing `apps/landing-page/middleware.ts` already does www→apex canonicalization and we don't want to entangle business redirect logic with host normalization.

**Performance:** the page is dynamic (UA-dependent). Mark with `export const dynamic = 'force-dynamic';` to skip static prerender.

**SEO:** add `export const metadata = { robots: { index: false, follow: false } };` — these landing pages exist purely as a fallback hop; we do not want them indexed.

#### 1.2 Add server-side route `app/c/[gymId]/page.tsx`

Identical structure to `/m/[uuid]/page.tsx`. The `gymId` param is preserved through to the store redirect via a URL hash so the user can re-scan after install (and so the desktop "Get the app" page can show the gym name if a sibling RPC fetch is desired in a follow-up — out of scope for MVP).

#### 1.3 Add `lib/store-redirect.ts`

Single module exporting:

```typescript
export type Channel = 'beta' | 'production';
export type Platform = 'ios' | 'android' | 'other';

export function detectPlatform(userAgent: string | null): Platform { /* ... */ }
export function getChannel(): Channel { /* reads STORE_REDIRECT_CHANNEL env */ }
export function getStoreUrl(platform: Platform, channel: Channel): string { /* ... */ }
```

Concrete URLs (placeholder; final values live in env, not in code, except for the production fallbacks below):

| Platform | Beta channel (`STORE_REDIRECT_CHANNEL=beta`) | Production channel |
|---|---|---|
| iOS     | `process.env.NEXT_PUBLIC_TESTFLIGHT_INVITE_URL` (e.g. `https://testflight.apple.com/join/XXXXXXXX`) | `https://apps.apple.com/app/sweatdrop/id<APP_ID>` |
| Android | `process.env.NEXT_PUBLIC_PLAY_INTERNAL_TESTING_URL` (closed-testing opt-in URL) | `https://play.google.com/store/apps/details?id=com.sweatdrop.app` |

Production iOS App ID and Play Store package name are stable and can be hardcoded as defaults inside `getStoreUrl`. TestFlight + internal-testing URLs **must** come from env — they rotate when we change the test group.

#### 1.4 Update Apple App Site Association

Modify `apps/landing-page/public/.well-known/apple-app-site-association`:

```jsonc
{
  "applinks": {
    "details": [
      {
        "appIDs": ["BRR7885TWH.com.sweatdrop.app"],
        "components": [
          { "/": "/auth/confirm", "?": { "token_hash": "?*", "type": "?*" } },
          { "/": "/auth/confirm", "#": "?*" },
          { "/": "/auth/reset", "#": "?*" },
          { "/": "/join/*" },
          { "/": "/m/*" },     // ← NEW
          { "/": "/c/*" }      // ← NEW
        ]
      }
    ]
  }
}
```

**Critical:** AASA must remain served as HTTP 200 directly on both `sweat-drop.com` AND `www.sweat-drop.com`, with no 3xx and `Content-Type: application/json`. The existing middleware in `apps/landing-page/middleware.ts` already preserves `/.well-known/*` on www — verify nothing regresses (CI smoke test below).

`assetlinks.json` does not need changes (it's domain-scoped, not path-scoped — Android App Links rely on the intent-filter `pathPrefix` in the app manifest).

#### 1.5 Verification

- [ ] Visit `https://sweat-drop.com/m/<any-uuid>` from desktop → "Get the app" page renders, both store CTAs visible.
- [ ] Spoof iOS user agent (`curl -A 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605'` …) with `STORE_REDIRECT_CHANNEL=beta` → response body contains the TestFlight URL.
- [ ] Spoof Android user agent → response contains Play internal-testing URL.
- [ ] Flip env to `production` → response now contains live App Store / Play Store URLs.
- [ ] `curl -sI https://www.sweat-drop.com/.well-known/apple-app-site-association` returns `200`, `Content-Type: application/json`. (Same on apex.)
- [ ] `apps/landing-page/middleware.ts` matcher still excludes `/.well-known/*` from any redirect.

---

### Step 2 — Mobile App: Deep-link Route Files + Shared Handler (`mobile-coder`)

**Owner:** `mobile-coder`
**Files:** 5 new, 1 modified

#### 2.1 Create `apps/mobile-app/lib/qr/handleQrDeepLink.ts`

Single shared handler that takes a parsed payload and an active session, performs the same business logic the in-app scanner does today, and returns a `Promise<void>` once navigation is complete. Extracted from `components/ScannerScreen.tsx` (the `handleQRCodeScanned` body). New module API:

```typescript
export type ParsedQR =
  | { kind: 'machine'; qrUuid: string; sensorHint: string | null }
  | { kind: 'checkin'; gymId: string }
  | { kind: 'unknown'; raw: string };

export function parseQrPayload(input: string): ParsedQR;

export type HandleQrDeepLinkOptions = {
  router: ReturnType<typeof useThrottledRouter>;
  session: Session | null;
  showModal: ReturnType<typeof useAppModal.getState>['showModal'];
  // …plus refs for updateHomeGym etc., or use store getters internally
};

export async function handleQrDeepLink(
  payload: ParsedQR,
  options: HandleQrDeepLinkOptions,
): Promise<void>;
```

The function:
1. For `machine`: calls `supabase.rpc('get_machine_status', { p_qr_uuid })`, applies the existing maintenance / busy / sensor-paired guards, runs the auto-checkin gate, and `router.replace`s to `/checkin-result` (with `pendingWorkout` JSON for the chained workout) or `/gym-welcome` / `/workout` exactly as today.
2. For `checkin`: calls `supabase.rpc('perform_checkin', { p_gym_id, p_lat, p_lng })` and `router.replace`s to `/checkin-result`.
3. For `unknown`: `showModal({ title: t('error'), … })` with a "go home" CTA.

`ScannerScreen.tsx` keeps its own logic temporarily (simpler refactor: use the new module from the new route files first; migrate the scanner to it in a follow-up if/when the duplication becomes a maintenance burden). **No behavior change** in ScannerScreen — only new code paths use the extracted module.

`parseQrPayload` accepts ALL these inputs and returns the unified `ParsedQR`:

| Input | Parsed kind | Notes |
|---|---|---|
| `https://sweat-drop.com/m/<uuid>` or `?s=csc` | `machine` | Strip host, take `/m/<uuid>` |
| `https://www.sweat-drop.com/m/<uuid>` | `machine` | Same — both hosts in associatedDomains |
| `https://sweat-drop.com/c/<gymId>` | `checkin` | |
| `sweatdrop://machine/<uuid>[?sensor=csc]` (legacy) | `machine` | Backward compat |
| `sweatdrop://checkin/<gymId>` (legacy) | `checkin` | |
| Plain UUID string (in-app scanner only path) | `machine` | Existing fallback in `ScannerScreen` |
| Anything else | `unknown` | |

#### 2.2 Add `apps/mobile-app/app/m/[uuid].tsx`

Lightweight screen:

```typescript
import { useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { useThrottledRouter } from '@/hooks/useThrottledRouter';
import { useSession } from '@/hooks/useSession';
import { useAppModal } from '@/lib/stores/useAppModal';
import { handleQrDeepLink, parseQrPayload } from '@/lib/qr/handleQrDeepLink';

export default function MachineDeepLink() {
  const { uuid, s } = useLocalSearchParams<{ uuid: string; s?: string }>();
  const router = useThrottledRouter();
  const { session } = useSession();
  const showModal = useAppModal((x) => x.showModal);

  useEffect(() => {
    if (!session?.user || !uuid) return;
    const payload = parseQrPayload(`sweatdrop://machine/${uuid}${s ? `?sensor=${s}` : ''}`);
    handleQrDeepLink(payload, { router, session, showModal });
  }, [session?.user, uuid, s]);

  return <View style={{ flex: 1, backgroundColor: '#000000' }} />;
}
```

**Critical detail:** the route MUST `router.replace` (never `push`) inside `handleQrDeepLink` so the deep-link route is removed from the stack. When the user later presses back from `/workout`, `/checkin-result`, etc., they land on `/home`, not on this `/m/[uuid]` route.

If `session?.user` is null (cold start, app re-installed, signed out) the route is a no-op view and the existing global guards in `_layout.tsx` route the user to onboarding/welcome. We additionally store the URL in `usePendingQRStore` so the post-login flow re-attempts the deep link automatically (mirrors today's behavior).

Add screen options in `_layout.tsx` Stack.Screen config: `presentation: 'transparentModal', animation: 'fade', gestureEnabled: false` so there's no slide-in flash before navigation completes.

#### 2.3 Add `apps/mobile-app/app/c/[gymId].tsx`

Same shape as `m/[uuid].tsx`, calling `parseQrPayload(`sweatdrop://checkin/${gymId}`)`.

#### 2.4 Add backward-compat routes for already-printed legacy stickers

- `apps/mobile-app/app/machine/[uuid].tsx` — proxy to the same `handleQrDeepLink` machine flow.
- `apps/mobile-app/app/checkin/[gymId].tsx` — proxy to the check-in flow.

These exist purely so expo-router has a real route to match when iOS / Android hands the app a legacy `sweatdrop://machine/<uuid>` URL. Without them, expo-router falls into `[...unmatched]` and the close-scanner regression returns. With them, the unmatched-route bug is structurally impossible.

#### 2.5 Simplify `apps/mobile-app/app/_layout.tsx` Linking handler

The `processUrl` function inside the `Linking.addEventListener('url', …)` effect today:
- Detects `sweatdrop://checkin/` or `sweatdrop://machine/`
- For warm launch, pushes `/scan?autoQR=...`

Change behavior to:
- For warm launch, hand the URL through expo-router instead so the new `/m/`, `/c/`, `/machine/`, `/checkin/` routes mount. Concretely, prefer:
  ```typescript
  if (isCheckin) router.replace({ pathname: '/checkin/[gymId]', params: { gymId } });
  if (isMachine) router.replace({ pathname: '/machine/[uuid]', params: { uuid, s: sensorParam ?? undefined } });
  ```
  (or, equivalently, normalize the URL into the `/m/`, `/c/` form first and route there).
- For HTTPS Universal Link warm launch (`event.url` starts with `https://sweat-drop.com/m/` or `/c/`), **do nothing** — expo-router auto-routes via `Linking` when the URL matches a registered scheme and a `screens` config; for Universal Links the OS already routed via `application(_:continue:userActivity:)` → expo-router. If duplicate handling becomes an issue, gate the legacy custom-scheme branch with `if (url.startsWith('sweatdrop://')) { … }`.
- Cold-start: keep storing the URL in `usePendingQRStore` so `app/index.tsx` can replay it after auth init. `index.tsx` should now `router.replace(<deep-link-route>)` instead of `router.push('/scan?autoQR=...')`.

This eliminates the `autoQR` param mechanism for the deep-link path. **Keep the existing `autoQR` code path in `ScannerScreen.tsx` unchanged** — it still serves the cold-start fallback when the deep-link route can't be reached (e.g., user signed out → onboarding completes → pending QR replayed via scanner UI).

#### 2.6 Update `apps/mobile-app/app.config.js` Android intent filters

Add a third intent filter block claiming `/m/` and `/c/` paths on both hosts so Android App Links autoVerify covers them:

```javascript
{
  action: 'VIEW',
  autoVerify: true,
  data: [
    { scheme: 'https', host: 'sweat-drop.com', pathPrefix: '/m/' },
    { scheme: 'https', host: 'sweat-drop.com', pathPrefix: '/c/' },
    { scheme: 'https', host: 'www.sweat-drop.com', pathPrefix: '/m/' },
    { scheme: 'https', host: 'www.sweat-drop.com', pathPrefix: '/c/' },
  ],
  category: ['BROWSABLE', 'DEFAULT'],
},
```

Bump `android.versionCode` and `ios.buildNumber` per the existing release runbook (`docs/plans/mobile_store_release_ios_android_runbook.md`). iOS associatedDomains list does not change — domain-level claim is enough; AASA component list (Step 1.4) is what scopes paths.

#### 2.7 Verification

| Scenario | Expected outcome |
|---|---|
| Build & install dev app, scan `sweatdrop://machine/<valid-uuid>` from native camera | App opens at machine flow → check-in gate runs → workout starts. Press back → `/home`. |
| Same with Universal Link `https://sweat-drop.com/m/<valid-uuid>` | Same outcome via `app/m/[uuid].tsx`. |
| Same with `https://sweat-drop.com/c/<gymId>` | Check-in screen runs → `/checkin-result`. Press back → `/home`. |
| Open scanner from `/home` → press X close button | Returns to `/home` (no `[unmatched]`). |
| Open scanner via `sweatdrop://machine/<uuid>` warm-launch → press X close | Returns to `/home`, NOT to `/machine/<uuid>` artifact. |
| Cold start with deep link, signed-out user | Routes to `/(onboarding)/welcome`; pending QR stored and replayed via in-app scanner after login. |
| In-app scanner: scan a printed QR encoding `https://sweat-drop.com/m/<uuid>` | Same machine flow as a `sweatdrop://machine/<uuid>` scan today. |
| In-app scanner: scan a legacy QR encoding `sweatdrop://machine/<uuid>` | Still works (no regression). |
| Type-check | `pnpm --filter sweatdrop-mobile-app type-check` passes. |

---

### Step 3 — Admin Panel: QR Generation Switch (`admin-coder`)

**Owner:** `admin-coder`
**Files:** ~6 small edits, no new files

Today's QR-generation surfaces all hardcode `sweatdrop://machine/${qr_uuid}` or `sweatdrop://checkin/${gymId}`. Switch them all to the new HTTPS form. Each surface gets the same one-line change.

#### 3.1 Surfaces to update

| File | Current | New |
|---|---|---|
| `apps/admin-panel/components/modules/MachineDetailView.tsx` (~L74) | `` `sweatdrop://machine/${qrUuid}` `` | `` `${PUBLIC_HOST}/m/${qrUuid}` `` |
| `apps/admin-panel/components/modules/MachinesManager.tsx` (~L618, 995, 1005, 1010) | `sweatdrop://machine/...` | `${PUBLIC_HOST}/m/...` |
| `apps/admin-panel/components/modules/CheckinSettingsModule.tsx` (~L102) | `sweatdrop://checkin/${gymId}` | `${PUBLIC_HOST}/c/${gymId}` |
| `apps/admin-panel/app/print-qr/page.tsx` (~L37, L39) | both forms | both forms HTTPS |
| `apps/admin-panel/app/print-qr/batch/page.tsx` (~L762) | machine form | HTTPS form |
| `apps/admin-panel/components/analytics/MachineFloor.tsx` (~L805) | machine form (display only) | HTTPS form |

#### 3.2 Add a single helper

`apps/admin-panel/lib/qr-urls.ts` (new):

```typescript
const PUBLIC_HOST = (process.env.NEXT_PUBLIC_QR_PUBLIC_HOST?.trim() || 'https://sweat-drop.com');

export function machineQrUrl(qrUuid: string, machineType?: string | null): string {
  const sensorParam = machineType === 'bike' ? '?s=csc' : '';
  return `${PUBLIC_HOST}/m/${qrUuid}${sensorParam}`;
}

export function checkinQrUrl(gymId: string): string {
  return `${PUBLIC_HOST}/c/${gymId}`;
}
```

All six surfaces import from this helper. The host is configurable per environment (e.g., a staging deploy can set `NEXT_PUBLIC_QR_PUBLIC_HOST=https://staging.sweat-drop.com` if/when staging exists). Default is the apex production host.

**Param rename note:** the new query param is `s` (compact). The old in-app scanner accepted `sensor=csc` via `URLSearchParams` parsing in `ScannerScreen.handleQRCodeScanned`. The shared parser (`parseQrPayload` in Step 2.1) accepts BOTH `s` and `sensor` for compatibility during transition.

#### 3.3 Print Studio copy adjustments

The in-sticker "Payload" debug field on `apps/admin-panel/app/print-qr/page.tsx` shows the raw URL today. After this change, it shows `https://sweat-drop.com/m/<uuid>`. No layout change required — the QR rasterizer (`BrandedQRCode`) is payload-agnostic.

The CTA presets (`MACHINE_CTAS`, `CHECKIN_CTAS` in `apps/admin-panel/components/print-studio/shared.tsx`) say things like "Scan to start" — already correct for the new URL. No copy changes required for MVP. (Optional follow-up: add a small caption like "If you don't have the app, scan to download" — track separately.)

#### 3.4 Verification

- [ ] Generate a fresh machine QR via `/print-qr?type=machine&machineId=<uuid>` → preview QR scans on a device with no app installed → Safari opens `https://sweat-drop.com/m/<uuid>` → smart redirect lands on App Store / TestFlight per env.
- [ ] Same QR scans on a device WITH the app installed → app opens directly to machine flow.
- [ ] `/print-qr/batch?gymId=<id>` produces a multi-page sticker PDF where each QR encodes the new URL.
- [ ] Type-check: `pnpm --filter sweatdrop-admin-panel type-check`.

---

### Step 4 — Production Beta→Live Cutover Runbook (no code, owner: ops)

**Owner:** Whoever runs the App Store / Play Store launch.

#### 4.1 Beta phase (today through Vortex pilot)

Landing-page Vercel project env:
```
STORE_REDIRECT_CHANNEL=beta
NEXT_PUBLIC_TESTFLIGHT_INVITE_URL=https://testflight.apple.com/join/<code>
NEXT_PUBLIC_PLAY_INTERNAL_TESTING_URL=https://play.google.com/apps/internaltest?id=com.sweatdrop.app
```

QR generation in admin panel uses the same `https://sweat-drop.com/m/...` URLs — no env split needed there.

#### 4.2 Production cutover

On launch day:
1. Submit and have approved iOS App Store + Play Store production listings with the SAME bundle id (`com.sweatdrop.app`) and SAME signing certificates as the TestFlight / Internal Testing builds — so AASA + assetlinks.json continue to verify.
2. Flip Vercel env: `STORE_REDIRECT_CHANNEL=production`. Optionally remove the TestFlight / Internal Testing env vars (the helper falls back to hardcoded production URLs).
3. Redeploy landing page (Vercel auto-deploys on env change).
4. Verify with `curl -A 'iPhone' https://sweat-drop.com/m/00000000-0000-0000-0000-000000000000` → response contains the App Store URL, not TestFlight.

**Rollback if production launch is problematic:** flip env back to `beta`. No sticker change. No mobile app change. Push notification users on the production build still work — they just see the TestFlight CTA on the redirect page if they didn't have the app installed yet, which is fine because they presumably already have it.

#### 4.3 Avoiding the "App Store rejects because it requires login to test" trap

App Review reviewers will scan a real QR sticker during review. They will get the production App Store redirect (or, if reviewing a TestFlight build before promotion, the TestFlight invite link). Since reviewers use the App Store directly to install whatever they're testing, the redirect-to-App-Store path on `/m/<uuid>` is essentially a no-op for them. The `is_demo` user / `is_demo_machine` infrastructure (already in place per `production_demo_gym_visibility_gating.md`) handles in-app demo data once they're signed in.

---

### Step 5 — Optional follow-ups (out of scope for MVP)

1. **Deferred deep-linking.** Capture the QR target server-side (cookie + `/api/deferred-link` endpoint), and on first launch the mobile app calls a "what brought you here?" RPC to replay the deep link. Add only if pilot data shows ≥10% of "no-app" scans drop off after install.
2. **Branded landing page for `/m/[uuid]` and `/c/[gymId]` desktop view.** Today it's a "Get the app" page. We could add the gym's name + logo by fetching gym/machine metadata via a public RPC (which already exists for machine status, would need a public-safe variant for gyms). Improves trust but isn't required for redirect to work.
3. **AASA + assetlinks.json regression CI check.** Add a GitHub Action that does `curl -sI` on both well-known endpoints from both apex and www and asserts `200` + correct `Content-Type`. Catches Vercel domain-redirect regressions before they break App Links.
4. **Migrate `ScannerScreen` to the shared `handleQrDeepLink` module.** Removes ~150 lines of duplication. Defer until the new path is validated in production.
5. **In-sticker copy for "no app" hint.** Sticker designer in `apps/admin-panel/components/print-studio/shared.tsx` could surface a tiny "iOS / Android" pair of tap-targets so a user without the app sees the install path even on the sticker itself.

---

## Data Model Changes

**None.**

`machines.qr_uuid` and `gyms.id` already serve as the canonical identifiers and are already `UUID`. No migration is needed; this plan is entirely transport-layer (URL form) plus one new column of routing in the apps.

## API Contracts

**Server-side (landing page):**

| Route | Method | Inputs | Output |
|---|---|---|---|
| `/m/[uuid]` | GET | path param `uuid` (UUID), optional query `s` (sensor hint) | iOS/Android: HTML with meta-refresh + script redirect to platform store URL. Desktop: branded "Get the app" page. |
| `/c/[gymId]` | GET | path param `gymId` (UUID) | Same shape. |

Cache headers: `Cache-Control: public, max-age=60, s-maxage=60` (UA-dependent; short cache acceptable since destination-by-platform changes only at env-flip time).

**Client-side (mobile app):**

| Route | Behavior |
|---|---|
| `app/m/[uuid].tsx` | Mount → call shared `handleQrDeepLink` machine path → `router.replace` to next screen → unmount. |
| `app/c/[gymId].tsx` | Mount → shared check-in path → `router.replace` to `/checkin-result`. |
| `app/machine/[uuid].tsx` | Backward-compat alias of `app/m/[uuid].tsx`. |
| `app/checkin/[gymId].tsx` | Backward-compat alias of `app/c/[gymId].tsx`. |

`handleQrDeepLink` is internal — no public API surface beyond the mobile app.

## Testing Requirements

### Mobile (`mobile-coder`)

1. iOS device with TestFlight build installed:
   - Native camera scans `https://sweat-drop.com/m/<valid-uuid>` printed QR → app opens at machine flow without browser visible.
   - Native camera scans `https://sweat-drop.com/c/<valid-gymId>` → check-in flow.
   - Native camera scans legacy `sweatdrop://machine/<uuid>` → still routes via new `app/machine/[uuid].tsx`; close scanner → `/home`.
2. Android device with Internal Testing build installed (assetlinks autoVerify confirmed via `adb shell pm get-app-links com.sweatdrop.app` → `verified`):
   - Same three scans → same outcomes.
3. Both platforms with app uninstalled:
   - Native camera scans `https://sweat-drop.com/m/<uuid>` → browser opens → server-side redirect → store install page.
   - Native camera scans legacy `sweatdrop://machine/<uuid>` → silent failure (expected; legacy stickers do not redirect when app missing — they only work for users who already have the app).
4. In-app `/scan` screen: all four formats parse correctly (HTTPS `/m/`, HTTPS `/c/`, legacy `sweatdrop://machine/`, legacy `sweatdrop://checkin/`). Machine type chip preselect works for both `?s=csc` and `?sensor=csc`.
5. Memory / closure regression: scan multiple QR codes back-to-back, ensure `hasScannedRef` is reset properly and no zombie listeners accumulate.

### Landing page (`landing-page-coder`)

1. `curl -sI https://sweat-drop.com/.well-known/apple-app-site-association` → `200` + `application/json`, body contains `/m/*` and `/c/*` components.
2. `curl -sI https://www.sweat-drop.com/.well-known/apple-app-site-association` → identical 200. (Critical: fails iOS Universal Links if either host returns 3xx.)
3. With `STORE_REDIRECT_CHANNEL=beta` in dev: spoofed iOS UA hits `/m/abc` → response references TestFlight invite URL; spoofed Android UA → references Internal Testing URL.
4. With `STORE_REDIRECT_CHANNEL=production`: iOS UA → App Store URL; Android UA → Play Store URL.
5. Desktop UA (`Mozilla/5.0 (Macintosh; …) Safari`): renders branded "Get the app" page with both store buttons (no auto-redirect).
6. Lighthouse on the desktop fallback ≥ 90 mobile / 95 desktop. The route is small (no JS bundle past the redirect script), so this is easy.

### Admin (`admin-coder`)

1. Render `/print-qr?type=machine&machineId=<uuid>&machineType=bike` → preview shows new HTTPS QR; "Copy link" copies the new URL.
2. Render `/print-qr/batch?gymId=<id>` → multi-page PDF carries new URL on every sticker.
3. Existing CheckinSettingsModule (`/dashboard/gym/[id]/settings/checkin`) shows new URL in the QR string field.
4. Type-check passes.

### Cross-stack acceptance

| Scenario | Pass criteria |
|---|---|
| Sticker printed today + app installed today | Scan → in-app machine/checkin flow runs end-to-end |
| Same sticker + app NOT installed today | Scan → SweatDrop-branded redirect → TestFlight or Internal Testing CTA |
| Same sticker + app NOT installed AFTER production launch (env flipped) | Scan → SweatDrop-branded redirect → App Store / Play Store CTA. **No reprint.** |
| Same sticker scanned with the in-app `/scan` screen | Identical outcome to native-camera scan with app installed |
| User opens scanner from home, scans a non-SweatDrop QR | Existing "Invalid QR code format" modal flow runs (no regression) |
| User cold-starts app from native scan, signs in, completes onboarding | Pending QR replays via the in-app scanner; user lands on the right post-login surface |

## Rollback

Per layer, in priority order:

1. **Landing page redirect:** revert `app/m/[uuid]/page.tsx`, `app/c/[gymId]/page.tsx`, AASA changes, `lib/store-redirect.ts`. AASA must redeploy to restore the previous component list. (Old `sweatdrop://`-encoded stickers continue working independently of this rollback.)
2. **Mobile app deep-link routes:** if the new routes regress something, ship a hotfix that makes `app/m/[uuid].tsx` and `app/c/[gymId].tsx` immediately `router.replace('/scan', { params: { autoQR: <reconstructed sweatdrop:// url> }})` — falls back to the existing scanner-mediated flow. Keep `app/machine/[uuid].tsx` and `app/checkin/[gymId].tsx` permanently regardless of rollback, because they fix the unmatched-route bug for legacy stickers and there is no downside to having them.
3. **Admin QR URL switch:** revert the helper or set `NEXT_PUBLIC_QR_PUBLIC_HOST=sweatdrop:` and have the helper detect the custom-scheme prefix and emit the old form. (Quick, ugly; only if the new URL form proves catastrophic.)
4. **Beta → Production env:** flip `STORE_REDIRECT_CHANNEL` back to `beta` on the landing-page Vercel project. Single button click in Vercel dashboard.

## Why this is the minimal change

- **Zero database migrations.** Pure transport-layer + routing.
- **One Vercel env var** controls beta vs. production — no rebuilds, no app updates, no sticker reprints to flip channels.
- **Zero changes to in-app business logic.** ScannerScreen, `get_machine_status`, `perform_checkin`, BLE, drops accounting are untouched.
- **Two new mobile route files (+ two backward-compat aliases) + one shared handler.** Total mobile surface area: ~5 files.
- **Six small admin-panel edits** all routed through one helper for future maintenance.
- **Three new entries in two well-known files** (AASA components + Android intent-filter pathPrefixes) — already-tested infrastructure.
- **The unmatched-route bug is fixed as a side-effect** of having real route files for the URL paths the OS hands the app.
- **Already-printed stickers are not invalidated.** The in-app scanner's multi-format parser keeps `sweatdrop://machine/...` and `sweatdrop://checkin/...` working forever.

---

## Agent Dispatch Prompts

### → `landing-page-coder`

```
Read docs/plans/feature_qr_universal_links_stable_print_redirect.md (Step 1 only).

Goal: serve env-aware platform-aware redirects from
https://sweat-drop.com/m/<uuid> and /c/<gymId> so QR stickers work
forever without reprints.

Tasks (in order):

1. Create apps/landing-page/lib/store-redirect.ts with detectPlatform(),
   getChannel(), getStoreUrl(). Read STORE_REDIRECT_CHANNEL,
   NEXT_PUBLIC_TESTFLIGHT_INVITE_URL, NEXT_PUBLIC_PLAY_INTERNAL_TESTING_URL
   from process.env. Hardcode production fallback URLs:
     iOS:     https://apps.apple.com/app/sweatdrop/id<APP_ID>
     Android: https://play.google.com/store/apps/details?id=com.sweatdrop.app

2. Create apps/landing-page/app/m/[uuid]/page.tsx with
     export const dynamic = 'force-dynamic';
     export const metadata = { robots: { index: false, follow: false } };
   The server component reads userAgent from headers(), derives
   platform + channel, and returns either:
     (a) iOS/Android: HTML containing <meta http-equiv="refresh">
         + <script>window.location.replace(STORE_URL)</script>
         + a small fallback page with "Open SweatDrop" + "Get the app" CTAs
     (b) Desktop: a SweatDrop-branded "Get the app" page with both store
         CTAs, no auto-redirect.
   Use the existing landing-page Tailwind theme + GlassCard primitives.

3. Create apps/landing-page/app/c/[gymId]/page.tsx with the same shape.

4. Update apps/landing-page/public/.well-known/apple-app-site-association
   to ADD two entries inside `components`:
     { "/": "/m/*" },
     { "/": "/c/*" }
   Keep existing entries unchanged.

5. Verify:
   - `curl -A 'iPhone' http://localhost:3000/m/00000000-...` returns body
     containing TestFlight URL when STORE_REDIRECT_CHANNEL=beta in
     .env.local (set NEXT_PUBLIC_TESTFLIGHT_INVITE_URL to a placeholder).
   - Same with `STORE_REDIRECT_CHANNEL=production` returns App Store URL.
   - `curl -sI https://www.sweat-drop.com/.well-known/apple-app-site-association`
     in deployed environment still returns 200 + application/json. (No
     middleware changes required — verify only.)
   - Type-check: pnpm --filter sweatdrop-landing-page type-check.

6. Update CHANGELOG.md under [Unreleased] / Added:
   "Landing page: /m/[uuid] and /c/[gymId] env-aware platform-aware
    redirects so QR stickers route to TestFlight / App Store / Play
    Internal / Play Store based on STORE_REDIRECT_CHANNEL without
    sticker reprints. AASA components extended to include /m/* and /c/*."

Do NOT touch apps/admin-panel/, apps/mobile-app/, or backend/supabase/.
```

### → `mobile-coder`

```
Read docs/plans/feature_qr_universal_links_stable_print_redirect.md (Step 2 only).

Goal: add real expo-router routes for QR deep-link paths
(/m/[uuid], /c/[gymId], /machine/[uuid], /checkin/[gymId]),
extract scanner business logic into a shared handler, fix the
"unmatched route after closing scanner" regression.

Tasks (in order):

1. Create apps/mobile-app/lib/qr/handleQrDeepLink.ts exporting
   parseQrPayload() and handleQrDeepLink(). The handler must replicate
   the machine-scan and check-in flows currently inside
   components/ScannerScreen.tsx.handleQRCodeScanned without modifying
   that file. Use router.replace (NEVER router.push) for all final
   navigations so the deep-link route is removed from the stack.

2. Create apps/mobile-app/app/m/[uuid].tsx as documented in Step 2.2.
3. Create apps/mobile-app/app/c/[gymId].tsx (same pattern).
4. Create apps/mobile-app/app/machine/[uuid].tsx and
   apps/mobile-app/app/checkin/[gymId].tsx as backward-compat aliases —
   they parse the legacy sweatdrop:// form and call the same handler.

5. Register the four new screens in apps/mobile-app/app/_layout.tsx
   Stack with options:
     headerShown: false,
     presentation: 'transparentModal',
     animation: 'fade',
     animationDuration: 200,
     gestureEnabled: false,

6. Update _layout.tsx Linking.addEventListener('url', …) handler
   per Step 2.5: route warm-launch sweatdrop:// URLs through the new
   /machine/[uuid] and /checkin/[gymId] routes instead of pushing
   /scan?autoQR=. Keep the cold-start usePendingQRStore behavior
   working so unauthenticated users still get their QR replayed
   post-login.

7. Update apps/mobile-app/app/index.tsx so that when a pendingQR is
   consumed and parsed, it routes to /m/[uuid] or /c/[gymId]
   directly (router.replace) instead of /scan?autoQR=. Fall back to
   the existing /scan?autoQR= path only for malformed URLs.

8. Update apps/mobile-app/app.config.js Android intentFilters: add a
   third VIEW filter with autoVerify=true claiming both hosts and
   pathPrefix '/m/' and '/c/' (see Step 2.6 for exact JSON). Bump
   buildNumber + versionCode per the existing release runbook.

9. Verification scenarios in Step 2.7 — run all of them on iOS sim,
   Android emulator, and at least one physical device per platform.

10. Update CHANGELOG.md under [Unreleased]:
    Added: "Mobile app: dedicated deep-link route handlers (/m, /c,
            /machine, /checkin) with shared handleQrDeepLink module.
            Universal Link / App Link path scopes /m/*, /c/* claimed
            in app.config.js intent filters."
    Fixed: "Closing the in-app scanner after entering via a QR
            deep link no longer surfaces an [...unmatched] route —
            real route files now match all QR deep-link paths."

Do NOT touch apps/admin-panel/, apps/landing-page/, or
backend/supabase/. Do NOT modify ScannerScreen.tsx beyond what is
necessary to use the new shared parseQrPayload helper for the
in-app scan code path (that change is optional for this PR — keep
it minimal).
```

### → `admin-coder`

```
Read docs/plans/feature_qr_universal_links_stable_print_redirect.md (Step 3 only).

Goal: switch every QR-generation surface from sweatdrop://… payloads
to https://sweat-drop.com/m/<uuid> and /c/<gymId>, routed through one
helper.

Tasks:

1. Create apps/admin-panel/lib/qr-urls.ts exporting machineQrUrl() and
   checkinQrUrl(). Read NEXT_PUBLIC_QR_PUBLIC_HOST with a default of
   'https://sweat-drop.com'. Trim env vars (Vercel adds whitespace —
   follow the existing supabase-client.ts pattern).

2. Replace every literal `sweatdrop://machine/${...}` and
   `sweatdrop://checkin/${...}` in:
     - components/modules/MachineDetailView.tsx
     - components/modules/MachinesManager.tsx
     - components/modules/CheckinSettingsModule.tsx
     - app/print-qr/page.tsx
     - app/print-qr/batch/page.tsx
     - components/analytics/MachineFloor.tsx
   …with calls to machineQrUrl(qr_uuid, machine.type) /
   checkinQrUrl(gymId).

3. Verify on /print-qr?type=machine&machineId=<uuid>&machineType=bike:
   - Preview QR encodes https://sweat-drop.com/m/<uuid>?s=csc
   - "Copy link" copies the same URL
   - Print preview is unchanged (BrandedQRCode re-encodes on payload
     change automatically)

4. Type-check: pnpm --filter sweatdrop-admin-panel type-check.

5. Update CHANGELOG.md under [Unreleased] / Changed:
   "Admin panel: QR generation now emits HTTPS Universal/App Link URLs
    (https://sweat-drop.com/m/<uuid>, /c/<gymId>) routed through
    apps/admin-panel/lib/qr-urls.ts. Replaces legacy sweatdrop://
    custom-scheme payloads."

Do NOT touch apps/mobile-app/, apps/landing-page/, or backend/supabase/.
Do NOT modify the BrandedQRCode component — payload changes are
sufficient.
```

---

## Open Follow-ups (Out of Scope)

1. **Deferred deep-linking** (capture QR target during pre-install web flow, replay after install) — only if pilot drop-off data demands it.
2. **Branded `/m/[uuid]` desktop fallback with gym/machine context** — fetch metadata via a new public-safe RPC.
3. **CI smoke test** for AASA + assetlinks.json HTTP-200 + correct Content-Type on both apex and www.
4. **Migrate `ScannerScreen` to the shared `handleQrDeepLink` module** — defer until production-validated.
5. **App-clip / Instant App** experiments for true zero-install QR scan UX.

---

**End of Plan**
