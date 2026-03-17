# SWEATDROP — Bugs & Features Plan

**Created:** 2026-03-11
**Status:** Ready for execution

---

## Architect Analysis — Root Causes & Findings

### BUGS

| # | Bug | Root Cause | Severity | Agent |
|---|-----|-----------|----------|-------|
| B1 | Onboarding edit — last step doesn't finish | `step-goal.tsx` uses `router.back()` in edit mode, only pops one screen (to step-birthday) instead of returning to profile. Secondary: `step-gender.tsx` has missing `profile` dep in useEffect. | 🔴 HIGH | Mobile |
| B2 | Streak badge incorrect (7-day badge with 2 days) | `evaluate_badges()` checks `profiles.streak_days` which may be stale or incorrectly calculated. Multiple historical streak logic rewrites suggest persistent issue. Need audit of current `award_drops()` streak calculation + data fix for affected users. | 🔴 HIGH | DBA + Mobile |
| B3 | Time flag on challenges | `getTimeRemaining()` in `challenges.tsx` parses date-only strings (`"2025-03-25"`) via `new Date()` → UTC midnight → timezone bug. Home screen doesn't show time remaining at all. | 🟡 MEDIUM | Mobile |
| B4 | Better Serbian translation | Broad i18n improvement. Need audit of all locale files. | 🟢 LOW | Mobile |
| B5 | Next badge on home screen — always same badge | `ProgressWidget.tsx` sorts unearned badges by `progressPercent` descending. When many badges share 0% progress, no secondary sort → same badge always appears. | 🟡 MEDIUM | Mobile |
| B6 | Admin panel — no members avatar | `MemberList.tsx` and `RetentionDashboard.tsx` always show first-letter initial. `avatar_url` IS fetched but never rendered. Other components (`TopPerformersWidget`, `LeaderboardHistory`) do show avatars. | 🟡 MEDIUM | Admin |

### FEATURES

| # | Feature | Complexity | Agent |
|---|---------|-----------|-------|
| F1 | Member page in admin panel | Medium — new page, queries from profiles + sessions + transactions | Admin |
| F2 | Member profile in mobile app | Medium — new screen with public profile view | Mobile |
| F3 | Fix leaderboard prizes | High — Settings reads `gym.leaderboard_config` but saves to `leaderboard_rewards`, no weekly/monthly selection, needs restructure into Leaderboard page | Admin + DBA |
| F4 | Rearrange admin sidebar | Medium — significant navigation restructure, merge pages, move items | Admin |

---

## Detailed Root Cause Evidence

### B1: Onboarding Edit — Last Step Doesn't Finish

**File:** `apps/mobile-app/app/(onboarding)/step-goal.tsx` (lines 36-49)

```typescript
const handleFinish = async () => {
  const result = await submit();
  if (result.success) {
    if (isEdit) {
      router.back();  // ❌ Only pops ONE screen (to step-birthday)
    } else {
      setOnboardingStep('done');
      router.replace('/home');
    }
  }
};
```

Navigation stack in edit mode: `profile → step-gender → step-weight → step-height → step-birthday → step-goal`
`router.back()` goes to step-birthday, not profile. User must manually back 4 more times.

**Secondary bug in** `step-gender.tsx`:
```typescript
useEffect(() => {
  if (isEdit && profile) {     // profile may be null on first render
    setEditMode(true);
    initializeFromProfile({...});
  } else {
    setEditMode(false);        // ❌ Incorrectly resets if profile not loaded yet
    reset();
  }
}, [isEdit]);                  // ❌ Missing `profile` in deps
```

### B2: Streak Badge Incorrect

**Badge evaluation flow:**
1. `award_drops()` → updates `profiles.streak_days` and `last_visit_date`
2. `award_drops()` → calls `evaluate_badges()`
3. `evaluate_badges()` → reads `profiles.streak_days` → checks `>= criteria.value`
4. Streak achievements seeded: 3, 7, 14, 30 days

**Potential issues:**
- `streak_days` may not reset properly when there's a gap > 1 day
- Multiple sessions on the same day may incorrectly increment streak
- Historical rewrites of streak logic (5+ migrations) suggest persistent edge cases
- Need to audit actual user data: `SELECT id, streak_days, last_visit_date FROM profiles WHERE streak_days > 2`

### B3: Time Flag on Challenges

**File:** `apps/mobile-app/app/challenges.tsx` (lines 162-174)

```typescript
const getTimeRemaining = (endDate: string) => {
  const end = new Date(endDate);  // ❌ "2025-03-25" → UTC midnight
  const now = new Date();
  const diff = end.getTime() - now.getTime();
  if (diff <= 0) return 'Ended';  // Shows "Ended" too early in some timezones
  // ...
};
```

**Fix pattern already exists in codebase:** `ArenasManager.tsx` line 397 uses `new Date(arena.end_date + 'T23:59:59')`.

**Home screen missing time:** `useChallengeProgress.ts` fetches `start_date`/`end_date` but doesn't include them in the returned `ChallengeProgress` interface (lines 129-141).

### B5: Next Badge Always Same

**File:** `apps/mobile-app/components/ProgressWidget.tsx` (lines 66-72)

```typescript
const unearnedBadges = allBadges
  .filter(b => !b.is_earned)
  .sort((a, b) => b.progressPercent - a.progressPercent);  // ❌ No tiebreaker
const nextBadge = unearnedBadges[0];  // Always same when many at 0%
```

### B6: Admin Avatar Missing

**File:** `apps/admin-panel/components/modules/MemberList.tsx` (lines 246-256)

```html
<!-- Always shows initial, never uses avatar_url -->
<div class="w-8 h-8 rounded-full bg-[#1A1A1A] flex items-center justify-center">
  <span>{member.username.charAt(0).toUpperCase()}</span>
</div>
```

`avatar_url` is fetched in `member-actions.ts` (line 105) but the component never checks it.

Pattern that DOES work (from `TopPerformersWidget.tsx` lines 63-65):
```html
{performer.avatar_url ? (
  <img src={performer.avatar_url} className="w-8 h-8 rounded-full object-cover" />
) : (
  <div class="w-8 h-8 rounded-full bg-[#1A1A1A]">...</div>
)}
```

### F3: Leaderboard Prizes — Broken Flow

**Current state:**
1. Settings page reads from `gym.leaderboard_config` (may not exist in schema)
2. On save, `updateLeaderboardRewards()` writes to `leaderboard_rewards` table
3. On reload, reads from `leaderboard_config` again → saved prizes don't appear
4. `LeaderboardRewardsForm.tsx` exists (correct implementation using `leaderboard_rewards`) but is NOT used anywhere
5. `updateLeaderboardRewards` hardcodes `period: 'monthly'` (line 174)
6. No weekly prize configuration exists in current UI

### F4: Admin Sidebar — Current vs Proposed

**Current sidebar (gym_owner):**
```
GLOBAL:      Branding
LOCATION:    GymSwitcher
CORE:        Dashboard, Members, Retention, Workout Plans
MANAGEMENT:  Challenges, Store Manager, Machines, Local Arenas, Invitations, Leaderboard History
OPERATIONS:  Redemptions, Verify Code, Team, Settings
```

**Proposed sidebar:**
```
GLOBAL:      Branding
LOCATION:    [Dropdown]
CORE:        Dashboard, Members (+ Retention merged), Leaderboard (+ prizes, moved from MANAGEMENT)
MANAGEMENT:  Challenges, Check-in (NEW), Store (+ Redemptions + Verify merged), Machines, Arenas (+ Invitations as tab)
OPERATIONS:  Workout Plans, Team, Settings (gym data, GPS, billing)
```

**Key changes:**
- Merge Members + Retention → single "Members" with retention as a tab/section
- Move Leaderboard from MANAGEMENT → CORE, add prize configuration + winner history
- Merge Store + Redemptions + Verify Code → single "Store" with tabs
- Merge Local Arenas + Invitations → single "Arenas" with tabs
- Move Workout Plans from CORE → OPERATIONS
- Add Check-in to MANAGEMENT (new, from master plan)
- Remove leaderboard prizes from Settings
- Move Check-in setup from Settings to its own MANAGEMENT item

---

## Execution Plan

### Execution Order

```
ROUND 1 — Quick Bug Fixes (independent, can run parallel)
  ├── Mobile Agent A: B1 (onboarding edit) + B3 (time flag) + B5 (next badge)
  ├── Admin Agent A:  B6 (member avatar)
  └── DBA Agent A:    B2 (streak badge audit + fix)

ROUND 2 — Features (after Round 1)
  ├── Admin Agent B:  F4 (sidebar restructure) — do first, it restructures navigation
  ├── Admin Agent C:  F1 (member page) + F3 (leaderboard prizes) — after F4
  └── Mobile Agent B: F2 (member profile) + B4 (Serbian translation)
```

---

## ROUND 1A — Mobile Agent: Quick Bug Fixes (B1 + B3 + B5)

> **Task: Fix 3 mobile bugs — onboarding edit, challenge time, next badge**
>
> Read `docs/plans/bugs_and_features_plan.md` Round 1A section.
>
> ### Fix B1: Onboarding edit — last step doesn't finish
>
> **Files:** `apps/mobile-app/app/(onboarding)/step-goal.tsx`, `apps/mobile-app/app/(onboarding)/step-gender.tsx`
>
> **step-goal.tsx — Fix edit mode navigation:**
>
> Replace `router.back()` with navigation that returns to profile:
> ```typescript
> if (isEdit) {
>   // Dismiss all onboarding screens and go back to profile
>   while (router.canGoBack()) {
>     router.back();
>   }
>   router.replace('/profile');
> }
> ```
>
> Or if `expo-router` supports it, use `router.dismissAll()` followed by checking we're at the right place, or simply:
> ```typescript
> if (isEdit) {
>   router.replace('/profile');
> }
> ```
>
> Test which approach works in expo-router. The goal is: after finishing edit, user lands on profile screen, not stuck in onboarding stack.
>
> **step-gender.tsx — Fix useEffect deps:**
>
> Change the useEffect to include `profile` in deps and guard against null:
> ```typescript
> useEffect(() => {
>   if (isEdit && profile) {
>     setEditMode(true);
>     initializeFromProfile({
>       gender: profile.gender,
>       weight_kg: profile.weight_kg,
>       height_cm: profile.height_cm,
>       date_of_birth: profile.date_of_birth,
>       fitness_goal: profile.fitness_goal,
>     });
>   } else if (!isEdit) {
>     setEditMode(false);
>     reset();
>   }
>   // If isEdit && !profile: wait for profile to load (do nothing)
> }, [isEdit, profile]);
> ```
>
> ### Fix B3: Challenge time flag
>
> **Files:**
> - `apps/mobile-app/app/challenges.tsx`
> - `apps/mobile-app/app/challenge-detail.tsx`
> - `apps/mobile-app/hooks/useChallengeProgress.ts`
> - `apps/mobile-app/app/home.tsx`
>
> **challenges.tsx and challenge-detail.tsx — Fix timezone:**
>
> In `getTimeRemaining()`, change:
> ```typescript
> // BEFORE (bug — UTC midnight):
> const end = new Date(endDate);
>
> // AFTER (fix — end of day local time):
> const end = new Date(endDate + 'T23:59:59');
> ```
>
> This pattern is already used in `ArenasManager.tsx` line 397.
>
> **useChallengeProgress.ts — Expose dates:**
>
> Add `start_date` and `end_date` to the `ChallengeProgress` interface:
> ```typescript
> interface ChallengeProgress {
>   // ... existing fields ...
>   start_date: string | null;
>   end_date: string | null;
> }
> ```
>
> Add to the returned object (around line 129):
> ```typescript
> return {
>   // ... existing fields ...
>   start_date: challenge.start_date,
>   end_date: challenge.end_date,
> };
> ```
>
> **home.tsx — Add time badge to challenge cards:**
>
> Add the same `getTimeRemaining()` helper (with the fixed timezone) and show a time badge on challenge cards, similar to how `challenges.tsx` displays it.
>
> ### Fix B5: Next badge always same
>
> **File:** `apps/mobile-app/components/ProgressWidget.tsx`
>
> Add a secondary sort when `progressPercent` is equal:
> ```typescript
> const unearnedBadges = allBadges
>   .filter(b => !b.is_earned)
>   .sort((a, b) => {
>     // Primary: highest progress first
>     const progressDiff = b.progressPercent - a.progressPercent;
>     if (progressDiff !== 0) return progressDiff;
>     // Secondary: prefer badges with display_order (global achievements)
>     const orderA = a.display_order ?? 999;
>     const orderB = b.display_order ?? 999;
>     return orderA - orderB;
>   });
> ```
>
> Also, consider showing the badge that is CLOSEST to being earned (highest non-zero progress). If all are 0%, pick the one with the lowest display_order (earliest global achievement — most achievable).
>
> ### Validation
> ```
> □ B1: Edit profile → go through all 5 steps → finish → lands on profile (not step-birthday)
> □ B1: Edit profile with slow network → step-gender initializes correctly
> □ B3: Challenge ending today at 11pm local → shows "Xh left" not "Ended"
> □ B3: Home screen challenge cards show time remaining
> □ B5: Home screen shows a different "next badge" as user earns badges
> □ B5: With 0% progress on all, shows the most achievable badge (not random)
> □ TypeScript: 0 errors
> ```

---

## ROUND 1B — Admin Agent: Member Avatar Fix (B6)

> **Task: Fix missing member avatars in admin panel**
>
> Read `docs/plans/bugs_and_features_plan.md` Round 1B section.
>
> **Files to fix:**
> - `apps/admin-panel/components/modules/MemberList.tsx` (lines 246-256)
> - `apps/admin-panel/components/modules/RetentionDashboard.tsx` (lines 298-307)
>
> **Pattern to follow** (from `TopPerformersWidget.tsx` lines 63-65):
> ```tsx
> {member.avatar_url ? (
>   <img
>     src={member.avatar_url}
>     alt={member.username}
>     className="w-8 h-8 rounded-full object-cover"
>   />
> ) : (
>   <div className="w-8 h-8 rounded-full bg-[#1A1A1A] flex items-center justify-center flex-shrink-0">
>     <span className="text-xs font-bold text-[#808080]">
>       {member.username.charAt(0).toUpperCase()}
>     </span>
>   </div>
> )}
> ```
>
> Apply this pattern in both `MemberList.tsx` and `RetentionDashboard.tsx`.
>
> `avatar_url` is already in the data — it's fetched in `member-actions.ts` (line 105) and `retention-actions.ts` (line 195). No backend changes needed.
>
> ### Validation
> ```
> □ Members page shows avatar images for users who have them
> □ Members page shows initial letter for users without avatar
> □ Retention page shows avatar images
> □ No broken images (handle null/empty avatar_url)
> □ TypeScript: 0 errors
> ```

---

## ROUND 1C — DBA Agent: Streak Badge Audit (B2)

> **Task: Audit and fix streak badge logic**
>
> Read `docs/plans/bugs_and_features_plan.md` Round 1C section.
>
> **Problem:** Users receiving streak badges (e.g., 7-day) when they don't have the actual streak. User reports getting 7-day badge with only 2 days of activity.
>
> ### Step 1: Audit current streak logic
>
> Find the latest `award_drops()` function. It's in `20260305000005_fix_award_drops_arena_scores.sql` or a later migration. Read it and identify the streak calculation:
> - Where does it update `profiles.streak_days`?
> - Where does it update `profiles.last_visit_date`?
> - Does it handle: (a) first visit, (b) same day, (c) consecutive day, (d) gap > 1 day?
>
> Find `evaluate_badges()` function. How does it evaluate streak achievements?
> - Does it read `profiles.streak_days` directly?
> - Are there 3, 7, 14, 30 day streak achievements?
>
> ### Step 2: Identify the bug
>
> Common streak bugs:
> 1. Streak not resetting when gap > 1 day
> 2. Streak incrementing on same day (multiple sessions)
> 3. Timezone mismatch — `CURRENT_DATE` vs `started_at AT TIME ZONE 'Europe/Belgrade'`
> 4. Race condition — `evaluate_badges()` called AFTER streak update, seeing new value before it's validated
>
> Check if `streak_days` can become artificially high:
> ```sql
> -- Run these diagnostics:
> SELECT id, username, streak_days, last_visit_date
> FROM profiles
> WHERE streak_days > 5
> ORDER BY streak_days DESC;
>
> -- Compare with actual session history:
> SELECT user_id, DATE(started_at AT TIME ZONE 'Europe/Belgrade') as visit_date
> FROM sessions
> WHERE is_active = false
> GROUP BY user_id, visit_date
> ORDER BY user_id, visit_date;
> ```
>
> ### Step 3: Fix the streak calculation
>
> Create migration: `20260312000004_fix_streak_calculation.sql`
>
> The streak calculation in `award_drops()` must:
> 1. Use `DATE(started_at AT TIME ZONE 'Europe/Belgrade')` consistently (not `CURRENT_DATE`)
> 2. Check `last_visit_date` BEFORE updating streak:
>    - If `last_visit_date = today` → do NOT increment (already counted)
>    - If `last_visit_date = yesterday` → increment
>    - If `last_visit_date < yesterday` or NULL → reset to 1
> 3. Use `FOR UPDATE` lock on profiles to prevent race conditions
>
> ### Step 4: Recalculate existing streaks
>
> Add to migration: recalculate all `streak_days` from actual session data:
> ```sql
> -- Recalculate streak_days for ALL users based on actual session history
> WITH session_dates AS (
>   SELECT user_id,
>          DATE(started_at AT TIME ZONE 'Europe/Belgrade') as visit_date
>   FROM sessions
>   WHERE is_active = false
>   GROUP BY user_id, visit_date
>   ORDER BY user_id, visit_date DESC
> ),
> streaks AS (
>   SELECT user_id,
>          visit_date,
>          visit_date - ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY visit_date DESC)::INTEGER AS streak_group
>   FROM session_dates
> ),
> current_streaks AS (
>   SELECT user_id,
>          COUNT(*) as streak_days
>   FROM streaks
>   WHERE streak_group = (
>     SELECT MIN(streak_group) FROM streaks s2 WHERE s2.user_id = streaks.user_id
>   )
>   GROUP BY user_id
> )
> UPDATE profiles p
> SET streak_days = COALESCE(cs.streak_days, 0)
> FROM current_streaks cs
> WHERE p.id = cs.user_id;
> ```
>
> **Note:** This is complex SQL. The DBA agent should test this carefully and may need to adjust.
>
> ### Step 5: Revoke incorrectly awarded badges
>
> ```sql
> -- Find users with streak badges who don't actually have the streak
> -- After recalculating streak_days, check:
> DELETE FROM user_badges ub
> USING global_achievements ga
> WHERE ub.global_achievement_id = ga.id
>   AND ga.criteria->>'type' = 'streak_days'
>   AND (SELECT streak_days FROM profiles WHERE id = ub.user_id) < (ga.criteria->>'value')::INTEGER;
> ```
>
> ### Validation
> ```
> □ Streak calculation uses Europe/Belgrade timezone consistently
> □ Same-day multiple sessions don't increment streak
> □ Gap > 1 day resets streak to 1
> □ Existing user streaks recalculated from actual session data
> □ Incorrectly awarded streak badges removed
> □ Types regenerated
> ```

---

## ROUND 2A — Admin Agent: Sidebar Restructure (F4)

> **Task: Restructure admin panel sidebar navigation**
>
> Read `docs/plans/bugs_and_features_plan.md` Round 2A section.
>
> **File:** `apps/admin-panel/components/Sidebar.tsx`
>
> ### Current structure (gym_owner):
> ```
> GLOBAL:      Branding
> LOCATION:    GymSwitcher
> CORE:        Dashboard, Members, Retention, Workout Plans
> MANAGEMENT:  Challenges, Store Manager, Machines, Local Arenas, Invitations, Leaderboard History
> OPERATIONS:  Redemptions, Verify Code, Team, Settings
> ```
>
> ### New structure:
> ```
> GLOBAL:      Branding
> LOCATION:    GymSwitcher (dropdown)
> CORE:        Dashboard, Members, Leaderboard
> MANAGEMENT:  Challenges, Check-in, Store, Machines, Arenas
> OPERATIONS:  Workout Plans, Team, Settings
> ```
>
> ### Detailed changes:
>
> **CORE group:**
> - Dashboard — unchanged
> - Members — keep at `/dashboard/gym/{id}/members`
>   - Remove separate "Retention" item
>   - Retention becomes a tab/section within Members page (handle later in F1)
> - Leaderboard — NEW item, at `/dashboard/gym/{id}/leaderboard`
>   - Combine: current "Leaderboard History" content + prize configuration
>   - Remove from MANAGEMENT group
>
> **MANAGEMENT group:**
> - Challenges — unchanged
> - Check-in — NEW item, at `/dashboard/gym/{id}/checkin`
>   - Will be created as part of master_execution_plan Phase 2B
>   - For now, add the sidebar item (page can be placeholder or come later)
> - Store — merge 3 items:
>   - Current "Store Manager" → tab: "Rewards"
>   - Current "Redemptions" → tab: "Redemptions"
>   - Current "Verify Code" → tab: "Verify"
>   - Route: `/dashboard/gym/{id}/store` (keep existing, add tabs)
> - Machines — unchanged
> - Arenas — merge 2 items:
>   - Current "Local Arenas" → tab: "My Arenas"
>   - Current "Invitations" → tab: "Invitations"
>   - Route: `/dashboard/gym/{id}/arenas` (keep existing)
>
> **OPERATIONS group:**
> - Workout Plans — moved from CORE (lower priority for most gym owners)
> - Team — unchanged
> - Settings — unchanged (GPS and billing will be added later)
>
> ### Implementation:
>
> 1. **Update `Sidebar.tsx`** — restructure the items array/groups
> 2. **Sidebar only** — do NOT restructure actual pages in this task
> 3. Routes can point to existing pages even if they'll be restructured later
> 4. Keep all existing routes working (don't break anything)
> 5. Remove Retention sidebar item (will become part of Members later)
> 6. Remove Redemptions sidebar item (will become part of Store later)
> 7. Remove Verify Code sidebar item (will become part of Store later)
> 8. Remove Invitations sidebar item (will become part of Arenas later)
> 9. Remove Leaderboard History from MANAGEMENT
> 10. Add Leaderboard to CORE
> 11. Add Check-in to MANAGEMENT (can be a placeholder link for now)
>
> **For gym_admin role:** Same restructure but without Machines, Team (as before).
> **For receptionist role:** Keep as-is (only Verify Code, Redemption Terminal, Live Feed).
>
> ### Icons (lucide-react):
> - Dashboard: `LayoutDashboard`
> - Members: `Users`
> - Leaderboard: `Trophy`
> - Challenges: `Target`
> - Check-in: `QrCode` or `MapPin`
> - Store: `ShoppingBag`
> - Machines: `Dumbbell` or `Cpu`
> - Arenas: `Swords`
> - Workout Plans: `ClipboardList`
> - Team: `UserCog`
> - Settings: `Settings`
>
> ### Validation
> ```
> □ Sidebar shows new structure for gym_owner
> □ Sidebar shows correct items for gym_admin (no Machines, Team)
> □ Receptionist sidebar unchanged
> □ All links navigate to correct pages
> □ No removed pages (just removed from sidebar, old routes still work)
> □ TypeScript: 0 errors
> ```

---

## ROUND 2B — Admin Agent: Member Page + Leaderboard Prizes (F1 + F3)

> **Task: Create member detail page and fix leaderboard prizes**
>
> Read `docs/plans/bugs_and_features_plan.md` Round 2B section.
>
> ### Feature F1: Member Detail Page
>
> **Create:** `apps/admin-panel/app/dashboard/gym/[id]/members/[memberId]/page.tsx`
>
> **Make member rows clickable** in `MemberList.tsx`:
> ```tsx
> <tr onClick={() => router.push(`/dashboard/gym/${gymId}/members/${member.id}`)}
>     className="cursor-pointer hover:bg-gray-800/30">
> ```
>
> **Page layout (sections):**
>
> **Header:**
> - Large avatar (64px) with fallback initial
> - Username (bold, large)
> - Email (muted)
> - Role badge (member/admin/staff)
> - "Member since" date (from `gym_memberships.created_at`)
>
> **Quick Stats (4 KPI cards):**
> - Total Drops (from `profiles.total_drops`)
> - Available Drops (from `profiles.available_drops`)
> - Current Streak (from `profiles.streak_days`)
> - Last Visit (from `profiles.last_visit_date`)
>
> **Activity section:**
> - Table of last 20 sessions:
>   - Date | Duration | Drops Earned | Machine
>   - Query: `sessions` JOIN `machines` WHERE user_id AND gym_id ORDER BY started_at DESC LIMIT 20
>
> **Drops History section:**
> - Table of last 20 transactions:
>   - Date | Type | Amount | Description
>   - Query: `drops_transactions` WHERE user_id AND gym_id ORDER BY created_at DESC LIMIT 20
>
> **Badges section:**
> - Grid of earned badges (from `user_badges` JOIN `global_achievements` or `gym_challenges`)
> - Show badge image, name, earned date
>
> **Redemptions section:**
> - Table of redemptions:
>   - Date | Reward | Status | Code
>   - Query: `redemptions` WHERE user_id ORDER BY created_at DESC LIMIT 20
>
> **Data fetching:** Create `apps/admin-panel/lib/actions/member-detail-actions.ts`:
> ```typescript
> export async function getMemberDetail(gymId: string, memberId: string) {
>   // Fetch profile, membership, sessions, transactions, badges, redemptions
> }
> ```
>
> ### Feature F3: Leaderboard Prizes
>
> **Problem summary:**
> 1. Settings reads `gym.leaderboard_config` (possibly non-existent) but saves to `leaderboard_rewards`
> 2. No weekly/monthly period selection
> 3. `updateLeaderboardRewards` hardcodes `period: 'monthly'`
>
> **Fix:**
>
> **Step 1:** Create/update leaderboard page at `/dashboard/gym/[id]/leaderboard/page.tsx`:
>
> **Tab structure:**
> - **Weekly** — current weekly leaderboard + weekly prize config
> - **Monthly** — current monthly leaderboard + monthly prize config
> - **History** — past winners (from `leaderboard_snapshots`)
>
> **Each tab (Weekly/Monthly) has:**
> - Current top 10 standings (from `get_leaderboard()` RPC)
> - Prize configuration panel:
>   - Rank 1 prize: name + type (drops/physical) + value + description
>   - Rank 2 prize: same
>   - Rank 3 prize: same
>   - Save button → writes to `leaderboard_rewards` with correct `period`
>
> **Step 2:** Fix `leaderboard-actions.ts`:
> - `updateLeaderboardRewards()` must accept `period` parameter (not hardcode 'monthly')
> - Read from `leaderboard_rewards` table (not `gym.leaderboard_config`)
> - Create `getLeaderboardRewards(gymId, period)` action that reads from `leaderboard_rewards`
>
> **Step 3:** Remove leaderboard prize config from Settings page:
> - In `apps/admin-panel/app/dashboard/gym/[id]/settings/page.tsx`
> - Remove the `LeaderboardRewardsModule` component
> - Leaderboard prizes are now managed in the Leaderboard page
>
> **History tab:**
> - Query `leaderboard_snapshots` for past periods
> - Show: Period | Winner | Score | Prize Awarded
>
> ### Validation
> ```
> □ F1: Click member row → navigates to member detail page
> □ F1: Member page shows avatar, stats, sessions, transactions, badges, redemptions
> □ F1: Back button returns to member list
> □ F3: Leaderboard page shows current standings for weekly and monthly
> □ F3: Prize configuration saves correctly for both weekly and monthly
> □ F3: Prizes persist after page reload (reads from leaderboard_rewards)
> □ F3: History tab shows past winners
> □ F3: Settings page no longer shows leaderboard prizes
> □ TypeScript: 0 errors
> ```

---

## ROUND 2C — Mobile Agent: Member Profile + Serbian Translation (F2 + B4)

> **Task: Create public member profile screen and improve Serbian translations**
>
> Read `docs/plans/bugs_and_features_plan.md` Round 2C section.
>
> ### Feature F2: Member Profile Screen
>
> **Create:** `apps/mobile-app/app/user/[id].tsx`
>
> **Register in** `apps/mobile-app/app/_layout.tsx`:
> ```typescript
> <Stack.Screen name="user/[id]" options={{ headerShown: false }} />
> ```
>
> **Data fetching:**
> ```typescript
> const { data: profile } = await supabase
>   .from('profiles')
>   .select('id, username, avatar_url, total_drops, streak_days, created_at')
>   .eq('id', userId)
>   .single();
>
> const { data: badges } = await supabase
>   .rpc('get_user_badges', { p_user_id: userId });
> ```
>
> **Screen layout:**
> - Header with avatar (large, centered), username
> - "Member since" date
> - Stats row: Total Drops | Streak | Badges Count
> - Badge grid (earned badges, similar to TrophyRoom but compact)
> - If viewing own profile: "Edit Profile" button → `/profile`
> - If viewing another user: future — "Follow" / "Challenge" buttons (placeholder/disabled for now)
>
> **Navigation to profile:**
> - From leaderboard: tap user row → `/user/${userId}`
> - From arena leaderboard: tap user → `/user/${userId}`
> - From session summary badge list: tap badge → badge detail (existing)
>
> **Design:** Follow existing glassmorphism design system.
>
> **i18n:** Add `profile` namespace (or add to existing namespace):
> ```json
> // sr: "Član od", "Ukupno dropova", "Nizovi", "Bedževi"
> // en: "Member since", "Total Drops", "Streaks", "Badges"
> ```
>
> ### Bug B4: Better Serbian Translation
>
> **Audit all locale files in** `apps/mobile-app/locales/sr/`:
>
> Common issues to look for:
> 1. English words left untranslated (mixed Serbian/English)
> 2. Machine-translated phrases that sound unnatural
> 3. Inconsistent terminology (e.g., "drops" vs "kapljice" — should stay "drops")
> 4. Missing pluralization rules
> 5. Hardcoded strings in components that bypass i18n
>
> **Files to audit:**
> - `locales/sr/common.json`
> - `locales/sr/home.json`
> - `locales/sr/challenges.json`
> - `locales/sr/arena.json`
> - `locales/sr/history.json`
> - `locales/sr/trophyRoom.json`
> - `locales/sr/onboarding.json`
> - Any other `.json` files in `locales/sr/`
>
> **Also search for hardcoded strings:**
> - Search all `.tsx` files in `apps/mobile-app/` for Serbian text not using `t()` or `useTranslation()`
> - Search for patterns like `"Danas"`, `"Izazovi"`, `"Čekiran"` etc. that should use i18n
>
> **Known specific issues to fix (from context):**
> - Challenge time remaining: "d left" / "h left" should be localized ("d preostalo" / "h preostalo")
> - Badge descriptions may be in English
> - Some UI labels might be hardcoded in Serbian (not using i18n)
>
> ### Validation
> ```
> □ F2: Tap user on leaderboard → navigates to user profile
> □ F2: Profile shows avatar, username, stats, badges
> □ F2: Own profile shows edit button
> □ F2: Other user's profile shows correctly (no edit)
> □ B4: All visible UI text in Serbian when language is set to Serbian
> □ B4: No mixed English/Serbian on any screen
> □ B4: Challenge time remaining is localized
> □ TypeScript: 0 errors
> ```

---

## Dependency Map

```
ROUND 1 (independent, can all run in parallel):
  ├── Mobile Agent A (B1 + B3 + B5) — no dependencies
  ├── Admin Agent A (B6) — no dependencies
  └── DBA Agent A (B2) — no dependencies

ROUND 2 (after Round 1):
  ├── Admin Agent B (F4 sidebar) — depends on: nothing from Round 1
  │   └── Admin Agent C (F1 member page + F3 leaderboard) — depends on: F4 sidebar done
  └── Mobile Agent B (F2 profile + B4 translations) — depends on: nothing from Round 1
```

**Note:** Round 2 items can start as soon as their Round 1 dependencies are done. In practice:
- Admin Agent B (sidebar) can start immediately after Round 1B completes
- Mobile Agent B can start immediately after Round 1A completes
- Admin Agent C must wait for Admin Agent B (sidebar restructure creates the new Leaderboard location)

---

## Files Reference

| Item | Files Modified/Created |
|------|----------------------|
| B1 | `step-goal.tsx`, `step-gender.tsx` |
| B2 | New migration `20260312000004_fix_streak_calculation.sql` |
| B3 | `challenges.tsx`, `challenge-detail.tsx`, `useChallengeProgress.ts`, `home.tsx` |
| B4 | All `locales/sr/*.json` files + component audit |
| B5 | `ProgressWidget.tsx` |
| B6 | `MemberList.tsx`, `RetentionDashboard.tsx` |
| F1 | New `members/[memberId]/page.tsx`, new `member-detail-actions.ts`, `MemberList.tsx` (add click) |
| F2 | New `app/user/[id].tsx`, `_layout.tsx`, leaderboard screens (add navigation) |
| F3 | New/update `leaderboard/page.tsx`, `leaderboard-actions.ts`, `settings/page.tsx` |
| F4 | `Sidebar.tsx` |
