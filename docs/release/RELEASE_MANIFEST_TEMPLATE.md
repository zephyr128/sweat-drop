# Release manifest (template)

**Aligned with:** `docs/plans/master_production_vortex_90d_execution_plan.md` (Workstream G3, F3).  
**Purpose:** Single source of truth for a pilot or production cut: what shipped, where it runs, and how to roll back.

Copy this file per release (e.g. `docs/release/manifests/2026-03-27_vortex_pilot_rc1.md`) and fill every section before go/no-go.

---

## 1. Release identity

| Field | Value |
|--------|--------|
| Release name / codename | |
| Target date (UTC) | |
| Git tag | |
| Git SHA (full) | |
| Release owner | |
| Sign-off (reviewer) | |
| Pilot scope note (e.g. Vortex-only) | |

**Related plans / runbooks:**

- Master plan: `docs/plans/master_production_vortex_90d_execution_plan.md`
- Env split: `docs/plans/production_env_split_dev_prod_runbook.md`
- Store release: `docs/plans/mobile_store_release_ios_android_runbook.md`
- Push: `docs/plans/production_push_notifications_runbook.md`
- QA / go-live: `docs/plans/production_qa_and_go_live_runbook.md`
- Legal / compliance: `docs/plans/legal_privacy_terms_mobile_compliance_checklist.md`
- Migration audit trail: `MIGRATION_NOTES.md` (repo root)

---

## 2. iOS (App Store / TestFlight)

| Field | Value |
|--------|--------|
| Bundle ID | |
| Marketing version (`CFBundleShortVersionString`) | |
| Build number (`CFBundleVersion`) | |
| EAS / CI profile used (`development` vs `production`) | |
| Binary artifact link (CI / internal store) | |
| TestFlight build URL (internal) | |
| App Store submission / version URL (if applicable) | |
| APNs: key id / team / env (sandbox vs production) | |
| Deep link / universal link domain verified for this build | |

**Rollback / halt:**

- [ ] App Store phased release % documented (if production)
- [ ] Procedure to pause rollout / submit hotfix: see store runbook + `GO_LIVE_DAY_OF_CHECKLIST.md`

---

## 3. Android (Google Play)

| Field | Value |
|--------|--------|
| Application ID (package) | |
| `versionName` | |
| `versionCode` | |
| Track (internal / closed / open / production) | |
| Staged rollout % (if production) | |
| Play Console release URL (internal) | |
| FCM: project id / service account key location (secret manager ref only; no secrets in repo) | |
| App Links / intent filters verified for this build | |

**Rollback / halt:**

- [ ] Halt staged rollout steps documented
- [ ] Prior stable versionCode noted for rollback preference

---

## 4. Admin panel (web)

| Field | Value |
|--------|--------|
| Hosting (e.g. Vercel project) | |
| Production URL | |
| Deployed git SHA (must match release SHA or documented delta) | |
| Branch → environment mapping (`main` → prod per master plan C1) | |
| `NEXT_PUBLIC_*` snapshot: Supabase URL host only (no keys in doc) | |

**Rollback:**

- [ ] Prior production deployment id / URL documented
- [ ] Redeploy previous artifact steps: platform dashboard + git revert policy

---

## 5. Database (Supabase PostgreSQL)

| Field | Value |
|--------|--------|
| Project (e.g. `sweatdrop-prod`) | |
| Supabase project ref (short id) | |
| Dashboard URL (internal) | |
| Migrations applied this release (filenames from `backend/supabase/migrations/`) | |
| `MIGRATION_NOTES.md` section updated and committed | |
| Backup snapshot id / time (before cut) | |

**Rollback:**

- [ ] Forward-only migration? Y/N — if N, down migration / restore path documented
- [ ] Link to DBA rollback rehearsal notes (date + owner)

---

## 6. Edge functions (Deno / Supabase Functions)

List every function deployed or materially changed for this release.

| Function name | Purpose (one line) | Deployed SHA / bundle id | Secrets touched (names only) | Cron / schedule note |
|----------------|-------------------|---------------------------|--------------------------------|----------------------|
| | | | | |
| | | | | |

**Rollback:**

- [ ] Prior function bundle redeploy procedure (Supabase CLI / dashboard)
- [ ] Cron jobs disabled/enabled checklist if behavior changes

---

## 7. Feature flags and pilot configuration

| Flag / config | Location (DB column, remote config, env) | Value for this release | Owner |
|----------------|------------------------------------------|-------------------------|--------|
| Pilot gym visibility (e.g. `is_pilot_enabled` / listing filter) | | | supabase-dba + mobile-coder |
| Other kill switches / limits | | | |

**Validation artifact:**

- [ ] Fresh-install gym list matches pilot policy (Vortex-only per master plan D2)

---

## 8. Secrets and third parties (inventory only)

Do **not** paste secret values. Record **where** each secret lives and **who** rotated it for this release.

| Secret / integration | Env (dev/prod) | Store (1Password / Vault / Supabase secrets / etc.) | Verified for this release |
|----------------------|----------------|------------------------------------------------------|---------------------------|
| Supabase service role / anon (per app) | | | |
| Mail provider (staff / ops email) | | | |
| Push: APNs key, FCM credentials | | | |
| Signing: iOS certs / Android upload key | | | |

---

## 9. Gates (go / no-go) — copy outcome

Reference: master plan **Go/No-Go Gates G1–G5**.

| Gate | Status (green / red) | Evidence link or note |
|------|----------------------|------------------------|
| G1 Platform safety | | |
| G2 Product reliability | | |
| G3 Pilot readiness | | |
| G4 Operational readiness | | |
| G5 Store + compliance | | |

**Production-hardener rule:** any red gate ⇒ **No-Go** until resolved and re-manifested.

---

## 10. Rollback quick links

| Scenario | Primary doc |
|----------|-------------|
| Wrong environment / client pointing at wrong Supabase | `INCIDENT_ROLLBACK_QUICKSHEET.md` §1 |
| Push credential or delivery failure | `INCIDENT_ROLLBACK_QUICKSHEET.md` §2 |
| Day-of sequencing | `GO_LIVE_DAY_OF_CHECKLIST.md` |
| DB migration rollback rehearsal | `MIGRATION_NOTES.md` + DBA notes |

---

## 11. Post-release

| Window | Action | Owner |
|--------|--------|--------|
| T+4h | Smoke + metric spot-check | |
| T+24h | Soak review; incident log empty or triaged | |
| Week 1 | Monitoring plan per master plan deliverables | |

---

**Workspace ownership (from master plan):** `supabase-dba`, `mobile-coder`, `admin-coder`, `edge-function-agent`, `reviewer`, `release-owner`, `test-automation-agent`.
