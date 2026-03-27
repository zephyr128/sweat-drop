# Feature: Premium Admin Panel (Security + Speed + Clarity)

**Date:** 2026-03-11  
**Priority:** Critical (production readiness)  
**Scope:** `apps/admin-panel` + supporting backend contracts

## Context

Gym operators need a premium, very fast, and intuitive admin panel with zero clutter:
- clear navigation and task-first flows,
- strict security and safe defaults,
- high performance on large datasets,
- no infinite scrolling for operational lists (pagination + search required).

This plan defines a phased execution across agents with measurable acceptance criteria.

---

## Product Principles

1. **No clutter:** one concept, one destination.
2. **Fast by default:** every large list has server-side pagination + search + sort.
3. **Secure by default:** authz checks in every action path; no sensitive leakage.
4. **Operational first:** top workflows are 1-2 clicks (members, redemptions, check-in, machines).
5. **Progressive disclosure:** advanced controls hidden from day-1 owner view.

---

## Must-have UX Decisions

1. **Replace long lists with paginated tables** (no endless scroll):
   - Members
   - Redemptions
   - Rewards (Store items)
   - Machines
   - Team
   - Challenges
   - Arenas / Invitations
   - Reports tables
2. **Standard list controls on every large page:**
   - Search input (debounced)
   - Filters
   - Sort
   - Page size (10/25/50)
   - Total count + current page indicator
3. **Unified table behavior:**
   - URL-synced state (`?q=&page=&limit=&sort=`),
   - loading/skeleton state,
   - empty state with one clear CTA.

---

## Dependencies

- Existing IA simplification baseline:
  - `docs/plans/admin_panel_premium_simplification_plan.md`
- Existing security hardening plans:
  - `docs/plans/production_anti_abuse_hardening_plan.md`
- Existing tokenomics/reporting plans (for affected tables/actions).

---

## Execution Plan by Agent

### Phase 1 — Backend Query Contracts for Pagination/Search (supabase-dba)

**Workspace:** `backend/supabase/`

1. For each large module, provide query contract support:
   - `p_search text`
   - `p_page int`
   - `p_limit int`
   - `p_sort_by text`
   - `p_sort_dir text`
2. Ensure total-count availability for pagination UI.
3. Add indexes for common search/sort patterns:
   - members (`username`, `email`, `created_at`, `last_visit`)
   - redemptions (`created_at`, `status`, `redemption_code`)
   - rewards (`name`, `reward_type`, `is_active`)
   - machines (`name`, `type`, `is_active`, `is_busy`)
4. Validate EXPLAIN plans for high-cardinality gyms.
5. Confirm RLS safety on all pagination/search RPCs.

**Acceptance criteria:**
- Query latency targets met on seeded large dataset.
- No full table scans on main filters/sorts.

---

### Phase 2 — Admin Server Actions Standardization (admin-coder)

**Workspace:** `apps/admin-panel/lib/actions/`

1. Introduce shared list action contract:
   - input: `{ q, page, limit, sortBy, sortDir, filters }`
   - output: `{ items, total, page, limit, totalPages }`
2. Apply to all list-heavy actions:
   - members, redemptions, store items, machines, team, challenges, arenas.
3. Add strict role/gym checks in every action path.
4. Add anti-overfetch limits and sane defaults.
5. Add unit tests for:
   - pagination correctness
   - search filtering
   - authorization boundaries

**Acceptance criteria:**
- No list action returns unbounded result sets.
- All list pages can render from same shape.

---

### Phase 3 — Premium List UX Rollout (admin-coder)

**Workspace:** `apps/admin-panel/components/` + `apps/admin-panel/app/`

1. Build reusable `DataTable` pattern (or harmonize existing tables):
   - search bar, filters, sortable headers, pagination footer.
2. Migrate pages incrementally:
   - Members
   - Store/Redemptions
   - Machines
   - Challenges
   - Arenas + Invitations
   - Team
3. Use URL state for shareable views and back/forward consistency.
4. Add compact row actions + bulk actions only where needed.
5. Add polished empty states and quick CTAs.

**Acceptance criteria:**
- No infinite scrolling on operational tables.
- Search + pagination available on each large list.
- Time-to-find-item significantly reduced.

---

### Phase 4 — Security Hardening Pass (supabase-dba + admin-coder + reviewer)

**Workspace:** backend + admin

1. Validate all server actions are server-only and auth-gated.
2. Remove any client-side privileged Supabase mutations.
3. Ensure secret-safe handling:
   - no key leaks in logs/toasts/errors.
4. Add abuse monitoring surfaces:
   - suspicious redemptions
   - abnormal mint patterns
5. Reviewer to run security checklist and produce findings.

**Acceptance criteria:**
- Security review has zero critical findings.
- No sensitive data exposed in admin responses.

---

### Phase 5 — Performance Optimization & Production Readiness (admin-coder + test-automation-agent)

**Workspace:** admin + tests

1. Reduce heavy client rendering:
   - prefer server components for list pages.
2. Optimize expensive dashboard widgets:
   - lazy-load non-critical analytics cards.
3. Add caching/revalidation strategy per page type.
4. Set performance budgets:
   - list page initial render,
   - search response time,
   - route transition time.
5. Add test suite for:
   - list pagination/search regression
   - role-based access regression
   - smoke checks for top workflows

**Acceptance criteria:**
- Meets defined latency targets in staging.
- No blocking regressions in core flows.

---

## Page-level Keep / Reduce / Merge / Add

### Keep
- Dashboard
- Members
- Store
- Check-in
- Machines
- Challenges
- Leaderboard
- Arenas
- Reports

### Reduce
- Above-the-fold dashboard cards to max 5 operational cards.
- Over-detailed technical fields in owner-default view.

### Merge
- Members + Retention (tabs)
- Store items + redemptions (+ verify in same domain)
- Arenas + Invitations (tabs)
- Check-in settings + live + stats (tabs)

### Add
- Standardized paginated table UX everywhere.
- Global quick search/jump.
- Setup checklist for first-time gym owners.
- Expiry pressure KPI and operational alerts.

---

## Testing Requirements

1. **Functional**
   - Search returns relevant rows.
   - Pagination stable across filters and sorts.
   - URL state restores table view.
2. **Security**
   - Unauthorized user cannot fetch another gym’s records.
   - Action-level auth checks pass for all roles.
3. **Performance**
   - P95 list query and render times within budget.
4. **UX**
   - Owner can complete top 5 workflows without guidance.

---

## Rollout Order (Agent Sequence)

1. **supabase-dba** — pagination/search contracts + indexes
2. **admin-coder** — action contract standardization
3. **admin-coder** — UI rollout page-by-page
4. **reviewer** — security/architecture audit
5. **test-automation-agent** — regression + performance validation

---

## Go-live Gates

1. No unpaginated list endpoints in production paths.
2. No critical/high security findings.
3. P95 response and render targets met in staging.
4. Core workflows pass smoke tests.
5. Owner/receptionist UAT confirms clarity and speed.
