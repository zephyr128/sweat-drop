# Release manifest — 2026-03-27 Vortex Pilot RC1

**Aligned with:** `docs/plans/master_production_vortex_90d_execution_plan.md`  
**Status:** Draft (ready for owner/reviewer sign-off)

---

## 1. Release identity

| Field | Value |
|--------|--------|
| Release name / codename | Vortex Pilot RC1 |
| Target date (UTC) | 2026-03-27 |
| Git tag | TODO |
| Git SHA (full) | `8bff927f1824d9acd9c8305ec80e0fda46c072d5` |
| Release owner | TODO |
| Sign-off (reviewer) | TODO |
| Pilot scope note (e.g. Vortex-only) | Pilot listing locked to pilot-enabled gyms (Vortex-only for launch window) |

---

## 2. iOS (App Store / TestFlight)

| Field | Value |
|--------|--------|
| Bundle ID | `com.sweatdrop.app` |
| Marketing version (`CFBundleShortVersionString`) | TODO |
| Build number (`CFBundleVersion`) | TODO |
| EAS / CI profile used (`development` vs `production`) | `production` |
| Binary artifact link (CI / internal store) | TODO |
| TestFlight build URL (internal) | TODO |
| App Store submission / version URL (if applicable) | TODO |
| APNs: key id / team / env (sandbox vs production) | TODO (prod APNs required) |
| Deep link / universal link domain verified for this build | TODO |

---

## 3. Android (Google Play)

| Field | Value |
|--------|--------|
| Application ID (package) | `com.sweatdrop.app` |
| `versionName` | TODO |
| `versionCode` | TODO |
| Track (internal / closed / open / production) | TODO |
| Staged rollout % (if production) | TODO |
| Play Console release URL (internal) | TODO |
| FCM: project id / service account key location (secret manager ref only; no secrets in repo) | TODO |
| App Links / intent filters verified for this build | TODO |

---

## 4. Admin panel (web)

| Field | Value |
|--------|--------|
| Hosting (e.g. Vercel project) | TODO |
| Production URL | TODO |
| Deployed git SHA (must match release SHA or documented delta) | TODO |
| Branch → environment mapping (`main` → prod per master plan C1) | `main` → production (target policy) |
| `NEXT_PUBLIC_*` snapshot: Supabase URL host only (no keys in doc) | TODO |

---

## 5. Database (Supabase PostgreSQL)

| Field | Value |
|--------|--------|
| Project (e.g. `sweatdrop-prod`) | Production project (ref below) |
| Supabase project ref (short id) | `jzyoyxabcdzvqcfnfzrz` |
| Dashboard URL (internal) | TODO |
| Migrations applied this release (filenames from `backend/supabase/migrations/`) | `20260311130000_add_pilot_gym_visibility_flag.sql`, `20260327120000_perform_checkin_lenient_full_drops_hotfix.sql`, `20260327140000_profiles_email_verified_and_release_compliance.sql`, `20260327150000_referrals_and_friend_challenges_mvp.sql` |
| `MIGRATION_NOTES.md` section updated and committed | Yes |
| Backup snapshot id / time (before cut) | TODO |

---

## 6. Edge functions (Deno / Supabase Functions)

| Function name | Purpose (one line) | Deployed SHA / bundle id | Secrets touched (names only) | Cron / schedule note |
|----------------|-------------------|---------------------------|--------------------------------|----------------------|
| `send-push` | Push dispatch v2 with structured metrics | TODO | `SUPABASE_SERVICE_ROLE_KEY` (runtime), Expo auth header | N/A |
| `re-engagement` | Re-engagement campaign pushes | TODO | uses `send-push` | Scheduled |
| `streak-reminder` | Streak reminder pushes | TODO | uses `send-push` | Scheduled |
| `drops-expiry-warning` | Drops expiry warning pushes | TODO | uses `send-push` | Scheduled |
| `send-happy-hour-reminders` | Happy hour reminder pushes | TODO | uses `send-push` | Scheduled |
| `distribute-leaderboard-prizes` | Leaderboard prize push notifications | TODO | uses `send-push` | Scheduled |
| `finalize-arena` | Arena finalize and participant notifications | TODO | uses `send-push` | Scheduled |
| `notify-arena-participants` | Arena participant notifications | TODO | uses `send-push` | Event-driven |

---

## 7. Feature flags and pilot configuration

| Flag / config | Location (DB column, remote config, env) | Value for this release | Owner |
|----------------|------------------------------------------|-------------------------|--------|
| Mobile gym listing | DB `gyms.is_mobile_listed` | Enabled for listed gyms | supabase-dba + mobile-coder |
| Push enabled | Mobile env (`.env` + EAS build env) | `EXPO_PUBLIC_PUSH_ENABLED=true` | mobile-coder |
| EAS project id | Mobile env (`.env` + EAS build env) | configured | mobile-coder |

---

## 8. Secrets and third parties (inventory only)

| Secret / integration | Env (dev/prod) | Store (1Password / Vault / Supabase secrets / etc.) | Verified for this release |
|----------------------|----------------|------------------------------------------------------|---------------------------|
| Supabase service role / anon (per app) | dev + prod | TODO | TODO |
| Mail provider (staff / ops email) | dev + prod | TODO | TODO |
| Push: APNs key, FCM credentials | prod required | Expo/EAS credentials + secret store | TODO |
| Signing: iOS certs / Android upload key | prod required | App Store Connect / Play App Signing | TODO |

---

## 9. Gates (go / no-go)

| Gate | Status (green / red) | Evidence link or note |
|------|----------------------|------------------------|
| G1 Platform safety | green | `pnpm test:release-preflight`, `pnpm type-check` |
| G2 Product reliability | green | `pnpm test:smoke`, `pnpm test:ci` |
| G3 Pilot readiness | green | Pilot gym migration + mobile pilot filter enabled |
| G4 Operational readiness | green | Go-live checklist + cutover command sheet present |
| G5 Store + compliance | pending | Store submission + final APNs/FCM prod verification pending |

---

## 10. Rollback quick links

- Wrong environment / client pointing at wrong Supabase: `docs/release/INCIDENT_ROLLBACK_QUICKSHEET.md`
- Push credential or delivery failure: `docs/release/INCIDENT_ROLLBACK_QUICKSHEET.md`
- Day-of sequencing: `docs/release/GO_LIVE_DAY_OF_CHECKLIST.md`
- Command execution sheet: `docs/release/PRODUCTION_CUTOVER_COMMANDS.md`

---

## 11. Post-release

| Window | Action | Owner |
|--------|--------|--------|
| T+4h | Smoke + metric spot-check | TODO |
| T+24h | Soak review; incident log empty or triaged | TODO |
| Week 1 | Monitoring plan per master plan deliverables | TODO |
