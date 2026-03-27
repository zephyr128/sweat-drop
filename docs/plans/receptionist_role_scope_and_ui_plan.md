# Feature: Receptionist Role Scope & UI (Locked)

**Date:** 2026-03-27  
**Priority:** High (security + day-to-day desk usability)  
**Scope:** `apps/admin-panel` (primary), optional `backend/supabase` hardening

---

## Context

Receptionist must have a clean, minimal desk experience with zero clutter and clear role boundaries.  
Current app already has receptionist routing and Desk page, but scope should be formalized and consistently enforced across navigation, routes, and server actions.

---

## Product Decisions (Locked)

1. Receptionist is a **desk operator role**, not management role.
2. Receptionist sees only operational surfaces needed at front desk.
3. Receptionist cannot edit economy/challenges/machines/store catalog/settings/team.
4. Receptionist can process redemptions and monitor check-ins/activity in real-time.
5. UX must stay consistent with current premium dark design system.

---

## Receptionist Visibility Matrix

### Allowed (read/operate)

- `Desk` (`/dashboard/gym/[id]/desk`)
  - Verify code
  - Redemptions queue
  - Live activity
- `Check-in` (`/dashboard/gym/[id]/checkin`) — **read-only operational monitoring**
  - new check-in alerts
  - verification badge status
  - open member detail
- `Store` (`/dashboard/gym/[id]/store`) — **redemptions-only operations**
  - redemption verification + pending queue
  - no reward creation/edit/delete
- `Activity Log` (`/dashboard/gym/[id]/activity`) — read-only timeline

### Forbidden

- Dashboard command center (`/dashboard/gym/[id]/dashboard`) edit actions
- Members management mutations
- Team/invitations
- Challenges
- Machines
- Arenas management
- Reports
- Economy / Safety & Fair Play
- Gym setup/settings
- Store rewards CRUD

---

## Sidebar IA (Receptionist)

### Keep only `DESK` group:

1. `Desk` (primary)
2. `Check-in` (ops monitor)
3. `Store Queue` (redemptions tab preselected)
4. `Activity Log`

Remove `Live Feed` duplicate link if `Desk` already contains activity tab.

---

## Execution Plan

### Step 1 — Route Guard Hardening (admin-coder)

Files:
- `apps/admin-panel/middleware.ts`
- `apps/admin-panel/lib/auth-guard.ts`

Tasks:
1. Define explicit receptionist allowed path list (single source of truth).
2. Ensure redirects for disallowed paths always go to `/dashboard/gym/[assigned]/desk`.
3. Prevent accidental access via deep links/query params.

### Step 2 — Sidebar & Navigation Cleanup (admin-coder)

Files:
- `apps/admin-panel/components/Sidebar.tsx`

Tasks:
1. Replace receptionist nav with locked set from IA above.
2. Keep badge counters only where useful (`Desk` / `Store Queue` pending redemptions).
3. Keep labels short and receptionist-friendly.

### Step 3 — Page-level Capability Gating (admin-coder)

Files:
- `apps/admin-panel/app/dashboard/gym/[id]/store/page.tsx`
- `apps/admin-panel/components/modules/StorePageTabs.tsx`
- `apps/admin-panel/components/modules/StoreRewardsList.tsx`
- `apps/admin-panel/components/modules/StoreManager.tsx`

Tasks:
1. For receptionist role, force `redemptions` operational view.
2. Hide/disable reward catalog CRUD buttons and forms.
3. Keep code verification workflow fully available.

### Step 4 — Action-level Permission Hardening (admin-coder)

Files:
- `apps/admin-panel/lib/actions/store-actions.ts`
- `apps/admin-panel/lib/actions/challenge-actions.ts`
- `apps/admin-panel/lib/actions/machine-actions.ts`
- any write actions reachable from receptionist routes

Tasks:
1. Confirm receptionist cannot call management mutations.
2. Allow only desk-safe actions:
   - verify/confirm/cancel redemption (as policy allows),
   - read check-ins/activity,
   - view member detail.
3. Return clear `Unauthorized` errors for forbidden mutations.

### Step 5 — Receptionist UX Polish (admin-coder)

Tasks:
1. Add role hint banner on desk screens:
   - “Reception mode: verification and queue operations”.
2. Keep interactions fast:
   - keyboard-friendly code input
   - minimal modal friction
3. Preserve premium style tokens:
   - `bg-[#0A0A0A]`, `border-[#1A1A1A]`, cyan accents.

---

## Optional Backend Hardening (supabase-dba)

If needed, add RPC-side role checks for high-risk mutations so frontend bypass cannot escalate receptionist privileges.

---

## Testing Requirements

### Access Control
- [ ] Receptionist cannot open forbidden pages via direct URL.
- [ ] Receptionist is redirected to desk from blocked pages.
- [ ] Gym scope enforced (cannot access another gym).

### Operations
- [ ] Receptionist can verify redemption code end-to-end.
- [ ] Redemptions queue updates in realtime.
- [ ] Check-in activity visible with verification badges.

### Regression
- [ ] Gym owner/admin access unaffected.
- [ ] Sidebar for other roles unchanged.

---

## Rollout Order

1. `admin-coder` — route/sidebar/capability gating  
2. `reviewer` — security and role-boundary audit  
3. `test-automation-agent` — receptionist access + desk operation smoke tests

