# Admin Panel Premium Simplification Plan

**Date:** 2026-03-12  
**Priority:** High (UX + adoption)  
**Goal:** Make admin panel self-explanatory, minimal-input, and easy for gym owners/receptionists without training.

## Context

Current admin panel is feature-rich, but navigation has duplication and route sprawl:
- Members vs Retention duplication,
- Arenas vs Invitations duplication,
- Branding duplication,
- receptionist has split desk flow.

We need a cleaner information architecture and simpler “first day” setup.

---

## UX Principles

1. **One concept = one destination** (no duplicate routes for same data).
2. **Day-1 essentials first**; advanced controls hidden behind progressive disclosure.
3. **Role clarity**: owner/admin/receptionist each see a clear, minimal workflow.
4. **Self-explanatory copy**: every key screen answers “What do I do here?”

---

## Proposed New Sidebar IA

## Gym Owner / Gym Admin

### HOME
- Dashboard

### PEOPLE
- Members (tabs: Members, Retention)
- Team (owner; optional for gym admin depending permissions)

### REWARDS & DESK
- Store (tabs: Items, Redemptions)
- Check-in (QR, GPS, check-in stats)

### FLOOR & PROGRAMS
- Machines
- Workout Plans

### GROWTH
- Challenges
- Leaderboard
- Arenas (tabs: My Arenas, Invitations)
- Reports

### SETTINGS
- Gym Setup (General, Appearance/Branding link, Check-in defaults)
- Advanced (Economy, Risk & Abuse)

## Final Placement Decisions (Locked)

1. **Risk & Abuse**
- Primary location: `Settings > Advanced > Safety & Fair Play` (owner/admin only).
- Secondary exposure: small dashboard alert chip only when risk spikes (e.g. suspicious redemptions, abnormal mint).
- Not a permanent top-level sidebar item to avoid clutter for day-to-day operators.

2. **Economy Stats**
- Operational quick view on `Dashboard`:
  - Burn/Mint ratio (30d)
  - Expiring drops (7d/30d)
  - Out-of-band active rewards count
- Full controls and deep analytics in `Settings > Advanced > Economy`.
- Economy tuning remains hidden behind advanced disclosure in owner default experience.

## Receptionist

### DESK (single destination)
- Verify Code
- Pending Redemptions
- Live Activity (compact feed)

This replaces multiple fragmented receptionist items.

---

## Redundancies to Remove (Canonical Routes)

1. **Retention route**
- Keep: `/dashboard/gym/[id]/members?tab=retention`
- Redirect: `/dashboard/gym/[id]/retention` -> canonical tab route

2. **Invitations route**
- Keep: `/dashboard/gym/[id]/arenas?tab=invitations`
- Redirect: `/dashboard/gym/[id]/invitations` -> canonical tab route

3. **Branding route duplication**
- Keep one canonical branding destination for owners.
- Redirect duplicate gym-scoped branding route to canonical.

4. **Receptionist split**
- Merge `/verify` + `/redemptions` into `/desk` with tabs.

---

## Phase-by-Phase Implementation

## Phase 1 — Low-risk wins (Redirect + tab deep-link)

**Owner:** `admin-coder`

Tasks:
1. Add URL tab support to:
   - `MembersPageTabs` (`?tab=members|retention`)
   - `ArenasPageTabs` (`?tab=my-arenas|invitations`)
2. Convert duplicate standalone pages to redirects:
   - retention
   - invitations
   - duplicate branding route
3. Keep old links working (bookmarks/shared links stay valid).

Success criteria:
- no functional regression,
- fewer top-level destinations,
- users always land on canonical screen.

## Phase 2 — Sidebar reorganization

**Owner:** `admin-coder`

Tasks:
1. Update `Sidebar.tsx` groups to new IA sections.
2. Move advanced surfaces (`Economy`, `Risk`) under Settings/Advanced.
3. Keep existing routes intact while label/group changes roll out.

Success criteria:
- navigation feels shorter and clearer,
- fewer “where do I click?” moments for owner/admin.

## Phase 3 — Receptionist Desk merge

**Owner:** `admin-coder`

Tasks:
1. New route: `/dashboard/gym/[id]/desk`.
2. Tabs:
   - Verify Code
   - Redemptions Queue
   - Live Activity
3. Middleware default for receptionist -> `/desk`.
4. Keep old routes as redirects during transition.

Success criteria:
- receptionist can do all actions from one page,
- handoff requires near-zero explanation.

## Phase 4 — First-run owner onboarding (in-app)

**Owner:** `admin-coder` (+ optional `supabase-dba` for checklist state table)

Create “Gym Setup Checklist” visible on dashboard until completed:
1. Complete gym info (name, address)
2. Configure check-in location/GPS
3. Add first reward item
4. Add first machine
5. Invite one staff member

UX:
- each step has one CTA,
- completed steps collapse,
- progress bar and “ready to launch” badge.

Success criteria:
- new owner can complete setup in <15 minutes without live support.

## Phase 5 — Copy polish and self-explanatory hints

**Owner:** `admin-coder`

Tasks:
1. Add one-line page descriptions at top of key screens.
2. Add helper hints on complex forms:
   - Challenges
   - Check-in
   - Economy
3. Add empty-state CTAs:
   - no machines -> “Add first machine”
   - no rewards -> “Add first reward”
   - no team -> “Invite staff”

Success criteria:
- user does not need external doc for first use.

---

## Key Data/Feature Prioritization (What matters most)

## Must be prominent
- Daily operational status: active sessions, pending redemptions, check-in activity.
- Revenue and engagement essentials: members active/inactive, redemptions, drops circulation.
- Setup blockers: missing GPS/check-in config, no rewards, no machines.

## Can be secondary/advanced
- deep economy tuning,
- risk console details,
- arena advanced ops,
- exhaustive historical analytics.

---

## File Impact (Primary)

- `apps/admin-panel/components/Sidebar.tsx`
- `apps/admin-panel/components/modules/MembersPageTabs.tsx`
- `apps/admin-panel/components/modules/ArenasPageTabs.tsx`
- `apps/admin-panel/app/dashboard/gym/[id]/retention/page.tsx` (redirect)
- `apps/admin-panel/app/dashboard/gym/[id]/invitations/page.tsx` (redirect)
- `apps/admin-panel/app/dashboard/gym/[id]/branding/page.tsx` (redirect if duplicate)
- `apps/admin-panel/app/dashboard/gym/[id]/desk/page.tsx` (new)
- `apps/admin-panel/middleware.ts` (receptionist default route)
- dashboard modules for checklist/empty-state CTA

---

## Validation Checklist

- [ ] No duplicate top-level destinations for same data
- [ ] Old bookmarked links still work via redirects
- [ ] Gym owner can finish setup with checklist + defaults
- [ ] Receptionist can perform all desk tasks from one page
- [ ] Navigation labels are self-explanatory without training
- [ ] Time-to-first-usable-gym setup <15 min
- [ ] No role sees confusing inaccessible items

---

## Rollout Notes

1. Ship redirects first, then sidebar changes.
2. Announce “Desk” merge to receptionists with in-app tooltip for 1 week.
3. Track UX metrics:
   - clicks-to-task completion,
   - bounce between pages,
   - setup completion rate for new gyms.

If metrics worsen, quickly revert labels while keeping canonical routes.
