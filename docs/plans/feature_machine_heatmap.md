# Feature: Machine Analytics Dashboard — Heatmap + Live Monitor

**Datum:** 2026-03-11 (updated 2026-03-12)
**Prioritet:** Feature
**Lokacija:** Admin Panel → Machines

## Context

The current "Machine Usage" widget (`MachineHeatmapWidget.tsx`) is minimal — it only shows a bar chart of the top 3 machines aggregated by type. Gym owners need a comprehensive machine analytics dashboard to understand usage patterns, optimize floor layouts, identify underused equipment, and plan peak-hour staffing. They also need **real-time visibility** into which machines are currently in use, who's on them, and how their workout is going.

### Available Live Data (from codebase exploration)

The mobile app already pushes real-time data during workouts:
- **Machine heartbeat** every **10 seconds** → `machines.last_heartbeat` (via `update_machine_heartbeat` RPC)
- **RPM updates** every **30 seconds** → `machines.last_rpm` (via `update_machine_rpm` RPC)
- **Session sync** every **30 seconds** → `sessions.duration_seconds`, `average_rpm`, `calories` (direct update)
- **Machine lock/unlock** → `machines.is_busy`, `machines.current_user_id` (via `lock_machine`/`unlock_machine` RPCs)

Supabase Realtime is enabled in config, and `@supabase/realtime-js` is already a dependency in the admin panel (unused so far).

## Design Vision

A modern, dark-themed analytics dashboard under the Machines section with **two tabs**:

### Tab 1: Live Monitor (real-time)
- **Live gym floor view** with all machines showing current status
- **Active workout cards** with user avatar, name, duration, RPM, calories
- **Status ring summary** (X active / Y busy / Z available / W maintenance)
- **Auto-refreshing** via Supabase Realtime subscriptions (instant) with polling fallback (15s)

### Tab 2: Analytics (historical)
- **Time × Day heatmap grid** (GitHub-style) showing peak usage
- **Per-machine analytics** with sparklines
- **Zone & type utilization breakdown**
- **KPI summary cards**

## Dependencies

- `sessions` table — has `machine_id`, `started_at`, `ended_at`, `duration_seconds`, `drops_earned`, `calories`, `is_active`, `average_rpm`, `user_id`
- `machines` table — has `name`, `type`, `zone`, `is_busy`, `is_under_maintenance`, `current_user_id`, `last_heartbeat`, `last_rpm`, `is_active`
- `profiles` table — has `username`, `avatar_url`, `full_name` (joinable via `machines.current_user_id`)
- Chart.js already installed (`react-chartjs-2`, `chart.js`)
- `@supabase/realtime-js` already in admin panel `package.json` (unused — we'll use it now)
- `@supabase/ssr` client available at `apps/admin-panel/lib/supabase-client.ts`
- Tailwind CSS + dark theme already established

---

## Execution Order

```
PHASE 1: DBA Agent   — New RPCs: get_machine_analytics_dashboard + get_live_machine_status
                       Enable Realtime publication for machines + sessions tables
PHASE 2: Admin Agent — New page with two tabs (Live Monitor + Analytics)
                       Supabase Realtime subscription for live updates
```

---

## PHASE 1 — DBA Agent

### Task 1A: Create `get_machine_analytics_dashboard` RPC

**Migration:** `backend/supabase/migrations/20260312000010_machine_analytics_dashboard.sql`

This function returns all data needed by the frontend in a single call.

```sql
CREATE OR REPLACE FUNCTION public.get_machine_analytics_dashboard(
  p_gym_id UUID,
  p_days   INTEGER DEFAULT 30  -- lookback window
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result    JSONB;
  v_from_date TIMESTAMPTZ := NOW() - (p_days || ' days')::INTERVAL;
BEGIN
  SELECT jsonb_build_object(

    -- 1. KPI summary
    'kpi', (
      SELECT jsonb_build_object(
        'total_sessions',    COUNT(*),
        'total_drops',       COALESCE(SUM(s.drops_earned), 0),
        'avg_duration_min',  ROUND(COALESCE(AVG(s.duration_seconds) / 60.0, 0), 1),
        'unique_users',      COUNT(DISTINCT s.user_id),
        'avg_sessions_per_day', ROUND(COUNT(*)::NUMERIC / GREATEST(p_days, 1), 1)
      )
      FROM sessions s
      WHERE s.gym_id = p_gym_id
        AND s.machine_id IS NOT NULL
        AND s.is_active = false
        AND s.created_at >= v_from_date
    ),

    -- 2. Hourly heatmap: day_of_week (0=Sun..6=Sat) × hour (0-23) → session count
    'hourly_heatmap', (
      SELECT COALESCE(jsonb_agg(row_to_json(h)), '[]'::jsonb)
      FROM (
        SELECT
          EXTRACT(DOW FROM s.started_at AT TIME ZONE 'Europe/Belgrade')::INT AS dow,
          EXTRACT(HOUR FROM s.started_at AT TIME ZONE 'Europe/Belgrade')::INT AS hour,
          COUNT(*) AS sessions,
          COALESCE(SUM(s.drops_earned), 0) AS drops,
          ROUND(COALESCE(AVG(s.duration_seconds) / 60.0, 0), 1) AS avg_min
        FROM sessions s
        WHERE s.gym_id = p_gym_id
          AND s.machine_id IS NOT NULL
          AND s.is_active = false
          AND s.created_at >= v_from_date
        GROUP BY 1, 2
        ORDER BY 1, 2
      ) h
    ),

    -- 3. Per-machine stats
    'machine_stats', (
      SELECT COALESCE(jsonb_agg(row_to_json(ms) ORDER BY ms.sessions DESC), '[]'::jsonb)
      FROM (
        SELECT
          m.id,
          m.name,
          m.type,
          m.zone,
          m.is_active,
          m.is_busy,
          m.is_under_maintenance,
          COUNT(s.id) AS sessions,
          COUNT(DISTINCT s.user_id) AS unique_users,
          COALESCE(SUM(s.drops_earned), 0) AS total_drops,
          ROUND(COALESCE(AVG(s.duration_seconds) / 60.0, 0), 1) AS avg_duration_min,
          ROUND(COALESCE(SUM(s.duration_seconds) / 3600.0, 0), 1) AS total_hours,
          -- Utilization: hours used / (hours in period × machines)
          ROUND(
            COALESCE(SUM(s.duration_seconds), 0)::NUMERIC
            / GREATEST(p_days * 12 * 3600, 1)  -- assume 12 operating hours/day
            * 100, 1
          ) AS utilization_pct,
          -- Daily sparkline: last 7 days session counts
          (
            SELECT COALESCE(jsonb_agg(day_count ORDER BY d), '[]'::jsonb)
            FROM (
              SELECT
                d::DATE AS d,
                COUNT(s2.id) AS day_count
              FROM generate_series(
                (NOW() - INTERVAL '6 days')::DATE,
                NOW()::DATE,
                '1 day'
              ) d
              LEFT JOIN sessions s2
                ON s2.machine_id = m.id
                AND s2.is_active = false
                AND DATE(s2.started_at AT TIME ZONE 'Europe/Belgrade') = d::DATE
              GROUP BY d
            ) spark
          ) AS sparkline
        FROM machines m
        LEFT JOIN sessions s
          ON s.machine_id = m.id
          AND s.is_active = false
          AND s.created_at >= v_from_date
        WHERE m.gym_id = p_gym_id
        GROUP BY m.id, m.name, m.type, m.zone, m.is_active, m.is_busy, m.is_under_maintenance
      ) ms
    ),

    -- 4. Zone breakdown
    'zone_stats', (
      SELECT COALESCE(jsonb_agg(row_to_json(zs) ORDER BY zs.sessions DESC), '[]'::jsonb)
      FROM (
        SELECT
          COALESCE(m.zone, 'Unassigned') AS zone,
          COUNT(DISTINCT m.id) AS machine_count,
          COUNT(s.id) AS sessions,
          COALESCE(SUM(s.drops_earned), 0) AS total_drops,
          ROUND(COALESCE(AVG(s.duration_seconds) / 60.0, 0), 1) AS avg_duration_min
        FROM machines m
        LEFT JOIN sessions s
          ON s.machine_id = m.id
          AND s.is_active = false
          AND s.created_at >= v_from_date
        WHERE m.gym_id = p_gym_id
        GROUP BY COALESCE(m.zone, 'Unassigned')
      ) zs
    ),

    -- 5. Type breakdown
    'type_stats', (
      SELECT COALESCE(jsonb_agg(row_to_json(ts) ORDER BY ts.sessions DESC), '[]'::jsonb)
      FROM (
        SELECT
          m.type,
          COUNT(DISTINCT m.id) AS machine_count,
          COUNT(s.id) AS sessions,
          COALESCE(SUM(s.drops_earned), 0) AS total_drops,
          ROUND(COALESCE(AVG(s.duration_seconds) / 60.0, 0), 1) AS avg_duration_min
        FROM machines m
        LEFT JOIN sessions s
          ON s.machine_id = m.id
          AND s.is_active = false
          AND s.created_at >= v_from_date
        WHERE m.gym_id = p_gym_id
        GROUP BY m.type
      ) ts
    ),

    -- 6. Peak hour identification
    'peak_hour', (
      SELECT jsonb_build_object('hour', h.hour, 'sessions', h.cnt)
      FROM (
        SELECT
          EXTRACT(HOUR FROM s.started_at AT TIME ZONE 'Europe/Belgrade')::INT AS hour,
          COUNT(*) AS cnt
        FROM sessions s
        WHERE s.gym_id = p_gym_id
          AND s.machine_id IS NOT NULL
          AND s.is_active = false
          AND s.created_at >= v_from_date
        GROUP BY 1
        ORDER BY cnt DESC
        LIMIT 1
      ) h
    ),

    -- 7. Busiest machine
    'busiest_machine', (
      SELECT jsonb_build_object('name', bm.name, 'type', bm.type, 'sessions', bm.cnt)
      FROM (
        SELECT m.name, m.type, COUNT(*) AS cnt
        FROM sessions s
        JOIN machines m ON m.id = s.machine_id
        WHERE s.gym_id = p_gym_id
          AND s.is_active = false
          AND s.created_at >= v_from_date
        GROUP BY m.name, m.type
        ORDER BY cnt DESC
        LIMIT 1
      ) bm
    )

  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_machine_analytics_dashboard(UUID, INTEGER) TO authenticated;
```

### Task 1B: Create `get_live_machine_status` RPC

This function returns the current state of all machines in a gym, joined with
active session data and user profile info. Designed for the Live Monitor tab.

Add to the same migration file:

```sql
CREATE OR REPLACE FUNCTION public.get_live_machine_status(
  p_gym_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'timestamp', NOW(),

    -- 1. Summary counts
    'summary', (
      SELECT jsonb_build_object(
        'total_machines',  COUNT(*),
        'active_now',      COUNT(*) FILTER (WHERE m.is_busy = true),
        'available',       COUNT(*) FILTER (WHERE m.is_busy = false AND m.is_active = true AND COALESCE(m.is_under_maintenance, false) = false),
        'maintenance',     COUNT(*) FILTER (WHERE COALESCE(m.is_under_maintenance, false) = true),
        'inactive',        COUNT(*) FILTER (WHERE m.is_active = false)
      )
      FROM machines m
      WHERE m.gym_id = p_gym_id
    ),

    -- 2. All machines with current state + active user/session data
    'machines', (
      SELECT COALESCE(jsonb_agg(row_to_json(mdata) ORDER BY mdata.is_busy DESC, mdata.name), '[]'::jsonb)
      FROM (
        SELECT
          m.id,
          m.name,
          m.type,
          m.zone,
          m.is_active,
          m.is_busy,
          COALESCE(m.is_under_maintenance, false) AS is_under_maintenance,
          m.last_heartbeat,
          m.last_rpm,

          -- Current user info (NULL when not busy)
          CASE WHEN m.is_busy AND m.current_user_id IS NOT NULL THEN
            jsonb_build_object(
              'id',         p.id,
              'username',   COALESCE(p.username, p.full_name, 'Unknown'),
              'avatar_url', p.avatar_url,
              'full_name',  p.full_name
            )
          ELSE NULL END AS current_user,

          -- Active session info (NULL when not busy)
          CASE WHEN m.is_busy THEN (
            SELECT jsonb_build_object(
              'id',               s.id,
              'started_at',       s.started_at,
              'duration_seconds', s.duration_seconds,
              'average_rpm',      s.average_rpm,
              'calories',         COALESCE(s.calories, 0),
              'drops_earned',     COALESCE(s.drops_earned, 0),
              'elapsed_seconds',  EXTRACT(EPOCH FROM (NOW() - s.started_at))::INT
            )
            FROM sessions s
            WHERE s.machine_id = m.id
              AND s.is_active = true
            ORDER BY s.started_at DESC
            LIMIT 1
          ) ELSE NULL END AS active_session

        FROM machines m
        LEFT JOIN profiles p ON p.id = m.current_user_id
        WHERE m.gym_id = p_gym_id
      ) mdata
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_live_machine_status(UUID) TO authenticated;
```

**Key design decisions:**
- `elapsed_seconds` is computed server-side from `NOW() - started_at`, giving the admin a live timer even if session `duration_seconds` hasn't been synced yet
- Busy machines sorted first so the live view highlights active workouts at the top
- `last_rpm` comes directly from the machine row (updated every 30s by mobile app)
- `last_heartbeat` lets the frontend detect stale machines (no heartbeat >60s = possibly disconnected)

### Task 1C: Enable Supabase Realtime for `machines` table

Add to the same migration. This enables the admin panel to subscribe to live changes
instead of polling.

```sql
-- Enable Realtime publication for the machines table
-- This allows admin panel to subscribe to INSERT/UPDATE/DELETE events
ALTER PUBLICATION supabase_realtime ADD TABLE machines;

-- Sessions table is also useful for detecting new workout starts/ends
ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
```

**NOTE:** If the Supabase project uses the hosted dashboard, publication may need to be
enabled there too. The migration handles self-hosted/local environments. If the
`ALTER PUBLICATION` fails because the table is already in the publication, wrap in a
DO block:

```sql
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE machines;
EXCEPTION WHEN duplicate_object THEN
  NULL; -- already in publication
END;
$$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
EXCEPTION WHEN duplicate_object THEN
  NULL; -- already in publication
END;
$$;
```

### Task 1D: Grant permissions

Both functions use `STABLE SECURITY DEFINER` so they run with definer privileges.
No extra RLS changes needed — the functions handle the gym_id filter internally.

### Validation

```sql
-- Test analytics RPC:
SELECT get_machine_analytics_dashboard('YOUR_GYM_ID', 30);
-- Verify: kpi, hourly_heatmap, machine_stats, zone_stats, type_stats, peak_hour, busiest_machine

-- Test live status RPC:
SELECT get_live_machine_status('YOUR_GYM_ID');
-- Verify: summary (total/active/available/maintenance counts), machines array
-- Each busy machine should have current_user and active_session populated

-- Verify Realtime:
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
-- Should include 'machines' and 'sessions'
```

---

## PHASE 2 — Admin Agent

### Task 2A: No additional dependencies needed

- `@supabase/realtime-js` — already in `package.json` (used for live subscriptions)
- `chart.js` + `react-chartjs-2` — already installed (for breakdowns if needed)
- Heatmap: use custom CSS Grid of div cells (no `chartjs-chart-matrix` needed)

### Task 2B: Create server actions

**File:** `apps/admin-panel/lib/actions/machine-analytics-actions.ts`

```typescript
'use server';

import { getAdminClient } from '@/lib/utils/supabase-admin';

export async function getMachineAnalytics(gymId: string, days: number = 30) {
  const supabase = getAdminClient();
  if (!supabase) return { success: false, error: 'Admin client not available' };

  const { data, error } = await supabase.rpc('get_machine_analytics_dashboard', {
    p_gym_id: gymId,
    p_days: days,
  });

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function getLiveMachineStatus(gymId: string) {
  const supabase = getAdminClient();
  if (!supabase) return { success: false, error: 'Admin client not available' };

  const { data, error } = await supabase.rpc('get_live_machine_status', {
    p_gym_id: gymId,
  });

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}
```

### Task 2C: Create the analytics page (TWO TABS)

**File:** `apps/admin-panel/app/dashboard/gym/[id]/machines/analytics/page.tsx`

This is a NEW route: `/dashboard/gym/[gymId]/machines/analytics`

The page has **two tabs**: Live Monitor and Analytics.

**Page structure:**
```
┌─────────────────────────────────────────────────────────────────────┐
│  Machine Hub                  [◉ Live Monitor]  [📊 Analytics]      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ════════════════════════════════════════════════════════════════   │
│  TAB 1: LIVE MONITOR (default view)                                 │
│  ════════════════════════════════════════════════════════════════   │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │  STATUS SUMMARY                            ● Live  (pulsing)  │ │
│  │                                                               │ │
│  │  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐                     │ │
│  │  │ 🟢 3 │  │ 🔵 12│  │ 🟡 1 │  │ 🔴 0 │                     │ │
│  │  │Active│  │Avail │  │Maint │  │Inact │                     │ │
│  │  └──────┘  └──────┘  └──────┘  └──────┘                     │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │  GYM FLOOR — MACHINE GRID                                     │ │
│  │                                                               │ │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌────────────┐ │ │
│  │  │ ◉ Treadmill #1    │  │ ● Bike #3         │  │ ○ Ellip #2 │ │ │
│  │  │ ━━━━━━━━━━━━━━━━ │  │ ━━━━━━━━━━━━━━━━ │  │            │ │ │
│  │  │ 👤 john_doe       │  │ 👤 maria_fit      │  │  Available │ │ │
│  │  │ ⏱ 24:35          │  │ ⏱ 12:08          │  │            │ │ │
│  │  │ 🔄 78 RPM        │  │ 🔄 92 RPM        │  │            │ │ │
│  │  │ 🔥 156 cal       │  │ 🔥 89 cal        │  │            │ │ │
│  │  │ 💧 23 drops      │  │ 💧 11 drops      │  │            │ │ │
│  │  │                    │  │                    │  │            │ │ │
│  │  │ ▓▓▓▓▓▓▓▓░░░ 73%  │  │ ▓▓▓▓░░░░░░ 40%   │  │            │ │ │
│  │  │ (duration bar)     │  │ (duration bar)     │  │            │ │ │
│  │  └──────────────────┘  └──────────────────┘  └────────────┘ │ │
│  │                                                               │ │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌────────────┐ │ │
│  │  │ ◉ Weight #1       │  │ ⚠ Treadmill #4   │  │ ○ Bike #5  │ │ │
│  │  │ ━━━━━━━━━━━━━━━━ │  │                    │  │            │ │ │
│  │  │ 👤 alex_strong    │  │  🔧 Maintenance   │  │  Available │ │ │
│  │  │ ⏱ 45:12          │  │  Since 2d ago      │  │            │ │ │
│  │  │ 🔄 -- RPM        │  │                    │  │            │ │ │
│  │  │ 🔥 312 cal       │  │                    │  │            │ │ │
│  │  │ 💧 48 drops      │  │                    │  │            │ │ │
│  │  │ ▓▓▓▓▓▓▓▓▓▓▓ 95%  │  │                    │  │            │ │ │
│  │  └──────────────────┘  └──────────────────┘  └────────────┘ │ │
│  │                                                               │ │
│  │  Legend: ◉ In Use  ○ Available  ⚠ Maintenance                │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │  ACTIVE WORKOUTS (detailed list)           3 sessions now     │ │
│  │  ─────────────────────────────────────────────────────────── │ │
│  │  Avatar  User          Machine        Duration  RPM   Cal   │ │
│  │  ──────  ────────────  ─────────────  ────────  ───   ───   │ │
│  │  🟢 📷  john_doe      Treadmill #1   24:35     78    156   │ │
│  │  🟢 📷  alex_strong   Weight #1      45:12     --    312   │ │
│  │  🟢 📷  maria_fit     Bike #3        12:08     92     89   │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ════════════════════════════════════════════════════════════════   │
│  TAB 2: ANALYTICS (same as before)                                  │
│  ════════════════════════════════════════════════════════════════   │
│                                                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐              │
│  │ Sessions │ │ Avg Min  │ │ Peak     │ │ Top      │              │
│  │   1,247  │ │   34.2   │ │  17:00   │ │ T-Mill 3 │              │
│  │ ▲12%     │ │ ▲ 2.1    │ │ 89 sess  │ │ 203 sess │              │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘              │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              USAGE HEATMAP (Hour × Day)                      │   │
│  │     Mon  Tue  Wed  Thu  Fri  Sat  Sun                        │   │
│  │ 06  ░░   ░░   ░░   ░░   ░░   ▒▒   ░░                       │   │
│  │ 07  ▒▒   ▒▒   ▒▒   ▒▒   ▒▒   ▓▓   ░░                       │   │
│  │ ...                                                           │   │
│  │ 17  ██   ██   ██   ██   ██   ▓▓   ▒▒   ← peak              │   │
│  │ 22  ░░   ░░   ░░   ░░   ▒▒   ░░   ░░                       │   │
│  │  ░ Low   ▒ Medium   ▓ High   █ Peak                         │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ... (rest of analytics: type/zone breakdown, machine fleet)        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Task 2D: Create components

**Components to create (all in `apps/admin-panel/components/analytics/`):**

---

#### LIVE MONITOR COMPONENTS

#### 1. `LiveMachineMonitor.tsx` — Main live monitor client component

- Accepts `gymId` prop
- **Initial data fetch:** calls `getLiveMachineStatus(gymId)` on mount
- **Realtime subscription:** subscribes to Supabase Realtime on `machines` and `sessions` tables
  filtered by `gym_id = gymId` to receive instant updates
- **Polling fallback:** if Realtime fails or as a safety net, poll every **15 seconds**
- Renders `StatusSummary`, `MachineGrid`, and `ActiveWorkoutsList`
- Shows a pulsing green "● Live" indicator in the header when connected
- Shows "● Reconnecting..." in yellow if Realtime disconnects

**Realtime subscription pattern (use client-side supabase from `@/lib/supabase-client`):**

```typescript
import { supabase } from '@/lib/supabase-client';

// Subscribe to machine status changes (lock/unlock/heartbeat/RPM)
const machineChannel = supabase
  .channel(`machines-${gymId}`)
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'machines',
    filter: `gym_id=eq.${gymId}`,
  }, (payload) => {
    // Update specific machine in state without full refetch
    updateMachineInState(payload.new);
  })
  .subscribe((status) => {
    setRealtimeConnected(status === 'SUBSCRIBED');
  });

// Subscribe to session changes (new workout start, workout end)
const sessionChannel = supabase
  .channel(`sessions-${gymId}`)
  .on('postgres_changes', {
    event: '*', // INSERT (new workout), UPDATE (sync/end), DELETE
    schema: 'public',
    table: 'sessions',
    filter: `gym_id=eq.${gymId}`,
  }, (payload) => {
    // On session INSERT/UPDATE/DELETE, refetch full state to get joined user data
    refetchLiveStatus();
  })
  .subscribe();

// Cleanup on unmount
return () => {
  supabase.removeChannel(machineChannel);
  supabase.removeChannel(sessionChannel);
};
```

**State management approach:**
- Keep full `LiveMachineData` in state
- On machine UPDATE events: patch the specific machine in the array (fast, no refetch)
- On session events: do a full `getLiveMachineStatus` refetch (to get joined profile data)
- `elapsed_seconds` on active sessions: use a local `setInterval(1000)` to tick the timer
  up client-side, reset on each server sync

#### 2. `StatusSummaryBar.tsx` — Colored status ring/bar

- **Input:** `summary` object from `get_live_machine_status`
- Shows 4 colored count badges in a horizontal row:
  - 🟢 Green: Active Now (machines with `is_busy = true`)
  - 🔵 Blue: Available (machines ready to use)
  - 🟡 Yellow: Maintenance (`is_under_maintenance = true`)
  - ⚫ Gray: Inactive (`is_active = false`)
- Each badge: large number + label below
- Animate count changes with a brief scale/pulse transition
- Style: `bg-[#0A0A0A] border border-[#2A2A2A] rounded-xl p-4`

#### 3. `MachineGrid.tsx` — Visual grid of all machines (THE LIVE CENTERPIECE)

- **Input:** `machines` array from `get_live_machine_status`
- Renders a responsive grid of machine cards (3-4 columns on desktop, 2 on tablet)
- Each card represents one machine with visual state:

**Busy machine card:**
```
┌─────────────────────────┐
│ ◉ Treadmill #1    🏃    │  ← Green left border + glowing outline
│ ─────────────────────── │
│ 👤 john_doe              │  ← Avatar circle + username
│                          │
│ ⏱ 24:35     🔄 78 RPM   │  ← Live timer (ticks every second)
│ 🔥 156 cal   💧 23 drops │
│                          │
│ ▓▓▓▓▓▓▓▓░░░░░░ 24m/45m  │  ← Duration progress bar (if avg known)
│ Floor 1                  │  ← Zone badge
└─────────────────────────┘
```

**Available machine card:**
```
┌─────────────────────────┐
│ ○ Bike #5         🚴    │  ← Dim border, muted colors
│                          │
│        Available         │  ← Centered status text
│                          │
│ Floor 2                  │
└─────────────────────────┘
```

**Maintenance machine card:**
```
┌─────────────────────────┐
│ ⚠ Treadmill #4    🏃    │  ← Yellow left border
│                          │
│    🔧 Maintenance        │  ← Centered with wrench icon
│    Since 2 days ago      │
│                          │
│ Floor 1                  │
└─────────────────────────┘
```

**Card design rules:**
- Busy cards: `border-l-4 border-l-emerald-500`, subtle `shadow-emerald-500/10` glow
- Available cards: `border border-[#2A2A2A] opacity-60`
- Maintenance cards: `border-l-4 border-l-amber-500`
- Inactive cards: `border border-[#1A1A1A] opacity-30`
- Cards sorted: Busy first → Available → Maintenance → Inactive
- **Live timer:** `elapsed_seconds` ticks up locally every second via `setInterval`
- **RPM display:** show `last_rpm` from machine, display `--` if 0 or null
- **Stale detection:** if `last_heartbeat` is more than 60s old on a busy machine,
  show a warning badge "⚠ No signal" — the mobile app may have disconnected

#### 4. `ActiveWorkoutsList.tsx` — Detailed table of current workouts

- **Input:** machines array (filtered to `is_busy = true` with `active_session`)
- Table with columns:
  - Status dot (animated green pulse)
  - User avatar (rounded, 32px, fallback to initials)
  - Username / full_name
  - Machine name + type icon
  - Duration (live ticking timer: `MM:SS`)
  - RPM (from `last_rpm`, update in real-time)
  - Calories (from `active_session.calories`)
  - Drops earned so far (from `active_session.drops_earned`)
- Sort by duration descending (longest workout first)
- Empty state: "No active workouts right now" with a subtle animation
- Style: dark table with row hover highlighting

---

#### ANALYTICS COMPONENTS (from original plan)

#### 5. `MachineAnalyticsDashboard.tsx` — Main analytics client component

- Accepts `gymId` prop
- Fetches data via `getMachineAnalytics(gymId, days)` on mount and when period changes
- Manages period state (7, 30, 90 days)
- Renders all analytics sub-components
- Loading skeleton with pulse animation

#### 6. `HeatmapGrid.tsx` — Time × Day heatmap (THE ANALYTICS CENTERPIECE)

- **Input:** `hourly_heatmap` array of `{ dow, hour, sessions, drops, avg_min }`
- **Render:** CSS Grid / flex with `7 columns (Mon→Sun) × 17 rows (6AM→22PM)`
- Each cell is a rounded rectangle (like GitHub contribution calendar)
- **Color scale:** 4-step gradient using CSS custom properties:
  - 0 sessions: `#1A1A1A` (empty/dark)
  - Low (1-25th percentile): `#0D3B4F` (dark teal)
  - Medium (25-75th): `#0891B2` (cyan-600)
  - High (75-95th): `#00E5FF` (primary)
  - Peak (95-100th): `#FFFFFF` (white hot)
- **Hover tooltip:** show exact count, drops earned, avg duration for that cell
- **Row labels:** hours (06, 07, ... 22) on the left
- **Column labels:** Mon, Tue, ... Sun on top
- Responsive: shrinks cells on smaller screens

#### 7. `MachineFleetTable.tsx` — Per-machine table with sparklines

- **Input:** `machine_stats` array
- **Columns:**
  - Status indicator (colored dot: green=active, yellow=busy, red=maintenance, gray=inactive)
  - Machine name
  - Type (icon + abbreviation)
  - Zone (badge)
  - Sessions count
  - Avg duration (minutes)
  - Utilization % (progress bar)
  - 7-day sparkline (inline SVG: 7 tiny bars, max 16px height)
- **Sorting:** click column headers to sort
- **Filtering:** optional type filter pills at top

#### 8. `KPICards.tsx` — Top stat cards

- 4 cards in a grid row
- Each card: label, big number, optional delta/trend
- Cards:
  1. Total Sessions (with period comparison)
  2. Avg Duration (minutes)
  3. Peak Hour (with session count)
  4. Top Machine (name + sessions)
- Style: `bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl p-5`

#### 9. `TypeZoneBreakdown.tsx` — Side-by-side breakdown cards

- Two cards side by side (50/50 grid)
- **Type card:** horizontal stacked bar showing % by type, with labels
- **Zone card:** horizontal bars showing session % by zone
- Style: same dark card theme

---

#### PAGE CONTAINER

#### 10. `MachineHubPage.tsx` — Tab container component

- **File:** `apps/admin-panel/components/analytics/MachineHubPage.tsx`
- Accepts `gymId` prop
- Manages active tab state: `'live'` | `'analytics'`
- Default tab: `'live'` (Live Monitor shown first)
- Tab bar design:
  - Two tab buttons at top right of page header
  - Active: `bg-[#00E5FF] text-black font-bold rounded-lg px-4 py-2`
  - Inactive: `bg-[#1A1A1A] text-[#808080] border border-[#333] rounded-lg px-4 py-2`
  - Live tab has a pulsing dot indicator: `◉ Live Monitor`
  - Analytics tab has chart icon: `📊 Analytics`
- Lazy-loads the inactive tab content (only fetch data when tab is selected)
- Back button linking to `/dashboard/gym/${gymId}/machines`

### Task 2E: Add navigation link

**File:** `apps/admin-panel/components/modules/MachinesManager.tsx`

Add an "Analytics" button at the top of the machines list (near "+ Add Machine") that links
to `/dashboard/gym/${gymId}/machines/analytics`.

Style: ghost/outline button with chart icon:
```
<Link href={`/dashboard/gym/${gymId}/machines/analytics`}>
  <BarChart3 /> Machine Hub
</Link>
```

### Task 2F: Replace old widget on dashboard

**File:** `apps/admin-panel/components/analytics/MachineHeatmapWidget.tsx`

Replace the existing simple bar chart with a **mini live status card**:
- Show count of active machines right now (e.g., "3 machines in use")
- Show total active users and a "View Live →" link to the analytics page
- This gives the dashboard an at-a-glance live view while keeping it clean

```
┌─────────────────────────────┐
│  Machine Status         🟢   │
│  ──────────────────────────  │
│  3 machines active now       │
│  3 users working out         │
│                              │
│  View Machine Hub →          │
└─────────────────────────────┘
```

---

## UI Design Specifications

### Color Palette

**Heatmap cells:**
```
--heat-0: #1A1A1A    // empty — matches card background
--heat-1: #0D3B4F    // low — dark teal
--heat-2: #0E7490    // medium — cyan-700
--heat-3: #00B8CC    // high — near primary
--heat-4: #00E5FF    // peak — primary cyan
--heat-5: #ECFEFF    // extreme — near white
```

**Machine status colors:**
```
--status-active:      #10B981  // emerald-500 — machine in use
--status-available:   #3B82F6  // blue-500 — ready to use
--status-maintenance: #F59E0B  // amber-500 — under maintenance
--status-inactive:    #6B7280  // gray-500 — turned off
```

### Heatmap Cell Sizing

- Each cell: `w-10 h-7` (40px × 28px) on desktop
- On smaller screens: `w-7 h-5` (28px × 20px)
- `border-radius: 3px`, `gap: 2px`, `transition: all 0.15s`

### Tooltip Design

- Dark tooltip (`bg-[#0A0A0A] border border-[#333]`)
- Shows: "Monday, 17:00 — 23 sessions • 12.4 avg min • 847 drops"
- Positioned above cell with a small arrow
- Appears on hover with `opacity` transition

### Sparkline Design (in fleet table)

- 7 tiny bars (one per day), each 4px wide, max 16px tall
- Color: `#00E5FF` (primary) for bars with data, `#333` for zero days
- No axes, no labels — just the visual pattern

### Period Selector (Analytics tab)

- 3 pill buttons: 7d / 30d / 90d
- Active state: `bg-[#00E5FF] text-black font-bold`
- Inactive state: `bg-[#1A1A1A] text-[#808080] border border-[#333]`

### Live Machine Card Design

**Active/Busy card:**
- `bg-[#0A0A0A] border-l-4 border-l-emerald-500 rounded-xl p-4`
- Subtle green glow: `shadow-[0_0_20px_rgba(16,185,129,0.08)]`
- Avatar: 28px circle, fallback to first letter of username with `bg-emerald-500/20`
- Duration timer: monospace font, `text-emerald-400`, ticks every second
- RPM: shows `last_rpm` or `--` if null/0
- Duration progress bar: thin (4px) bar at bottom of card, `bg-emerald-500`
  calculated as `elapsed / avg_duration_for_this_machine_type`

**Available card:**
- `bg-[#0A0A0A]/50 border border-[#2A2A2A] rounded-xl p-4 opacity-60`
- Only shows machine name, type icon, zone badge
- Hover: `opacity-80 border-[#3A3A3A]`

**Maintenance card:**
- `bg-[#0A0A0A] border-l-4 border-l-amber-500 rounded-xl p-4 opacity-80`
- Wrench icon, "Maintenance" label

### Live Indicator

- Pulsing green dot next to "Live Monitor" tab and header
- CSS animation: `@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.5 } }`
- When Realtime disconnects, switch to yellow with "Reconnecting..." text

### Empty States

**Live Monitor — no machines:**
- "No machines configured yet. Add machines from the Machines page."
- Link to machines management

**Live Monitor — no active workouts:**
- Machine grid still shows all machines as available (dimmed)
- Active workouts list shows: "No active workouts right now"
- Subtle animation (breathing opacity) on the status summary

**Analytics — no data:**
- Show the grid structure but all cells empty
- Center message: "No machine usage data for this period"
- Subtle illustration or icon (BarChart3 from lucide)

---

## Data Flow Architecture

```
LIVE MONITOR:
┌──────────────┐     ┌──────────────────┐     ┌──────────────────────┐
│ Mobile App   │────▶│ Supabase Tables   │────▶│ Admin Panel (Live)   │
│              │     │                    │     │                      │
│ lock_machine │     │ machines           │     │ Realtime subscription│
│ heartbeat    │────▶│  is_busy           │────▶│  on machines UPDATE  │
│ update_rpm   │     │  current_user_id   │     │                      │
│ session sync │     │  last_heartbeat    │     │ Polling fallback     │
│ unlock       │     │  last_rpm          │     │  getLiveMachineStatus│
│ award_drops  │     │                    │     │  every 15s           │
│              │     │ sessions           │     │                      │
│              │────▶│  is_active         │────▶│ Realtime subscription│
│              │     │  duration_seconds  │     │  on sessions *       │
│              │     │  average_rpm       │     │  → full refetch      │
│              │     │  calories          │     │                      │
└──────────────┘     └──────────────────┘     └──────────────────────┘

                     ┌──────────────────┐
                     │ profiles         │     Joined in RPC via
                     │  username        │◀─── machines.current_user_id
                     │  avatar_url      │
                     │  full_name       │
                     └──────────────────┘

ANALYTICS:
┌──────────────────┐     ┌──────────────────────┐
│ Supabase RPC     │────▶│ Admin Panel           │
│ get_machine_     │     │ (Analytics tab)       │
│ analytics_       │     │                        │
│ dashboard()      │     │ One-shot fetch on      │
│                  │     │ tab open + period      │
│                  │     │ change                 │
└──────────────────┘     └──────────────────────┘
```

### Live Timer Strategy

The `elapsed_seconds` field in the active session is server-computed (`NOW() - started_at`).
However, the admin panel should NOT poll every second. Instead:

1. On initial fetch / Realtime event: store `elapsed_seconds` and `fetchedAt = Date.now()`
2. Run a local `setInterval(1000)` that computes displayed time as:
   `displaySeconds = elapsed_seconds + Math.floor((Date.now() - fetchedAt) / 1000)`
3. This gives smooth second-by-second ticking without any server load
4. On next Realtime event or poll: reset `elapsed_seconds` and `fetchedAt`

### Stale Machine Detection

If a machine has `is_busy = true` but `last_heartbeat` is more than 60 seconds old:
- The mobile app likely crashed or lost connection
- Show a warning badge on the machine card: "⚠ No signal"
- The database has `unlock_stale_machines()` which clears stale locks (heartbeat > 30s)
  but this runs as a cron job — the admin should see the issue before auto-cleanup

---

## Testing Requirements

After implementation, verify:

### Live Monitor
- [ ] Machine grid shows all machines for the gym
- [ ] Busy machines show user avatar, username, and live stats
- [ ] Duration timer ticks every second (client-side, not polling)
- [ ] RPM updates appear within ~30 seconds of mobile app RPM change
- [ ] Machine lock/unlock reflects within ~2 seconds via Realtime
- [ ] When a workout ends: machine card transitions from busy → available smoothly
- [ ] When a workout starts: new machine card appears with user info
- [ ] Status summary counts update in real-time
- [ ] Active workouts table shows all current sessions with correct data
- [ ] "No signal" warning shows for stale heartbeats (>60s)
- [ ] Realtime connection indicator (green dot) shows correct state
- [ ] Polling fallback works when Realtime subscription fails
- [ ] No memory leaks: Realtime channels are cleaned up on unmount
- [ ] Works with 0 machines (empty state)
- [ ] Works with 20+ machines (grid layout doesn't break)

### Analytics (Heatmap + Fleet)
- [ ] Heatmap grid renders correctly with real session data
- [ ] Heatmap color intensity is proportional to actual usage
- [ ] Tooltip shows correct data when hovering over cells
- [ ] Period selector (7d/30d/90d) refetches and updates all components
- [ ] Machine fleet table shows all machines (not just top 3)
- [ ] Sparklines are visually correct (7 bars matching last 7 days)
- [ ] Sorting works on fleet table columns
- [ ] Zone breakdown shows "Unassigned" for machines without zone
- [ ] Machine types show correct icons
- [ ] Empty state renders properly when no data

### General
- [ ] Tab switching between Live Monitor and Analytics works smoothly
- [ ] Page loads within 2 seconds (RPC performance)
- [ ] Responsive: works on tablet (1024px) and desktop (1440px+)
- [ ] Accessible: tooltips work with keyboard focus
- [ ] Navigation: link from machines list works, back button works
- [ ] Dashboard widget shows live active count and links to Machine Hub

---

## Files Summary

| Phase | Agent | File | Action |
|-------|-------|------|--------|
| 1 | DBA | `backend/supabase/migrations/20260312000010_machine_analytics_dashboard.sql` | Create RPCs + enable Realtime |
| 2 | Admin | `apps/admin-panel/lib/actions/machine-analytics-actions.ts` | Create server actions (analytics + live) |
| 2 | Admin | `apps/admin-panel/app/dashboard/gym/[id]/machines/analytics/page.tsx` | Create page (server component shell) |
| 2 | Admin | `apps/admin-panel/components/analytics/MachineHubPage.tsx` | Create tab container (live + analytics) |
| 2 | Admin | `apps/admin-panel/components/analytics/LiveMachineMonitor.tsx` | Create live monitor (Realtime) |
| 2 | Admin | `apps/admin-panel/components/analytics/StatusSummaryBar.tsx` | Create status count badges |
| 2 | Admin | `apps/admin-panel/components/analytics/MachineGrid.tsx` | Create visual machine grid |
| 2 | Admin | `apps/admin-panel/components/analytics/ActiveWorkoutsList.tsx` | Create active sessions table |
| 2 | Admin | `apps/admin-panel/components/analytics/MachineAnalyticsDashboard.tsx` | Create analytics dashboard |
| 2 | Admin | `apps/admin-panel/components/analytics/HeatmapGrid.tsx` | Create heatmap |
| 2 | Admin | `apps/admin-panel/components/analytics/MachineFleetTable.tsx` | Create fleet table |
| 2 | Admin | `apps/admin-panel/components/analytics/KPICards.tsx` | Create KPI cards |
| 2 | Admin | `apps/admin-panel/components/analytics/TypeZoneBreakdown.tsx` | Create breakdown |
| 2 | Admin | `apps/admin-panel/components/modules/MachinesManager.tsx` | Add "Machine Hub" link |
| 2 | Admin | `apps/admin-panel/components/analytics/MachineHeatmapWidget.tsx` | Replace with mini live status card |
