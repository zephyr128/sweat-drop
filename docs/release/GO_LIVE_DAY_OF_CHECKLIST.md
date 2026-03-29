# Go-live day-of checklist (T-24h / T-2h / T+4h / T+24h)

**Aligned with:** `docs/plans/master_production_vortex_90d_execution_plan.md` (Day 14, Gates G1–G5, Workstream F3).  
**Companion:** Fill `RELEASE_MANIFEST_TEMPLATE.md` for this cut before using this checklist.
**Operator commands:** `PRODUCTION_CUTOVER_COMMANDS.md`

**Principles:** No production promotion with open P0s; dev/prod isolation verified; rollback rehearsed and owners named.

---

## Preconditions (before T-24h)

- [ ] Release manifest started from `docs/release/RELEASE_MANIFEST_TEMPLATE.md` with git SHA, builds, migrations, and function list.
- [ ] `MIGRATION_NOTES.md` reflects migrations applied to **production** project (not only dev).
- [ ] On-call roster and escalation path published (Slack / Pager / phone tree).
- [ ] Comms channel for release window (e.g. `#release-YYYY-MM-DD`) created.

**Reference runbooks:**

- `docs/plans/production_env_split_dev_prod_runbook.md`
- `docs/plans/production_qa_and_go_live_runbook.md`
- `docs/plans/mobile_store_release_ios_android_runbook.md`
- `docs/plans/production_push_notifications_runbook.md`

---

## T-24h — freeze, verify, rehearse

**Goal:** Scope locked; environments and credentials match the manifest; rollback is credible.

| # | Task | Owner role | Done |
|---|------|------------|------|
| 1 | Code freeze for release branch / tag; only blocker fixes with second reviewer | reviewer | |
| 2 | Re-run go/no-go gates G1–G5; document green/red in manifest | reviewer | |
| 3 | Confirm mobile **prod** builds use **prod** Supabase URL/anon key (host matches `sweatdrop-prod` or your prod project) | mobile-coder | |
| 4 | Confirm admin **prod** deployment uses same prod Supabase as mobile | admin-coder | |
| 5 | Wrong-env write test: dev binary must not write to prod (or document negative test outcome) | test-automation-agent | |
| 6 | DB: backup verified; migration list matches `backend/supabase/migrations/` applied to prod | supabase-dba | |
| 7 | Edge functions: deploy list matches manifest; cron schedules are **prod**-appropriate | edge-function-agent | |
| 8 | Push: APNs (prod) + FCM credentials loaded in **prod** secrets; test send scheduled post-cut | edge-function-agent + mobile-coder | |
| 9 | Legal URLs in app + store listings match checklist | reviewer | |
| 10 | Rollback rehearsal completed once this quarter (or note date); link evidence in manifest | supabase-dba + release-owner | |

**Incident prep:**

- [ ] `INCIDENT_ROLLBACK_QUICKSHEET.md` bookmarked for on-call
- [ ] Ability to halt staged store rollout confirmed (iOS / Android consoles)

---

## T-2h — final checks, comms, go decision

**Goal:** Binary and web are the intended artifacts; team is aligned; explicit go/no-go.

| # | Task | Owner role | Done |
|---|------|------------|------|
| 1 | Manifest complete: iOS build #, Android versionCode, admin deploy id, migrations, functions | release-owner | |
| 2 | Smoke on **production-like** build (TestFlight / Play internal or closed) in last 24h — auth, check-in, drops, redeem | test-automation-agent | |
| 3 | Pilot gym listing: fresh install shows only pilot-enabled gyms (e.g. Vortex) | mobile-coder | |
| 4 | P0 count = 0; P1 blockers either fixed or explicitly waived with named approver | reviewer | |
| 5 | Announce freeze end time and rollback trigger (crash spike, auth spike, push failure spike) to channel | release-owner | |
| 6 | On-call handoff: primary + secondary named; Supabase dashboard access verified | release-owner | |

**Go / No-Go:** Single decision recorded in manifest §9 (all gates green ⇒ Go).

---

## T0 — cutover window (execute per your runbook)

Execute steps from `production_qa_and_go_live_runbook.md` and store runbooks. Typical sequence (adjust to your pipeline):

1. Apply pending DB migrations to prod (if not already).
2. Deploy edge functions to prod.
3. Deploy admin to prod.
4. Promote mobile via store tracks (staged % per policy).
5. Verify health endpoints / logs / first user smoke.

Check each box in your platform runbook; do not duplicate full procedures here.

---

## T+4h — smoke, signals, stability

**Goal:** Early detection of wrong-env, auth, check-in, drops, push, or admin regressions.

| # | Task | Owner role | Done |
|---|------|------------|------|
| 1 | Core journey smoke on **store or TF track build** (not only dev client): login, check-in, session, drops, redeem | test-automation-agent | |
| 2 | Push: at least one device per OS receives a test notification (prod credentials) | mobile-coder | |
| 3 | Edge function logs: error rate vs baseline; push send failures not spiking | edge-function-agent | |
| 4 | Admin: receptionist and gym_owner scopes still block cross-gym leakage | admin-coder | |
| 5 | If staged rollout: crash / ANR / auth metrics within threshold; else halt rollout per manifest | release-owner | |
| 6 | Incident log: any sev-1/2 triaged with link to `INCIDENT_ROLLBACK_QUICKSHEET.md` if rollback considered | on-call | |

---

## T+24h — soak, manifest closeout, retrospective

**Goal:** Confirm pilot operations do not require engineering firefighting; document learnings.

| # | Task | Owner role | Done |
|---|------|------------|------|
| 1 | Review monitoring / alerts for drops, check-in, redeem, push (per master plan F1) | supabase-dba + admin-coder | |
| 2 | Update manifest with actual store URLs, final rollout %, and any hotfix SHAs | release-owner | |
| 3 | Confirm no silent wrong-env reports (support / staff / logs) | reviewer | |
| 4 | Short retro: what to automate next release (CI env checks, manifest generation) | reviewer | |
| 5 | Week-1 monitoring plan owner confirmed (master plan deliverables) | release-owner | |

---

## Rollback triggers (immediate)

Stop promotion and open incident if any of the following are sustained or clearly user-impacting:

- Auth or session failure spike vs baseline
- Check-in or drops minting errors indicating server/RLS misdeploy
- Push **credential** errors (401/403 to APNs/FCM) or mass invalid token pattern
- Evidence of **prod** traffic from **dev** builds or reversed (wrong Supabase host in client)

Use `INCIDENT_ROLLBACK_QUICKSHEET.md` for containment steps.

---

**Workspace ownership:** `release-owner`, `reviewer`, `supabase-dba`, `mobile-coder`, `admin-coder`, `edge-function-agent`, `test-automation-agent`.
