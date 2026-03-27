# Feature: Happy Hour Visibility + Reminder Notifications

**Date:** 2026-03-11  
**Priority:** High (acquisition + retention + predictable gym traffic)  
**Scope:** `apps/mobile-app`, `apps/admin-panel`, `backend/supabase`

---

## Context

Users must clearly know **when next Happy Hour starts** so they can plan gym visits.  
Relying only on “active now” state is not enough.

We need:
1. visible “Upcoming Happy Hours” on mobile home screen
2. optional push reminder before start
3. clear admin controls for visibility/reminder behavior

---

## Product Decisions (Locked)

1. Implement **both** channels:
   - In-app visibility (home card/list)
   - Push reminders (opt-in, not mandatory)
2. Show at most **next 3 upcoming windows** (avoid clutter).
3. Reminder presets:
   - `30 min before`
   - `10 min before`
   - `At start`
4. Respect user preferences:
   - global push enable
   - per-topic toggle: `happy_hour_reminders`
5. If no upcoming windows, show compact empty state:
   - “No upcoming Happy Hour this week”.

---

## Dependencies

- `docs/plans/staff_identity_engagement_promotions_realtime_master_plan.md` (Workstream D)
- Existing happy hour rule model from D2:
  - `gym_drop_boost_rules`
  - `get_active_drop_boost(...)`
- Existing push infrastructure:
  - `profiles.expo_push_token`
  - mobile notifications module (`apps/mobile-app/lib/notifications.ts`)

---

## Data Model Changes (supabase-dba)

Create migration: `YYYYMMDD000005_happy_hour_user_visibility_and_reminders.sql`

### 1) Rule visibility fields
Extend `gym_drop_boost_rules`:
- `is_visible_to_members BOOLEAN NOT NULL DEFAULT true`
- `display_label TEXT NULL` (optional marketing title: “Morning Boost”)

### 2) User preference fields
Option A (recommended): add to `profiles`
- `happy_hour_reminders_enabled BOOLEAN NOT NULL DEFAULT true`
- `happy_hour_reminder_offset_min INT NOT NULL DEFAULT 30`  
  CHECK in `(0, 10, 30)`

### 3) Reminder delivery dedupe table
Create `happy_hour_reminder_logs`:
- `id`
- `gym_id`
- `user_id`
- `rule_id`
- `window_start_at`
- `offset_min`
- `sent_at`
- unique `(user_id, rule_id, window_start_at, offset_min)` to avoid duplicate sends

---

## API Contracts (supabase-dba)

### 1) Upcoming windows RPC
`get_upcoming_happy_hours(p_gym_id UUID, p_limit INT DEFAULT 3)`

Returns:
- `rule_id`
- `label`
- `multiplier`
- `start_at`
- `end_at`
- `minutes_until_start`
- `is_today`

Only visible rules (`is_visible_to_members = true`).

### 2) User reminder preference RPC
`set_happy_hour_reminder_pref(p_enabled BOOLEAN, p_offset_min INT)`

Auth-scoped to `auth.uid()` only.

### 3) Admin preview helper RPC (optional)
`get_happy_hour_schedule_preview(p_gym_id UUID, p_days INT DEFAULT 7)`

Used for admin confidence and conflict debugging.

---

## Execution Plan

### Step 1 — Backend (supabase-dba)

1. Add migration fields/tables above.
2. Implement `get_upcoming_happy_hours`.
3. Implement `set_happy_hour_reminder_pref`.
4. Add index support for fast upcoming queries:
   - by `gym_id`, `is_active`, `is_visible_to_members`.
5. Add migration notes entry with rollback.

### Step 2 — Push Scheduler (supabase-dba / edge-function agent)

1. Create edge function `send-happy-hour-reminders`.
2. Trigger schedule every 5 minutes:
   - finds windows starting in target offsets (30/10/0)
   - filters members with:
     - push token present
     - `happy_hour_reminders_enabled = true`
   - respects chosen offset
3. Deduplicate via `happy_hour_reminder_logs`.
4. Push payload includes deep link to home/workout start.

### Step 3 — Mobile UX (mobile-coder)

1. Home screen:
   - add `UpcomingHappyHoursCard`:
     - “Starts in X min”
     - shows next up to 3 windows
     - shows multiplier badge (e.g. `x1.5`)
2. If active now:
   - top badge: “Happy Hour Live”.
3. Settings:
   - add reminder toggle + offset selector (30/10/start).
4. Localized strings (EN + SR).

### Step 4 — Admin UX (admin-coder)

1. In Happy Hour rules manager:
   - `Visible to members` toggle
   - display label field
2. Add schedule preview panel:
   - next 7 days windows
   - “Member-visible” marker
3. Optional quick action:
   - “Send test reminder to me”.

### Step 5 — Realtime polish (admin-coder + mobile-coder)

1. When rules change, update visible upcoming card/list without full refresh.
2. Fallback polling every 60s on home for upcoming windows.

---

## Testing Requirements

### Functional
- [ ] Home screen shows upcoming Happy Hours correctly.
- [ ] Active Happy Hour switches card state from upcoming → live.
- [ ] User can disable reminders and receives none.
- [ ] User receives reminder at selected offset (30/10/0).

### Data Integrity
- [ ] No duplicate reminder pushes for same rule window+offset.
- [ ] Hidden rules (`is_visible_to_members=false`) never appear on home.

### Time/Timezone
- [ ] Boundary tests across midnight and DST changes.
- [ ] Gym timezone respected in upcoming calculation.

### Performance
- [ ] Upcoming RPC responds within target budget (<150ms typical).
- [ ] Home card render does not regress startup performance.

---

## Rollout Order

1. `supabase-dba` — schema + RPCs  
2. `supabase-dba`/edge — reminder scheduler  
3. `mobile-coder` — home card + settings toggles  
4. `admin-coder` — visibility controls + schedule preview  
5. `reviewer` + `test-automation-agent` — reliability and timezone QA

