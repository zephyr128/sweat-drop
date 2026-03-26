# SWEATDROP Production Test Plan

**Date:** 2026-03-12  
**Priority:** Critical  
**Goal:** Build a repeatable, mostly hardware-independent test system that blocks unsafe releases.

## Context

Team does not have constant treadmill/bike access. We must still validate anti-abuse, drops economy, redemptions, and core UX before gym testing.

This plan creates a layered test strategy where real hardware is only final acceptance, not primary QA.

## Test Strategy (Pyramid)

- **70% Backend/RPC contract tests** (no hardware required)
- **20% App integration tests with simulated sensor data**
- **10% Real gym acceptance tests** (short final run)

## Release Gates

Release is **No-Go** if any is false:
- [ ] Critical RPC test suite pass = 100%
- [ ] Anti-abuse test suite pass = 100%
- [ ] Mobile integration smoke pass
- [ ] Admin moderation/economy UI smoke pass
- [ ] 60-90 min real gym acceptance completed

---

## PHASE 1 — Test Infrastructure Bootstrap

### 1.1 Root test scripts

**Workspace:** root  
**Owner:** `test-automation-agent`

Add standard scripts (through agent implementation):
- `test:db`
- `test:mobile`
- `test:admin`
- `test:e2e`
- `test:smoke`
- `test:ci` (orchestrates all)

`test:ci` should fail fast and return non-zero on any failing block.

### 1.2 Deterministic test data fixtures

**Workspace:** `backend/supabase`  
**Owner:** `supabase-dba` + `test-automation-agent`

Create fixtures for:
- gyms, users, memberships,
- machines + locks,
- sessions (valid and fraudulent),
- rewards/redemptions (all limit types),
- challenges/check-ins.

Fixture requirements:
- idempotent setup,
- idempotent cleanup,
- predictable timestamps (avoid flaky time tests).

### 1.3 Test reports output format

Every test run must generate:
- machine-readable report (`json`)
- human summary (`md`)
- top failures by severity

Artifacts folder:
- `docs/test-reports/`

---

## PHASE 2 — Backend/RPC Contract Test Suite

**Workspace:** `backend/supabase`  
**Owner:** `supabase-dba` + `test-automation-agent`

## 2.1 Critical RPC Coverage

Required functions:
- `lock_machine`
- `unlock_machine`
- `update_machine_heartbeat`
- `award_drops`
- `perform_checkin`
- `claim_reward`

## 2.2 Must-pass test scenarios

### A) Identity & Ownership
- cannot award drops for another user’s session
- cannot lock/unlock machine for another user
- cannot update heartbeat/rpm without ownership

### B) Session Constraints
- one active session per user enforced
- one active session per machine enforced
- stale lock cleanup behavior verified

### C) Check-in Integrity
- strict mode: no GPS = rejected/no drops
- distance outside radius = rejected
- one check-in per day unique constraint holds

### D) Reward Claims
- unlimited: blocks duplicate pending, allows later claim
- once: blocks after first confirmed/pending claim
- daily/weekly/monthly limits respected by period boundary
- out-of-stock and insufficient drops correctly blocked

### E) Caps / Tokenomics
- per-session cap applies
- daily cap applies
- weekly cap applies
- excess mint attempts are blocked/capped and logged

### F) Idempotency
- repeated `award_drops` call on same session does not double mint
- repeated claim requests cannot double create pending rows

## 2.3 Performance sanity checks

For critical RPCs, set guardrails:
- p95 latency threshold in local/staging (define baseline, e.g. <400ms for core RPC logic).

---

## PHASE 3 — Mobile Integration Tests (No BLE Hardware)

**Workspace:** `apps/mobile-app`  
**Owner:** `mobile-coder` + `test-automation-agent`

## 3.1 Sensor Simulator

Add test-mode data source for workout flow:
- synthetic RPM stream (normal, idle, spike),
- heartbeat cadence,
- disconnect/reconnect events.

Simulator profiles:
- `normal_30min`
- `interval_training`
- `suspicious_spike`
- `disconnect_mid_session`

## 3.2 Required mobile scenarios

- start session -> simulated workout -> finalize -> summary
- no signal after start -> safe cancel / no reward
- reconnect flow does not duplicate session reward
- fraud-like spike does not bypass caps
- claim reward UI handles all backend limit errors cleanly

## 3.3 Localization and UX safety

Verify errors are user-readable (EN/SR):
- limit reached,
- suspicious activity blocked,
- GPS strict check failure.

---

## PHASE 4 — Admin Panel Test Suite

**Workspace:** `apps/admin-panel`  
**Owner:** `admin-coder` + `test-automation-agent`

## 4.1 Server action tests

Coverage:
- auth and role guards for critical actions
- abuse moderation actions (freeze, rollback, quarantine)
- economy settings validations

## 4.2 UI smoke tests

Required pages:
- risk dashboard
- economy settings
- store manager with redemption limits
- reports pages (gym + superadmin)

Smoke criteria:
- page loads,
- key controls render,
- save actions succeed/fail with expected message.

---

## PHASE 5 — E2E Production Smoke

**Owner:** `test-automation-agent` + `reviewer`

Run a short end-to-end suite in staging:
1. user signs in and completes one valid session
2. user claims one reward
3. staff confirms redemption
4. abuse attempt blocked and logged
5. superadmin sees risk event + can moderate

If any fails -> release blocked.

---

## PHASE 6 — Minimal Real-Gym Acceptance (Final Only)

**Owner:** `reviewer` + product ops

Duration: 60-90 minutes.

Hardware matrix:
- 1 treadmill
- 1 bike
- 2 phones

Checklist:
- genuine workout flow works on both machines
- account sharing attempt blocked/flagged
- QR piggyback attempt fails/no rewards
- reward claim + desk confirmation works
- metrics visible in admin risk/economy dashboards

---

## Agent Execution Order

1. `test-automation-agent` (bootstrap infra + orchestrator scripts)
2. `supabase-dba` (RPC tests + fixtures + constraints)
3. `mobile-coder` (simulator-driven integration tests)
4. `admin-coder` (server action + UI smoke tests)
5. `test-automation-agent` (full `test:ci`)
6. `reviewer` (independent gate signoff)

---

## Deliverables

- Test infrastructure scripts and CI entrypoint
- DB contract/abuse test suite
- Mobile simulator test suite
- Admin smoke/action test suite
- Staging E2E smoke pack
- Real-gym final acceptance checklist
- Standardized test reports in `docs/test-reports/`

## Deal Breakers

- [ ] Any critical RPC has no automated test
- [ ] Any anti-abuse control is untested
- [ ] No deterministic test fixtures
- [ ] No one-command full run (`test:ci`)
- [ ] Reviewer cannot reproduce results from report artifacts
