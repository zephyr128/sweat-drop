# Production Anti-Abuse Hardening Plan

**Date:** 2026-03-12  
**Priority:** Critical (Launch Blocker)  
**Workspaces:** `backend/supabase`, `apps/mobile-app`, `apps/admin-panel`

## Context

User requested a bulletproof anti-theft system:
- prevent drop farming and fake sessions,
- prevent QR piggybacking (scan another treadmill while someone else uses it),
- prevent one account/phone being shared for abuse,
- enforce daily limits and abuse detection.

## Threat Model

1. **Session spoofing**: submit fake session data, mint drops.
2. **QR piggybacking**: claim drops without actually using machine.
3. **Multi-session abuse**: one account starts multiple active sessions.
4. **Account sharing**: multiple devices/users farming one account.
5. **Check-in abuse**: fake location / repeated check-ins.
6. **Reward extraction abuse**: repeated claims and cross-account farming.

## Phase 1 — Backend Security Controls (supabase-dba)

### 1.1 Hard bind security-definer functions to `auth.uid()`

**Files:** new migration `backend/supabase/migrations/20260324000010_harden_auth_identity_checks.sql`

Update functions to reject caller impersonation:
- `lock_machine(p_machine_id, p_user_id)`
- `unlock_machine(p_machine_id, p_user_id)`
- `update_machine_heartbeat(p_machine_id, p_user_id)`
- `update_machine_rpm(p_machine_id, p_user_id, p_rpm)`
- `award_drops(p_session_id)`
- `perform_checkin(...)`

Rule:
```sql
IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
  RAISE EXCEPTION 'Unauthorized';
END IF;
```

For `award_drops`, validate:
- session exists,
- `sessions.user_id = auth.uid()`,
- session still active or just finalized in valid path,
- `drops_earned` idempotency guard retained.

### 1.2 Enforce one active session per user and per machine

Add partial unique indexes:
- `uq_sessions_one_active_per_user` on `(user_id)` where `is_active = true`
- `uq_sessions_one_active_per_machine` on `(machine_id)` where `is_active = true`

Result:
- impossible to run parallel active sessions from same account,
- impossible to attach two active sessions to one machine.

### 1.3 Session integrity and anti-spoof constraints

Add server-side guardrails:
- reject `award_drops` if `duration_seconds` below minimum threshold (except early-abort type),
- cap session duration eligible for reward (e.g. max 2h per session),
- cap calories/RPM plausibility window by machine type,
- require machine lock ownership during rewarding path.

Add anomaly flags table:
- `fraud_events(id, user_id, gym_id, event_type, severity, metadata, created_at, resolved_at, resolved_by)`.

### 1.4 Strict check-in verification modes

Introduce gym-level config:
- `checkin_verification_mode`: `lenient` | `strict`.

Behavior:
- `strict`: no GPS -> no check-in drops (and no checkin challenge progress).
- `lenient`: allow fallback path, but tag as unverified and cap reward.

### 1.5 Rate limiting / issuance caps at DB level

Create `drop_limits` table and enforcement helper:
- max drops per user per day,
- max drops per user per week,
- max sessions counted per day,
- optional gym-level overrides.

Before awarding session drops:
- calculate already minted period totals,
- cap or reject additional minting with explicit reason.

### 1.6 Device/account anti-sharing telemetry

Add table:
- `user_device_fingerprints(user_id, device_hash, first_seen_at, last_seen_at, is_trusted)`.

Log suspicious patterns:
- >N devices in 24h for same account,
- same device reused by multiple accounts in short window,
- concurrent active sessions from different device hashes.

### 1.7 Inactivity auto-finish and lock starvation prevention

Problem to solve:
- User leaves treadmill, phone remains connected in pocket, heartbeat continues.
- Machine stays busy and blocks next user even though no one is training.

Add gym-level policy fields:
- `session_inactivity_autofinish_sec` (default: 180 seconds)
- `session_warning_after_sec` (default: 60 seconds)
- `session_takeover_stale_sec` (default: 90 seconds, optional)

Backend changes:
1. Add RPC `finalize_inactive_session(p_session_id UUID, p_reason TEXT)`:
   - validates ownership or privileged role,
   - finalizes active session with partial drops (idempotent),
   - sets `is_active = false`,
   - calls `unlock_machine`,
   - writes `fraud_events` / audit metadata with reason (`inactivity_autofinish`).
2. Update stale cleanup policy:
   - keep `cleanup_abandoned_sessions()` fallback for dead heartbeats,
   - but inactivity finalize should happen earlier from app-side signal inactivity.
3. Add machine lock starvation detector:
   - busy machine + no meaningful activity + long lock duration -> flag event `machine_lock_starvation`.

Expected behavior:
- Next user sees `machine busy` only for short, justified window.
- If inactivity persists beyond threshold, session auto-finalizes and machine unlocks automatically.

## Phase 2 — Mobile Anti-Cheat Workflow (mobile-coder)

### 2.1 Session start hardening

In scan/workout start flow:
- require successful `lock_machine` before session creation in all paths,
- remove or lock down legacy path that creates sessions without lock.

### 2.2 Live possession proof

During workout:
- send periodic heartbeat + rpm telemetry + session consistency token,
- if heartbeat/rpm missing beyond threshold, pause reward accumulation,
- enforce foreground checks (if app fully backgrounded too long, reduce or halt minting).

### 2.3 Anti-piggyback UX

Prevent passive QR misuse:
- start workout only after short live confirmation window (RPM/heartbeat observed),
- show explicit “machine activity not detected” state and auto-cancel if no signal.

### 2.4 Device trust signals

Client sends stable device fingerprint hash (privacy-safe) with session/check-in calls.
No PII in hash; rotate strategy documented.

### 2.5 Inactivity auto-finish UX and heartbeat gating

Implement exact flow for “user left machine but phone stayed in pocket”:
1. If no machine activity (`RPM = 0`) for `session_warning_after_sec`:
   - show blocking warning overlay with countdown.
2. If inactivity reaches `session_inactivity_autofinish_sec`:
   - call `finalize_inactive_session` (or existing finish path with inactivity reason),
   - stop heartbeat interval immediately,
   - disconnect BLE,
   - unlock machine,
   - navigate user to summary (or scanner with explanatory message).
3. Heartbeat gating:
   - do not keep machine alive indefinitely when workout is auto-paused due to inactivity,
   - heartbeat should be tied to “active pedaling evidence” after warning window.
4. Safety:
   - if user resumes pedaling before timeout, cancel countdown and continue session normally.

Optional controlled takeover (v1.1):
- If next user scans a busy machine that is stale beyond `session_takeover_stale_sec`,
  allow “Request takeover” flow that triggers forced finalize + unlock with audit log.

## Phase 3 — Admin Abuse Console (admin-coder)

### 3.1 Create “Risk & Abuse” module

New route:
- `apps/admin-panel/app/dashboard/gym/[id]/risk/page.tsx`
- superadmin global view:
  - `apps/admin-panel/app/dashboard/super/risk/page.tsx`

Views:
- flagged users list with risk score,
- fraud event stream,
- suspicious redemptions queue,
- device/account anomaly panel.

### 3.2 Moderation actions

Server actions:
- freeze account for drops earning,
- mark session invalid and rollback drops,
- quarantine redemption,
- whitelist false positive.

All actions must write to audit log table.

### 3.3 Risk scoring model (v1)

Initial weighted rules:
- concurrent session attempt (+40),
- 95th percentile drops bursts repeatedly (+25),
- frequent multi-device switching (+20),
- repeated strict-checkin failures (+15),
- failed claim attempts spikes (+10).
- repeated inactivity auto-finishes on same account (+15).
- repeated lock starvation events on same machine/account (+20).

Thresholds:
- 40+ warn,
- 60+ auto-review,
- 80+ temporary freeze + manual review.

## Phase 4 — Validation and Red-Team (reviewer + dba + mobile + admin)

Test scenarios:
1. Try rewarding session for another user id.
2. Try two active sessions from one account.
3. Try claiming drops with stale machine lock.
4. Try GPS-denied check-in in strict gym.
5. Try daily cap overflow through repeated short sessions.
6. Try one device with multiple accounts.
7. User leaves machine, phone keeps app alive; verify auto-finish unlocks machine.
8. Second user scans immediately after first leaves; verify machine becomes available after inactivity timeout.

Expected:
- all blocked or capped,
- fraud event logged,
- moderation UI visibility within <30s.

## Deal Breakers (No-Go if unresolved)

- [ ] Any path exists to mint drops for a different account.
- [ ] Any path exists to run multiple active sessions for one account.
- [ ] Strict check-in gyms still awarding unverified check-ins.
- [ ] No audit trail for moderation decisions.
- [ ] No rollback capability for fraudulent drops/redemptions.
- [ ] Busy machine can remain locked indefinitely with no real activity.

## Deliverables Summary

- New migration with identity checks + constraints + caps.
- Risk events schema and moderation RPC/actions.
- Mobile anti-piggyback and anti-sharing instrumentation.
- Admin risk dashboards and controls.
- Red-team test report signed by reviewer.
