# Feature: Admin Dashboard Premium V3 (Command Center)

**Date:** 2026-03-11 (revised 2026-03-11)  
**Priority:** Critical (owner UX + daily operations)  
**Scope:** `apps/admin-panel` + `backend/supabase`  
**Supersedes:** `admin_dashboard_premium_v2_plan.md`

## Context & Problems with Current Dashboard

The V2 dashboard shipped but has critical metric and UX issues:

1. **Unreliable KPIs**: `activeRatePct` shows 110% (not clamped), Drops shows "3810%" delta (prev was tiny), Economy shows "200%" (meaningless burn/mint), "Top1 100%" (only one user).
2. **Activity Feed misrouted**: "View all" links to `store→redemptions`, which is incorrect. Must be a separate screen.
3. **Top Performers uses wallet balance** (`local_drops_balance`), not earned drops. Also doesn't filter out staff/owner roles.
4. **Challenge Snapshot**: `completionRatePct` is hardcoded to 0, never computed.

---

## Product Decisions (Locked)

1. **KPI metric corrections are mandatory** — clamp, guard edge cases, show meaningful data.
2. **Activity Feed becomes a separate screen** at `gym/[id]/activity` with filters, search, pagination.
3. **Dashboard shows last 5 events** + "Open Activity Log" CTA (not "View all → store").
4. **Top Performers must show earned drops** (from `drops_transactions` or `total_drops` on profiles), not wallet balance. Filter only `role = 'user'`.
5. **Challenge completion rate** must be computed from real `challenge_progress` data.
6. **Economy KPI** shows burn/mint as a percentage with clear label, not raw ratio.

---

## Information Architecture — Dashboard V3

### Top KPI Row (6 cards max)

| # | Card | Primary | Secondary | Link | Guard |
|---|------|---------|-----------|------|-------|
| 1 | **Members** | `total` | `X% active (7d)` | `/members` | Clamp 0–100% |
| 2 | **Check-ins Today** | `today` | `N this week` | `/checkin` | — |
| 3 | **Store Desk** | `N pending` (badge if > 0) | `M confirmed today` | `/store?tab=redemptions` | — |
| 4 | **Economy** | Burn/Mint `X%` | Health chip (Healthy/Watch/Alert) | `/economy` | If no snapshot → "No data yet" |
| 5 | **Drops (7d)** | `N` total | `+X%` or `+N` delta vs prev 7d | `/reports` | If prev < 50 → show absolute delta, not % |
| 6 | **Risk Alerts** | `N unresolved` | `M critical` or "All clear" | `/risk` | — |

### Middle Section (2-column on desktop)

**A) Machine Operations (2/3 width)**
- Live status strip: In Use / Ready / Maint. / Offline (colored pills, animated dot for active)
- 7-day sessions bar chart
- Machine type split (progress bars)
- Peak hour badge
- Footer CTA: "Open Machine Hub"

**B) Desk + Activity Preview (1/3 width)**
- Pending pickups alert (amber banner if > 0, links to Store)
- Last 5 events (check-ins + redemptions mixed, sorted by time)
- Footer CTA: **"Open Activity Log"** → `/gym/[id]/activity`

### Bottom Section (2-column)

**A) Challenges Snapshot**
- Active count, real completion rate, most popular
- CTA: "Manage" → `/challenges`

**B) Top Performers**
- Top 3 members by **earned drops** (filtered to `role = 'user'`)
- Avatar, name, earned drops count
- CTA: links to member profile

### Conditional: Setup Checklist
- Show only when < 5/5 complete
- When all done → hidden entirely (not replaced with a card)

---

## KPI Metric Corrections (Mandatory)

### 1. Active Rate
```
activeRatePct = min(100, round((distinct_active_7d / total_members) * 100))
```
Problem: `active7d` counted from `gym_checkins` can exceed `gym_memberships` count if a user checked in but isn't in memberships table. Fix: use `LEAST(count, total)` or count from memberships join.

### 2. Drops Delta
```
if prev7d < 50 → show "+N drops" (absolute)
else → show "+X%" (percentage)
if prev7d == 0 and current > 0 → show "New" badge
```

### 3. Economy Health Display
```
if no economy_snapshots_daily row → show "No data yet" in gray
if burn_mint_ratio exists → show as percentage with label
```

### 4. Top1 Share
```
if total_members <= 3 → hide Top1 share (not meaningful)
else → show normally
```

### 5. Challenge Completion Rate
Must be computed server-side:
```sql
round(
  count(*) filter (where cp.is_completed = true)::numeric /
  nullif(count(*), 0) * 100
) from challenge_progress cp
join gym_challenges gc on gc.id = cp.challenge_id
where gc.gym_id = p_gym_id and gc.is_active = true
```

### 6. Top Performers — Earned Drops
Replace `local_drops_balance` with earned drops from `drops_transactions`:
```sql
select p.id, p.username, p.avatar_url,
  coalesce(sum(dt.amount) filter (where dt.amount > 0), 0) as earned_drops
from gym_memberships gm
join profiles p on p.id = gm.user_id
left join drops_transactions dt on dt.user_id = p.id and dt.gym_id = p_gym_id
where gm.gym_id = p_gym_id and p.role = 'user'
group by p.id, p.username, p.avatar_url
order by earned_drops desc
limit 5
```

---

## Activity Log — Separate Screen

### Route
`apps/admin-panel/app/dashboard/gym/[id]/activity/page.tsx`

### Sidebar Placement
Add to `REWARDS & DESK` group after Store:
```
REWARDS & DESK
  Store (badge: N pending)
  Check-in
  Activity Log  ← NEW
```

### Screen Layout
```
ACTIVITY LOG
Recent gym activity — check-ins, redemptions, and system events

[All] [Check-ins] [Redemptions]     [Search member...]  [Period ▼]

Time         Type          Member        Details                Status
─────────────────────────────────────────────────────────────────────
2m ago       Check-in      Ana K.        Checked in via QR      ✓
15m ago      Redemption    Stefan M.     Protein Shake 20%      Pending
1h ago       Redemption    Nenad         Water Bottle           Confirmed
...

[Pagination: 1 2 3 ... 12 →]
```

### Data Source
Merge `gym_checkins` + `redemptions` for the gym, sort by time desc, paginate (20/page).

---

## Dependencies

- `economy_snapshots_daily` table (already exists)
- `fraud_events` table (already exists)
- `drops_transactions` table (already exists)
- `challenge_progress` + `gym_challenges` (already exist)
- `get_live_machine_status` RPC (already exists)

---

## Execution Plan by Agent

### Phase 1 — DBA: Dashboard RPC Fix (supabase-dba)

**Migration:** `20260311000001_dashboard_v3_rpc.sql`

1. **Rewrite `get_gym_dashboard_overview` RPC** to fix all metrics:
   - `activeRatePct`: clamp 0–100, use `LEAST`
   - `challengeSnapshot.completionRatePct`: real computation from `challenge_progress`
   - `topPerformers`: earned drops from `drops_transactions` (amount > 0), filtered to `role = 'user'`, top 5
   - Include `topPerformers` in the JSONB return so dashboard needs only ONE RPC call
   - `deskFeed`: last 10 events (5 checkins + 5 redemptions merged)

2. **Create `get_gym_activity_log` RPC** for the Activity Log screen:
   ```sql
   get_gym_activity_log(
     p_gym_id UUID,
     p_kind TEXT DEFAULT 'all',  -- 'all', 'checkin', 'redemption'
     p_search TEXT DEFAULT NULL,
     p_page INT DEFAULT 1,
     p_per_page INT DEFAULT 20
   ) RETURNS JSONB
   -- returns { items: [...], total: N, page: N, per_page: N }
   ```
   Each item: `{ id, kind, member_name, member_avatar, details, status, created_at }`

3. **Indexes** (if missing):
   - `gym_checkins(gym_id, checked_in_at DESC)`
   - `redemptions(gym_id, created_at DESC)`
   - `drops_transactions(user_id, gym_id) WHERE amount > 0`

### Phase 2 — Admin Coder: Server Actions + UI

**Task 2A: Update `dashboard-actions.ts`**
- Update `DashboardOverview` type to include `topPerformers` array
- Remove separate `getTopPerformers` call from dashboard — it's now in the main RPC
- Apply client-side safety guards:
  - `activeRatePct = Math.min(100, Math.max(0, raw))`
  - Drops delta: if `prev7d < 50` → return absolute delta, not percentage
  - Economy: if no snapshot → return `{ health: 'gray', healthLabel: 'No data' }`

**Task 2B: Create `activity-log-actions.ts`**
- `getGymActivityLog(gymId, kind, search, page, perPage)` → calls `get_gym_activity_log` RPC

**Task 2C: Fix `DashboardKPIGrid.tsx`**
- Drops card: show absolute delta when prev < 50 (e.g., "+1,143" instead of "+3810%")
- Economy card: handle `gray` health state gracefully
- Risk card: "All clear" message when 0 unresolved

**Task 2D: Fix `DeskActivityPanel.tsx`**
- Change "View all" link from `store?tab=redemptions` to `activity` route
- Limit feed to 5 items (not 10)
- Rename CTA to "Open Activity Log"

**Task 2E: Fix `TopPerformersWidget.tsx`**
- Use `topPerformers` from the dashboard overview prop instead of separate fetch
- Remove the separate `useEffect` + `getTopPerformers` call
- Display "earned drops" label

**Task 2F: Fix `top-performers-actions.ts`**
- Change query from `local_drops_balance` to earned drops from `drops_transactions`
- Add `role = 'user'` filter on profiles join
- Keep this action for non-dashboard usage (e.g., leaderboard page)

**Task 2G: Create Activity Log page**
- Route: `apps/admin-panel/app/dashboard/gym/[id]/activity/page.tsx`
- Component: `apps/admin-panel/components/modules/ActivityLog.tsx`
- Features: tab filter (All/Check-ins/Redemptions), search by member name, period selector, pagination (20/page)
- Premium dark theme, consistent with existing admin panel style

**Task 2H: Update Sidebar**
- Add "Activity Log" item to `REWARDS & DESK` group with `Activity` icon from lucide
- Import `ScrollText` or `ActivitySquare` icon

**Task 2I: Update `DashboardShell.tsx`**
- Pass `topPerformers` from overview to `TopPerformersWidget` as prop
- Remove gymId dependency for separate performer fetch

### Phase 3 — Reviewer

1. Verify KPI guards: no values > 100% for rates, no absurd delta percentages
2. Verify Top Performers shows earned drops, not balance
3. Verify Activity Feed "View all" goes to Activity Log, not store
4. Verify Activity Log has pagination and doesn't load all records
5. Security: Activity Log RPC enforces gym access
6. No sensitive data in logs

---

## API Contract (Target)

```ts
type DashboardOverview = {
  kpis: {
    members: { total: number; active7d: number; activeRatePct: number };
    checkins: { today: number; week: number };
    storeDesk: { pendingPickups: number; confirmedToday: number };
    economy: {
      burnMintRatio: number;
      top1SharePct: number;
      health: 'green' | 'yellow' | 'red' | 'gray';
      healthLabel: string;
      totalMembers: number; // for Top1 hide logic
    };
    dropsIssued7d: {
      total: number;
      prev7d: number;
      deltaPct: number | null;   // null if prev < 50
      deltaAbsolute: number;     // always available
    };
    risk: { unresolved: number; critical: number };
  };
  machineOps: {
    liveSummary: { active: number; available: number; maintenance: number; offline: number; total: number };
    usageTrend7d: Array<{ date: string; sessions: number }>;
    typeSplit: Array<{ type: string; count: number; sharePct: number }>;
    peakHour: { hour: number; sessions: number } | null;
  };
  deskFeed: Array<{ id: string; kind: 'checkin' | 'redemption'; title: string; at: string; status: string }>;
  challengeSnapshot: { active: number; completionRatePct: number; mostPopular: string | null };
  topPerformers: Array<{
    id: string;
    username: string;
    avatar_url: string | null;
    earnedDrops: number;
  }>;
  setupComplete: boolean;
};

type ActivityLogEntry = {
  id: string;
  kind: 'checkin' | 'redemption';
  memberName: string;
  memberAvatar: string | null;
  details: string;
  status: string;
  createdAt: string;
};

type ActivityLogResponse = {
  items: ActivityLogEntry[];
  total: number;
  page: number;
  perPage: number;
};
```

---

## Rollout Order

1. `supabase-dba` — fix dashboard RPC + create activity log RPC  
2. `admin-coder` — fix KPIs, fix top performers, fix activity feed link, build Activity Log screen  
3. `reviewer` — validate metrics, security, UX  
