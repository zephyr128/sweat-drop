# Incident rollback quicksheet

**Aligned with:** `docs/plans/master_production_vortex_90d_execution_plan.md` (C1 env split, I1 push credentials, G3 staged rollout).  
**Use when:** You need fast containment, not a full root-cause write-up (that comes after).

**Related:** `docs/release/RELEASE_MANIFEST_TEMPLATE.md`, `docs/plans/production_env_split_dev_prod_runbook.md`, `docs/plans/production_push_notifications_runbook.md`.

---

## How to use this doc

1. Assign **incident commander** (rotates): owns timeline, comms, go/no-go on rollback.
2. **Contain first** (stop bleeding), then **verify** (confirm fix), then **communicate**.
3. Record actions in your incident channel with timestamps.

---

## 1. Wrong-environment wiring (client, admin, or function points at wrong Supabase / secrets)

### Symptoms

- Data appearing in the “wrong” project (e.g. pilot traffic in dev DB, or dev testers creating rows in prod).
- RLS errors spikes only on one platform (mobile vs admin) — often mismatched URL/keys.
- Edge function logs show project ref / JWT `aud` that does not match intended env.
- New prod build still hitting `*.supabase.co` host that matches **dev** project ref.

### Immediate containment (order may be parallelized)

| Step | Action | Owner |
|------|--------|--------|
| 1 | **Stop** further promotion: halt staged store rollout; pause admin deploy pipeline if mid-flight | release-owner |
| 2 | Identify **which surface** is wrong: mobile (`EXPO_PUBLIC_*`), admin (`NEXT_PUBLIC_*`), edge function secrets, or CI injected vars | mobile-coder / admin-coder / edge-function-agent |
| 3 | If **prod secrets may have been exposed** in a dev artifact or log: rotate Supabase anon (and service role if leaked) in **affected** project; redeploy clients/functions that embedded old values | supabase-dba |
| 4 | Mark affected builds in manifest as **do not distribute**; prepare corrected build or config-only redeploy | release-owner |

### Verification checklist

- [ ] Mobile prod binary: Supabase URL hostname matches **production** project (compare to manifest / dashboard).
- [ ] Admin prod deployment: same production URL; no preview deployment accidentally receiving prod keys.
- [ ] Edge functions in prod: `SUPABASE_URL` and keys reference **prod** project only.
- [ ] Run one **read-only** sanity query from each client against expected project (e.g. feature flag row count) — do not use destructive tests on prod.

### Rollback options

| Option | When to use | Rough steps |
|--------|-------------|-------------|
| **A. Redeploy config** | Wrong env var in hosting (Vercel / EAS env / Supabase secrets) only | Fix secret → redeploy same artifact → re-verify smoke |
| **B. Roll back admin** | Bad deploy with correct secrets hard to untangle | Redeploy **previous** known-good deployment id from host dashboard |
| **C. Roll back mobile** | Store build baked wrong URL (rare if using env at build time) | Halt rollout; submit previous build or hotfix with correct `app.config` / EAS profile |
| **D. DB** | Migrations applied to wrong project | **Do not** apply “fix” migrations blindly — restore from backup or forward-fix with DBA; document in `MIGRATION_NOTES.md` |

### Post-incident (within 48h)

- [ ] CI guard: fail build if prod URL pattern appears in dev profile or vice versa (if not already).
- [ ] Update `RELEASE_MANIFEST_TEMPLATE.md` instance for this release with “what went wrong” appendix.
- [ ] Wrong-env test added to recurring release checklist (`GO_LIVE_DAY_OF_CHECKLIST.md` T-24h).

---

## 2. Push credential failure (APNs / FCM / Expo push path)

### Symptoms

- Edge function or push pipeline logs: **401 / 403**, “BadDeviceToken”, “InvalidProviderToken”, “MismatchSenderId”, or auth errors to Apple/Google.
- Sudden **100%** or near-100% failure for new notifications while older tokens might still work (depends on breakage).
- iOS: works in dev but **not** on TestFlight/App Store build (often sandbox vs production APNs, wrong key, or wrong bundle id).
- Android: FCM project mismatch between app `google-services.json` / Expo config and server credential.

### Immediate containment

| Step | Action | Owner |
|------|--------|--------|
| 1 | **Reduce blast radius:** disable or pause scheduled push campaigns / crons that retry in a tight loop (if your ops model allows) | edge-function-agent |
| 2 | Confirm **which environment** fails (prod only vs all) | edge-function-agent |
| 3 | Check secret **names** in prod (not values in chat): APNs key id, team id, bundle id, FCM service account attachment | edge-function-agent + mobile-coder |
| 4 | If credentials **compromised or rotated**: revoke old keys in Apple/Google console; install new secrets in Supabase (or host); redeploy `send-push` and related functions | supabase-dba + edge-function-agent |

### Diagnosis shortcuts (non-destructive)

- [ ] One **manual** test send to a **known** device token from prod function logs (follow `production_push_notifications_runbook.md`).
- [ ] Compare mobile build’s bundle id / application id with APNs key’s allowed app id and FCM project.
- [ ] Confirm prod binary uses **production** APNs environment (not sandbox-only key misuse on store build).

### Rollback / recovery paths

| Situation | Recovery |
|-----------|----------|
| Wrong secret in prod only | Upload correct secret → redeploy functions → single-device verification → resume crons |
| Bad deploy broke push code | Redeploy **previous** function bundle from known-good SHA |
| iOS key / profile mismatch | Fix Apple Developer configuration; may require **new** app build if entitlement/bundle issue |
| Android FCM project mismatch | Align `google-services.json` (or Expo config) with server credential **or** create matching server key in correct Firebase project |
| Cannot fix within SLO | Leave transactional email / in-app messaging if available; **communicate** degraded push to stakeholders; track backlog item |

### Do not

- Paste private keys or service account JSON into Slack, tickets, or this repo.
- “Fix” by pointing prod app at dev Firebase/APNs project — that violates env isolation (master plan C1).

### Post-incident

- [ ] Document root cause class: credential expiry, rotation miss, wrong env, bundle id drift, Expo credential sync.
- [ ] Add a line item to next release manifest §6 (functions) and §8 (secrets) for push verification signoff.
- [ ] Extend push matrix in `production_push_notifications_runbook.md` if a new failure mode was discovered.

---

## Escalation matrix

| Role | Responsibility |
|------|----------------|
| **supabase-dba** | Project refs, keys rotation, RLS, migrations, backups |
| **edge-function-agent** | Function deploy, logs, cron, push/mail integration |
| **mobile-coder** | Client env, EAS profiles, token registration lifecycle |
| **admin-coder** | Admin env, role scope, desk ops breakage |
| **release-owner** | Store halt, comms, manifest truth |
| **reviewer** | Go/no-go after containment, security implications |

---

## Quick reference links (repo)

| Document | Path |
|----------|------|
| Release manifest template | `docs/release/RELEASE_MANIFEST_TEMPLATE.md` |
| Day-of checklist | `docs/release/GO_LIVE_DAY_OF_CHECKLIST.md` |
| Env split runbook | `docs/plans/production_env_split_dev_prod_runbook.md` |
| Push runbook | `docs/plans/production_push_notifications_runbook.md` |
| Store release | `docs/plans/mobile_store_release_ios_android_runbook.md` |
| Migration notes | `MIGRATION_NOTES.md` |
