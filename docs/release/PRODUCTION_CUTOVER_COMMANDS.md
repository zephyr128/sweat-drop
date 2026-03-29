# Production Cutover Commands (Operator Sheet)

**Purpose:** Exact command sequence for release window execution.  
**Use with:** `GO_LIVE_DAY_OF_CHECKLIST.md`, `RELEASE_MANIFEST_TEMPLATE.md`.

---

## 0) Pre-window sanity

Run from repo root:

```bash
pnpm test:release-preflight
pnpm type-check
pnpm test:smoke
pnpm test:ci
```

Expected: all pass, no gate regressions.

---

## 1) Database (Supabase prod)

From `backend/`:

```bash
supabase link --project-ref <PROD_PROJECT_REF>
supabase migration list
supabase db push --dry-run --include-all
supabase db push --include-all --yes
supabase migration list
```

Evidence to attach in manifest:
- migration list before/after
- applied migration IDs

---

## 2) Edge functions (prod)

From `backend/`:

```bash
supabase functions deploy send-push
supabase functions deploy re-engagement
supabase functions deploy streak-reminder
supabase functions deploy drops-expiry-warning
supabase functions deploy send-happy-hour-reminders
supabase functions deploy distribute-leaderboard-prizes
supabase functions deploy finalize-arena
supabase functions deploy notify-arena-participants
```

If your release changes more functions, deploy all changed functions from the release manifest.

---

## 3) Admin panel deployment (prod)

Use your hosting pipeline (Vercel/CI) and record:
- deploy id
- commit SHA
- environment name (`production`)

Post-deploy quick checks:
- superadmin login
- gym owner login
- receptionist scope boundaries

---

## 4) Mobile builds (store tracks)

From repo root:

```bash
pnpm --filter sweatdrop-mobile-app exec eas build --platform ios --profile production
pnpm --filter sweatdrop-mobile-app exec eas build --platform android --profile production
```

Then:
- submit iOS build to TestFlight/App Store Connect
- submit Android AAB to Play Console (internal/closed first)

Record in manifest:
- iOS version + build number
- Android versionName + versionCode
- build artifact URLs/IDs

---

## 5) Production push verification

After store-distributed or prod-profile binaries are installed:

1) Confirm token registration in prod DB:
- token exists for test users/devices
- mapped to correct user IDs

2) Send direct test push through `send-push`:
- 1 iOS token
- 1 Android token

3) Confirm delivery + deep-link behavior:
- foreground
- background tap
- cold start tap

4) Inspect edge logs for:
- `receipt_ok > 0`
- no APNs/FCM credential errors

---

## 6) Rollout decision gate

Proceed to staged rollout only if:
- auth/check-in/session/redeem smoke passes on release build
- push pass on both platforms
- no P0/P1 blockers

If any fail: stop promotion and execute `INCIDENT_ROLLBACK_QUICKSHEET.md`.

---

## 7) T+4h / T+24h follow-up commands

```bash
pnpm test:smoke
pnpm test:ci
```

Plus runtime monitoring from dashboards/logs (crashes, auth failures, push failures, check-in anomalies).
