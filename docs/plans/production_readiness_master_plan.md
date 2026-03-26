# SWEATDROP Production Readiness Master Plan

**Date:** 2026-03-12  
**Owner:** Architect  
**Goal:** Launch safely with no critical abuse vectors, predictable token economy, and clear go/no-go gates.

## Context

SWEATDROP is near launch, but there are launch blockers around anti-fraud, reward economy control, and operational hardening. This plan coordinates all agents into one execution program.

## Launch Principles

1. **Security before growth**: no feature goes live if abuse can mint drops at scale.
2. **Server is source of truth**: client can suggest metrics, server decides rewards.
3. **Economy must be bounded**: daily, weekly, monthly max issuance per user/gym.
4. **Observability first**: if we cannot detect abuse/bugs quickly, we are not production-ready.
5. **Go-live by gates**: objective criteria, not subjective confidence.

## Critical Deal Breakers (Must Fix Before Launch)

1. `award_drops()` caller/session ownership hard check missing.
2. Lock RPCs trust client-supplied user id.
3. No hard one-active-session-per-user DB protection.
4. GPS check-in can bypass strict verification when location unavailable.
5. No end-to-end automated smoke/regression suite for critical flows.
6. Status semantics mismatch risk in redemptions (`pending/confirmed/claimed` across flows).
7. No anti-abuse anomaly monitoring with auto-flag/quarantine.

## Program Structure

This master plan is executed through three linked plans:

- `docs/plans/production_anti_abuse_hardening_plan.md`
- `docs/plans/tokenomics_and_pricing_plan.md`
- `docs/plans/production_qa_and_go_live_runbook.md`

## Execution Order

```
Phase 0: Freeze & Baseline
Phase 1: Security and Abuse Hardening (DBA + Mobile + Admin)
Phase 2: Tokenomics Calibration and Guardrails (DBA + Admin + Product)
Phase 3: QA, Load, and Operational Readiness (Reviewer + QA + SRE-style checks)
Phase 4: Staged Rollout and Post-launch Monitoring
```

## Phase 0 — Freeze & Baseline

### 0.1 Code Freeze Rules
- Freeze net-new features except production blockers.
- Require migration review for every DB change.
- Require explicit rollout notes per merged PR.

### 0.2 Baseline Snapshot
- Dump current critical function definitions:
  - `award_drops`, `claim_reward`, `perform_checkin`,
  - `lock_machine`, `unlock_machine`, `update_machine_heartbeat`.
- Export current values for:
  - reward prices, stock, redemption limits,
  - challenge rewards, arena prize settings.
- Produce baseline KPI dashboard:
  - DAU/WAU, sessions/day, drops minted/day, redemptions/day, rejection rate.

## Phase 1 — Security & Abuse Hardening

Detailed implementation: `production_anti_abuse_hardening_plan.md`.

### Required Outputs
- Hardened SQL functions + constraints.
- Abuse policy matrix (what is blocked, rate-limited, flagged).
- Admin abuse monitor UI.
- Incident playbook for suspicious users/gyms.

### Gate 1 (Must Pass)
- No known critical abuse path remains reproducible in test.
- Red-team abuse scripts fail (session spoofing, multi-device farming, QR piggybacking).
- False positive rate acceptable in pilot (<2% manual reversals).

## Phase 2 — Tokenomics & Pricing

Detailed implementation: `tokenomics_and_pricing_plan.md`.

### Required Outputs
- Final issuance policy:
  - per-session cap,
  - per-day cap,
  - per-week cap,
  - anti-whale deceleration.
- Reward pricing bands by category and target redemption rate.
- Simulated 90-day economy projection for low/med/high engagement gyms.
- Admin controls and guardrails for reward pricing and stock.

### Gate 2 (Must Pass)
- Unit economics signed off:
  - target cost per active user,
  - redemption conversion target,
  - drop inflation within safe bound.
- No unlimited exploit paths for top 1% users.

## Phase 3 — QA & Operational Readiness

Detailed implementation: `production_qa_and_go_live_runbook.md`.

### Required Outputs
- E2E critical flow suite.
- DB function smoke tests.
- Monitoring + alerting dashboard.
- Rollback runbook verified in staging.

### Gate 3 (Must Pass)
- P0/P1 bug count = 0.
- Soak test (48h) with no critical incidents.
- On-call rotation and incident ownership confirmed.

## Phase 4 — Staged Rollout

### 4.1 Progressive Exposure
- Day 0: internal accounts only.
- Day 1-3: pilot gym cohort.
- Day 4-7: expanded gym cohort.
- Full release after stability threshold reached.

### 4.2 Rollback Triggers
- Drops mint anomaly > 3x baseline for 30 minutes.
- Redemption fraud spike > threshold.
- Session finalization failure > 2%.
- Check-in fraud false negative confirmed at scale.

## Agent Assignment Matrix

- **supabase-dba**
  - Security constraints, function hardening, anti-abuse tables/RPCs, rate limits.
- **mobile-coder**
  - Client anti-cheat telemetry, stricter workflow, better error handling, device/account checks.
- **admin-coder**
  - Abuse dashboard, moderation actions, tokenomics controls, reports.
- **reviewer**
  - Pre-merge verification, regression checks, risk signoff.
- **production-hardener (new rule)**
  - Cross-cutting launch gate enforcement and incident-readiness checks.

## Weekly Cadence (Until Launch)

- Daily: blocker standup, abuse metrics review.
- Every 48h: migration and rollback rehearsal.
- Twice weekly: tokenomics calibration sync.
- Weekly: launch gate status update (Red/Yellow/Green).

## Final Go/No-Go Checklist

- [ ] Gate 1 passed (anti-abuse)
- [ ] Gate 2 passed (tokenomics)
- [ ] Gate 3 passed (QA/ops)
- [ ] Rollback validated in staging
- [ ] Incident response owners assigned
- [ ] Production configs verified (cron, env vars, storage, RLS, alerts)

If any item is not checked, release is **No-Go**.
