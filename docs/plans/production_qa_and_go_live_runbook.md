# Production QA and Go-Live Runbook

**Date:** 2026-03-12  
**Priority:** Critical  
**Purpose:** Convert engineering readiness into a controlled production release with rollback confidence.

## Scope

This runbook covers:
- pre-launch QA,
- staging hardening,
- launch day sequence,
- rollback and incident response.

## Phase 1 — Test Matrix (Must Complete)

## 1.1 Critical User Journeys

1. Sign in -> select gym -> scan -> workout -> summary -> drops posted.
2. Claim reward -> redemption appears -> staff confirms.
3. Check-in (GPS strict + lenient gym modes).
4. Challenge completion (daily/weekly/streak/check-in types).
5. Arena participation and result redemption row creation.
6. Leaderboard prize cycle (weekly/monthly snapshot + redemption insert).

## 1.2 Abuse / Security Journeys

1. Attempt to award drops on someone else's session id.
2. Attempt multiple active sessions from one user.
3. Attempt lock/heartbeat with spoofed user id.
4. Attempt check-in without valid location in strict mode.
5. Attempt duplicate reward claim under each redemption limit.
6. Attempt farming with two devices on one account.

Expected result: blocked, logged, and observable in risk dashboard.

Required evidence for each abuse case (attach to release ticket):
- blocked response payload (HTTP/RPC status + error code),
- one DB verification query output,
- one dashboard screenshot (risk/fraud panel),
- one log extract (edge/db function log line with request id).

Evidence source map (hard requirement):
1. someone else's session award_drops attempt:
   - DB: `audit_events` with `event_type='award_drops_denied'`
   - Logs: `award_drops` function logs with denied reason
   - Dashboard: Fraud -> "Unauthorized award attempts"
2. multiple active sessions:
   - DB: `sessions` where `status='active'` grouped by `user_id` (must be <= 1)
   - Logs: `lock_machine` / session create conflict logs
   - Dashboard: Fraud -> "Concurrent session violations"
3. spoofed heartbeat/lock:
   - DB: lock ownership mismatch counters in audit stream
   - Logs: heartbeat/lock denied due to ownership
   - Dashboard: Fraud -> "Lock ownership denials"
4. strict GPS check-in bypass:
   - DB: check-ins denied due to geofence in `audit_events`
   - Logs: `perform_checkin` denied distance/radius reason
   - Dashboard: Check-in -> "GPS denied (strict)"
5. duplicate reward claims:
   - DB: reward claim denials with limit type (daily/weekly/monthly/lifetime)
   - Logs: `claim_reward` conflict/limit denied
   - Dashboard: Rewards -> "Claim denials by limit type"
6. two-device farming:
   - DB: anomaly/fraud events for account/device overlap
   - Logs: duplicate device fingerprint/account session overlap
   - Dashboard: Fraud -> "Device/account farming anomalies"

## 1.3 Failure and Recovery Journeys

1. Mobile app crash mid-workout; abandoned session cleanup finalizes safely.
2. Network loss during reward claim; idempotent retry behavior.
3. Edge function timeout for arena finalization; retry and no double-award.
4. Cron disabled scenario; manual backfill scripts tested.

## Phase 2 — Automated Gate Suite

## 2.1 Backend smoke suite (SQL/RPC)

Build script-based checks for:
- `award_drops` auth guard,
- `perform_checkin` GPS strict behavior,
- `claim_reward` limits,
- `lock_machine` ownership guarantees,
- one-active-session constraints.

## 2.2 Admin and Mobile E2E smoke

Minimal Playwright/Detox style smoke:
- login,
- one session flow,
- one claim flow,
- one moderation flow.

At least run nightly in staging until launch.

Pass/fail criteria (hard gate):
- last 3 nightly runs: 100% pass on critical smoke flows,
- no flaky retry on critical flows in final 24h,
- total smoke duration <= 20 minutes,
- any failed critical smoke in launch window -> automatic No-Go until green rerun.

## 2.3 Type and lint gates

Mandatory green checks:
- `pnpm type-check`
- `pnpm lint`
- migration SQL lint/parse check.

## Phase 3 — Staging Rehearsal

## 3.1 Production-like staging checklist

- [ ] Same env var set and secrets layout as production.
- [ ] Same Supabase extensions enabled (`pg_cron`, etc.) or documented alternatives.
- [ ] Same auth providers configured (Apple/Google/email).
- [ ] Realtime and edge functions deployed and reachable.

## 3.2 Data seed rehearsal

- Seed realistic gyms, members, rewards, sessions.
- Include abuse-like synthetic users for detection tuning.

## 3.3 48-hour soak test

Run synthetic and manual traffic:
- sustained session creation/finalization,
- claims and confirmations,
- challenge updates.

No P0/P1 incidents allowed.

## Phase 4 — Monitoring and Alerts

## 4.1 Core Metrics Dashboard

Track every 5 minutes:
- sessions started/completed,
- drops minted and burned,
- reward claims pending/confirmed/cancelled,
- check-in verified vs unverified,
- fraud event counts by severity.

## 4.2 Alert thresholds

Page on-call when:
- drops minted per minute > 3x baseline,
- failed `award_drops` > 2% over 15m,
- claim failure rate > 10% over 30m,
- challenge update failures > 2%,
- anomaly events jump > 5x daily baseline.

Normalization guardrails:
- percentage-based alerts require minimum sample size:
  - `award_drops` failures: min 100 calls / 15m window,
  - claim failures: min 50 calls / 30m window,
  - challenge update failures: min 100 updates / 30m window.
- multiplier-based alerts require both:
  - baseline from last 7 days same hour bucket,
  - absolute floor (e.g. >= 30 events in window) to avoid low-traffic noise.
- pilot phase uses cohort-specific baseline; switch to global baseline only after full rollout.

## 4.3 Operational ownership

Define named owners for:
- DB incidents,
- mobile release rollback,
- admin incident controls,
- customer support escalations.

## Phase 5 — Launch Day Procedure

## 5.1 T-minus checklist

T-24h:
- final migration list frozen,
- backup snapshot verified,
- rollback scripts validated.
- release manifest frozen and signed off (see 5.2).

T-2h:
- deploy DB changes,
- deploy admin/mobile builds,
- verify critical health checks.

T-0:
- enable pilot cohort,
- monitor metrics every 15 min.

T+4h:
- first checkpoint (go/hold/rollback decision).

T+24h:
- second checkpoint for wider rollout.

## 5.2 Release Manifest (Mandatory)

No deploy without a completed manifest in the launch ticket:
- git SHA for admin-panel deploy,
- mobile build versions (iOS/Android) + rollout percentage,
- exact migration IDs applied in order,
- edge function versions/checksums,
- feature flags and target values,
- monitoring dashboard links and alert policy IDs,
- rollback target versions (admin/mobile/functions/schema).

Any mismatch between deployed artifacts and manifest -> immediate release hold.

## 5.3 Rollback Plan

Immediate rollback triggers:
- critical drops abuse confirmed,
- reward claim corruption,
- session finalization widespread failures.

Rollback actions:
1. toggle feature flags to safe mode,
2. disable vulnerable RPC path if needed,
3. restore previous function definitions,
4. run reconciliation for affected users.

Database rollback and recovery (mandatory):
5. determine rollback mode:
   - mode A (forward fix): schema is irreversible but contained -> apply vetted hotfix migration,
   - mode B (time restore): data corruption or broad integrity breach -> execute PITR.
6. PITR runbook:
   - capture incident timestamp and affected window,
   - restore to pre-incident timestamp in isolated environment,
   - validate integrity checks (sessions, drops, claims, rewards),
   - execute cutover plan approved by incident commander,
   - reconcile post-restore deltas from audit logs.
7. RTO/RPO targets:
   - target RTO: <= 30 minutes for safe-mode containment,
   - target RTO: <= 2 hours for full restore cutover,
   - target RPO: <= 5 minutes using managed backups/PITR logs.
8. stop-the-line criteria:
   - if reconciliation cannot prove ledger consistency,
   - if restore validation fails critical integrity checks,
   - if owner signoff missing (DB + product + incident commander).

## Phase 6 — Post-Launch Stabilization (Week 1-2)

- Daily bug triage with strict SLA:
  - P0: immediate hotfix,
  - P1: <24h,
  - P2: <72h.
- Daily economy review and anti-fraud review.
- Weekly postmortem on incidents and false positives.

## Launch Gate Criteria

Go-Live allowed only when all true:
- [ ] P0 bugs = 0
- [ ] P1 bugs = 0
- [ ] Abuse red-team suite passes
- [ ] Rollback rehearsal succeeded
- [ ] Monitoring + alerting live
- [ ] On-call and escalation roster confirmed
- [ ] Product, engineering, operations signoff done
- [ ] Release manifest completed and signed
- [ ] Last 3 nightly smoke runs green with no flaky critical retries
- [ ] PITR drill evidence attached (within last 14 days)
- [ ] Abuse evidence artifacts attached for each scenario in 1.2

If any one is false -> **No-Go**.
