# Performance: `get_gym_dashboard_overview` RPC Optimization

**Status:** Draft  
**Author:** Architect  
**Date:** 2026-04-17  
**Workspace:** `backend/supabase`  
**Assignee:** supabase-dba  
**Companion plan:** `docs/plans/perf_admin_panel_navigation.md` (Step 10)

---

## Context

The admin panel page `apps/admin-panel/app/dashboard/gym/[id]/dashboard/page.tsx` calls `supabase.rpc('get_gym_dashboard_overview', { p_gym_id, p_window_days })` (see `apps/admin-panel/lib/actions/dashboard-actions.ts:89`). This RPC fans out into aggregations across `sessions`, `drops_transactions`, `redemptions`, `profiles`, `machines`, and `challenges`.

User confirms this RPC is **known to be slow** and is the dominant cost on every gym dashboard load. The admin-panel side fixes (caching, parallelization) won't matter if the RPC stays at 1s+.

This plan profiles the RPC, identifies missing indexes and redundant scans, and produces a migration that brings p50 < 150ms.

---

## Dependencies

- [ ] Supabase SQL editor access (or `psql` against production).
- [ ] `apps/admin-panel` side changes NOT required for this plan. Companion plan handles caller.
- [ ] Ability to apply migrations via `supabase db push` after staging validation.

---

## Execution Plan

### Step 1 — Profile the current RPC

**Workspace:** `backend/supabase` (supabase-dba)

**Tasks:**
- Open Supabase SQL editor (prod project: `jzyoyxabcdzvqcfnfzrz`).
- Pick a representative gym with realistic data volume (Vortex as founding partner — likely largest).
- Run:
  ```sql
  EXPLAIN (ANALYZE, BUFFERS, TIMING, FORMAT TEXT)
  SELECT get_gym_dashboard_overview('<gym_uuid>'::uuid, 7);
  ```
- Capture the plan output. Paste into `docs/perf_notes/rpc_overview_baseline.md` for reference.
- Also time the raw function:
  ```sql
  \timing on
  SELECT get_gym_dashboard_overview('<gym_uuid>'::uuid, 7);
  ```
  Record p50/p95 over 10 runs.

**Deliverable:** Baseline measurement document listing:
- Total function time (p50, p95).
- Sub-query breakdown: which CTEs / sub-selects dominate.
- All sequential scans with row counts > 10k.
- Missing indexes suggested by the planner.

---

### Step 2 — Add missing indexes

**Workspace:** `backend/supabase` (supabase-dba)

**Expected targets** (confirm from Step 1 output):

Likely slow scans and their fix indexes:

| Table | Query pattern | Probable missing index |
|-------|---------------|------------------------|
| `sessions` | `WHERE gym_id = ? AND ended_at >= NOW() - INTERVAL '7 days'` | `idx_sessions_gym_ended_at (gym_id, ended_at DESC)` |
| `sessions` | `WHERE gym_id = ? AND started_at >= ?` | `idx_sessions_gym_started_at (gym_id, started_at DESC)` |
| `drops_transactions` | `WHERE gym_id = ? AND created_at >= ?` | `idx_drops_gym_created (gym_id, created_at DESC)` |
| `drops_transactions` | aggregations per user for top performers | `idx_drops_gym_user (gym_id, user_id) INCLUDE (amount)` |
| `redemptions` | `WHERE gym_id = ? AND status = ? AND created_at >= ?` | `idx_redemptions_gym_status_created (gym_id, status, created_at DESC)` |
| `profiles` | `WHERE home_gym_id = ? OR last_active_gym_id = ?` | `idx_profiles_home_gym (home_gym_id)` and/or `idx_profiles_last_active_gym (last_active_gym_id)` |
| `machines` | `WHERE gym_id = ? AND status = ?` | `idx_machines_gym_status (gym_id, status)` |

**Fix:**
- Create migration: `backend/supabase/migrations/YYYYMMDDHHMMSS_perf_dashboard_indexes.sql`
- Use `CREATE INDEX CONCURRENTLY` where possible (not inside transactions).
- After creating, re-run `EXPLAIN ANALYZE` from Step 1 to confirm index is used.

**Impact:** Typically 3–10× speedup on aggregations hitting these tables.

---

### Step 3 — Rewrite the RPC body (if Step 2 alone doesn't close the gap)

**Workspace:** `backend/supabase` (supabase-dba)

**Problem:** The RPC likely has multiple independent CTEs running as separate sub-queries. Postgres can usually parallelize these, but if they share a common filter (e.g. `sessions` scoped to `gym_id + window_days`), a single pre-filter CTE can be scanned once and reused.

**Fix:**
- Review current RPC source (`supabase db dump -s` or read from dashboard SQL editor).
- Extract a common CTE:
  ```sql
  WITH scoped_sessions AS (
    SELECT * FROM sessions
    WHERE gym_id = p_gym_id
      AND started_at >= NOW() - (p_window_days || ' days')::interval
  ),
  scoped_drops AS (
    SELECT * FROM drops_transactions
    WHERE gym_id = p_gym_id
      AND created_at >= NOW() - (p_window_days || ' days')::interval
  )
  SELECT ...
  ```
- Replace repeated aggregations with a single pass using `FILTER` clauses:
  ```sql
  SELECT
    count(*) FILTER (WHERE started_at >= current_date) AS sessions_today,
    count(*) FILTER (WHERE started_at >= NOW() - interval '7 days') AS sessions_week
  FROM scoped_sessions;
  ```
- Migration: `backend/supabase/migrations/YYYYMMDDHHMMSS_perf_rewrite_dashboard_rpc.sql`
  - Use `CREATE OR REPLACE FUNCTION get_gym_dashboard_overview(...)` (signature must stay identical — admin-panel caller depends on JSON shape).

**Impact:** 2–5× speedup if Step 2 isn't sufficient.

**Validation:**
- `SELECT get_gym_dashboard_overview(...)` returns **identical JSON structure** before and after. Diff using `jsonb_pretty()`.

---

### Step 4 — (Optional) Materialized view for hot metrics

**Workspace:** `backend/supabase` (supabase-dba)

**Only if Steps 2–3 don't bring p50 < 150ms.**

**Fix:**
- Create a materialized view `mv_gym_daily_metrics` refreshed every 5 min by a scheduled Edge Function or `pg_cron`.
- Columns: `gym_id`, `date`, `checkins`, `sessions`, `drops_issued`, `active_users`, etc.
- Rewrite the RPC to pull 7-day rollups from the MV instead of live aggregation.

**Migration:** `backend/supabase/migrations/YYYYMMDDHHMMSS_perf_mv_gym_daily_metrics.sql`

**Trade-off:** 5-minute staleness on dashboard KPIs. Confirm acceptable with product.

---

## API Contracts

**No changes to public API.** The RPC signature and response JSON shape MUST remain identical:

```ts
// apps/admin-panel/lib/actions/dashboard-actions.ts relies on this shape:
export interface DashboardOverview {
  kpis: { members, checkins, storeDesk, economy, dropsIssued7d, risk };
  machineOps: { liveSummary, usageTrend7d, typeSplit, peakHour };
  deskFeed: Array<...>;
  challengeSnapshot: { active, completionRatePct, mostPopular };
  topPerformers: Array<...>;
  setupComplete: boolean;
}
```

---

## Testing Requirements

### Regression Tests
- [ ] `SELECT get_gym_dashboard_overview('<gym>'::uuid, 7)` returns same JSON keys and types before/after.
- [ ] Admin panel dashboard renders identically for `superadmin`, `gym_owner`, `gym_admin`.
- [ ] `apps/admin-panel/app/dashboard/gym/[id]/economy/page.smoke.test.tsx` passes.

### Performance Targets
| Metric | Before | Target After Step 2 | Target After Step 3 |
|--------|--------|---------------------|---------------------|
| RPC p50 | measure in Step 1 | < 400ms | < 150ms |
| RPC p95 | measure in Step 1 | < 800ms | < 300ms |
| Gym dashboard TTFB | ~1.5–2s | ~600–900ms | ~300–500ms |

### Load Testing
- Run the RPC 100 times serially and in parallel (via `pgbench` or a simple Node script).
- Confirm no connection pool exhaustion.

---

## Rollout Strategy

1. **Step 1** (profiling) — read-only, do immediately.
2. **Step 2** (indexes) — `CREATE INDEX CONCURRENTLY`, safe to apply to prod during low-traffic window.
3. Measure → if p50 < 150ms, **stop**.
4. **Step 3** (RPC rewrite) — apply to staging first, diff JSON output, then prod.
5. **Step 4** (materialized view) — only if Steps 2–3 insufficient.

---

## Related Files

- `apps/admin-panel/lib/actions/dashboard-actions.ts:89` — caller
- `apps/admin-panel/app/dashboard/gym/[id]/dashboard/page.tsx:44-49` — page that awaits this RPC
- `backend/supabase/migrations/` — where new migrations land
- Function source: search with `rg "get_gym_dashboard_overview" backend/supabase/migrations/`

---

## Open Questions

1. Is 5-minute staleness acceptable for dashboard KPIs (Step 4)? Confirm with product before investing in MV.
2. Do we have a non-prod Supabase project to run baseline on, or should we profile directly in prod during low-traffic hours?
3. Are there any other dashboards (e.g. `super/page.tsx`, `owner/page.tsx`) that also call expensive RPCs and should be bundled into this plan?
