# Feature: Reports Page (Admin Panel + Superadmin)

**Datum:** 2026-03-12
**Prioritet:** Feature
**Lokacija:** Admin Panel → Core (Gym Owner) + Superadmin

## Context

Gym owners need usage analytics and revenue insights for their gym. Superadmins need
platform-wide metrics. Currently there is no dedicated reports page — analytics are
scattered across Dashboard widgets and individual feature pages.

## Schema Corrections vs Original Spec

The original prompt contained several table/column name mismatches. All have been
corrected in this plan:

| Original (WRONG) | Actual (CORRECT) | Notes |
|---|---|---|
| `store_items` | `rewards` | Base schema table name |
| `store_items.drop_price` | `rewards.price_drops` | Column name |
| `redemptions.item_id` | `redemptions.reward_id` | FK column name |
| `redemptions.status = 'delivered'` | `redemptions.status = 'confirmed'` | Actual status values: `pending`, `confirmed`, `cancelled` |
| `arenas` | `sweat_arenas` | Actual table name |
| `arenas.gym_id` | `arena_gyms.gym_id` | Arenas linked to gyms via junction table `arena_gyms` |
| `arenas.status` (TEXT) | `sweat_arenas.is_active` + `is_finalized` | Status derived from two booleans + date comparison |
| `arenas.prize_description` (TEXT) | `sweat_arenas.prizes` (JSONB) | JSONB array: `[{ rank, prize, value }]` |
| `arenas.gym_revenue_percentage` | `arena_invitations.revenue_share_percent` | On invitation table, not arena itself |
| `/dashboard/admin/` | `/dashboard/super/` | Superadmin route prefix in this codebase |

---

## Dependencies

- `sessions` table — `gym_id`, `user_id`, `started_at`, `duration_seconds`, `drops_earned`, `is_active`
- `gym_checkins` table — `gym_id`, `user_id`, `checked_in_at`
- `rewards` table — `gym_id`, `name`, `price_drops`, `is_active`
- `redemptions` table — `gym_id`, `reward_id` (FK to `rewards`), `status`, `created_at`, `drops_spent`
- `challenge_progress` table — `challenge_id`, `is_completed`, `updated_at`
- `gym_challenges` table — `gym_id`, `id`
- `sweat_arenas` table — `name`, `sponsor_name`, `prizes` (JSONB), `start_date`, `end_date`, `is_active`, `is_finalized`
- `arena_gyms` table — `arena_id`, `gym_id` (junction table)
- `arena_participants` table — `arena_id`, `user_id`, `gym_id`
- `arena_invitations` table — `revenue_share_percent`
- `gyms` table — `id`, `name`, `is_active`, `owner_id`
- `profiles` table — `id`, `username`, `role`, `home_gym_id`, `streak_days`, `avatar_url`

---

## Execution Order

```
PHASE 1: DBA Agent   — 6 SQL functions + 1 migration
PHASE 2: Admin Agent — Reports page (gym owner) + Superadmin reports + server actions
                       + sidebar update + PDF/CSV export
```

---

## PHASE 1 — DBA Agent

### Migration: `backend/supabase/migrations/20260324000001_report_functions.sql`

### Task 1.1: Gym Store Revenue Report

```sql
CREATE OR REPLACE FUNCTION public.get_gym_store_report(
  p_gym_id UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ
)
RETURNS TABLE (
  item_name TEXT,
  item_id UUID,
  redemptions_count BIGINT,
  price_drops INTEGER,
  total_drops_spent BIGINT,
  pending_count BIGINT,
  confirmed_count BIGINT,
  is_active BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    rw.name,
    rw.id,
    COUNT(rd.id),
    rw.price_drops,
    (COUNT(rd.id) * rw.price_drops)::BIGINT,
    COUNT(rd.id) FILTER (WHERE rd.status = 'pending'),
    COUNT(rd.id) FILTER (WHERE rd.status = 'confirmed'),
    rw.is_active
  FROM rewards rw
  LEFT JOIN redemptions rd ON rd.reward_id = rw.id
    AND rd.gym_id = p_gym_id
    AND rd.created_at >= p_start_date
    AND rd.created_at < p_end_date
  WHERE rw.gym_id = p_gym_id
  GROUP BY rw.id, rw.name, rw.price_drops, rw.is_active
  ORDER BY COUNT(rd.id) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_gym_store_report(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
```

### Task 1.2: Gym Engagement Report

```sql
CREATE OR REPLACE FUNCTION public.get_gym_engagement_report(
  p_gym_id UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    -- Sessions
    'total_sessions', (
      SELECT COUNT(*) FROM sessions
      WHERE gym_id = p_gym_id
        AND started_at >= p_start_date AND started_at < p_end_date
        AND is_active = false
    ),
    'avg_session_duration_min', (
      SELECT ROUND(COALESCE(AVG(duration_seconds) / 60.0, 0), 1)
      FROM sessions
      WHERE gym_id = p_gym_id
        AND started_at >= p_start_date AND started_at < p_end_date
        AND is_active = false
        AND duration_seconds > 0
    ),
    -- Members
    'total_active_members', (
      SELECT COUNT(DISTINCT user_id)
      FROM sessions
      WHERE gym_id = p_gym_id
        AND started_at >= p_start_date AND started_at < p_end_date
        AND is_active = false
    ),
    'total_registered_members', (
      SELECT COUNT(*) FROM profiles
      WHERE home_gym_id = p_gym_id
    ),
    'total_checkins', (
      SELECT COUNT(*) FROM gym_checkins
      WHERE gym_id = p_gym_id
        AND checked_in_at >= p_start_date AND checked_in_at < p_end_date
    ),
    'avg_visits_per_member', (
      SELECT ROUND(
        COUNT(*)::NUMERIC / NULLIF(COUNT(DISTINCT user_id), 0), 1
      )
      FROM gym_checkins
      WHERE gym_id = p_gym_id
        AND checked_in_at >= p_start_date AND checked_in_at < p_end_date
    ),
    -- Inactive members: registered but no session in last 14 days
    'inactive_14d', (
      SELECT COUNT(*) FROM profiles p
      WHERE p.home_gym_id = p_gym_id
        AND NOT EXISTS (
          SELECT 1 FROM sessions s
          WHERE s.user_id = p.id
            AND s.gym_id = p_gym_id
            AND s.started_at >= NOW() - INTERVAL '14 days'
            AND s.is_active = false
        )
    ),
    -- Drops Economy
    'total_drops_earned', (
      SELECT COALESCE(SUM(drops_earned), 0)
      FROM sessions
      WHERE gym_id = p_gym_id
        AND started_at >= p_start_date AND started_at < p_end_date
        AND is_active = false
    ),
    'total_drops_spent', (
      SELECT COALESCE(SUM(rd.drops_spent), 0)
      FROM redemptions rd
      WHERE rd.gym_id = p_gym_id
        AND rd.created_at >= p_start_date AND rd.created_at < p_end_date
        AND rd.status = 'confirmed'
    ),
    -- Challenges
    'challenges_completed', (
      SELECT COUNT(*)
      FROM challenge_progress cp
      JOIN gym_challenges gc ON cp.challenge_id = gc.id
      WHERE gc.gym_id = p_gym_id
        AND cp.is_completed = true
        AND cp.updated_at >= p_start_date AND cp.updated_at < p_end_date
    ),
    'active_challenges_count', (
      SELECT COUNT(*)
      FROM gym_challenges gc
      WHERE gc.gym_id = p_gym_id
        AND gc.is_active = true
        AND (gc.end_date IS NULL OR gc.end_date >= CURRENT_DATE)
    ),
    -- Streaks
    'avg_streak_days', (
      SELECT ROUND(COALESCE(AVG(p.streak_days), 0), 1)
      FROM profiles p
      WHERE p.home_gym_id = p_gym_id
        AND p.streak_days > 0
    ),
    -- Top 5 members by drops earned in period
    'top_members', (
      SELECT COALESCE(jsonb_agg(row_to_json(tm)), '[]'::jsonb)
      FROM (
        SELECT
          p.username,
          p.avatar_url,
          COUNT(s.id) AS sessions_count,
          COALESCE(SUM(s.drops_earned), 0) AS drops_earned,
          p.streak_days
        FROM sessions s
        JOIN profiles p ON s.user_id = p.id
        WHERE s.gym_id = p_gym_id
          AND s.started_at >= p_start_date AND s.started_at < p_end_date
          AND s.is_active = false
        GROUP BY p.id, p.username, p.avatar_url, p.streak_days
        ORDER BY SUM(s.drops_earned) DESC
        LIMIT 5
      ) tm
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_gym_engagement_report(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
```

### Task 1.3: Gym Arena Report

Corrected for actual schema: `sweat_arenas` + `arena_gyms` junction + `prizes` JSONB.

```sql
CREATE OR REPLACE FUNCTION public.get_gym_arena_report(
  p_gym_id UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ
)
RETURNS TABLE (
  arena_id UUID,
  arena_name TEXT,
  sponsor_name TEXT,
  participants_count BIGINT,
  gym_participants_count BIGINT,
  arena_start DATE,
  arena_end DATE,
  derived_status TEXT,
  prizes JSONB,
  revenue_share_pct INTEGER
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sa.id,
    sa.name,
    sa.sponsor_name,
    -- Total participants across all gyms
    (SELECT COUNT(DISTINCT ap.user_id) FROM arena_participants ap WHERE ap.arena_id = sa.id),
    -- Participants from THIS gym only
    (SELECT COUNT(DISTINCT ap.user_id) FROM arena_participants ap
     WHERE ap.arena_id = sa.id AND ap.gym_id = p_gym_id),
    sa.start_date,
    sa.end_date,
    -- Derive status from booleans + dates
    CASE
      WHEN sa.is_finalized THEN 'ended'
      WHEN NOT sa.is_active THEN 'inactive'
      WHEN sa.start_date > CURRENT_DATE THEN 'upcoming'
      WHEN sa.end_date < CURRENT_DATE THEN 'ending'
      ELSE 'live'
    END,
    sa.prizes,
    -- Revenue share from invitation (if exists)
    (SELECT COALESCE(ai.revenue_share_percent, 70)
     FROM arena_invitations ai
     WHERE ai.arena_id = sa.id AND ai.gym_id = p_gym_id
     LIMIT 1)::INTEGER
  FROM sweat_arenas sa
  JOIN arena_gyms ag ON ag.arena_id = sa.id AND ag.gym_id = p_gym_id
  WHERE sa.created_at >= p_start_date AND sa.created_at < p_end_date
  ORDER BY sa.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_gym_arena_report(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
```

### Task 1.4: Weekly Sessions Trend (for sparkline/line chart)

```sql
CREATE OR REPLACE FUNCTION public.get_gym_sessions_trend(
  p_gym_id UUID,
  p_weeks INTEGER DEFAULT 12
)
RETURNS TABLE (
  week_start DATE,
  sessions_count BIGINT,
  unique_members BIGINT,
  drops_earned BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE_TRUNC('week', s.started_at AT TIME ZONE 'Europe/Belgrade')::DATE,
    COUNT(*),
    COUNT(DISTINCT s.user_id),
    COALESCE(SUM(s.drops_earned), 0)
  FROM sessions s
  WHERE s.gym_id = p_gym_id
    AND s.started_at >= NOW() - (p_weeks || ' weeks')::INTERVAL
    AND s.is_active = false
  GROUP BY 1
  ORDER BY 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_gym_sessions_trend(UUID, INTEGER) TO authenticated;
```

### Task 1.5: Superadmin Platform Report

```sql
CREATE OR REPLACE FUNCTION public.get_platform_report(
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- Security: only superadmin can call this
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'superadmin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized: superadmin only';
  END IF;

  SELECT jsonb_build_object(
    'total_gyms', (SELECT COUNT(*) FROM gyms WHERE is_active = true),
    'total_users', (SELECT COUNT(*) FROM profiles),
    'mau', (
      SELECT COUNT(DISTINCT user_id)
      FROM sessions
      WHERE started_at >= p_start_date AND started_at < p_end_date
        AND is_active = false
    ),
    'total_sessions', (
      SELECT COUNT(*) FROM sessions
      WHERE started_at >= p_start_date AND started_at < p_end_date
        AND is_active = false
    ),
    'total_drops_earned', (
      SELECT COALESCE(SUM(drops_earned), 0)
      FROM sessions
      WHERE started_at >= p_start_date AND started_at < p_end_date
        AND is_active = false
    ),
    'total_redemptions', (
      SELECT COUNT(*) FROM redemptions
      WHERE created_at >= p_start_date AND created_at < p_end_date
        AND status = 'confirmed'
    ),
    'total_arenas', (
      SELECT COUNT(*) FROM sweat_arenas
      WHERE created_at >= p_start_date AND created_at < p_end_date
    ),
    'per_gym', (
      SELECT COALESCE(jsonb_agg(row_to_json(gs) ORDER BY gs.sessions_count DESC), '[]'::jsonb)
      FROM (
        SELECT
          g.id AS gym_id,
          g.name AS gym_name,
          COUNT(s.id) AS sessions_count,
          COUNT(DISTINCT s.user_id) AS active_members,
          COALESCE(SUM(s.drops_earned), 0) AS drops_earned,
          (
            SELECT COUNT(*) FROM redemptions r
            WHERE r.gym_id = g.id
              AND r.created_at >= p_start_date AND r.created_at < p_end_date
              AND r.status = 'confirmed'
          ) AS redemptions_count,
          (
            SELECT COUNT(DISTINCT p.id) FROM profiles p
            WHERE p.home_gym_id = g.id
          ) AS registered_members
        FROM gyms g
        LEFT JOIN sessions s ON s.gym_id = g.id
          AND s.started_at >= p_start_date AND s.started_at < p_end_date
          AND s.is_active = false
        WHERE g.is_active = true
        GROUP BY g.id, g.name
      ) gs
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_platform_report(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
```

### Task 1.6: Challenge Completion Stats for Report

```sql
CREATE OR REPLACE FUNCTION public.get_gym_challenge_report(
  p_gym_id UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ
)
RETURNS TABLE (
  challenge_id UUID,
  challenge_name TEXT,
  challenge_type TEXT,
  total_participants BIGINT,
  completions BIGINT,
  completion_rate NUMERIC
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    gc.id,
    gc.name,
    gc.challenge_type::TEXT,
    COUNT(DISTINCT cp.user_id),
    COUNT(DISTINCT cp.user_id) FILTER (WHERE cp.is_completed = true),
    ROUND(
      COUNT(DISTINCT cp.user_id) FILTER (WHERE cp.is_completed = true)::NUMERIC
      / NULLIF(COUNT(DISTINCT cp.user_id), 0) * 100, 1
    )
  FROM gym_challenges gc
  LEFT JOIN challenge_progress cp ON cp.challenge_id = gc.id
    AND cp.updated_at >= p_start_date AND cp.updated_at < p_end_date
  WHERE gc.gym_id = p_gym_id
    AND gc.is_active = true
  GROUP BY gc.id, gc.name, gc.challenge_type
  ORDER BY COUNT(DISTINCT cp.user_id) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_gym_challenge_report(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
```

### Validation

```sql
-- Test all functions:
SELECT get_gym_store_report('GYM_ID', '2025-12-01', '2026-03-12');
SELECT get_gym_engagement_report('GYM_ID', '2025-12-01', '2026-03-12');
SELECT get_gym_arena_report('GYM_ID', '2025-12-01', '2026-03-12');
SELECT get_gym_sessions_trend('GYM_ID', 12);
SELECT get_gym_challenge_report('GYM_ID', '2025-12-01', '2026-03-12');
-- Superadmin only:
SELECT get_platform_report('2025-12-01', '2026-03-12');
```

---

## PHASE 2 — Admin Agent

### Task 2A: Install PDF export dependency

```bash
pnpm add jspdf jspdf-autotable --filter sweatdrop-admin-panel
pnpm add -D @types/jspdf --filter sweatdrop-admin-panel
```

**Why jsPDF:** Lightweight, client-side PDF generation. No server-side rendering needed.
`jspdf-autotable` handles table layouts in PDFs automatically.

### Task 2B: Create period helper utility

**File:** `apps/admin-panel/lib/utils/report-periods.ts`

```typescript
export const REPORT_PERIODS = {
  pilot: { label: 'Pilot (90d)', days: 90 },
  month: { label: 'Last 30 days', days: 30 },
  twoMonths: { label: 'Last 60 days', days: 60 },
} as const;

export type ReportPeriod = keyof typeof REPORT_PERIODS;

export function getPeriodDates(period: ReportPeriod): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - REPORT_PERIODS[period].days);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function getCustomPeriodDates(startDate: Date, endDate: Date): { start: string; end: string } {
  return { start: startDate.toISOString(), end: endDate.toISOString() };
}
```

### Task 2C: Create server actions

**File:** `apps/admin-panel/lib/actions/report-actions.ts`

```typescript
'use server';

import { getAdminClient } from '@/lib/utils/supabase-admin';
import { getCurrentProfile } from '../auth';

// Auth helper: verify gym access
async function verifyGymAccess(gymId: string) {
  const profile = await getCurrentProfile();
  if (!profile) return { authorized: false, error: 'Not authenticated' } as const;

  if (profile.role === 'superadmin') return { authorized: true, profile } as const;

  if (profile.role !== 'gym_owner' && profile.role !== 'gym_admin') {
    return { authorized: false, error: 'Unauthorized role' } as const;
  }

  const supabase = getAdminClient();
  if (!supabase) return { authorized: false, error: 'Admin client not available' } as const;

  const { data: gym } = await supabase
    .from('gyms').select('owner_id').eq('id', gymId).single();

  if (!gym) return { authorized: false, error: 'Gym not found' } as const;

  const ownsGym = (gym as any).owner_id === profile.id;
  const isAssignedGym = profile.assigned_gym_id === gymId;

  if (!ownsGym && !isAssignedGym) {
    return { authorized: false, error: 'Unauthorized' } as const;
  }

  return { authorized: true, profile } as const;
}

export async function getGymEngagementReport(gymId: string, startDate: string, endDate: string) {
  const auth = await verifyGymAccess(gymId);
  if (!auth.authorized) return { success: false, error: auth.error };

  const supabase = getAdminClient();
  if (!supabase) return { success: false, error: 'Admin client not available' };

  const { data, error } = await supabase.rpc('get_gym_engagement_report', {
    p_gym_id: gymId, p_start_date: startDate, p_end_date: endDate,
  });

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function getGymStoreReport(gymId: string, startDate: string, endDate: string) {
  const auth = await verifyGymAccess(gymId);
  if (!auth.authorized) return { success: false, error: auth.error };

  const supabase = getAdminClient();
  if (!supabase) return { success: false, error: 'Admin client not available' };

  const { data, error } = await supabase.rpc('get_gym_store_report', {
    p_gym_id: gymId, p_start_date: startDate, p_end_date: endDate,
  });

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function getGymArenaReport(gymId: string, startDate: string, endDate: string) {
  const auth = await verifyGymAccess(gymId);
  if (!auth.authorized) return { success: false, error: auth.error };

  const supabase = getAdminClient();
  if (!supabase) return { success: false, error: 'Admin client not available' };

  const { data, error } = await supabase.rpc('get_gym_arena_report', {
    p_gym_id: gymId, p_start_date: startDate, p_end_date: endDate,
  });

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function getGymSessionsTrend(gymId: string, weeks: number = 12) {
  const auth = await verifyGymAccess(gymId);
  if (!auth.authorized) return { success: false, error: auth.error };

  const supabase = getAdminClient();
  if (!supabase) return { success: false, error: 'Admin client not available' };

  const { data, error } = await supabase.rpc('get_gym_sessions_trend', {
    p_gym_id: gymId, p_weeks: weeks,
  });

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function getGymChallengeReport(gymId: string, startDate: string, endDate: string) {
  const auth = await verifyGymAccess(gymId);
  if (!auth.authorized) return { success: false, error: auth.error };

  const supabase = getAdminClient();
  if (!supabase) return { success: false, error: 'Admin client not available' };

  const { data, error } = await supabase.rpc('get_gym_challenge_report', {
    p_gym_id: gymId, p_start_date: startDate, p_end_date: endDate,
  });

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function getPlatformReport(startDate: string, endDate: string) {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== 'superadmin') {
    return { success: false, error: 'Superadmin only' };
  }

  const supabase = getAdminClient();
  if (!supabase) return { success: false, error: 'Admin client not available' };

  const { data, error } = await supabase.rpc('get_platform_report', {
    p_start_date: startDate, p_end_date: endDate,
  });

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}
```

### Task 2D: Create gym owner Reports page

**File:** `apps/admin-panel/app/dashboard/gym/[id]/reports/page.tsx`

Server component shell that passes gymId to the client component.

### Task 2E: Create report components

**Directory:** `apps/admin-panel/components/reports/`

#### 1. `GymReportDashboard.tsx` — Main client component

- Accepts `gymId` prop
- Manages period state (default: `'pilot'` for 90 days)
- Fetches all report data in parallel on mount and when period changes:
  ```typescript
  const [engagement, store, arenas, trend, challenges] = await Promise.all([
    getGymEngagementReport(gymId, start, end),
    getGymStoreReport(gymId, start, end),
    getGymArenaReport(gymId, start, end),
    getGymSessionsTrend(gymId, 12),
    getGymChallengeReport(gymId, start, end),
  ]);
  ```
- Renders all sections below
- Loading skeleton with pulse animation
- Error boundary for each section (one failing section shouldn't break the page)

#### 2. `ReportPeriodSelector.tsx` — Period selector bar

- Period pills: `[Pilot (90d)] [30d] [60d] [Custom]`
- Custom: date picker for start and end dates
- Export buttons on the right: `[Export PDF] [Export CSV]`
- Active pill: `bg-[#00E5FF] text-black font-bold`
- Inactive: `bg-[#1A1A1A] text-[#808080] border border-[#333]`
- Layout: flex with pills on left, export buttons on right

#### 3. `EngagementKPIs.tsx` — KPI card grid

- Section title: "ENGAGEMENT"
- 4 KPI cards in first row:
  - Total Sessions
  - Avg Duration (min)
  - Active Members
  - Avg Visits/Member
- Card style: `bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl p-5`
- Big number in white, label in `text-zinc-500`

#### 4. `DropsEconomyKPIs.tsx` — Drops circulation metrics

- Section title: "DROPS ECONOMY"
- 3 KPI cards:
  - Drops Earned (total)
  - Drops Spent (confirmed redemptions)
  - Circulation % (`drops_spent / drops_earned * 100`)

#### 5. `SessionsTrendChart.tsx` — Line chart (12 weeks)

- Uses `react-chartjs-2` `Line` component (already installed)
- X axis: week start dates
- Y axis: session count
- Optional second line: unique members
- Dark theme: `#00E5FF` for sessions line, `#808080` for grid lines
- Responsive, fills card width

#### 6. `StoreReportTable.tsx` — Store performance table

- Section title: "STORE PERFORMANCE"
- Table columns: Name, Redemptions, Drops Spent, Pending, Confirmed, Status
- Status badge: green "Active" / gray "Inactive" based on `is_active`
- Footer row: TOTAL with sum of redemptions and drops spent
- Note per spec: No EUR values — only drops and redemption counts

#### 7. `ArenaReportTable.tsx` — Arena performance table

- Section title: "SWEAT ARENAS"
- Table columns: Arena, Sponsor, Your Participants, Total Participants, Period, Status, Revenue Share
- Status badge: colorized by derived status (`live` = green, `ended` = gray, `upcoming` = blue)
- Prize column: render from `prizes` JSONB — show first prize value or "View prizes" tooltip
- Revenue share note: "Your share: {revenue_share_pct}%"

#### 8. `ChallengeReportTable.tsx` — Challenge completion stats

- Section title: "CHALLENGES"
- KPI row: Completed (count), Avg Completion Rate, Most Popular (by participants)
- Table: Challenge name, Type badge, Participants, Completions, Completion Rate (progress bar)

#### 9. `MembersReportSection.tsx` — Member insights

- Section title: "MEMBERS"
- KPI cards: Registered, Active (trained in period), Inactive 14d+, Avg Streak
- Top 5 members table: Rank, Avatar+Username, Sessions, Drops, Streak (fire emoji + days)
- Avatar: 28px circle, fallback to initials

#### 10. `ReportExportPDF.tsx` — PDF export utility (client-side)

```typescript
'use client';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export function generateGymReportPDF(params: {
  gymName: string;
  period: string;
  engagement: EngagementData;
  storeItems: StoreReportRow[];
  arenas: ArenaReportRow[];
  topMembers: TopMember[];
}) {
  const doc = new jsPDF();

  // Header: SweatDrop logo placeholder + gym name
  doc.setFontSize(20);
  doc.text('SweatDrop', 20, 20);
  doc.setFontSize(14);
  doc.text(`${params.gymName} — Report`, 20, 30);
  doc.setFontSize(10);
  doc.text(`Period: ${params.period}`, 20, 38);

  // KPIs section
  doc.setFontSize(12);
  doc.text('Engagement', 20, 50);
  // ... render KPI values

  // Store table
  autoTable(doc, {
    startY: 70,
    head: [['Item', 'Redemptions', 'Drops Spent', 'Status']],
    body: params.storeItems.map(item => [
      item.item_name,
      item.redemptions_count.toString(),
      item.total_drops_spent.toString(),
      item.is_active ? 'Active' : 'Inactive',
    ]),
    theme: 'striped',
  });

  // Arena table, top members, etc.
  // ...

  // Footer
  const pageHeight = doc.internal.pageSize.height;
  doc.setFontSize(8);
  doc.text('Powered by SweatDrop', 20, pageHeight - 10);

  doc.save(`${params.gymName}_report_${params.period}.pdf`);
}
```

#### 11. `ReportExportCSV.tsx` — CSV export utility (client-side)

- Generate 3 CSV strings: engagement, store, arenas
- Bundle into a ZIP using `JSZip` or simply download as separate files
- If keeping it simple (no JSZip): download as individual CSV files
- File names: `engagement_report.csv`, `store_report.csv`, `arenas_report.csv`

### Task 2F: Create Superadmin Reports page

**File:** `apps/admin-panel/app/dashboard/super/reports/page.tsx`

Note: superadmin pages are under `/dashboard/super/`, NOT `/dashboard/admin/`.

**Page structure:**

```
PLATFORM REPORTS
SweatDrop network overview

Period: [This Month ▼]  [Export PDF]

─── PLATFORM OVERVIEW ─────────────────────────

[Active Gyms]  [Total Users]  [MAU]   [Total Sessions]
[    2      ]  [    312    ]  [187]   [    2,847     ]

[Drops Earned]  [Redemptions]  [Active Arenas]
[  428,000  ]   [    229   ]   [     3       ]

─── PER GYM BREAKDOWN ────────────────────────

Tabela:
Gym       Members  Sessions  MAU  Drops     Redemptions
Vortex    180      1,847     124  284,000   142
Play      132      1,000      88  144,000    87

─── GROWTH TREND ──────────────────────────────

Line chart: MAU per week across all gyms (aggregate)
```

### Task 2G: Create superadmin report components

**Directory:** `apps/admin-panel/components/reports/`

#### `PlatformReportDashboard.tsx` — Superadmin main component

- Fetches `getPlatformReport(start, end)` + `getGymSessionsTrend(null, 12)` for global trend
- Renders platform KPIs, per-gym breakdown table, growth trend chart
- Period selector (default: current month)

#### `PlatformKPIs.tsx` — Platform-level stat cards

- 7 cards in two rows (4 + 3)
- Same card design as gym KPIs

#### `GymComparisonTable.tsx` — Per-gym comparison

- Sortable table with columns: Gym Name, Registered Members, Sessions, MAU, Drops Earned, Redemptions
- Row click → links to that gym's detailed reports page

### Task 2H: Update Sidebar

**File:** `apps/admin-panel/components/Sidebar.tsx`

**Add Reports link for gym owner/admin:**

In `gymOwnerLinks` and `gymAdminLinks`, add to the `core` section after Leaderboard:

```typescript
import { FileBarChart } from 'lucide-react';

// In core array, after leaderboard-history:
{ href: `${base}/reports`, label: 'Reports', icon: FileBarChart },
```

**Add Reports link for superadmin:**

In `superadminLinks` array, add after System Health:

```typescript
{ href: '/dashboard/super/reports', label: 'Reports', icon: FileBarChart },
```

---

## UI Design Specifications

### Page Header

```
┌─────────────────────────────────────────────────────────────┐
│  REPORTS                                                     │
│  Usage analytics and revenue insights for {Gym Name}         │
│                                                               │
│  [Pilot 90d] [30d] [60d] [Custom]        [📄 PDF] [📊 CSV]  │
└─────────────────────────────────────────────────────────────┘
```

### Section Titles

- All caps, `text-xs text-zinc-500 tracking-wider font-medium`
- Thin horizontal divider below: `border-t border-zinc-800`
- Matches existing sidebar section title styling

### KPI Cards

- `bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl p-5`
- Label: `text-xs text-zinc-500 uppercase`
- Value: `text-2xl font-bold text-white`
- Optional sub-text: `text-xs text-zinc-400`

### Tables

- Header: `text-xs text-zinc-500 uppercase tracking-wider`
- Rows: `hover:bg-zinc-900/50` with `border-b border-zinc-800`
- Footer/total row: `font-semibold bg-zinc-900/30`

### Export Buttons

- PDF: `bg-[#1A1A1A] border border-[#2A2A2A] hover:border-[#00E5FF]/50 text-white rounded-lg px-4 py-2`
- CSV: same style
- Both use lucide icons: `FileText` for PDF, `Download` for CSV

### Empty State

When no data for a section:
- "No {section} data for this period"
- Muted icon + message centered in the section card

---

## Important Notes

1. **No EUR values in store section** — only show drops spent and redemption counts.
   Gym owner knows the real-world value of each reward.

2. **Arenas with prize values** — the `prizes` JSONB may contain `"value": "€120"`.
   Render the prize description text as-is from the JSONB since sponsors define these.

3. **PDF branding** — include SweatDrop logo (text placeholder for now), gym name,
   period, and "Powered by SweatDrop" footer.

4. **Performance** — all 5 gym report RPCs are called in parallel. Each is `STABLE`
   and uses indexed columns (`gym_id`, `started_at`, `created_at`). Should complete
   within 1-2 seconds even with thousands of sessions.

5. **Security** — all RPCs are `SECURITY DEFINER`. Server actions double-check
   authorization via `verifyGymAccess()`. `get_platform_report` additionally checks
   `auth.uid()` is superadmin inside the SQL function itself.

---

## Testing Requirements

### Gym Owner Reports
- [ ] Reports page loads for gym owner with correct gym data
- [ ] Period selector changes data across all sections
- [ ] Custom date range works
- [ ] All 6 KPI sections render with correct values
- [ ] Sessions trend chart shows 12 weeks of data
- [ ] Store table shows all rewards with correct redemption counts
- [ ] Store table totals are mathematically correct
- [ ] Arena table shows arenas linked to this gym via `arena_gyms`
- [ ] Arena derived status is correct (live/ended/upcoming)
- [ ] Challenge table shows completion rates
- [ ] Top 5 members table shows avatars and correct ranking
- [ ] Export PDF downloads a valid PDF file with all sections
- [ ] Export CSV downloads separate CSV files
- [ ] Gym admin can see reports for their assigned gym
- [ ] Other gym owners CANNOT see this gym's reports (auth check)

### Superadmin Reports
- [ ] Platform report page loads with aggregate data
- [ ] Per-gym breakdown table is sortable
- [ ] Growth trend chart shows MAU over time
- [ ] Non-superadmin users get redirected / see error

### General
- [ ] Sidebar shows Reports link for gym owners (in CORE section)
- [ ] Sidebar shows Reports link for superadmin
- [ ] Page is responsive (tablet + desktop)
- [ ] Loading skeletons appear while data is fetching
- [ ] Error states are handled gracefully per section
- [ ] TypeScript: 0 errors

---

## Files Summary

| Phase | Agent | File | Action |
|-------|-------|------|--------|
| 1 | DBA | `backend/supabase/migrations/20260324000001_report_functions.sql` | Create 6 RPCs |
| 2 | Admin | `apps/admin-panel/lib/utils/report-periods.ts` | Create period utility |
| 2 | Admin | `apps/admin-panel/lib/actions/report-actions.ts` | Create 7 server actions |
| 2 | Admin | `apps/admin-panel/app/dashboard/gym/[id]/reports/page.tsx` | Create gym reports page |
| 2 | Admin | `apps/admin-panel/app/dashboard/super/reports/page.tsx` | Create superadmin reports page |
| 2 | Admin | `apps/admin-panel/components/reports/GymReportDashboard.tsx` | Main gym report component |
| 2 | Admin | `apps/admin-panel/components/reports/ReportPeriodSelector.tsx` | Period selector + export buttons |
| 2 | Admin | `apps/admin-panel/components/reports/EngagementKPIs.tsx` | Engagement KPI cards |
| 2 | Admin | `apps/admin-panel/components/reports/DropsEconomyKPIs.tsx` | Drops economy cards |
| 2 | Admin | `apps/admin-panel/components/reports/SessionsTrendChart.tsx` | Line chart (12 weeks) |
| 2 | Admin | `apps/admin-panel/components/reports/StoreReportTable.tsx` | Store performance table |
| 2 | Admin | `apps/admin-panel/components/reports/ArenaReportTable.tsx` | Arena report table |
| 2 | Admin | `apps/admin-panel/components/reports/ChallengeReportTable.tsx` | Challenge completion table |
| 2 | Admin | `apps/admin-panel/components/reports/MembersReportSection.tsx` | Members KPIs + top 5 |
| 2 | Admin | `apps/admin-panel/components/reports/ReportExportPDF.tsx` | PDF generation (jsPDF) |
| 2 | Admin | `apps/admin-panel/components/reports/ReportExportCSV.tsx` | CSV export utility |
| 2 | Admin | `apps/admin-panel/components/reports/PlatformReportDashboard.tsx` | Superadmin main component |
| 2 | Admin | `apps/admin-panel/components/reports/PlatformKPIs.tsx` | Platform KPI cards |
| 2 | Admin | `apps/admin-panel/components/reports/GymComparisonTable.tsx` | Per-gym comparison table |
| 2 | Admin | `apps/admin-panel/components/Sidebar.tsx` | Add Reports links |
