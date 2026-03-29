# SWEATDROP Master Production Plan (Vortex 90d Pilot)

**Date:** 2026-03-11  
**Owner:** Architect  
**Scope:** Production readiness for one-gym pilot (Vortex), while preserving multi-gym architecture for later scale.

## Context

This plan operationalizes launch-critical work requested by product leadership:
- mobile auth and UX hardening,
- social growth features (invite friend, 1v1 challenges),
- admin mailer and desk operations,
- strict dev/prod environment separation,
- DB cleanup for MVP focus,
- Vortex-only pilot launch behavior,
- premium and practical QR rollout.
- app store and play store production release process.
- legal and compliance readiness (Terms, Privacy, consent surfaces).
- production-grade push notification readiness and verification.

The goal is to close all production blockers in days, not weeks, with clear execution ownership and release gates.

## Execution Progress (Live)

- `2026-03-27`: Remote Supabase migrations synced (`supabase db push --include-all --yes`), including pilot gym visibility, check-in hotfix, profile compliance columns, and referrals/friend-challenges MVP.
- `2026-03-27`: Release gates green locally:
  - `pnpm test:release-preflight`
  - `pnpm type-check`
  - `pnpm test:smoke`
  - `pnpm test:ci`
- `2026-03-27`: Mobile auth hardening extended with mandatory legal consent on auth entry (Terms + Privacy acceptance required before sign-in), with acceptance timestamps persisted to `profiles`.
- `2026-03-27`: Added release operator sheet `docs/release/PRODUCTION_CUTOVER_COMMANDS.md` and wired it into checklist + automated artifact verification.

## Dependencies (Must Exist Before Execution)

- Existing anti-abuse plan: `docs/plans/production_anti_abuse_hardening_plan.md`
- Existing QA/runbook plan: `docs/plans/production_qa_and_go_live_runbook.md`
- Existing production baseline: `docs/plans/production_readiness_master_plan.md`
- Existing push + staff/email/checkin migrations in `MIGRATION_NOTES.md` marked applied in dev.
- Existing QA and smoke harness from `docs/plans/production_test_plan.md`.
- Published web URLs for legal docs (Privacy Policy + Terms of Service).
- Store release runbook: `docs/plans/mobile_store_release_ios_android_runbook.md`
- Push runbook: `docs/plans/production_push_notifications_runbook.md`
- Legal checklist: `docs/plans/legal_privacy_terms_mobile_compliance_checklist.md`

## Production Principles (Locked)

1. Server is source of truth for rewards, eligibility, and anti-fraud decisions.
2. Every launch-critical flow must pass an E2E smoke test in dev and prod-like staging.
3. Dev and prod must be isolated across DB, secrets, storage, edge functions, and app builds.
4. Pilot constraints (Vortex-only) are controlled by configuration flags, not one-off manual hacks.
5. No feature ships without rollback notes and measurable success criteria.
6. Mobile release is not complete until both store review and post-install production checks pass.
7. Legal surfaces (privacy/terms/consent) must be available in-app and in both store listings.

---

## Workstream A - Mobile Auth + Premium UX + Social Growth

### A1. Auth Reliability (Email + Google + Apple)
**Workspace:** `apps/mobile-app`, `backend/supabase`  
**Owners:** mobile-coder, supabase-dba, reviewer

#### Tasks
1. Normalize auth pathways into one post-login identity resolver (no duplicate profile creation).
2. Email login policy decision:
   - Option 1: verified magic link only, or
   - Option 2: OTP code entry in app.
   Lock one path and remove ambiguous mixed UX.
3. Enforce email verification gate before app unlock if provider is `email`.
4. Add account-linking guardrails:
   - same email across Apple/Google/email resolves to same profile,
   - explicit merge handling if legacy duplicate exists.
5. Add auth recovery flows:
   - re-send verification,
   - session expired recovery,
   - offline-safe auth messaging.

#### Data/API Contract
- `profiles.email_verified_at` (or Supabase auth metadata equivalent) must be checked client + server side.
- Mobile auth bootstrap endpoint/hook returns:
  - `isVerified`,
  - `providersLinked[]`,
  - `mustCompleteOnboarding`.

#### Validation
- New user matrix: email, Apple, Google.
- Existing user matrix: re-login with same and different provider.
- Duplicate account prevention verified with seeded conflict scenarios.

---

### A2. Mobile Home/Profile UX Redefinition
**Workspace:** `apps/mobile-app`  
**Owners:** mobile-coder, reviewer

#### Tasks
1. Home screen information architecture:
   - keep only core cards (drops progress, active challenge, quick actions, upcoming reward),
   - remove redundant or duplicate informational cards.
2. Profile page structure:
   - identity block (name, email, gym),
   - progress block (streak, total earned, tier),
   - settings block (notifications, privacy, language),
   - support/legal block.
3. Introduce lightweight in-app onboarding hints for first-time users (tooltips or first-run cards).
4. Ensure performance budget:
   - no heavy queries on initial mount,
   - skeleton loading for all remote sections.

#### Validation
- 5-second usability test: gym owner/receptionist can explain each section without training.
- Render and interaction smoothness on older iPhone devices.

---

### A3. Invite Friend (Referral with Real Conversion)
**Workspace:** `apps/mobile-app`, `backend/supabase`, `apps/admin-panel`  
**Owners:** mobile-coder, supabase-dba, admin-coder

#### Product Rules (Locked)
- Referrer gets drops only when invited friend completes:
  1) first valid gym check-in, and  
  2) first valid redemption.
- One invitee can reward only one referrer.
- Fraud protections: self-invite, same-device abuse, and same-phone-number loops blocked.

#### Data Model
- New table: `referrals`
  - `referrer_user_id`, `invitee_user_id`, `invite_code`, `status`,
  - `qualified_checkin_at`, `qualified_redemption_at`, `rewarded_at`, `reward_tx_id`.
- Indexes on `invite_code`, `referrer_user_id`, `invitee_user_id`.

#### API Contract
- `create_referral_invite()`
- `apply_referral_code()`
- `evaluate_referral_qualification()`

#### Validation
- Happy path and all abuse paths (self referral, duplicate redemption trigger, multi-account same device).

---

### A4. Challenge Friend (1v1)
**Workspace:** `apps/mobile-app`, `backend/supabase`  
**Owners:** mobile-coder, supabase-dba

#### Supported Match Types (MVP)
- `drops_race`
- `streak_race`
- `sessions_race`

#### Data Model
- `friend_challenges`
  - challenger, opponent, type, target, start/end, status, winner
- `friend_challenge_progress`
  - per-user progress snapshots

#### Rules
- Duration presets: 3d, 7d, 14d.
- Tie handling: exact tie => split reward or no winner (configurable; lock one).
- Rewards are capped and abuse-safe (cannot exceed daily/weekly policy).

#### Validation
- Start/accept/decline/expire flows.
- Date boundary correctness (`>= start_date`) as already enforced in challenge fixes.

---

## Workstream B - Admin Panel Ops + Mailer + Role Safety

### B1. Mailer Integration (Staff Invite + Operational Email)
**Workspace:** `apps/admin-panel`, `backend/supabase/functions`  
**Owners:** admin-coder, edge-function-agent, reviewer

#### Tasks
1. Adopt one provider (Resend/SendGrid/Postmark) and standardize templates.
2. Ensure staff invite lifecycle is complete:
   - send, resend, expire, cancel, accept.
3. Add operational observability in admin:
   - delivery status badge,
   - error tooltip,
   - retry action with limit.
4. Add provider fallback strategy (retry once, then fail with actionable reason).

#### API Contract
- `send-staff-invitation-email` input/output schema is versioned (`v1` payload).
- `mark_staff_invitation_email_delivery` remains source of truth in DB.

#### Validation
- Delivery success in dev/prod,
- bounced/failed path,
- idempotent resend behavior.

---

### B2. Admin UX for Pilot Operations
**Workspace:** `apps/admin-panel`  
**Owners:** admin-coder, reviewer

#### Tasks
1. Preserve premium dashboard principles (clean KPI, no clutter, meaningful activity feed).
2. Ensure receptionist scope is locked and tested:
   - no access outside desk/checkin/store queue/activity.
3. Add pilot control panel:
   - pilot start/end date,
   - Vortex pilot status,
   - quick links for daily operations.

#### Validation
- Role-based route tests (superadmin, gym_owner, receptionist).
- No broken navigation or "view all" misroutes.

---

## Workstream C - Environment Split (Dev vs Production)

### C1. Environment Architecture
**Workspace:** all (admin, mobile, supabase, CI/CD)  
**Owners:** supabase-dba, admin-coder, mobile-coder, reviewer

#### Tasks
1. Two Supabase projects:
   - `sweatdrop-dev`,
   - `sweatdrop-prod`.
2. Separate secrets per environment:
   - Supabase URL/keys,
   - mail provider keys,
   - push credentials,
   - signing credentials.
3. Branch mapping:
   - `develop` deploys to dev,
   - `main` deploys to production.
4. Separate mobile build profiles:
   - dev profile (internal testing),
   - prod profile (App Store/TestFlight).
5. Edge function deployment isolation:
   - no shared secrets,
   - environment-specific cron schedules.

#### Validation
- "Wrong env write" test: dev app must never write to prod DB.
- CI check that blocks merge if env variables are missing/inconsistent.

---

## Workstream D - DB Cleanup + MVP Focus (Vortex Pilot)

### D1. Schema Cleanup Strategy (Safe)
**Workspace:** `backend/supabase`  
**Owners:** supabase-dba, reviewer

#### Rules
- No destructive drop before backup + impact report.
- Prefer phase approach:
  1) mark deprecated,
  2) stop reads/writes,
  3) archive,
  4) remove.

#### Tasks
1. Inventory all tables/functions/views into:
   - `keep_now`,
   - `deprecate_post_pilot`,
   - `remove_before_launch`.
2. SmartCoach scope:
   - disable from active paths (if not already),
   - move non-MVP objects to deprecate list, not immediate hard-delete unless zero dependency.
3. Add DB documentation artifact: "MVP Active Surface" (tables + RPCs used in pilot).

#### Validation
- No runtime query references to removed/deprecated objects.
- Migration rollback tested.

---

### D2. Vortex-only Pilot Data Policy
**Workspace:** `backend/supabase`, `apps/mobile-app`, `apps/admin-panel`  
**Owners:** supabase-dba, mobile-coder, admin-coder

#### Product Rules (Locked)
- Multi-gym architecture remains.
- Pilot-visible enabled gym list shows Vortex only.
- Existing non-Vortex data can remain archived or hidden, but not exposed to pilot users.

#### Tasks
1. Add `gyms.is_pilot_enabled` flag (or equivalent feature flag in existing config system).
2. Mobile gym listing query must filter by pilot-enabled in pilot mode.
3. Admin view for superadmin to toggle pilot-enabled gyms.
4. Add end-of-pilot switch plan (expand to more gyms without schema rewrite).

#### Validation
- Fresh install sees only Vortex in pilot mode.
- Existing users cannot accidentally switch to disabled gyms.

---

## Workstream E - QR Production Rollout (Premium + Affordable)

### E1. QR Design and Print Standards
**Workspace:** `apps/admin-panel`, Ops docs  
**Owners:** admin-coder, reviewer

#### Tasks
1. Define QR visual spec:
   - minimum size, error correction, contrast, quiet zone.
2. Create two print formats:
   - machine sticker (small),
   - desk backup sheet (A4 grid).
3. Add protected label metadata:
   - machine name/type/id visible to staff,
   - short fallback code for manual entry.
4. Add replacement workflow in admin:
   - mark old QR invalid,
   - regenerate and print new QR.

#### Validation
- Scan success rate under gym lighting and sweat/wear conditions.
- Tamper and damage recovery tested.

---

## Workstream F - Missing Critical Production Controls (Added)

### F1. Observability + Alerting
**Workspace:** backend, admin  
**Owners:** supabase-dba, admin-coder, edge-function-agent

#### Tasks
1. Standardize structured logs for edge functions and key RPCs.
2. Add alert thresholds:
   - push delivery failure spike,
   - check-in failure spike,
   - drops anomaly rate.
3. Admin operations page with near-real-time health signals.

### F2. Security + Abuse Runtime Controls
**Workspace:** backend, mobile, admin  
**Owners:** supabase-dba, mobile-coder, admin-coder

#### Tasks
1. Enforce one-active-session-per-user and machine occupancy integrity.
2. Rate limits for checkin/redeem/session start attempts.
3. Fraud event quarantine + manual review workflow.

### F3. Release Governance
**Workspace:** all  
**Owners:** reviewer, test-automation-agent

#### Tasks
1. Mandatory release checklist in repo.
2. P0/P1 bug gate: zero open blockers before prod deploy.
3. 48h soak test on prod-like data before public rollout.

---

## Workstream G - iOS + Android Store Release Program

### G1. iOS Release (App Store Connect + TestFlight)
**Workspace:** `apps/mobile-app`, release ops  
**Owners:** mobile-coder, reviewer, release-owner

#### Tasks
1. Apple account and app record readiness:
   - confirm bundle id, app name, SKU, category, age rating, territories.
2. App Store metadata package:
   - localized app description (EN/SR),
   - keywords,
   - support URL,
   - marketing URL,
   - privacy policy URL,
   - app preview/screenshots (all required device sizes).
3. Build pipeline:
   - `development` profile for internal testing,
   - `production` profile for TestFlight/App Store binary.
4. Signing/credentials:
   - verify distribution cert/provisioning profile,
   - APNs key present and linked to app id.
5. TestFlight process:
   - internal testers first,
   - external testers optional for pilot,
   - collect crash and feedback for at least one full cycle.
6. App Review submission:
   - answer export compliance,
   - login/demo account notes for reviewer,
   - explain location/Bluetooth/camera usage clearly.

#### Validation
- TestFlight install works on clean device.
- Push token registration succeeds on production binary.
- Deep links and auth providers work in production profile.

---

### G2. Android Release (Google Play Console)
**Workspace:** `apps/mobile-app`, release ops  
**Owners:** mobile-coder, reviewer, release-owner

#### Tasks
1. Play Console app record readiness:
   - package id, app category, contact details, store listing text.
2. Store assets:
   - icon, feature graphic, phone screenshots, optional promo video.
3. App Content policies:
   - Data safety form,
   - privacy policy URL,
   - ads declaration,
   - content rating questionnaire,
   - target audience declaration.
4. Build and signing:
   - AAB generation for production,
   - Play App Signing enabled,
   - upload key safely stored and documented.
5. Release tracks:
   - internal testing,
   - closed testing (pilot),
   - production staged rollout (e.g. 10% -> 25% -> 50% -> 100%).

#### Validation
- Install/update flow works across tracks.
- Push and deep links verified in Play-distributed build.
- Crash/ANR baseline acceptable before full rollout.

---

### G3. Store Operations and Versioning Discipline
**Workspace:** release ops + all  
**Owners:** reviewer, release-owner

#### Tasks
1. Single release manifest includes:
   - iOS build number + version,
   - Android versionCode + versionName,
   - linked git SHA,
   - migration IDs deployed,
   - edge function versions.
2. Staged rollout policy:
   - rollback triggers for crash spike, push failure spike, auth failure spike.
3. Store hotfix policy:
   - when to use phased release halt,
   - when to roll forward vs rollback.

---

## Workstream H - Legal, Privacy, and Consent Readiness

### H1. Legal Documents and Hosting
**Workspace:** legal/docs + mobile/admin links  
**Owners:** product-owner, reviewer, admin-coder, mobile-coder

#### Required Documents
- Privacy Policy (data collection, processing, retention, deletion contact).
- Terms of Service (eligibility, acceptable use, reward rules, liability).
- Optional but recommended: Community/Anti-abuse policy.

#### Tasks
1. Publish legal documents on stable HTTPS URLs.
2. Version legal docs and keep change history.
3. Add in-app legal access points:
   - onboarding,
   - settings/profile,
   - footer/help entry points where appropriate.
4. Store listing legal URLs must match in-app links.

---

### H2. Consent and Data Controls
**Workspace:** `apps/mobile-app`, `backend/supabase`  
**Owners:** mobile-coder, supabase-dba, reviewer

#### Tasks
1. Permission rationale UX:
   - camera (QR),
   - location (check-in),
   - Bluetooth (machine/sensor),
   - notifications (campaigns/reminders).
2. Record explicit consent signals where required for marketing pushes.
3. Provide user controls:
   - toggle non-critical notifications,
   - account deletion/export request path.
4. Ensure data minimization:
   - only required fields for pilot are collected.

#### Validation
- App review compliance text is aligned with actual behavior.
- No permission prompt appears without contextual pre-explanation.

---

## Workstream I - Production Push Notification Readiness

### I1. Credential and Environment Integrity
**Workspace:** `apps/mobile-app`, `backend/supabase/functions`, release ops  
**Owners:** edge-function-agent, mobile-coder, reviewer

#### Tasks
1. iOS APNs credential setup and validation for production app id.
2. Android FCM server credential setup and validation.
3. Confirm push project ids and env vars per environment:
   - dev and prod separated,
   - no cross-environment token leakage.
4. Ensure token registration lifecycle:
   - first login,
   - app reinstall,
   - logout/login refresh.

---

### I2. Production Push Verification Matrix
**Workspace:** `backend/supabase/functions`, `apps/mobile-app`  
**Owners:** edge-function-agent, mobile-coder, test-automation-agent

#### Must-pass Scenarios
1. Foreground push received and rendered.
2. Background push received and opens correct deep link.
3. Silent failure path logs actionable reason (invalid token/credentials).
4. Campaign send to batch with partial failures remains idempotent.
5. Happy-hour and re-engagement triggers deliver exactly once per dedupe window.

#### Validation Artifacts
- Function logs with send counts and failures.
- Delivery summary table evidence.
- Device screenshots for iOS and Android.

---

## 14-Day Execution Schedule

### Day 1-2
- C1 env split bootstrap
- A1 auth reliability fixes
- B1 mailer provider setup

### Day 3-4
- D1 DB cleanup inventory + deprecation actions
- D2 Vortex pilot gating
- E1 QR print standards + admin export polish

### Day 5-6
- A2 mobile UX cleanup (home/profile)
- B2 admin pilot operations and role hardening verification
- F1 observability baseline

### Day 7-8
- A3 referral MVP implementation
- A4 1v1 challenge MVP implementation
- F2 anti-abuse reinforcement and review

### Day 9
- Full integration QA (auth, checkin, workout, drops, redeem, push, referrals, 1v1)
- Fix-only day (no new scope)

### Day 10-11
- I1/I2 production push readiness and device matrix verification
- H1/H2 legal links, consent surfaces, and store compliance sync

### Day 12-13
- G1/G2 store packaging, submission assets, and pilot track rollouts
- TestFlight + Play internal/closed testing signoff

### Day 14
- Go/No-Go review
- Controlled production rollout
- On-call + rollback readiness confirmed

---

## Agent Assignment Matrix (Execution Ownership)

- **supabase-dba**
  - env DB split support, schema cleanup, pilot flags, referral + 1v1 schema, anti-abuse constraints.
- **edge-function-agent**
  - mailer dispatch reliability, push workflow hardening, operational logging.
- **mobile-coder**
  - auth UX gate, home/profile cleanup, referral + 1v1 mobile flows, pilot gym list behavior.
- **admin-coder**
  - staff invite operations, pilot controls, QR print/regeneration workflows, role-safe desk UX.
- **reviewer**
  - security review, regression verification, release gate signoff.
- **test-automation-agent**
  - E2E smoke + regression + soak scripts and reports.

---

## Go/No-Go Gates

### Gate G1 - Platform Safety
- [ ] No critical auth, role, RLS, or reward abuse vector reproducible.
- [ ] Dev/prod environment isolation verified end-to-end.

### Gate G2 - Product Reliability
- [ ] Core journeys pass: signup/login, checkin, workout, drops, redeem, push.
- [ ] Staff invite email and checkin desk flows stable under repeated use.

### Gate G3 - Pilot Readiness
- [ ] Vortex-only listing behavior verified on fresh install.
- [ ] QR flow works with final printed format.
- [ ] Daily operations can run without engineering intervention.

### Gate G4 - Operational Readiness
- [ ] Monitoring + alerting live.
- [ ] Rollback steps rehearsed and documented.
- [ ] On-call owners assigned for pilot window.

### Gate G5 - Store and Compliance Readiness
- [ ] App Store Connect metadata complete and validated.
- [ ] Play Console metadata/content forms complete and validated.
- [ ] Privacy Policy and Terms are reachable from app + stores.
- [ ] Push works on production iOS and Android binaries.

If any gate is red, release remains **No-Go**.

---

## Testing Requirements (Mandatory)

1. Auth matrix tests (email/Google/Apple, new/existing/linking).
2. Drop economy consistency tests (admin config -> RPC -> mobile display -> session summary).
3. Pilot gating tests (gym visibility and access control).
4. Referral and 1v1 abuse tests.
5. Push/mail delivery tests across dev and prod environments.
6. Role tests for receptionist/gym_owner/superadmin route + action scope.
7. Recovery tests:
   - failed edge function retries,
   - failed mail provider fallback,
   - DB migration rollback.
8. Store-distributed binary tests:
   - TestFlight install + core journey,
   - Play internal/closed track install + core journey.
9. Legal/compliance checks:
   - privacy/terms links reachable,
   - consent toggles persist and are respected.

---

## Deliverables Checklist

- [ ] Environment separation runbook (`dev` vs `prod`)
- [ ] MVP active DB surface report (keep/deprecate/remove)
- [ ] Vortex pilot configuration guide
- [ ] QR production operations SOP
- [ ] Release checklist with gate ownership
- [ ] Post-launch week-1 monitoring plan
- [ ] App Store + Play Store submission checklist and manifest
- [ ] Legal/compliance checklist with owner signoff

