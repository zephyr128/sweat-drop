# Addendum: Activity Log includes Workouts (Dashboard V3)

**Date:** 2026-03-11  
**Base plan:** `docs/plans/admin_dashboard_premium_v3_plan.md`  
**Goal:** Extend Activity Log so gym operators can see workout lifecycle events, not only check-ins and redemptions.

---

## Decision (Locked)

Yes, `Activity Log` must include workout events.

### New workout event types

- `workout_started` — user started a workout on a machine
- `workout_finished` — user completed a workout with earned drops
- `workout_auto_finished` — session auto-finished due to inactivity policy
- `workout_cancelled` — session ended early/cancelled (if supported by current session finalization flow)

### Signal-to-noise policy

- **Dashboard preview (last 5):** include `checkin`, `redemption`, `workout_finished`, `workout_auto_finished`
- **Exclude** `workout_started` from preview (too noisy)
- **Activity Log screen:** show all workout event types with filters

---

## Data Source Strategy

Use `sessions` as source of truth for workout events.

- `workout_started`: derived from `sessions.started_at`
- `workout_finished`: derived from completed sessions (`is_active = false`) with normal completion semantics
- `workout_auto_finished`: derived from completed sessions where reason/source indicates inactivity auto-finish
- `workout_cancelled`: derived from completed sessions with cancel reason/status (only if current schema supports it)

If end reason is not stored consistently yet, add a normalized field in a follow-up migration:
- `sessions.end_reason TEXT CHECK (end_reason IN ('manual', 'inactivity_autofinish', 'cancelled', 'other'))`

---

## API Contract Changes

### 1) `get_gym_dashboard_overview(...)`

`deskFeed` union expands from 2 to 4 kinds:

```ts
kind: 'checkin' | 'redemption' | 'workout_finished' | 'workout_auto_finished'
```

Item shape remains:
- `id`, `kind`, `title`, `at`, `status`

### 2) `get_gym_activity_log(...)`

`p_kind` expands:

```sql
p_kind TEXT DEFAULT 'all'
-- allowed: 'all', 'checkin', 'redemption', 'workout'
```

Returned items include workout kinds:

```ts
kind: 'checkin' | 'redemption' | 'workout_started' | 'workout_finished' | 'workout_auto_finished' | 'workout_cancelled'
details: string // e.g. "Started workout on Bike #2" or "Finished workout (24 min, +38 drops)"
status: string  // e.g. active, completed, autofinished, cancelled, pending, confirmed
```

---

## Execution Plan Update

### Phase 1 — supabase-dba

1. Extend `get_gym_activity_log` to merge sessions-based workout events with existing check-ins/redemptions.
2. Extend `get_gym_dashboard_overview` desk feed to include only `workout_finished` and `workout_auto_finished`.
3. Add/verify indexes for activity performance:
   - `sessions(gym_id, started_at DESC)`
   - `sessions(gym_id, is_active, updated_at DESC)` (or equivalent end-time index)

### Phase 2 — admin-coder

1. Update Activity Log filters to:
   - `All | Check-ins | Redemptions | Workouts`
2. Add workout row rendering:
   - icon/badge per workout kind
   - details text includes machine name/type and drops when available
3. Keep dashboard preview concise:
   - include only completion-type workout events
   - keep max 5 records

### Phase 3 — reviewer

1. Verify ordering by timestamp across mixed event kinds.
2. Verify workout_started appears only on Activity Log page (not dashboard preview).
3. Verify event labels and status colors are consistent and understandable.
4. Verify no performance regression on gyms with high session volume.

---

## Validation Checklist

- [ ] Activity Log shows workout start/finish events with member + machine context
- [ ] Dashboard preview stays low-noise and operationally useful
- [ ] Workout filter works independently from check-in/redemption filters
- [ ] Pagination still works with merged datasets
- [ ] Query latency remains within target budget
- [ ] No unauthorized cross-gym activity leakage

---

## Prompt Delta (for Agents)

### DBA delta
- Extend both RPCs to include workout events from `sessions`.
- Add `workout` filter support in `get_gym_activity_log`.
- Keep dashboard feed restricted to completion-type workout events.

### Admin delta
- Add `Workouts` tab in Activity Log.
- Add row UI for workout event kinds and statuses.
- Keep dashboard preview to 5 events and no `workout_started`.

