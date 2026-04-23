# Feature: Exclude Demo/Test Accounts from Global Leaderboard (Pre-Vortex)

**Status:** Planning
**Owner:** Architect
**Target Release:** Before Vortex gym goes live
**Created:** 2026-04-23
**Dependencies:**
- `profiles.is_demo` flag (migration `20260421192713_profiles_is_demo_flag.sql`) — already in production
- `get_leaderboard()` RPC (current live version in `20260414110000_fix_arena_leaderboard_zero_score_filter.sql`)

---

## Context

### Problem

On production:
- A test gym **"SweatDrop Gym"** exists and holds: (a) internal QA accounts, (b) the Apple App Review reviewer account, (c) any automated smoke-test accounts.
- Vortex gym is about to onboard real members.

When a real Vortex user opens the Leaderboard screen and selects the **Global** scope, they will currently see test accounts because `get_leaderboard('global', …)` aggregates `profiles.weekly_drops | monthly_drops | total_drops` across **all profiles** with `role='user'` — independent of which gym they belong to.

### Why we don't need a new column

`profiles.is_demo` already exists, is superadmin-mutation-guarded, and is returned by `get_my_profile()`. It was introduced specifically for the pilot demo-gate. We reuse it here.

### Other leaks we audited

| Surface | Leaks test data? | Notes |
|---|---|---|
| **Leaderboard — Global** | ✅ Yes (fix here) | `get_leaderboard('global', …)` reads `profiles.*_drops` ignoring gym membership |
| **Leaderboard — Gym** | ❌ No | `leaderboard_live_scores` is per-gym; test accounts only appear in the test gym |
| **Arenas — cross-gym** | ⚠️ Potential | `get_leaderboard('arena', …)` reads from `arena_participants`. Only leaks if a demo account joins an arena. Fix defensively. |
| **Leaderboard — Challenge** | ❌ No | Challenge leaderboards are scoped to a single `gym_challenge` which belongs to one gym |
| **Badges (`evaluate_badges`)** | ❌ No | Per-user evaluation, no cross-user ranking |
| **Arena prizes / Leaderboard prizes cron** | ⚠️ Potential | Distributes prizes to top ranks — if demo users top the global list they'd get prizes. Filter at the source (`get_leaderboard`) and this follows automatically. |

### What about hiding the gym itself?

This plan **does not** hide `SweatDrop Gym` from the gym discovery/picker in the mobile app. Rationale:

- The Apple review account needs to be able to **see and select** the test gym during review — hiding it breaks review.
- Real users picking the test gym is a low-risk edge case (no prize pools, no physical rewards attached).
- Hiding at gym level would add surface area (new column, RLS updates, picker filter) that we explicitly want to avoid.

If you later want the test gym hidden from the public gym list for non-demo users, that's a separate follow-up plan (see "Open Follow-ups" at the bottom).

---

## Execution Plan

### Phase 1 — One migration (supabase-dba)

**Migration file:** `backend/supabase/migrations/20260423200000_exclude_demo_users_from_global_and_arena_leaderboards.sql`

**Agent:** supabase-dba

#### Changes

**Part 1 — patch `get_leaderboard()`**

`CREATE OR REPLACE FUNCTION public.get_leaderboard(...)` — verbatim copy of the current definition from `20260409200002_materialize_leaderboard_scores.sql` with **two surgical additions**:

- In the `'global'` branch `WHERE` clause, add:
  ```sql
  AND COALESCE(p.is_demo, false) = false
  ```
- In the `'arena'` branch `WHERE` clause, add the same predicate (joined on `p` alias):
  ```sql
  AND COALESCE(p.is_demo, false) = false
  ```

No changes to `'gym'` or `'challenge'` branches — those are already scope-isolated per the audit table above. Filtering them would silently break per-gym rankings for demo accounts, which is sometimes useful for QA.

**Part 2 — seed the flag on existing test profiles**

Idempotent UPDATE (safe to re-run):

```sql
UPDATE public.profiles
SET is_demo = true, updated_at = NOW()
WHERE id IN (
  SELECT gm.user_id
  FROM public.gym_memberships gm
  JOIN public.gyms g ON g.id = gm.gym_id
  WHERE g.name ILIKE 'sweatdrop gym%'         -- exact-match fallback in the migration
     OR g.slug  = 'sweatdrop-gym'              -- preferred match when slug is known
)
AND COALESCE(is_demo, false) = false;
```

> supabase-dba must verify the exact gym identifier first:
> `SELECT id, name, slug FROM public.gyms WHERE name ILIKE '%sweatdrop%';`
> and adjust the `WHERE` accordingly. If there's only one SweatDrop-named gym, the `ILIKE` match is sufficient. Using the literal `id` is fine too — whichever is cleanest given the actual row.

**Part 3 — safety comment on the function**

```sql
COMMENT ON FUNCTION public.get_leaderboard(TEXT, UUID, TEXT, INT, BOOLEAN) IS
  'Global and arena branches exclude profiles.is_demo = true. '
  'Gym and challenge branches are already scope-isolated and do not filter demo flag. '
  'Production: test accounts in SweatDrop Gym must have is_demo = true.';
```

#### Testing

1. **Unit:** Create a demo profile (`is_demo = true`) with `total_drops = 99999`. Call `get_leaderboard('global', NULL, 'all_time', 50, false)` — user must NOT appear. Flip `is_demo = false`, re-call, user MUST appear in top rank.
2. **Regression:** Call `get_leaderboard('gym', <sweatdrop-gym-id>, 'all_time', 50, false)` with a demo member — member MUST still appear (gym leaderboard intentionally unfiltered).
3. **Seed verification:** After the UPDATE, run:
   ```sql
   SELECT p.id, p.username, p.is_demo
   FROM public.profiles p
   JOIN public.gym_memberships gm ON gm.user_id = p.id
   JOIN public.gyms g ON g.id = gm.gym_id
   WHERE g.name ILIKE 'sweatdrop gym%';
   ```
   Every returned row must have `is_demo = true`.
4. **End-to-end (manual):** Sign in on mobile as a Vortex member → Leaderboard → Global tab → confirm no test usernames visible in top 50.

#### Rollback

If something goes wrong, recreate the previous version of `get_leaderboard` (the definition from `20260409200002_materialize_leaderboard_scores.sql`). The `UPDATE ... SET is_demo = true` is functionally harmless in isolation — it only gates visibility through the function — so the flag update does not need to be rolled back.

---

### Phase 2 — Onboarding operational note (no code)

**Owner:** Superadmin / supabase-dba

Document in `docs/PRODUCTION.md` or `ENVIRONMENTS.md` under a new section **"Demo account hygiene"**:

> Whenever a new test/QA/Apple-review account is provisioned (e.g. before a new App Store submission), mark it with `is_demo = true` immediately after signup:
> ```sql
> UPDATE public.profiles SET is_demo = true WHERE email = 'reviewer+apple@...';
> ```
> Equivalent admin-panel UI exists on the superadmin user detail page (if already shipped).

This is a **process** guardrail, not code. It prevents the same leak from reappearing as the team adds future test identities.

---

## Open Follow-ups (Out of Scope for This Plan)

Deliberately deferred — add a separate plan if/when they become a priority:

1. **Hide `SweatDrop Gym` from the gym discovery list for non-demo users.**
   Would require either:
   - Add `gyms.is_demo` boolean + filter in `get_public_gyms()` / gym picker query.
   - Or: add `gym_memberships.is_visible` per-user override.
   Both are more invasive than the current plan; not needed for the Apple review scenario.

2. **Filter demo users from leaderboard prize distribution (`distribute-leaderboard-prizes` Edge Function).**
   Current fix at the RPC level means demo users are already absent from the `get_leaderboard` output. If the Edge Function re-queries scores via a different path (not via `get_leaderboard`), double-check after Phase 1 and add the same filter at the SQL level inside the function if needed.

3. **Dashboard KPIs segregation.**
   Superadmin dashboards (total users, total drops) currently include demo users. If production KPIs need to exclude demo activity, add a `WHERE COALESCE(is_demo, false) = false` in report queries. Low priority — superadmin understands the flag.

---

## Why This Is "Najpametnije i Najefikasnije"

- **0 new columns, 0 new tables, 0 new indexes.** Pure function patch + one UPDATE.
- **1 migration file, ≈60 lines** (most of which is the faithful copy of the existing function body).
- **No frontend changes.** Mobile app / admin panel require zero code changes.
- **Reuses the existing `is_demo` lever** that was already designed for exactly this scenario.
- **Reversible in seconds** (swap the function back).
- **Covers the known leak surfaces** (global + arena). Gym and challenge branches are already safe by construction.
- **Forward-compatible**: any new demo account automatically stays hidden from global/arena as long as `is_demo=true` is flipped during provisioning.

---

## Agent Dispatch Prompt

```
Read docs/plans/production_demo_gym_exclusion_from_global_leaderboard.md.

Create ONE migration file:
  backend/supabase/migrations/20260423200000_exclude_demo_users_from_global_and_arena_leaderboards.sql

The migration must do three things:

1. CREATE OR REPLACE public.get_leaderboard(...) using the current body from
   20260409200002_materialize_leaderboard_scores.sql, with two additions:
   - 'global' branch WHERE: add `AND COALESCE(p.is_demo, false) = false`
   - 'arena'  branch WHERE: add the same predicate on alias p
   Do not touch 'gym' or 'challenge' branches.

2. UPDATE profiles SET is_demo = true for every member of the SweatDrop test gym.
   First verify the gym identifier with:
     SELECT id, name, slug FROM public.gyms WHERE name ILIKE '%sweatdrop%';
   Then embed either the literal UUID or an ILIKE match in the UPDATE. Make it
   idempotent: guard with `AND COALESCE(is_demo, false) = false`.

3. Add COMMENT ON FUNCTION explaining the demo-exclusion policy (see plan §Phase 1 Part 3).

After applying:
  - Run the three Testing queries in the plan and report results.
  - Update MIGRATION_NOTES.md with a [2026-04-23] entry.
  - Do NOT regenerate database.types.ts (no schema change).

Do NOT touch mobile app, admin panel, or any other file.
```

---

**End of Plan**
