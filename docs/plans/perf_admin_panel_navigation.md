# Performance: Admin Panel Navigation Latency

**Status:** Draft  
**Author:** Architect  
**Date:** 2026-04-17  
**Workspace:** `apps/admin-panel`

---

## Context

Users report that navigating between routes in the admin panel (`apps/admin-panel`) is very slow **in both dev and production** (perceived 1.5–4s per click). Root-cause analysis shows the dominant cost is **serial network round-trips to the remote Supabase instance** (`https://jzyoyxabcdzvqcfnfzrz.supabase.co`), compounded by `force-dynamic` rendering that disables every Next caching layer and by duplicate auth/profile fetches in middleware + layout + page. The `get_gym_dashboard_overview` RPC is also known to be slow.

This plan eliminates redundant Supabase round-trips, adds safe caching, introduces streaming/Suspense boundaries, and upgrades stale Supabase client versions. No feature work, no UI changes.

---

## ⚡ Recommended Fast Path (user priority: quick wins)

Based on user confirmation (2026-04-17) that:
- Sporost postoji **i u dev-u i u prod-u**
- Preferiraju se **brzi wins, ne full cleanup**
- `get_gym_dashboard_overview` RPC **je poznat kao spor**

Execute **in this order**, measuring after each:

| Order | Step | Why first | Effort |
|-------|------|-----------|--------|
| **1** | **Step 9** — Enable Turbopack in dev | Fixes dev-only complaint immediately, zero risk | 5 min |
| **2** | **Step 1** — `React.cache()` on `getCurrentUser`/`getCurrentProfile` | Eliminates 2 of 3 redundant auth round-trips on every navigation (both dev + prod) | 30 min |
| **3** | **Step 2** — Parallelize middleware queries | Kills serial waterfall on every dashboard route | 45 min |
| **4** | **Step 10** (companion plan) — RPC optimization for `get_gym_dashboard_overview` | Dominant cost on gym dashboard; assign to `supabase-dba` in parallel | separate plan |
| **5** | **Step 6** (scoped) — Add `loading.tsx` only to `gym/[id]/dashboard` and `gym/[id]/store` | Perceived latency massively improves even before RPC is faster | 30 min |
| **6** | **Step 3** (scoped) — Remove `force-dynamic` from `app/layout.tsx` and `app/dashboard/layout.tsx` | Low-risk subset; leaves per-page `force-dynamic` alone for now | 10 min |

**Stop after Step 6 and re-measure.** If p50 navigation ≥ 50% faster, skip the rest. Otherwise continue with Steps 4, 5, 7, 8 from the full plan below.

Companion plan for Step 10: `docs/plans/perf_gym_dashboard_rpc.md` (to be created, assigned to supabase-dba).

---

## Dependencies

- [ ] No database migrations required.
- [ ] No new env vars.
- [ ] Access to Supabase Dashboard to run `EXPLAIN ANALYZE` on `get_gym_dashboard_overview` RPC (Step 7, optional).

---

## Root Cause Summary (ranked by impact)

| # | Cause | File(s) | Estimated cost |
|---|-------|---------|----------------|
| 1 | `supabase.auth.getUser()` called 2–3× per navigation (middleware + layout + page) | `middleware.ts:38`, `lib/auth.ts:19`, `lib/auth-guard.ts:10` | 300–900ms serial |
| 2 | Middleware runs 3–5 sequential Supabase queries on every dashboard path | `middleware.ts` | 200–600ms serial |
| 3 | `force-dynamic` on root layout, dashboard layout, and ≥14 pages → zero cache | `app/layout.tsx:18`, `app/dashboard/layout.tsx:8`, pages | removes all caching headroom |
| 4 | Profile fetched 3× per gym navigation (not memoized with `cache()`) | `lib/auth.ts`, `lib/auth-guard.ts`, `app/dashboard/layout.tsx` | 100–400ms serial |
| 5 | `gym/[id]/dashboard/page.tsx` runs 5–8 sequential DB calls (profile, gyms, RPC, referral, 3× counts) | `app/dashboard/gym/[id]/dashboard/page.tsx` | 500–1500ms serial |
| 6 | `app/dashboard/gyms/page.tsx` is a client component (`'use client'` + `useEffect`) → spinner + extra round-trip | `app/dashboard/gyms/page.tsx:1` | 200–500ms + UX flicker |
| 7 | Old `@supabase/ssr@^0.1.0` (current stable is `^0.5.x`) | `apps/admin-panel/package.json:25` | minor (per-request cookie parsing) |
| 8 | No `loading.tsx` boundaries on most routes — user sees blank screen until everything resolves | `app/dashboard/**` | perceptual (whole render blocks) |
| 9 | If running `next dev` without Turbopack, every first route visit recompiles on demand | `package.json:6` script | 2–10s on first visit only |

---

## Execution Plan

Ordered by **impact × effort**. Each step is independently deployable and can be validated in isolation.

### Step 1 — Collapse duplicate auth/profile fetches with `React.cache()`

**Workspace:** `apps/admin-panel` (admin-coder)

**Problem:** `getCurrentProfile()` and `getCurrentUser()` are called 2–3× per navigation (layout, page, guards). Each call does `supabase.auth.getUser()` → network + `from('profiles')` → network.

**Fix:**
- Wrap `getCurrentUser` and `getCurrentProfile` in `React.cache()` so Next dedupes all calls within the same RSC render pass.
- File: `apps/admin-panel/lib/auth.ts`
- Pattern:
  ```ts
  import { cache } from 'react';
  export const getCurrentUser = cache(async (): Promise<User | null> => { ... });
  export const getCurrentProfile = cache(async (): Promise<UserProfile | null> => { ... });
  ```

**Impact:** Eliminates 2 out of 3 redundant Supabase round-trips per navigation (saves ~200–600ms).

**Validation:**
- Add temporary `console.log('[auth] getCurrentProfile called')` → confirm it fires once per request (not three).
- Navigate between 5 gym routes; verify network panel → only one `/auth/v1/user` call per navigation.

---

### Step 2 — Parallelize middleware queries

**Workspace:** `apps/admin-panel` (admin-coder)

**Problem:** `middleware.ts` runs profile + gym + gym (×2 in some branches) **sequentially**. For `gym_owner`, that's 4 waterfall round-trips.

**Fix:**
- File: `apps/admin-panel/middleware.ts`
- Use `Promise.all` to parallelize independent fetches:
  - Once `user` is known, kick off `profiles` and the gym query for the current URL **in parallel** (if URL matches `/dashboard/gym/[id]`).
  - Replace the sequential chain in RBAC branches with `Promise.all([profileQuery, gymQuery])` where possible.
- Hoist the regex `gymRouteMatch` above the profile fetch so the gym query can run concurrently.

**Impact:** Cuts middleware latency roughly in half on gym routes (300ms → ~150ms typical).

**Validation:**
- Use `performance.now()` before/after middleware body; log duration. Confirm p50 < 200ms on gym routes.

---

### Step 3 — Remove `force-dynamic` where it is not needed

**Workspace:** `apps/admin-panel` (admin-coder)

**Problem:** `force-dynamic` on `app/layout.tsx`, `app/dashboard/layout.tsx`, and 14 pages is a sledgehammer. It forces every RSC to re-run from zero on every navigation and disables Next's built-in Data Cache.

**Rationale:** Cookies already make any RSC that reads them auto-dynamic — explicit `force-dynamic` is redundant **and** it blocks Next's per-request memoization optimizations and route-segment caching.

**Fix:**
- File: `apps/admin-panel/app/layout.tsx` — **remove** `export const dynamic = 'force-dynamic'` (line 18). Root layout should not force the entire app dynamic.
- File: `apps/admin-panel/app/dashboard/layout.tsx` — **remove** `export const dynamic = 'force-dynamic'` (line 8). Comment on line 6–7 already notes it's "auto-dynamic at runtime". Keep the guard against `phase-production-build`.
- Audit the 14 pages with `force-dynamic`:
  - Keep it **only** on truly live pages: `gym/[id]/dashboard`, `gym/[id]/desk`, `gym/[id]/activity`, `gym/[id]/checkin`, `gym/[id]/risk`, `print/*`.
  - **Remove** from pages where `revalidate = 60` (or similar) would be acceptable: `gym/[id]/store`, `gym/[id]/workout-plans`, `gym/[id]/machines`, `gym/[id]/machines/[machineId]`, `dashboard/super/achievements`, `accept-invitation/[token]`.
  - Decision per page should be made by admin-coder + confirmed by reviewer.

**Impact:** Enables Next Data Cache where appropriate. Reduces RSC waterfall on unchanged subtrees. Minor per-navigation win (~50–150ms) but sets up future caching.

**Validation:**
- Run `pnpm build:admin` → verify no new static-generation errors on untouched pages.
- Run `pnpm dev:admin` and confirm behavior unchanged for live dashboards.

---

### Step 4 — Deduplicate the gym fetch between middleware and page

**Workspace:** `apps/admin-panel` (admin-coder)

**Problem:** For `/dashboard/gym/[id]/dashboard`, middleware does `select('owner_id, status, is_suspended')` AND the page does `select('*')`. Two round-trips for the same row.

**Fix:**
- File: `apps/admin-panel/app/dashboard/gym/[id]/dashboard/page.tsx`
- Wrap the gym fetch in a helper `getGymById = cache(async (id) => ...)` in `apps/admin-panel/lib/gym.ts` and reuse it from any `gym/[id]/**` page.
- Middleware **cannot** share RSC cache (different runtime), so keep its query minimal (`select('status, is_suspended, owner_id')` — already good) and ensure the page uses `.select('*')` only once via the cached helper.
- Alternatively: set a request-scoped header in middleware (`x-gym-owner-id`) with the gym's owner/status and have the page read it from `headers()` to skip the re-fetch. Document trade-off with reviewer.

**Impact:** Saves one `gyms` round-trip per gym-page navigation (~80–200ms).

**Validation:**
- Network panel: exactly one `rest/v1/gyms?id=eq.{id}` request per page render.

---

### Step 5 — Parallelize page-level data fetches on gym dashboard

**Workspace:** `apps/admin-panel` (admin-coder)

**Problem:** `gym/[id]/dashboard/page.tsx` (lines 30–73) runs:
1. `requireGymAccess` (profile fetch)
2. `gyms select *`
3. `Promise.all([getGymDashboardOverview, getReferralData])`
4. Three separate count queries if setup incomplete

Steps 1 and 2 can happen in parallel once user is known. The 3× count queries in step 4 should be a single RPC or a single `select` with aggregation.

**Fix:**
- File: `apps/admin-panel/app/dashboard/gym/[id]/dashboard/page.tsx`
- Kick off `gyms.select('*').eq('id', id)` and `getGymDashboardOverview(id)` and `getReferralData(id)` all in parallel using `Promise.all` — do NOT await the gym query before starting the RPC.
- Replace the three `count(*)` queries (lines 61–65) with a single RPC (`get_gym_setup_status(p_gym_id uuid)`) that returns a row with boolean flags. Assign this sub-step to **supabase-dba** (new plan required).
- Alternative (no migration): run all three counts in `Promise.all` — already done. The bigger win is combining into one RPC.

**Impact:** Cuts dashboard render from ~1.5–2s to ~400–700ms (p50).

**Validation:**
- Measure time-to-first-byte for `/dashboard/gym/[id]/dashboard` before and after.
- Ensure setup checklist still renders correctly when incomplete.

---

### Step 6 — Wrap slow data in Suspense with `loading.tsx` boundaries

**Workspace:** `apps/admin-panel` (admin-coder)

**Problem:** Only 3 `loading.tsx` files exist in the whole app. For other routes, the user sees a blank page until every query resolves.

**Fix:**
- Add `loading.tsx` at each segment:
  - `app/dashboard/gym/[id]/store/loading.tsx`
  - `app/dashboard/gym/[id]/machines/loading.tsx`
  - `app/dashboard/gym/[id]/redemptions/loading.tsx`
  - `app/dashboard/gym/[id]/leaderboard-history/loading.tsx`
  - `app/dashboard/gym/[id]/challenges/loading.tsx`
  - `app/dashboard/gym/[id]/reports/loading.tsx`
  - `app/dashboard/gym/[id]/economy/loading.tsx`
  - `app/dashboard/gym/[id]/risk/loading.tsx`
  - `app/dashboard/gym/[id]/retention/loading.tsx`
  - `app/dashboard/gym/[id]/members/loading.tsx`
  - `app/dashboard/super/owners/loading.tsx`
  - `app/dashboard/super/machines/loading.tsx`
  - `app/dashboard/super/reports/loading.tsx`
- Use a simple consistent skeleton component (e.g. `components/ui/PageSkeleton.tsx`) shared across all `loading.tsx` files.
- For the gym dashboard specifically: split the page into a fast shell (gym header + setup checklist) and Suspense-wrap the slow `DashboardShell` — already partially done, just add `<Suspense fallback={<PanelSkeleton />}>`.

**Impact:** Perceived latency drops dramatically. User sees instant shell + skeleton instead of blank page.

**Validation:**
- DevTools → Slow 3G → navigate between routes. Skeleton must appear within ~100ms.

---

### Step 7 — Convert `app/dashboard/gyms/page.tsx` to a Server Component

**Workspace:** `apps/admin-panel` (admin-coder)

**Problem:** File is `'use client'` with `useEffect` → `supabase.from('gyms').select('*')`. Adds a full client-side round-trip and spinner on every visit.

**Fix:**
- File: `apps/admin-panel/app/dashboard/gyms/page.tsx`
- Convert to Server Component (remove `'use client'`, `useEffect`, `useState`, spinner).
- Fetch `gyms` server-side in the component.
- Keep any interactive sub-part (e.g. action buttons) as a small client child component.

**Impact:** Removes 1 full client round-trip + spinner flicker (~200–400ms saved).

**Validation:**
- Network panel: no `fetch` to Supabase from the browser for this route.

---

### Step 8 — Upgrade `@supabase/ssr` and align Supabase client versions

**Workspace:** `apps/admin-panel` (admin-coder)

**Problem:** `@supabase/ssr@^0.1.0` is stuck on a 2023-era release. Newer versions fix cookie thrashing, session caching, and have better Next 15 support.

**Fix:**
- File: `apps/admin-panel/package.json`
- Run: `pnpm add @supabase/ssr@latest --filter sweatdrop-admin-panel` (target `^0.5.x`).
- Follow the 0.1 → 0.5 migration guide: the `cookies()` API signature in `lib/supabase-server.ts` and `middleware.ts` may need to switch from `get/set/remove` to `getAll/setAll`. Verify no breakage.
- Run `pnpm --filter sweatdrop-admin-panel type-check` and `pnpm --filter sweatdrop-admin-panel test`.

**Impact:** Small per-request improvement (~10–50ms) + future-proof for Next 15.

**Validation:**
- Login, logout, session refresh all still work.
- No regression in middleware RBAC redirects.

---

### Step 9 — Enable Turbopack in dev

**Workspace:** `apps/admin-panel` (admin-coder)

**Problem:** If devs are running `next dev` without `--turbo`, every first route visit triggers webpack compilation (2–10s). User's complaint may be largely this.

**Fix:**
- File: `apps/admin-panel/package.json`, line 6:
  ```json
  "dev": "next dev --turbopack"
  ```
- Run `pnpm dev:admin` — first compile is still slow, but subsequent route visits are near-instant (~100ms vs ~3s).

**Impact:** Dev-mode navigation 10–20× faster on first visit per route.

**Validation:**
- `pnpm dev:admin` → open 5 routes → observe compile time in terminal.

---

### Step 10 — (Optional) Profile and optimize `get_gym_dashboard_overview` RPC

**Workspace:** `backend/supabase` (supabase-dba — separate plan required)

**Problem:** `gym/[id]/dashboard/page.tsx:89` calls `get_gym_dashboard_overview` which fans out into many sub-queries inside Postgres. If this RPC is > 200ms, it dominates dashboard render.

**Fix (requires new plan for supabase-dba):**
- Run `EXPLAIN (ANALYZE, BUFFERS) SELECT get_gym_dashboard_overview(...)` in Supabase SQL editor.
- Identify missing indexes on `sessions`, `drops_transactions`, `redemptions`, `profiles` (likely on `gym_id`, `created_at`).
- Memoize stable sub-queries (e.g. 7-day rolling counts) using materialized views or a dedicated `mv_gym_daily_metrics` refreshed every 5 minutes.

**Impact:** Potentially 500ms–1.5s saved per gym dashboard load.

**Validation:**
- EXPLAIN ANALYZE before/after. RPC p50 < 150ms.

---

## Workspace Assignment Summary

| Step | Assigned to | Estimated effort |
|------|-------------|------------------|
| 1. `React.cache()` wrapping | admin-coder | 30 min |
| 2. Parallelize middleware | admin-coder | 45 min |
| 3. Remove `force-dynamic` | admin-coder + reviewer | 1–2 h |
| 4. Deduplicate gym fetch | admin-coder | 45 min |
| 5. Parallelize gym dashboard | admin-coder (+ supabase-dba for setup RPC) | 1–2 h |
| 6. Suspense boundaries | admin-coder | 2 h |
| 7. Gyms list → Server Component | admin-coder | 30 min |
| 8. Upgrade `@supabase/ssr` | admin-coder | 30 min + test |
| 9. Turbopack dev | admin-coder | 5 min |
| 10. RPC profiling (optional) | supabase-dba | separate plan |

Total admin-coder effort (Steps 1–9): **~1 working day**.

---

## API Contracts

No external contract changes. Internal helper signatures added:

**`apps/admin-panel/lib/auth.ts`:**
```ts
export const getCurrentUser: () => Promise<User | null>;       // now cached per-request
export const getCurrentProfile: () => Promise<UserProfile | null>; // now cached per-request
```

**`apps/admin-panel/lib/gym.ts` (NEW file):**
```ts
export const getGymById: (id: string) => Promise<Gym | null>;  // cached per-request
```

**Optional new RPC (Step 5, supabase-dba):**
```sql
CREATE FUNCTION get_gym_setup_status(p_gym_id uuid)
RETURNS TABLE (has_reward boolean, has_machine boolean, has_staff boolean);
```

---

## Testing Requirements

### Before/After Measurements (admin-coder must record)

For each navigation below, measure **time-to-interactive** with DevTools → Performance tab, cold cache, throttled to "Fast 3G":

| Route | Target p50 (before) | Target p50 (after) |
|-------|---------------------|--------------------|
| `/dashboard/super` | measure first | ≤ 800ms |
| `/dashboard/owner` → redirect → `/dashboard/gym/[id]/dashboard` | measure first | ≤ 1200ms |
| `/dashboard/gym/[id]/dashboard` | measure first | ≤ 800ms |
| `/dashboard/gym/[id]/store` | measure first | ≤ 600ms |
| `/dashboard/gyms` | measure first | ≤ 400ms |

### Functional Regression Tests

- [ ] Login as `superadmin` → lands on `/dashboard/super`.
- [ ] Login as `gym_owner` → lands on `/dashboard/gym/[id]/dashboard`.
- [ ] Login as `gym_admin` → lands on assigned gym dashboard.
- [ ] Login as `receptionist` → lands on `desk`, other routes blocked.
- [ ] Suspended gym → sign-out + redirect on login.
- [ ] Navigating between gym sub-routes does not re-authenticate (verify via network panel: only one `/auth/v1/user` per navigation).
- [ ] `pnpm --filter sweatdrop-admin-panel test` — all existing tests pass.
- [ ] `pnpm build:admin` — production build succeeds.

---

## Rollout Strategy

1. Branch: `perf/admin-panel-navigation`.
2. Land Steps 1, 2, 9 first (lowest risk, immediate dev-experience win) — deploy to preview.
3. Measure → if p50 improvement ≥ 30%, continue.
4. Land Steps 3, 4, 7 (cache/RSC cleanup) — deploy to preview.
5. Land Steps 5, 6 (data fetch + Suspense) — deploy to preview.
6. Land Step 8 (Supabase upgrade) last due to risk of cookie/auth regression — deploy to preview → staging → prod.
7. Step 10 only if Steps 1–9 don't close the gap.

---

## Open Questions (confirm with user before admin-coder executes)

1. Is the complaint about **dev mode** (`pnpm dev:admin`) or **production** navigation? Step 9 alone may resolve a dev-only complaint.
2. Are there any routes where `force-dynamic` is intentional for business reasons (beyond live dashboards)?
3. Is `get_gym_dashboard_overview` RPC tuned already, or should Step 10 be scheduled?

---

## Related Files (for admin-coder reference)

- `apps/admin-panel/middleware.ts` — primary bottleneck
- `apps/admin-panel/lib/auth.ts` — add `cache()` wrappers
- `apps/admin-panel/lib/auth-guard.ts` — benefits from Step 1
- `apps/admin-panel/lib/supabase-server.ts` — verify 0.5.x migration
- `apps/admin-panel/app/layout.tsx` — remove `force-dynamic`
- `apps/admin-panel/app/dashboard/layout.tsx` — remove `force-dynamic`
- `apps/admin-panel/app/dashboard/gym/[id]/dashboard/page.tsx` — parallelize fetches
- `apps/admin-panel/app/dashboard/gyms/page.tsx` — convert to RSC
- `apps/admin-panel/package.json` — upgrade `@supabase/ssr`, add `--turbopack`
