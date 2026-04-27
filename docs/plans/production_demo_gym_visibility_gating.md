# Feature: Hide Demo Gym from Production Members (Demo-User-Only Visibility)

**Status:** Planning
**Owner:** Architect
**Target Release:** Before next App Store submission / Vortex public expansion
**Created:** 2026-04-27

---

## Context

### Problem

On production, the **"SweatDrop Gym"** (test gym) is currently discoverable in mobile app gym lists by every signed-in user, including real Vortex members. It must remain visible to **demo users only** — Apple App Review reviewer accounts, internal QA, and sales-demo accounts (`profiles.is_demo = true`) — and disappear from every other user's gym discovery surface.

Previous plan `production_demo_gym_exclusion_from_global_leaderboard.md` (2026-04-23) deliberately deferred hiding the gym row itself, listing it as **"Open Follow-up #1"**. This plan picks up exactly that follow-up with the smallest possible footprint.

### Why we're NOT inventing new infrastructure

The pilot infrastructure we need is **already in place**:

| Existing primitive | Status | Source |
|---|---|---|
| `profiles.is_demo BOOLEAN` (superadmin-guarded) | ✅ Live | `20260421192713_profiles_is_demo_flag.sql` |
| `get_my_profile()` returns `is_demo` | ✅ Live | `20260421192714_get_my_profile_include_is_demo.sql` |
| `machines.is_demo_machine` + RPC + superadmin guard | ✅ Live | `20260421195628`, `20260421235900` |
| `useIsDemoUser()` mobile hook | ✅ Live | `apps/mobile-app/hooks/useIsDemoUser.ts` |
| `gyms` discovery RPC `get_public_gyms_for_mobile()` | ✅ Live | `20260311130000_add_pilot_gym_visibility_flag.sql` |

We are **mirroring** the established `is_demo_machine` pattern at the gym level. Zero new conceptual surface.

### Why we don't filter on the client (`useIsDemoUser`)

Filtering client-side leaks the demo gym row into the network response and depends on every screen remembering to apply the filter. Filtering server-side at the single RPC entry point is one place to fix, no leak surface, no client coordination.

---

## Audit: Where gyms are listed to users

| File | Today | After this plan |
|---|---|---|
| `apps/mobile-app/app/gyms.tsx` | Calls `rpc('get_public_gyms_for_mobile')` (primary) + table fallback | Demo-aware via patched RPC. Defense-in-depth via `is_mobile_listed=false` on demo gym closes the table-fallback path. |
| `apps/mobile-app/app/(onboarding)/home-gym.tsx` | Direct `from('gyms').select('*').eq('is_mobile_listed', true)` | Switch to RPC so demo users still see the demo gym during App Review onboarding. |
| `apps/mobile-app/app/home.tsx` (no-gym empty state, ~L656) | Direct `from('gyms')` filter on `is_mobile_listed=true` | Switch to RPC for the same reason as onboarding. |
| `apps/mobile-app/app/gym-detail.tsx`, `gym-welcome.tsx`, `workout.tsx` | Single-row lookup by `id` | **Out of scope.** No discovery surface — a non-demo user has no UX path that yields a demo gym ID. |
| `apps/mobile-app/app/profile.tsx`, `smartcoach.tsx`, `useGymData.ts` | Reads user's own memberships | **Out of scope.** A non-demo user will not have a membership in the demo gym. |
| Admin panel (`apps/admin-panel/`) | Gym admin / superadmin views | **Out of scope.** Admins must continue to see all gyms. |

### What about the existing pilot flag?

`gyms.is_pilot_enabled` exists but is set to `true` for every row (default `true`, no row currently uses `false`). Reusing it would conflate "staged-rollout pilot visibility" with "demo gym visibility" — two different policies. Keep them separate.

---

## Dependencies

- [x] `profiles.is_demo` flag in production
- [x] `get_public_gyms_for_mobile()` RPC in production (the single discovery RPC we patch)
- [x] `is_superadmin(uuid)` helper in production (used by existing demo guards)
- [x] Existing `Gym` TypeScript interface in `apps/mobile-app/lib/stores/useGymStore.ts` already supports `owner_id`, `lat`, `lng`, `is_pilot_enabled` etc. — no breaking type changes needed.

---

## Execution Plan

### Step 1 — Database (supabase-dba)

**Owner:** `supabase-dba`
**Migration:** `backend/supabase/migrations/20260427120000_gyms_is_demo_gym_and_rpc_demo_filter.sql`

#### 1.1 Add `gyms.is_demo_gym` column

```sql
ALTER TABLE public.gyms
  ADD COLUMN IF NOT EXISTS is_demo_gym BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.gyms.is_demo_gym IS
  'When true, this gym is visible only to profiles.is_demo = true users '
  '(Apple reviewer, internal QA, sales demos). Must never be true for real partner gyms.';

CREATE INDEX IF NOT EXISTS idx_gyms_is_demo_gym
  ON public.gyms(is_demo_gym) WHERE is_demo_gym = true;
```

#### 1.2 Superadmin-only mutation guard (mirror `profiles.is_demo` pattern)

```sql
CREATE OR REPLACE FUNCTION public.enforce_gyms_is_demo_gym_superadmin_only()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.is_demo_gym IS DISTINCT FROM OLD.is_demo_gym
     AND auth.uid() IS NOT NULL
     AND NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'Only superadmin can modify gyms.is_demo_gym';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gyms_guard_is_demo_gym_update ON public.gyms;
CREATE TRIGGER trg_gyms_guard_is_demo_gym_update
  BEFORE UPDATE ON public.gyms
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_gyms_is_demo_gym_superadmin_only();
```

#### 1.3 Patch `get_public_gyms_for_mobile()` to be demo-aware

`CREATE OR REPLACE FUNCTION public.get_public_gyms_for_mobile(p_pilot_only BOOLEAN DEFAULT false)` — preserve signature for backwards compatibility, **expand `RETURNS TABLE` to `SETOF public.gyms`** so callers (onboarding, home, gyms screens) get the full row shape they already consume from the table.

Body — single SELECT, same SECURITY DEFINER context, with one extra predicate:

```sql
RETURN QUERY
SELECT g.*
FROM public.gyms g
WHERE COALESCE(g.is_active, true) = true
  AND (NOT p_pilot_only OR g.is_pilot_enabled = true)
  AND (
    COALESCE(g.is_demo_gym, false) = false
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND COALESCE(p.is_demo, false) = true
    )
  )
ORDER BY g.name ASC;
```

```sql
COMMENT ON FUNCTION public.get_public_gyms_for_mobile(BOOLEAN) IS
  'Returns active gyms visible to the caller. Demo gyms (is_demo_gym = true) are returned only to demo users (profiles.is_demo = true). Single source of truth for mobile gym discovery.';

GRANT EXECUTE ON FUNCTION public.get_public_gyms_for_mobile(BOOLEAN) TO authenticated;
-- Anonymous discovery (pre-auth gym preview) excluded intentionally:
-- demo gating requires auth.uid(), so anon callers receive no demo gym either way.
-- If anon access was previously granted, keep the GRANT and accept that anon
-- callers always see the non-demo subset.
GRANT EXECUTE ON FUNCTION public.get_public_gyms_for_mobile(BOOLEAN) TO anon;
```

> **DBA note:** verify the existing GRANT to `anon` was intentional. If it was, anonymous callers still get the non-demo subset only (the `EXISTS` short-circuits to false because `auth.uid()` is null). That is the desired behavior.

#### 1.4 Seed the existing test gym

Verify identifier first:

```sql
SELECT id, name, slug, is_active, is_mobile_listed, is_demo_gym
FROM public.gyms
WHERE name ILIKE '%sweatdrop%' OR slug ILIKE '%sweatdrop%';
```

Then idempotent UPDATE (defense-in-depth — also flips `is_mobile_listed=false` so the table-fallback path in `gyms.tsx` cannot leak the row if the RPC ever fails):

```sql
UPDATE public.gyms
SET is_demo_gym = true,
    is_mobile_listed = false,
    updated_at = NOW()
WHERE name ILIKE 'sweatdrop gym%'
  AND COALESCE(is_demo_gym, false) = false;
```

> If multiple SweatDrop-named rows exist, the DBA must narrow to the actual test gym `id` literal before running.

#### 1.5 Type regeneration

```bash
cd backend && supabase gen types typescript --linked > types/database.types.ts
```

The new column `gyms.is_demo_gym` will appear in the generated types. No manual edits to types files.

---

### Step 2 — Mobile App (mobile-coder)

**Owner:** `mobile-coder`
**Files modified:** 2 (no new files, no new deps)

The patched RPC now returns the full `gyms` row shape, so the two remaining direct-table queries can switch to the RPC with minimal logic change.

#### 2.1 `apps/mobile-app/app/(onboarding)/home-gym.tsx`

Replace lines ~115–122:

```typescript
// BEFORE
const { data: gymsData, error } = await supabase
  .from('gyms')
  .select('*')
  .eq('is_mobile_listed', true)
  .eq('is_active', true)
  .order('name');

// AFTER
const { data: gymsData, error } = await supabase
  .rpc('get_public_gyms_for_mobile');
```

Keep the rest of the function (owner_branding hydration, mapping) untouched. The RPC already orders by `name` and filters `is_active = true`. Demo users will see the test gym during App Review onboarding; production users will not.

#### 2.2 `apps/mobile-app/app/home.tsx` (no-gym empty state, ~L662–688)

Replace the `from('gyms')` query block with the RPC and reduce the result to the existing 10-row cap on the client:

```typescript
// BEFORE
const { data: gymsData, error } = await supabase
  .from('gyms')
  .select('id, name, city, address, owner_id, is_active, is_mobile_listed')
  .eq('is_active', true)
  .eq('is_mobile_listed', true)
  .order('name')
  .limit(10);

// AFTER
const { data: rpcGyms, error } = await supabase
  .rpc('get_public_gyms_for_mobile');
const gymsData = (rpcGyms ?? []).slice(0, 10);
```

Keep the existing fallback branch and `owner_branding` hydration logic as-is.

#### 2.3 No store changes

`apps/mobile-app/lib/stores/useGymStore.ts` — `Gym` interface already accepts `owner_id?`, `lat?`, `lng?`, `is_pilot_enabled?` etc. The new `is_demo_gym` field is not used by any UI; it can remain absent from the interface. Add it only if a future surface needs to read it.

#### 2.4 Verification

- [ ] Sign in as a `profiles.is_demo = true` account → `/onboarding/home-gym` shows the demo gym in the list.
- [ ] Sign in as a `profiles.is_demo = false` account → `/onboarding/home-gym` does NOT show the demo gym.
- [ ] Same dual check on `/home` no-gym empty state.
- [ ] Same dual check on `/gyms` (already RPC-driven; verify regression).
- [ ] Existing demo flows (BLE simulator, demo machine RPC) remain functional — no auth/profile cache invalidation needed because `useIsDemoUser` is unrelated to gym visibility under this plan.

---

### Step 3 — Admin Panel (admin-coder)

**Owner:** `admin-coder` — **OPTIONAL, not required for this release**

No code change required for launch. Superadmin can flip `is_demo_gym` for any new test gym via SQL or via the existing superadmin gym editor (whichever is faster).

If/when this becomes operationally noisy, add a small follow-up:

- Surface `is_demo_gym` as a read-only badge on `/dashboard/super` gym list.
- Add a superadmin-only toggle on the gym detail page that issues `UPDATE gyms SET is_demo_gym = ...` (the trigger guard rejects non-superadmin attempts at the DB level — UI is just convenience).

Track this as a separate plan if/when prioritized.

---

## API Contracts

### `get_public_gyms_for_mobile(p_pilot_only BOOLEAN DEFAULT false)` — RETURNS `SETOF public.gyms`

**Caller is demo user (`profiles.is_demo = true`):** returns all active gyms including demo gyms.
**Caller is non-demo or anonymous:** returns all active gyms with `is_demo_gym = false`.
**`p_pilot_only = true`:** further restricts to `is_pilot_enabled = true`. Demo filter is applied independently.

**Backwards compatibility:** existing single argument-less call sites (`gyms.tsx`) continue to work. Return shape changes from a hand-listed column subset to full `gyms` row — clients that destructure existing column names are unaffected because every previously listed column is still present.

---

## Data Model Changes

| Table | Change | Type |
|---|---|---|
| `public.gyms` | Add column `is_demo_gym BOOLEAN NOT NULL DEFAULT false` | Additive |
| `public.gyms` | Add partial index `idx_gyms_is_demo_gym` (where true) | Additive |
| `public.gyms` | Add BEFORE UPDATE trigger `trg_gyms_guard_is_demo_gym_update` | Additive |
| `public.gyms` | UPDATE one row: SweatDrop test gym → `is_demo_gym=true, is_mobile_listed=false` | Data |

**No schema breaks. No RLS policy churn.** The existing SELECT policy on `gyms` is unchanged — visibility is enforced at the RPC layer (the only layer the mobile app uses for discovery).

---

## Testing Requirements

### Database (supabase-dba)

1. **Smoke:**
   ```sql
   SELECT id, name, is_demo_gym, is_mobile_listed
   FROM public.gyms
   WHERE name ILIKE '%sweatdrop%';
   ```
   Expect: `is_demo_gym = true`, `is_mobile_listed = false`.

2. **Demo-aware RPC — non-demo user:**
   ```sql
   SET request.jwt.claims = '{"sub":"<non-demo-user-uuid>","role":"authenticated"}';
   SELECT id, name, is_demo_gym FROM public.get_public_gyms_for_mobile();
   ```
   Expect: zero rows with `is_demo_gym = true`.

3. **Demo-aware RPC — demo user:**
   ```sql
   SET request.jwt.claims = '{"sub":"<demo-user-uuid>","role":"authenticated"}';
   SELECT id, name, is_demo_gym FROM public.get_public_gyms_for_mobile();
   ```
   Expect: SweatDrop gym present, `is_demo_gym = true`.

4. **Mutation guard:**
   ```sql
   -- Logged in as non-superadmin
   UPDATE public.gyms SET is_demo_gym = false WHERE name ILIKE 'sweatdrop%';
   -- Expect: ERROR: Only superadmin can modify gyms.is_demo_gym
   ```

5. **Pilot-only branch unaffected:**
   ```sql
   SELECT count(*) FROM public.get_public_gyms_for_mobile(true);
   ```
   Expect: equal to non-demo callers' visible-pilot count.

### Mobile (mobile-coder)

1. Reviewer account (`is_demo=true`) signs in fresh → onboarding home-gym shows SweatDrop test gym → can complete onboarding selecting it.
2. Real Vortex member (`is_demo=false`) signs in fresh → onboarding home-gym does NOT show SweatDrop test gym; only Vortex (and any other production gyms) appear.
3. Real member with no home gym yet → home screen empty state's available-gyms list does NOT include SweatDrop.
4. Real member opens `/gyms` → SweatDrop not present.
5. Existing demo simulator flow on `ScannerScreen` (5x tap) still gated by `useIsDemoUser` — unchanged.

### Regression

- [ ] `/dashboard/super` (admin panel) still shows all gyms including SweatDrop.
- [ ] Existing SweatDrop demo memberships continue to work for QA accounts (membership lookup is by `gym_id`, not by discovery RPC).
- [ ] Leaderboard global / arena still excludes demo profiles per the prior plan (no interaction with this change).

---

## Rollback

1. **Function:** `CREATE OR REPLACE FUNCTION public.get_public_gyms_for_mobile(...)` back to the version from `20260311130000_add_pilot_gym_visibility_flag.sql`.
2. **Demo gym row:** `UPDATE public.gyms SET is_demo_gym = false, is_mobile_listed = true WHERE id = '<sweatdrop-id>';`
3. **Column:** leave `is_demo_gym` in place (NOT NULL DEFAULT false is harmless if unused).
4. **Mobile:** revert the two file diffs — the RPC still works regardless.

---

## Why this is the minimal change

- **1 migration file** (additive: column + index + trigger + function CREATE OR REPLACE + 1-row UPDATE)
- **2 mobile file edits** (~3 lines each, no new files, no new deps)
- **0 admin panel changes**
- **0 new RLS policies** (RPC SECURITY DEFINER + caller-aware predicate is sufficient)
- **0 client-side gating** (server-side single source of truth — no leak surface)
- **Mirrors the existing `is_demo_machine` pattern** (no new conceptual surface for the team to learn)
- **Forward-compatible:** any new test/demo gym is hidden by default — superadmin flips `is_demo_gym = true` and it disappears from production discovery automatically
- **Reversible** in seconds via function rollback + 1-row UPDATE

---

## Agent Dispatch Prompts

### → supabase-dba

```
Read docs/plans/production_demo_gym_visibility_gating.md.

Create ONE migration file:
  backend/supabase/migrations/20260427120000_gyms_is_demo_gym_and_rpc_demo_filter.sql

The migration must:

1. ALTER TABLE public.gyms ADD COLUMN IF NOT EXISTS is_demo_gym BOOLEAN NOT NULL DEFAULT false.
2. Add COMMENT, partial index `idx_gyms_is_demo_gym`.
3. Create function `enforce_gyms_is_demo_gym_superadmin_only` and BEFORE UPDATE trigger
   `trg_gyms_guard_is_demo_gym_update` (mirror the profiles.is_demo guard).
4. CREATE OR REPLACE FUNCTION public.get_public_gyms_for_mobile(p_pilot_only BOOLEAN DEFAULT false)
   RETURNS SETOF public.gyms — body per Step 1.3 in the plan. Re-grant EXECUTE to authenticated
   (and anon if previously granted — keep parity with the prior version).
5. Verify the existing demo gym identifier with a SELECT, then UPDATE
   public.gyms SET is_demo_gym = true, is_mobile_listed = false, updated_at = NOW()
   WHERE name ILIKE 'sweatdrop gym%' AND COALESCE(is_demo_gym, false) = false.
   If the SELECT shows multiple matching rows, narrow to the explicit test gym id literal first
   and report the chosen id in MIGRATION_NOTES.md.
6. COMMENT ON FUNCTION explaining the demo gating policy.

After applying:
  - Run `supabase db push` and verify with: \d+ public.gyms (column present),
    \df public.get_public_gyms_for_mobile (new signature).
  - Run the 5 Testing queries from the plan and report results.
  - Regenerate types: supabase gen types typescript --linked > backend/types/database.types.ts.
  - Update MIGRATION_NOTES.md with a [2026-04-27] entry naming the test gym id.
  - Update CHANGELOG.md under [Unreleased] / Added with: "gyms.is_demo_gym flag + demo-aware
    get_public_gyms_for_mobile() RPC; SweatDrop test gym hidden from non-demo users".
  - Do NOT touch apps/mobile-app or apps/admin-panel.
```

### → mobile-coder

```
Read docs/plans/production_demo_gym_visibility_gating.md (Step 2 only).

Make exactly two edits — no new files, no new deps:

1. apps/mobile-app/app/(onboarding)/home-gym.tsx
   Replace the `from('gyms').select('*').eq('is_mobile_listed', true).eq('is_active', true).order('name')`
   call with `supabase.rpc('get_public_gyms_for_mobile')`. Keep the rest of the function intact.

2. apps/mobile-app/app/home.tsx (no-gym empty state, ~L662)
   Replace the `from('gyms').select(...).eq('is_active', true).eq('is_mobile_listed', true).order('name').limit(10)`
   call with `const { data: rpcGyms, error } = await supabase.rpc('get_public_gyms_for_mobile');`
   followed by `const gymsData = (rpcGyms ?? []).slice(0, 10);`. Keep the fallback branch and
   owner_branding hydration unchanged.

Verification:
  - Run app on simulator with a demo account → onboarding home-gym shows SweatDrop test gym.
  - Run with a non-demo account → SweatDrop test gym does NOT appear in onboarding home-gym,
    /home empty state, or /gyms.
  - Type-check passes: pnpm --filter sweatdrop-mobile-app type-check.

Update CHANGELOG.md under [Unreleased] / Changed:
  "Mobile gym discovery (onboarding + home empty state) routed through
   get_public_gyms_for_mobile RPC for demo-gym gating."

Do NOT touch backend/supabase or apps/admin-panel.
```

---

## Open Follow-ups (Out of Scope)

1. **Admin UI toggle** for `is_demo_gym` on `/dashboard/super` gym detail. Trigger guard already protects the DB; UI is convenience only.
2. **Anonymous gym discovery** (pre-auth marketing surface, e.g., landing page). Anonymous callers will receive only non-demo gyms — desired behavior; no further work.
3. **Audit `gym-detail.tsx` deep-link safety.** A non-demo user with a known demo gym `id` could still load the detail page. Currently low risk (no UX path produces such an id for non-demo users). Add `is_demo_gym` filter to `gym-detail.tsx`'s single-row fetch only if a leak path emerges.

---

**End of Plan**
