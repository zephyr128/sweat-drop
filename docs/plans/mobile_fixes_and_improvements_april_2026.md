# Mobile App Fixes & Improvements — April 2026

## Context

A batch of 11 bug fixes and UI improvements across the mobile app. Items range from simple UI tweaks (remove text, restyle a button) to backend-impacting bugs (streak miscalculation, challenge progress/date bugs) and moderate UI overhauls (redemptions filtering, workouts screen calendar, My Stats polish).

## Dependencies

- [ ] **Bug #8, #9, #11 (Streak / Challenge):** Require supabase-dba investigation and fix **before** mobile-coder touches UI
- [ ] All other items are mobile-only and can be executed in parallel

---

## Priority Order (suggested)

| Priority | Items | Why |
|----------|-------|-----|
| P0 — Bugs (backend) | #8, #9, #11 | Data-correctness bugs; streak and challenge progress are wrong |
| P1 — Bugs (mobile) | #4, #10 | Display bugs (dates, colors) |
| P2 — UI Polish | #1, #6, #7 | Quick wins, design alignment |
| P3 — Features | #2, #3, #5 | Larger UI improvements |

---

## Execution Plan

---

### Item 1: Remove "+ bonus" and gym name from HeroDropsRing / Home screen ring (mobile-coder)

**What:** The home screen ring area (likely `ActivityRings` or `StatsCards`) shows a "+ N bonus" when over-cap drops are earned, and possibly a gym name. Remove both.

**Files to inspect and edit:**
- `apps/mobile-app/app/home.tsx` — find where bonus drops text is rendered near the ring
- `apps/mobile-app/components/StatsCards.tsx` — the "Today" pill shows `overCap` / bonus pattern
- `apps/mobile-app/components/HeroDropsRing.tsx` — check if still imported anywhere; if so, strip bonus/gym text

**Changes:**
1. In `StatsCards.tsx`, remove the `+ bonus` display from the Today stats pill
2. Remove any gym name label near the drops ring on the home screen
3. Keep the core drop count and progress ring intact

**Testing:**
- Verify home screen ring shows only drop count, no bonus suffix
- Verify no gym name label appears near the ring
- Verify numbers are still accurate

---

### Item 2: Improve My Stats screen (mobile-coder)

**What:** The stats screen (`app/stats.tsx`) needs UX improvements.

**Files:**
- `apps/mobile-app/app/stats.tsx` — main stats screen
- `apps/mobile-app/hooks/useMyStats.ts` — data hook
- `apps/mobile-app/components/StatsView.tsx` — reusable stats component (if used)

**Known issues from code audit:**
- `formatDate` in `stats.tsx` uses a **hardcoded English month abbreviation array** — not i18n-safe (related to Item #4)
- The screen uses `SliderTabs` for period selection (`today | week | month | all`)

**Changes (mobile-coder to define specifics, general direction):**
1. Replace hardcoded English months with `toLocaleDateString` using locale from `i18n.language`
2. Improve visual hierarchy — larger hero stat numbers, better card grouping
3. Ensure all cards follow the glassmorphism design system (`BlurView intensity={50}`, `branding.primary` accents)
4. Add machine breakdown visualization improvements (if present)
5. Ensure `bestStreak` display is prominent

**Design guidelines:**
- Follow established design system (see `CHANGELOG.md [2025-03-02]`)
- Use `useBranding()` for all colors
- Use `FadeInDown` staggered animations

**Testing:**
- Switch language to Serbian and verify months display correctly
- Test all 4 period tabs
- Verify data accuracy against Supabase

---

### Item 3: Improve Workouts / Workout History screen (mobile-coder)

**What:** The workout history screen (`app/workout-history.tsx`) needs: streak display for selected month, clickable dates in the calendar, day-specific data view, and improved history list. Keep the whole-month option.

**Files:**
- `apps/mobile-app/app/workout-history.tsx` — main screen with `SectionList` + calendar grid

**Changes:**
1. **Streak for selected month:** Calculate and display the longest streak within the currently viewed month. Use session dates from the loaded data (no new query needed — sessions are already fetched).
2. **Clickable calendar dates:** Make each day cell in the calendar grid a `Pressable`. When a date is tapped:
   - Highlight it as "selected" (use `branding.primary` background)
   - Filter the session list below to show only that day's workouts
   - Show a small summary for that day (total drops, session count, duration)
3. **"All month" toggle:** Add a clear option to deselect the day filter and show the full month again (e.g., tap the selected date again, or add an "All" pill above the list)
4. **History list improvements:**
   - Improve card design: add machine icon/type, drop count badge, duration
   - Follow glassmorphism design system
   - Better empty state for days with no workouts
5. **Fix date formatting** — use locale-aware formatting (see Item #4)

**Testing:**
- Tap a date → only that day's sessions shown
- Tap again → full month restored
- Navigate months → streak recalculates
- Verify Serbian date display

---

### Item 4: Fix Serbian Cyrillic date display on all screens (mobile-coder)

**What:** Dates display incorrectly (likely Latin script instead of Cyrillic, or English fallback) when the app language is Serbian.

**Files to audit and fix (all files using date formatting):**
- `apps/mobile-app/app/workout-history.tsx` — `toLocaleDateString` / `toLocaleTimeString` with `sr-RS`
- `apps/mobile-app/app/challenges.tsx` — `formatCompletedDate` uses `toLocaleDateString`
- `apps/mobile-app/app/stats.tsx` — **hardcoded English months** in `formatDate` — **must fix**
- `apps/mobile-app/app/redemptions.tsx` — date display
- `apps/mobile-app/app/leaderboard.tsx` — date display
- `apps/mobile-app/app/session-summary.tsx` — date/time display
- `apps/mobile-app/components/UserSettingsSheet.tsx` — date display
- Any other screen using `toLocaleDateString` or `toLocaleTimeString`

**Root cause:** React Native on Android/iOS uses different ICU data. `sr-RS` locale may not include Cyrillic month/day names on all platforms.

**Recommended fix (create a shared utility):**
1. Create `apps/mobile-app/lib/utils/formatDate.ts`:
   ```typescript
   import i18n from '@/lib/i18n';
   
   export function formatDate(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
     const d = typeof date === 'string' ? new Date(date) : date;
     const locale = i18n.language === 'sr' ? 'sr-Cyrl-RS' : 'en-US';
     return d.toLocaleDateString(locale, options);
   }
   
   export function formatTime(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
     const d = typeof date === 'string' ? new Date(date) : date;
     const locale = i18n.language === 'sr' ? 'sr-Cyrl-RS' : 'en-US';
     return d.toLocaleTimeString(locale, options);
   }
   ```
2. Replace all inline `toLocaleDateString('sr-RS'` / `'en-US'` calls across the app with this utility
3. Specifically fix `stats.tsx` `formatDate` which uses hardcoded English month names
4. Test that `sr-Cyrl-RS` produces Cyrillic output on both iOS and Android. If not, implement a manual Cyrillic month/day lookup table as fallback.

**Testing:**
- Set app language to Serbian
- Navigate every screen that shows dates
- Verify all months, days, times display in Cyrillic script
- Test on both iOS and Android (ICU differences)

---

### Item 5: Reward card on home screen improvement (mobile-coder)

**What:** The reward card in `StatsCards.tsx` needs: reward image, a title like "Next Award", better visual treatment.

**Files:**
- `apps/mobile-app/components/StatsCards.tsx` — the reward `PressableCard`
- `apps/mobile-app/hooks/useHomeStats.ts` — needs to return reward `image_url` in `closestReward`

**Changes:**
1. **Extend `useHomeStats`:** Add `image_url` to the `closestReward` query (the `rewards` table likely has an `image_url` column)
2. **Update `StatsCards.tsx` reward card:**
   - Add reward image thumbnail on the left (use `expo-image` with placeholder)
   - Add title text: "Next Award" (i18n key: `home.nextAward`)
   - Show reward name below the title
   - Show drops remaining with water icon
   - Add progress bar showing how close the user is (needs `reward.price_drops` and `user's local_drops_balance`)
3. Follow glassmorphism design system

**Testing:**
- Verify reward image loads (and fallback when no image)
- Verify "Next Award" title displays
- Verify drops-to-go is accurate
- Verify card navigates to store on press

---

### Item 6: Redemptions screen — filtering, lazy loading, tabs (mobile-coder)

**What:** The redemptions screen (`app/redemptions.tsx`) is a flat `ScrollView` with no filtering. Needs slide tabs (like leaderboard), filtering by status, and lazy loading.

**Reference implementation:** `app/leaderboard.tsx` uses `SliderTabs` + scope pills.

**Files:**
- `apps/mobile-app/app/redemptions.tsx` — main screen
- Reference: `apps/mobile-app/app/leaderboard.tsx` — tab pattern

**Changes:**
1. **Add `SliderTabs`** at the top with tabs: `All | Pending | Confirmed | Collected | Rejected`
   - Use `branding.primary` accent color (same as leaderboard)
   - Each tab filters `redemptions` by `status` field
2. **Convert `ScrollView` → `FlatList`** for lazy loading / virtualization
3. **Implement pagination:** Load 20 items at a time, `onEndReached` to load more
4. **Add pull-to-refresh:** `RefreshControl` with `branding.primary` tint
5. **Add gym filter** (optional): If user has memberships at multiple gyms, add a scope selector (gym pill row)
6. **Empty states** per tab: "No pending redemptions", etc.
7. Follow glassmorphism design system

**Testing:**
- Verify each tab filters correctly
- Scroll to bottom → more items load
- Pull to refresh works
- Empty state shown when no items match filter

---

### Item 7: Session summary "Close and Collect" button redesign (mobile-coder)

**What:** The session summary button should match the reward-detail bottom bar design: fixed position, BlurView backdrop, icon + text row, consistent sizing.

**Files:**
- `apps/mobile-app/app/session-summary.tsx` — current button (inside ScrollView, no blur, text-only)
- Reference: `apps/mobile-app/app/reward-detail.tsx` — bottom bar pattern

**Current state (session-summary):**
- `TouchableOpacity` inside `ScrollView` (scrolls with content)
- `padding: theme.spacing.lg`, `borderRadius: theme.borderRadius.xl`
- Text only, fontSize 20

**Target state (match reward-detail):**
- `View` with `position: 'absolute', bottom: 0, left: 0, right: 0`
- `BlurView intensity={80} tint="dark"` backdrop
- `paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md, paddingBottom: 36` (safe area)
- Button: `flexDirection: 'row'`, icon + text, `height: 54`, `borderRadius: 16`
- `fontStyles.heading`, fontSize 17, `letterSpacing: 0.3`
- Add a checkmark or gift icon (`Ionicons name="checkmark-circle"`)

**Changes:**
1. Move the button out of the `ScrollView` to a fixed bottom bar
2. Wrap in `BlurView` with matching styles from reward-detail
3. Change to row layout with icon + text
4. Adjust font size from 20 → 17 with letter spacing
5. Add `paddingBottom` for safe area (or use `useSafeAreaInsets`)
6. Add bottom padding to `ScrollView` content so it doesn't hide behind the bar

**Testing:**
- Button stays fixed at bottom while scrolling
- BlurView backdrop visible when content scrolls behind
- Visual match with reward-detail bottom bar
- Button still triggers correct navigation

---

### Item 8: Challenge bug — streak 7-day progress shows wrong count (supabase-dba + mobile-coder)

**What:** A streak challenge "7 days in a row" shows as completed (`is_completed = true`) but progress displays 2/7. After doing a workout today, it changed to 1/7.

**Root cause analysis:**

The `update_challenge_progress` function (migration `20260331000001_fix_days_visited_period_bounds.sql`) recomputes streak from session/checkin data on every call. The streak calculation uses an "islands and gaps" approach with `WHERE last_date = v_today`. This means:

- **After today's workout:** only counts the current active streak ending today → if user broke their streak, it correctly shows 1
- **Before today's workout:** `v_today` has no session, so `WHERE last_date = v_today` returns 0, but `current_streak_days` retains the old value from the last update

**The bug:** `is_completed` was set to `true` when the user hit 7, and `completed_at` was set. But `current_streak_days` keeps getting recalculated on every new workout, showing the *current* streak (not the streak at completion time). The UI reads `current_streak_days` for display.

#### Step 1: Database fix (supabase-dba)

**Option A (recommended): Freeze progress on completed challenges**

In `update_challenge_progress`, skip updating `current_value` / `current_streak_days` for challenges where `is_completed = true`:

```sql
-- At the top of the challenge loop, after fetching progress:
IF v_existing_completed THEN
  CONTINUE;  -- Don't recalculate already-completed challenges
END IF;
```

This preserves the progress values at the moment of completion.

**Migration:** `YYYYMMDDHHMMSS_freeze_completed_challenge_progress.sql`

**Also apply to:** `update_checkin_challenge_progress` (same pattern)

#### Step 2: Data repair (supabase-dba)

Run a one-time fix for any existing completed challenges with wrong progress:

```sql
UPDATE challenge_progress
SET current_value = (
  SELECT COALESCE(c.streak_days, c.target_drops)
  FROM gym_challenges c WHERE c.id = challenge_progress.challenge_id
),
current_streak_days = (
  SELECT COALESCE(c.streak_days, c.target_drops)
  FROM gym_challenges c WHERE c.id = challenge_progress.challenge_id
)
WHERE is_completed = true
  AND current_value < (
    SELECT COALESCE(c.streak_days, c.target_drops)
    FROM gym_challenges c WHERE c.id = challenge_progress.challenge_id
  );
```

#### Step 3: Mobile display (mobile-coder)

After DBA fix, verify that `challenge-detail.tsx` and `challenges.tsx` read `current_streak_days` (or `current_value`) correctly. No mobile code change should be needed if the DB values are correct.

**Testing:**
- Complete a streak challenge → progress shows X/X (full)
- Do another workout next day → progress still shows X/X (frozen)
- Start a new streak challenge → progress starts at 0/Y and increments correctly

---

### Item 9: Challenge completed date always shows today's date — bug (supabase-dba + mobile-coder)

**What:** In the completed challenges list, it says "Completed [today's date]" for all challenges, even ones completed days ago.

**Root cause analysis:**

In `challenges.tsx`, `completedOn` is rendered using:
```typescript
formatCompletedDate(userProgress?.updated_at || challenge.updated_at)
```

The problem: `updated_at` on `challenge_progress` is set to `NOW()` on **every** progress update (not just completion). So even after a challenge is completed, subsequent workouts keep bumping `updated_at`.

**The fix has two parts:**

#### Step 1: Mobile fix (mobile-coder)

Change the completed date source from `updated_at` to `completed_at`:

```typescript
// In challenges.tsx, completed challenges section:
// BEFORE:
formatCompletedDate(userProgress?.updated_at || challenge.updated_at)

// AFTER:
formatCompletedDate(userProgress?.completed_at || userProgress?.updated_at || challenge.updated_at)
```

Also ensure `completed_at` is included in the Supabase query for challenge progress.

#### Step 2: Verify DBA (supabase-dba)

Confirm that `completed_at` is set correctly in both:
- `update_challenge_progress` — yes, sets `completed_at = NOW()` when `is_completed` transitions to true
- `update_checkin_challenge_progress` — yes, same pattern

**Also verify:** the `CONTINUE` fix from Item #8 prevents `updated_at` from bumping on completed challenges (solves this issue at the source too).

**Testing:**
- Complete a challenge on Monday, check on Tuesday → shows Monday's date
- Do more workouts → date stays as Monday

---

### Item 10: Edit body data — step indicators use theme color instead of gym branding (mobile-coder)

**What:** The onboarding step dots (ProgressDots in `OnboardingStep.tsx`) and selected card borders in `step-gender.tsx` use `theme.colors.primary` (static SweatDrop cyan) instead of the user's home gym branding color.

**Files:**
- `apps/mobile-app/components/OnboardingStep.tsx` — `ProgressDots` uses `theme.colors.primary`
- `apps/mobile-app/app/(onboarding)/step-gender.tsx` — selected card uses `theme.colors.primary`
- `apps/mobile-app/app/(onboarding)/step-weight.tsx` — likely same
- `apps/mobile-app/app/(onboarding)/step-height.tsx` — likely same
- `apps/mobile-app/app/(onboarding)/step-birthday.tsx` — likely same
- `apps/mobile-app/app/(onboarding)/step-goal.tsx` — likely same

**Changes:**
1. In `OnboardingStep.tsx`, import `useBranding()` hook
2. Replace `theme.colors.primary` with `branding.primary` for:
   - Active/completed dot color in ProgressDots
   - Any accent colors
3. **Conditional logic:** When in edit mode (`edit=true` query param), the user has a home gym, so `useBranding()` will return gym colors. During initial onboarding (no gym yet), `useBranding()` returns the default fallback, which is fine.
4. Apply same fix to individual step screens (`step-gender.tsx`, etc.) for selected card borders/backgrounds

**Testing:**
- Set a gym with a non-default primary color (e.g., red)
- Go to Settings → tap Edit on gender/weight/height
- Verify step dots and selected states use the gym's branding color
- Verify initial onboarding (no gym) still uses the default accent color

---

### Item 11: Current streak bug — shows stale value, resets incorrectly (supabase-dba)

**What:** The global streak (`profiles.streak_days`) shows 2 even though the last workout was 2 days ago. After today's workout, it correctly resets to 1. This also affects streak challenges (showed 2/7, now 1/7).

**Root cause analysis:**

The streak in `profiles.streak_days` is only updated when `award_drops` or `perform_checkin` runs. Between workouts, the stale value persists. If a user skips a day:
- Day 1: workout → streak = 1, last_visit = Day1
- Day 2: workout → streak = 2, last_visit = Day2
- Day 3: no workout → streak still shows 2 (stale)
- Day 4: no workout → streak still shows 2 (stale)
- Day 5: workout → `award_drops` runs, sees gap (Day2 → Day5), resets to 1

**The display bug:** The mobile app reads `profiles.streak_days` and displays it as-is, even though the streak has logically broken (today - last_visit_date > 1 day).

#### Fix Option A: Client-side validation (mobile-coder) — Recommended, no migration needed

In `useHomeStats.ts` and anywhere else `streak_days` is displayed, add a check:

```typescript
const today = new Date();
today.setHours(0, 0, 0, 0);
const lastVisit = profile.last_visit_date ? new Date(profile.last_visit_date + 'T00:00:00') : null;

let displayStreak = profile.streak_days || 0;
if (lastVisit) {
  const diffDays = Math.floor((today.getTime() - lastVisit.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays > 1) {
    displayStreak = 0; // Streak is broken
  }
}
```

**Important:** Use Europe/Belgrade timezone for `today` to match the backend logic.

Apply this fix in:
- `apps/mobile-app/hooks/useHomeStats.ts`
- `apps/mobile-app/hooks/useMyStats.ts`
- `apps/mobile-app/components/QuickStatsRow.tsx` (or wherever streak is displayed)
- `apps/mobile-app/components/StatsCards.tsx`
- `apps/mobile-app/app/workout-history.tsx`

#### Fix Option B: Scheduled backend job (supabase-dba) — Optional, defense in depth

Create a cron job that runs daily at midnight (Belgrade time) to reset stale streaks:

```sql
UPDATE profiles
SET streak_days = 0
WHERE last_visit_date < CURRENT_DATE - INTERVAL '1 day'
  AND streak_days > 0;
```

This ensures the DB value is always correct, not just the display. Add to the existing cron job migration pattern.

**Recommendation:** Implement **both** fixes. Option A for immediate UI correctness, Option B for data integrity.

**Testing:**
- Skip 2 days of workouts → streak shows 0 (not stale value)
- Do a workout after gap → streak shows 1
- Do another workout next day → streak shows 2
- Challenge progress reflects correct streak after the Item #8 fix

---

## Summary: Agent Assignments

### supabase-dba (do first)
1. **Item #8:** Add `CONTINUE` guard for completed challenges in `update_challenge_progress` and `update_checkin_challenge_progress` + data repair migration
2. **Item #9:** Verify `completed_at` is set correctly (likely already fine after #8 fix)
3. **Item #11 (Option B):** Add cron job to reset stale streaks nightly

**Migration files to create:**
- `YYYYMMDDHHMMSS_freeze_completed_challenge_progress.sql`
- `YYYYMMDDHHMMSS_cron_reset_stale_streaks.sql` (optional)

### mobile-coder (after DBA fixes for #8/#9/#11)
1. **Item #1:** Remove bonus text and gym name from ring area
2. **Item #2:** Improve My Stats screen
3. **Item #3:** Improve Workout History with clickable dates and streak
4. **Item #4:** Create shared date formatting utility with Cyrillic support; replace all inline formatters
5. **Item #5:** Improve reward card on home screen
6. **Item #6:** Add tabs, filtering, lazy loading to redemptions screen
7. **Item #7:** Redesign session summary button to match reward-detail
8. **Item #9:** Use `completed_at` instead of `updated_at` for completed date
9. **Item #10:** Replace `theme.colors.primary` with `branding.primary` in onboarding steps
10. **Item #11 (Option A):** Add client-side streak validation using `last_visit_date`

---

## Estimated Effort

| Item | Agent | Effort |
|------|-------|--------|
| #1 Remove bonus/gym from ring | mobile-coder | Small (30 min) |
| #2 Improve My Stats | mobile-coder | Medium (2-3 hrs) |
| #3 Improve Workouts screen | mobile-coder | Large (3-4 hrs) |
| #4 Fix Serbian dates | mobile-coder | Medium (1-2 hrs) |
| #5 Reward card improvement | mobile-coder | Medium (1-2 hrs) |
| #6 Redemptions filtering/tabs | mobile-coder | Large (2-3 hrs) |
| #7 Session summary button | mobile-coder | Small (30 min) |
| #8 Challenge progress bug | supabase-dba + mobile verify | Medium (1 hr) |
| #9 Challenge completed date | mobile-coder + dba verify | Small (30 min) |
| #10 Onboarding step colors | mobile-coder | Small (30 min) |
| #11 Streak display bug | mobile-coder + optional dba | Small-Medium (1 hr) |

---

## Plan Review Checklist

- [x] All steps reference specific files/workspaces
- [x] Database changes assigned to supabase-dba
- [x] Mobile changes assigned to mobile-coder
- [x] Dependencies clearly listed (DBA before mobile for #8, #9, #11)
- [x] API contracts defined (streak validation logic, completed_at field)
- [x] Testing requirements specified per item
- [x] No admin-panel changes needed
- [x] All mobile code uses React Native patterns (View, Text, StyleSheet)
- [x] All styling follows glassmorphism design system
