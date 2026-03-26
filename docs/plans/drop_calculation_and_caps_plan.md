# Feature Plan: Drops Calculation Model + Session/Day Limits

**Date:** 2026-03-12  
**Priority:** Critical (Economy + Anti-abuse)  
**Workspaces:** `backend/supabase`, `apps/mobile-app`, `apps/admin-panel`

## Context

If we set daily/session caps, users must not reach those caps in a few minutes via spikes or spoofed telemetry.
At the same time, stronger users (higher RPM, faster pace, incline training, long endurance sessions) should earn more fairly.

This plan defines:
- machine-specific earning logic,
- anti-spike smoothing,
- hard caps,
- long-session (marathon) handling,
- transparent admin controls.

---

## Design Principles

1. **Intensity matters** (faster/harder = more drops).
2. **Time matters** (consistent effort over time should be rewarded).
3. **No instant cap abuse** (anti-spike and rate limiting).
4. **Machine-specific fairness** (bike vs treadmill vs elliptical vs stepper).
5. **Long workout support** (2h sessions possible, but with diminishing returns).

---

## Target Machine Types

Use `machines.type` normalization map:
- `treadmill`
- `bike`
- `elliptical`
- `stepper`

If unknown type:
- fallback to generic formula with conservative multiplier.

---

## Proposed Earning Model (v1)

## 1) Session is scored per minute, not only at the end

For each active minute, compute `minute_score`, then convert to drops.
Final session drops = sum(minute_drops) with caps.

This avoids a single spoofed final value dominating the session.

## 2) General structure

`minute_drops = base_rate(type) * intensity_factor(type) * consistency_factor * anti_spike_factor`

Then apply:
- session cap
- day cap
- week cap

## 3) Intensity by machine

### Bike (RPM-based)

Inputs:
- `rpm_smoothed` (rolling avg 20-30s)

Suggested bands:
- <40 rpm: very low effort (0.4x)
- 40-60 rpm: low/moderate (0.8x)
- 60-85 rpm: target zone (1.0x to 1.25x)
- 85-105 rpm: hard effort (1.35x)
- >105 rpm: capped multiplier (max 1.45x, no unlimited growth)

Anti-spike:
- if raw RPM jumps >35% instantly and not sustained >=20s, ignore spike.

### Treadmill (speed + incline)

Inputs (priority):
- speed (km/h)
- incline (%)
- fallback: calories estimate if no speed/incline telemetry available

Intensity formula:
- `speed_factor` from pace bands
- `incline_bonus` additive but capped (e.g. +0.00 to +0.25)
- total treadmill intensity capped (e.g. max 1.6x)

Example bands:
- walk (3-5.5 km/h): 0.7x to 0.95x
- jog (5.5-8.5): 1.0x to 1.2x
- run (8.5-12): 1.25x to 1.45x
- sprint (>12): max 1.55x (must be sustained)

### Elliptical

Inputs:
- cadence/RPM equivalent + resistance level (if available)
- fallback to calories + duration

Intensity:
- cadence band multiplier + resistance bonus (capped).

### Stepper

Inputs:
- step rate + resistance level (if available)

Intensity:
- step-rate bands + resistance bonus (capped).

---

## Caps and Guardrails

## 1) Hard caps

Initial launch defaults:
- `max_drops_per_session = 120`
- `max_drops_per_day = 300`
- `max_drops_per_week = 1500`
- `max_rewarded_sessions_per_day = 4`

## 2) Per-minute earning ceiling

Even at max effort:
- hard ceiling e.g. `max_drops_per_minute = 2.2`

This guarantees user cannot hit session cap in a few minutes.

## 3) Minimum rewarded duration

Only award meaningful drops if:
- effective active duration >= 3 minutes (or lower threshold for warm-up policy).

## 4) Diminishing returns for long sessions

To support marathon users without inflation:
- first 45 min: 100% rate
- 45-90 min: 80% rate
- 90-120 min: 60% rate
- >120 min: 40% rate (or no extra, configurable)

This keeps fairness for endurance athletes while controlling economy.

## 5) Idle filtering

If no valid machine activity for N seconds:
- pause accrual,
- inactivity countdown,
- optional auto-finish path (as defined in anti-abuse plan).

---

## Special Cases

1. **Marathon runner / 2h+**
   - allowed,
   - receives drops with diminishing schedule,
   - still bounded by session/day/week caps.

2. **HIIT user (short high spikes)**
   - rewarded only if effort is sustained in rolling window,
   - transient spikes do not dominate score.

3. **Sensor missing metrics**
   - fallback conservative scoring path (duration + calories),
   - lower confidence multiplier (e.g. 0.85x),
   - flag for telemetry quality monitoring.

4. **Device/signal instability**
   - short disconnect tolerance window,
   - no duplicate awarding,
   - idle/paused periods excluded from accrual.

---

## Phase 1 — DBA Agent (Core Formula + Enforcement)

Create migration:
- `backend/supabase/migrations/20260324000012_drop_calculation_model.sql`

Tasks:
1. Add config table `drop_model_config`:
   - base rates by machine type,
   - multiplier caps,
   - minute ceiling,
   - diminishing-return thresholds.
2. Add function `calculate_session_drops_v2(...)`:
   - accepts machine type + telemetry aggregates,
   - returns structured calculation breakdown.
3. Update `award_drops` to use v2 formula.
4. Keep old formula as fallback flag (`use_drop_model_v2`).
5. Enforce session/day/week caps in same transaction.
6. Persist audit breakdown in `sessions.raw_metrics.security/drop_calc`.

Validation SQL:
- bike high rpm sustained vs spike,
- treadmill speed+incline combinations,
- 2h session diminishing return,
- cap enforcement boundaries.

---

## Phase 2 — Mobile Agent (Telemetry Quality + UX)

Tasks:
1. Ensure telemetry pipeline includes:
   - smoothed RPM/cadence,
   - speed/incline when available,
   - active vs paused minute flags.
2. Send structured metric buckets periodically (not only final totals).
3. Show user-facing hints:
   - “Higher effort = more drops”
   - “Session reached cap” / “Daily limit reached”.
4. Ensure inactivity pauses accrual (align with anti-abuse plan).

---

## Phase 3 — Admin Agent (Control + Transparency)

Tasks:
1. Add Economy controls page section:
   - per-type base rates,
   - cap settings (with safe ranges),
   - diminishing return thresholds.
2. Add “Drop Calculator Preview” tool:
   - input sample workout values,
   - preview expected drops output.
3. Add policy lock modes:
   - gym owner can tune only within superadmin guardrails.

---

## Phase 4 — Test Agent (Must-pass)

Add test scenarios:
1. User cannot hit session cap in <10 minutes even at max inputs.
2. Bike sustained high RPM yields more than moderate RPM.
3. Treadmill higher speed+incline yields more than flat jog.
4. Elliptical/stepper scale properly with cadence/resistance.
5. 2h workout gets diminishing returns and stays within day cap.
6. Spike abuse does not produce disproportionate reward.
7. Limit reached messages and states are correct.

---

## Rollout Strategy

1. **Shadow mode (7 days):**
   - compute old and new drops in parallel,
   - store delta, do not change user balance yet.
2. **Pilot gyms (7-14 days):**
   - activate v2 for pilot cohort,
   - monitor burn/mint ratio and user feedback.
3. **Global rollout:**
   - enable v2 by default,
   - keep emergency rollback flag to old formula for 1 release cycle.

---

## Deal Breakers (No-Go)

- [ ] User can hit session cap in a few minutes via spikes.
- [ ] No machine-type differentiation in production formula.
- [ ] Long sessions either over-rewarded (inflation) or fully penalized (bad UX).
- [ ] No telemetry quality fallback behavior.
- [ ] No admin visibility into calculation policy.

---

## Deliverables

- Drop formula v2 spec + migration.
- Cap and diminishing-return enforcement.
- Mobile telemetry readiness.
- Admin calculator + controls.
- Automated test suite covering all machine types and edge cases.
