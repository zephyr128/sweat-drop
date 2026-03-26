# Feature: Rewarded Sessions Cap Refactor (BLE-safe)

## Context

Current behavior can punish legitimate users when BLE is unstable:
- User starts/stops multiple times because of sensor disconnects.
- Session-level reward attempts are fragmented into many short sessions.
- Hard `max_rewarded_sessions_per_day` can block rewards even when `max_drops_per_session` and day/week caps are still valid.

Goal:
- Keep anti-abuse controls.
- Prevent false negatives caused by BLE instability.
- Make drops policy understandable and fair for real users.

---

## Decision

`max_rewarded_sessions_per_day` should **not** be a default hard block.

New policy:
1. Primary hard guards remain:
   - `max_drops_per_session` (as **soft threshold**, not forced workout stop)
   - `max_drops_per_day`
   - `max_drops_per_week`
   - activity signal checks (RPM/speed/cadence)
2. `max_rewarded_sessions_per_day` becomes:
   - **soft risk signal** by default (fraud telemetry + admin warning),
   - optional hard gate only when explicitly enabled for high-risk gyms.
3. BLE restart tolerance:
   - merge/reconcile short restart sessions inside grace window,
   - avoid counting reconnection fragments as separate rewarded sessions.
4. Fairness for high-effort continuous users:
   - no requirement to restart workout to keep earning,
   - after session threshold, apply reduced earning tiers (diminishing),
   - keep day/week caps as final hard stop.

---

## Fairness Principle (anti-pause exploit)

The model must reward **real active effort**, not start/stop patterns.

Rules:
1. A user doing one long, continuous high-effort workout should not be penalized vs a user splitting into many short sessions.
2. Session splits within grace window should be stitched into one logical workout for cap accounting.
3. Soft session threshold should reduce marginal rate, not zero-out instantly.
4. Daily and weekly budgets remain primary anti-abuse hard limits.
5. Optional anti-split heuristic:
   - if multiple sessions occur within a short window, evaluate them under one merged budget bucket.

Recommended default tiering after `max_drops_per_session`:
- 0% to threshold: `100%` rate
- threshold to threshold + 50%: `40%` rate
- above that: `15%` rate

This prevents "pause and restart farming" while keeping fair rewards for genuine long sessions.

---

## Dependencies

- Existing tokenomics and drop model migrations are applied.
- Existing anti-abuse telemetry (`fraud_events`) is active.
- Mobile app already fetches drop limits via RPC.

---

## Execution Plan

### Step 1: Database Policy Refactor (supabase-dba)

**Workspace:** `backend/supabase/`

1. Create migration `YYYYMMDDHHMMSS_refactor_rewarded_sessions_cap.sql`.
2. Extend `tokenomics_config` with explicit behavior flags:
   - `enforce_rewarded_sessions_cap BOOLEAN NOT NULL DEFAULT false`
   - `rewarded_sessions_cap_mode TEXT NOT NULL DEFAULT 'soft' CHECK (rewarded_sessions_cap_mode IN ('off','soft','hard'))`
   - `session_restart_grace_sec INTEGER NOT NULL DEFAULT 300`
3. Normalize existing data:
   - ensure `max_rewarded_sessions_per_day >= 1`
   - set `enforce_rewarded_sessions_cap=false` for all gyms initially
4. Update `award_drops()`:
   - remove unconditional hard block on rewarded sessions/day.
   - behavior by mode:
     - `off`: ignore this cap
     - `soft`: log fraud/risk event only (no drop block)
     - `hard`: block as today
   - change session cap behavior:
     - do not force zero reward immediately at session threshold,
     - apply configurable post-threshold multipliers (`tier1_factor`, `tier2_factor`).
5. Add reconciliation logic for restart fragments:
   - if same user + same machine reconnects inside `session_restart_grace_sec`, mark as same reward bucket (or merged effective session for countering).
6. Add merged-window anti-split accounting:
   - sessions close in time are aggregated for soft session-threshold logic to prevent restart exploit.
6. Add explanatory cap reason in function result metadata (`raw_metrics.drop_calc_v2.reasons`) so mobile can show exact reason.
7. Add/extend RPC for mobile policy fetch:
   - return effective values for session/day/week caps plus `rewarded_sessions_cap_mode` and `session_restart_grace_sec`.
   - include session-tier settings for UI explanation.

---

### Step 2: Mobile Behavior Alignment (mobile-coder)

**Workspace:** `apps/mobile-app/`

1. Update workout policy fetch to include:
   - `rewarded_sessions_cap_mode`
   - `session_restart_grace_sec`
2. For reconnection flows:
   - if reconnect within grace window, continue same logical workout context (do not treat as new rewarded session fragment in UI logic).
3. Update `workout` and `session-summary` messaging:
   - distinguish:
     - activity-signal block,
     - day/week cap reached,
     - session threshold reached (reduced earning mode),
     - hard rewarded-sessions cap (only if enabled),
     - soft mode warnings (non-blocking).
4. Keep live gauge behavior continuous; do not freeze due to soft signals.
5. Add i18n keys for explicit reasons in `workout.json` (`en` + `sr`).

---

### Step 3: Admin UX Simplification (admin-coder)

**Workspace:** `apps/admin-panel/`

1. Economy Settings:
   - hide hard rewarded sessions cap from default/simple mode.
   - show under Advanced as:
     - Mode: Off / Soft monitor / Hard enforce.
   - show session-threshold behavior clearly:
     - "After threshold, rewards continue at reduced rate."
2. Add clear copy:
   - "Use Hard mode only for abuse spikes; Soft mode recommended."
3. Add BLE-safe guidance in UI:
   - show that reconnections within grace window are treated as one logical workout.
4. Add risk widget:
   - "Micro-sessions today" and "Potential BLE fragmentation" counters (from fraud events / sessions).

---

### Step 4: QA and Validation (test-automation-agent + reviewer)

**Workspace:** cross-workspace

1. Add deterministic tests for:
   - 3 reconnects in 10 minutes -> still rewarded correctly under soft mode.
   - hard mode enabled -> block triggers correctly after cap.
   - off mode -> no block from rewarded-sessions cap.
   - one continuous 60-min workout vs three 20-min split workouts -> no unfair advantage for split pattern.
   - continuous high-intensity user still earns post-threshold reduced rewards.
2. Add mobile integration tests:
   - rpm=0 => no drops
   - reconnection flow preserves continuous gauge behavior
   - 140 cap displayed correctly from backend policy
3. Add DB smoke scripts:
   - verify cap mode switch behavior and exact reason codes.

---

## API Contracts

### Mobile policy RPC (example shape)

`get_user_drop_limits(p_gym_id uuid) ->`
- `max_drops_per_session: int`
- `max_rewarded_sessions_per_day: int`
- `max_drops_per_day: int`
- `max_drops_per_week: int`
- `rewarded_sessions_cap_mode: 'off' | 'soft' | 'hard'`
- `session_restart_grace_sec: int`
- `session_soft_tier_1_factor: numeric` (default 0.40)
- `session_soft_tier_2_factor: numeric` (default 0.15)

### Award result metadata (persisted)

`sessions.raw_metrics.drop_calc_v2.reasons[]` may include:
- `insufficient_activity_signal_bike`
- `drop_cap_day_hit`
- `drop_cap_week_hit`
- `rewarded_sessions_cap_soft_signal`
- `rewarded_sessions_cap_hard_block`
- `session_restart_merged`
- `session_soft_threshold_reached`
- `session_soft_tier_1_applied`
- `session_soft_tier_2_applied`

---

## Rollout Order (Agent Sequence)

1. **supabase-dba** (schema + function behavior + RPC)
2. **mobile-coder** (policy read + reconnect-safe logic + user messages)
3. **admin-coder** (advanced control + simple UX copy)
4. **test-automation-agent** (integration + scenario tests)
5. **reviewer** (risk/regression review before production toggle)

---

## Release Strategy

1. Deploy with `rewarded_sessions_cap_mode='soft'` globally.
2. Monitor 7 days:
   - number of soft signals
   - no-reward complaints
   - fraud event trends
3. Only enable `hard` mode per gym when fraud indicators justify it.

---

## Success Criteria

- Legit users with BLE reconnect issues are no longer unfairly blocked.
- Abuse visibility remains high via soft telemetry.
- Hard enforcement is explicit and controlled, not accidental.
- Mobile gauge/reward flow matches backend policy and is transparent to user.
