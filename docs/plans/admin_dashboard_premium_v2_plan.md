# Feature: Admin Dashboard Premium V2 (Command Center)

**Date:** 2026-03-11  
**Priority:** Critical (owner UX + operations)  
**Scope:** `apps/admin-panel` + `backend/supabase` (dashboard RPC contracts)

## Context

Current gym dashboard is functional but not yet premium command-center quality:
- Store and Pending Pickups are split into two cards (redundant).
- Quick Actions block duplicates sidebar navigation and adds clutter.
- Machine section shows navigation to Machine Hub, but lacks essential at-a-glance stats/charts.
- Economy Health exists as a widget, but economy is not clearly integrated in top KPI layer.

Goal: build a premium, fast, self-explanatory dashboard with only the most operationally important data.

---

## Product Decisions (Locked)

1. **Economy must be a top KPI card** (not only a separate panel).
2. **Store + Pending Pickups must be merged** into one operational card.
3. **Remove Quick Actions block** from dashboard.
4. **Machine Usage must include essential charts/stats** (live + trend + utilization), not just a CTA link.
5. Dashboard is a **daily operations cockpit**, not a navigation page.

---

## Information Architecture — Dashboard V2

## Top KPI Row (6 cards max)

1. **Members**
- Total members
- Active last 7d (%)
- Link: `Members`

2. **Check-ins Today**
- Today count
- Week count
- Link: `Check-in`

3. **Store Desk** (merged card)
- Pending pickups (primary value)
- Pending + confirmed today (secondary)
- Link: `Desk` (or `Store?tab=redemptions` fallback)

4. **Economy Health**
- Burn/Mint ratio
- Top1 share
- Health status chip (`green/yellow/red`)
- Link: `Economy`

5. **Drops Issued (7d)**
- Total issued last 7d
- Delta vs previous 7d
- Link: `Reports`

6. **Risk Alerts**
- Unresolved events
- Severity hint if critical exists
- Link: `Risk & Abuse`

## Middle Section

### A) Machine Operations (primary panel)
- **Live status mini-summary:** active / available / maintenance / offline
- **Usage trend chart (7d):** sessions/day and utilization %
- **Top machine types:** treadmill/bike/elliptical/stepper split
- **Peak hour** label
- Footer CTA: `Open Machine Hub` for deep analytics

### B) Desk + Activity stream (secondary panel)
- Pending pickups queue preview (top 5)
- Recent check-ins / redemptions feed (last 10 events)
- Status badges for urgency

## Bottom Section

### A) Challenges Snapshot
- Active challenges
- Completion rate (period)
- Most popular challenge

### B) Setup + Blockers
- Existing setup checklist shown only when incomplete
- If complete, replace with "All systems operational" card

---

## Dependencies

- Existing plans:
  - `docs/plans/admin_panel_premium_security_speed_production_plan.md`
  - `docs/plans/admin_panel_premium_simplification_plan.md`
- Existing backend capabilities:
  - `get_machine_analytics_dashboard`
  - `get_live_machine_status`
  - `economy_snapshots_daily`
  - `fraud_events`
  - report RPCs and check-in stats

---

## Execution Plan by Agent

### Phase 1 — Dashboard Data Contracts (supabase-dba)

**Workspace:** `backend/supabase/`

1. Add dedicated dashboard RPC (single fetch contract):
- `get_gym_dashboard_overview(p_gym_id uuid, p_window_days int default 7)`
- Returns JSONB:
  - `kpis` (members, checkins_today, pending_pickups, economy_health, drops_issued_7d, risk_alerts)
  - `machine_ops` (live_summary, usage_trend_7d, type_split, peak_hour)
  - `desk_feed` (recent redemptions/checkins)
  - `challenge_snapshot`
  - `setup_status`

2. Ensure strict gym access check in function (`SECURITY DEFINER` + auth guard helper).
3. Add/confirm indexes for:
- sessions by gym/date,
- redemptions by gym/status/date,
- gym_checkins by gym/date,
- fraud_events unresolved by gym,
- machines by gym/status fields.

**Acceptance criteria:**
- One RPC returns all dashboard sections under 300ms on seeded medium gym dataset.
- No N+1 queries from frontend for dashboard render path.

---

### Phase 2 — Server Actions + Data Normalization (admin-coder)

**Workspace:** `apps/admin-panel/lib/actions/`

1. Create action:
- `getGymDashboardOverview(gymId: string, windowDays?: number)`
- return shape:
  - `{ success: boolean; data?: DashboardOverview; error?: string }`

2. Normalize fallback behavior if any sub-block is missing:
- show empty-safe defaults, never crash cards.
3. Remove noisy console logging from dashboard fetch paths.

**Acceptance criteria:**
- Dashboard page uses one primary action call for all core blocks.
- Types strict, no `any` leakage.

---

### Phase 3 — Premium Dashboard UI Refactor (admin-coder)

**Workspace:** `apps/admin-panel/app/dashboard/gym/[id]/dashboard/` + `components`

1. Refactor dashboard layout to V2 sections above.
2. Merge cards:
- Remove separate `Pending Pickups` card.
- Upgrade `Store` card into `Store Desk` card with pending as primary metric.
3. Promote `Economy` into top KPI row (keep deep widget details accessible).
4. Remove `Quick Actions` block entirely.
5. Replace current machine widget behavior:
- Add mini charts + utilization + live status summary.
- Keep Machine Hub as secondary CTA.
6. Keep visual style premium:
- denser info hierarchy,
- clear label/subtitle semantics,
- consistent card heights and loading skeletons.

**Candidate files:**
- `apps/admin-panel/app/dashboard/gym/[id]/dashboard/page.tsx`
- `apps/admin-panel/components/analytics/AnalyticsSection.tsx`
- `apps/admin-panel/components/analytics/MachineHeatmapWidget.tsx`
- `apps/admin-panel/components/economy/EconomyHealthWidget.tsx`
- new `apps/admin-panel/components/dashboards/DashboardKPIGrid.tsx` (if needed)
- new `apps/admin-panel/components/dashboards/MachineOpsPanel.tsx` (if needed)
- new `apps/admin-panel/components/dashboards/StoreDeskCard.tsx` (if needed)

**Acceptance criteria:**
- Dashboard has no redundant blocks.
- All critical operations visible above the fold on desktop.
- Mobile/tablet breakpoints remain usable and uncluttered.

---

### Phase 4 — Security & Performance Pass (admin-coder + reviewer)

**Workspace:** admin

1. Verify action-level auth checks and gym scoping.
2. Ensure no client-side privileged data mutations.
3. Measure render and interaction performance:
- initial dashboard render,
- filter/window changes,
- no blocking spinner for entire page after first load.
4. Reviewer validates:
- no security regressions,
- no sensitive data in logs,
- KPI semantics correct.

---

### Phase 5 — Validation & QA (test-automation-agent)

**Workspace:** tests + admin

1. Smoke tests:
- dashboard loads for owner/admin/receptionist scopes correctly,
- cards render with realistic + empty data,
- links route to correct modules.
2. Regression checks:
- Store desk merge behavior,
- economy KPI values align with snapshots,
- machine panel shows chart/stats (not only link).
3. Performance checks:
- dashboard P95 render target in staging.

---

## API Contract (Target)

```ts
type DashboardOverview = {
  kpis: {
    members: { total: number; active7d: number; activeRatePct: number };
    checkins: { today: number; week: number };
    storeDesk: { pendingPickups: number; confirmedToday: number };
    economy: { burnMintRatio: number; top1SharePct: number; health: 'green' | 'yellow' | 'red'; healthLabel: string };
    dropsIssued7d: { total: number; prev7d: number; deltaPct: number | null };
    risk: { unresolved: number; critical: number };
  };
  machineOps: {
    liveSummary: { active: number; available: number; maintenance: number; offline: number; total: number };
    usageTrend7d: Array<{ date: string; sessions: number; utilizationPct: number }>;
    typeSplit: Array<{ type: string; sessions: number; sharePct: number }>;
    peakHour: { hour: number; sessions: number } | null;
  };
  deskFeed: Array<{ id: string; kind: 'checkin' | 'redemption'; title: string; at: string; status: string }>;
  challengeSnapshot: { active: number; completionRatePct: number; mostPopular: string | null };
  setupStatus: { complete: boolean; blockers: string[] };
};
```

---

## Testing Requirements

1. **Functional**
- Economy KPI appears in top row and links to economy page.
- Store + pending pickups are merged into one card.
- Quick Actions section no longer rendered.
- Machine panel shows chart(s) and summary stats.

2. **Security**
- Non-authorized users cannot access another gym dashboard data.
- RPC and action enforce gym scope.

3. **Performance**
- Dashboard renders without heavy multi-query client waterfalls.
- P95 page render and data fetch within agreed staging budget.

4. **UX**
- Owner can answer key questions in <10 seconds:
  - "How many pickups are pending?"
  - "Is economy healthy?"
  - "Are machines being used right now?"
  - "Do I have risk alerts?"

---

## Rollout Order

1. `supabase-dba` — dashboard overview RPC + indexes  
2. `admin-coder` — server action + UI refactor  
3. `reviewer` — security + UX consistency  
4. `test-automation-agent` — regression/perf validation

