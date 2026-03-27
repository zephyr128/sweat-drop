# Feature: Realtime Check-in Verification Alerts (Admin)

**Date:** 2026-03-11  
**Priority:** High (front-desk operations)  
**Scope:** `apps/admin-panel`, `backend/supabase` (+ optional mobile transparency)

---

## Context

When a member checks in, admin/reception must immediately see:

1. a realtime notification on admin screen,
2. a verification badge in check-in list (`Verified` / `Needs verification`),
3. verification details when opening that member profile.

Goal: zero manual refresh and under 1-click visibility of verification status.

---

## Dependencies

- `docs/plans/staff_identity_engagement_promotions_realtime_master_plan.md` (Workstream B + E)
- Existing admin check-in page:
  - `apps/admin-panel/app/dashboard/gym/[id]/checkin/page.tsx`
  - `apps/admin-panel/components/modules/CheckinStatsModule.tsx`
- Existing member detail UI:
  - `apps/admin-panel/components/modules/MemberDetailView.tsx`
- Existing realtime/activity foundation:
  - dashboard activity + activity log subscriptions

---

## Product Decisions (Locked)

1. Check-in event triggers **instant desk alert** (toast/banner + optional sound).
2. Every row in check-in table shows **identity badge**:
   - `Verified` (green)
   - `Needs verification` (amber)
3. Clicking unverified user opens **quick verify drawer/modal** directly from check-in row.
4. Member profile shows **full verification block**:
   - status
   - verified name
   - external membership id
   - verified by
   - verified at
   - notes
5. All updates are realtime; fallback polling only as backup.

---

## Execution Plan

### Step 1 — Database model + RPC (supabase-dba)

Create migration: `YYYYMMDD000006_checkin_verification_realtime.sql`

1. Ensure `gym_member_identities` exists (or equivalent identity table) with:
   - `gym_id`, `user_id`, `is_verified`
   - `full_name_verified`
   - `external_membership_id`
   - `verified_by`, `verified_at`, `verification_notes`
2. Add indexes:
   - `(gym_id, user_id)` unique
   - `(gym_id, is_verified)`
3. Add/confirm RPCs:
   - `get_checkin_identity_candidates(p_gym_id, p_user_id)`
   - `verify_member_identity(...)`
   - `upsert_physical_member_identity(...)`
4. Ensure publication includes:
   - `gym_checkins`
   - `gym_member_identities`

### Step 2 — Admin check-in realtime alert UX (admin-coder)

Files:
- `apps/admin-panel/components/modules/CheckinStatsModule.tsx`
- `apps/admin-panel/lib/actions/gym-actions.ts` (or dedicated identity actions)

Tasks:
1. Subscribe to realtime `gym_checkins` inserts for current gym.
2. On new check-in:
   - show toast: `New check-in: {member}`
   - prepend/update list row without page refresh
3. Add identity badge column in table:
   - resolve from identity table/RPC snapshot
4. Row action:
   - if unverified -> `Verify now` button opens drawer/modal

### Step 3 — Quick verify flow (admin-coder)

Create:
- `apps/admin-panel/components/modules/MemberIdentityVerifyDrawer.tsx`
- `apps/admin-panel/lib/actions/member-identity-actions.ts`

Behavior:
1. Prefill known user data.
2. Admin enters/edits:
   - verified full name
   - external membership ID
   - notes
3. Save + verify:
   - call RPC
   - update row badge immediately (`Needs verification` -> `Verified`)
   - show success toast.

### Step 4 — Member profile visibility (admin-coder)

Update:
- `apps/admin-panel/components/modules/MemberDetailView.tsx`
- related member detail actions

Add section: `Identity Verification`
- status chip
- verified full name
- membership ID
- verified by
- verified at
- notes
- edit/re-verify action for owner/admin roles.

### Step 5 — Optional mobile transparency (mobile-coder)

Optional profile hint:
- `Gym identity: Verified / Pending`
- no edit capability on mobile; desk remains source of truth.

---

## API Contracts

### Check-in list row shape (admin)

```ts
type CheckinRow = {
  id: string;
  user_id: string;
  username: string;
  checked_in_at: string;
  gps_verified: boolean;
  identity: {
    isVerified: boolean;
    membershipId?: string | null;
  };
};
```

### Member identity detail (admin)

```ts
type MemberIdentityDetail = {
  isVerified: boolean;
  fullNameVerified: string | null;
  externalMembershipId: string | null;
  verifiedByName: string | null;
  verifiedAt: string | null;
  notes: string | null;
};
```

---

## Testing Requirements

### Functional
- [ ] New check-in appears live without refresh.
- [ ] Admin sees immediate notification/toast on check-in.
- [ ] Badge shows correct verification state.
- [ ] Verify action flips badge to `Verified` immediately.
- [ ] Member detail shows all verification fields.

### Security
- [ ] Only scoped gym staff/admin can verify for that gym.
- [ ] Cross-gym verification updates are blocked.
- [ ] Audit fields (`verified_by`, `verified_at`) always populated on verify.

### Realtime Reliability
- [ ] Works with multiple admin clients simultaneously.
- [ ] Fallback polling restores state after reconnect.

---

## Rollout Order

1. `supabase-dba` — identity schema/RPC + realtime publication  
2. `admin-coder` — check-in realtime alerts + badges + verify drawer  
3. `admin-coder` — member detail verification block  
4. `reviewer` — auth scope + realtime correctness  
5. `test-automation-agent` — check-in-to-verify E2E scenario

