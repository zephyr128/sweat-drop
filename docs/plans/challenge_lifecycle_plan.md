# Challenge Lifecycle & Time Display — Comprehensive Plan

**Created:** 2026-03-11
**Status:** Ready for execution
**Related:** `docs/plans/bugs_and_features_plan.md` (B3)

---

## Problem Statement

All 7 challenge types display time remaining identically: `"{days}d {hours}h {minutes}m left"`. This produces absurd results:

- **Milestone challenges** show "3648d 11h 19m left" (10-year default end_date)
- **Daily challenges** show "0d 8h 30m left" then disappear the next day (end_date = today)
- **Weekly challenges** expire at end of week and vanish (end_date = Sunday)

Each challenge type has a fundamentally different lifecycle that requires different time display logic and different date defaults.

---

## Current State Analysis

### Date Defaults (set in `challenge-actions.ts` when admin creates)

| Type | start_date | end_date | Problem |
|------|-----------|----------|---------|
| daily | Today 00:00 | Today 23:59 | Challenge disappears next day. For recurring daily, admin must manually set far-future end_date. |
| weekly | Today 00:00 | Sunday 23:59 | Challenge disappears after this week. Same problem. |
| monthly | Today 00:00 | Last day of month | Reasonable for single-month, but no auto-recreation. |
| streak | Today 00:00 | Today + streakDays×2 | Reasonable as completion window. |
| checkin_streak | Today 00:00 | Today + streakDays×2 | Same as streak. |
| checkin_count | Today 00:00 | Last day of month | Same as monthly. |
| milestone | Today 00:00 | Today + 10 years | Causes "3648d" display. Should be permanent. |

### Time Display (same for all types)

```typescript
// challenges.tsx, challenge-detail.tsx, home.tsx
const getTimeRemaining = (endDate: string) => {
  const end = new Date(endDate + 'T23:59:59');
  const diff = end.getTime() - now.getTime();
  // Returns: "Xd Xh Xm left" for ALL types
};
```

### Reset Logic (cron jobs)

| Reset Function | Schedule | Targets |
|---------------|----------|---------|
| `reset_daily_challenges()` | Daily 23:00 UTC | `challenge_type = 'daily'` within date range |
| `reset_weekly_challenges()` | Sunday 23:00 UTC | `challenge_type = 'weekly'` within date range |
| (none) | — | monthly, streak, milestone have no resets |

### Admin Form

**No date inputs.** Admin cannot set `start_date` or `end_date`. Dates are auto-computed.

---

## Design: Challenge Lifecycle Model

### 7 Types, 3 Lifecycle Categories

**Category A: Recurring (daily, weekly)**
- Progress resets on a cycle (daily at midnight / weekly on Sunday)
- Challenge stays active for a long period (the "campaign window")
- Users can complete the challenge multiple times across cycles
- Time display: show when progress **resets**, not when campaign ends

**Category B: Period-based (monthly, checkin_count)**
- Has a meaningful deadline (end of month or custom)
- No automatic reset — one chance to complete within the period
- Time display: show **time remaining** until deadline

**Category C: Window-based (streak, checkin_streak)**
- User has a time window to achieve the streak
- No reset — either complete it or miss it
- Time display: show **time remaining** to complete

**Category D: Permanent (milestone)**
- No deadline — all-time achievement
- Never expires, never resets
- Time display: **none** — show "Ongoing" or "∞"

### Summary Table

| Type | Category | Time Display | end_date Default | Resets? |
|------|----------|-------------|-----------------|---------|
| daily | Recurring | "Resets in Xh Xm" (until midnight) | start + 1 year | Yes, daily |
| weekly | Recurring | "Resets in Xd Xh" (until Sunday) | start + 1 year | Yes, weekly |
| monthly | Period | "Xd left" | End of month | No |
| streak | Window | "Xd left to complete" | start + streakDays×2 | No |
| checkin_streak | Window | "Xd left to complete" | start + streakDays×2 | No |
| checkin_count | Period | "Xd left" | End of month | No |
| milestone | Permanent | "Ongoing" (no countdown) | NULL | No |

---

## Detailed Behavior Per Type

### DAILY Challenges

**Lifecycle:**
1. Admin creates daily challenge: "Earn 100 drops today" (reward: 20 drops)
2. Default dates: `start_date = today`, `end_date = today + 1 year`
3. Day 1: User earns 100 drops → completed → badge + reward. Progress stays for the day.
4. At midnight (23:00 UTC cron): `reset_daily_challenges()` resets progress to 0, `is_completed = false`
5. Day 2: Challenge appears fresh. User can earn again.
6. Repeats until `end_date` or admin deactivates.

**Time display:** "Resets in 6h 30m" (time until midnight local)
**After reset:** "Resets in 23h 55m"
**If completed today:** Show "✅ Completed · Resets in Xh"

### WEEKLY Challenges

**Lifecycle:**
1. Admin creates weekly challenge: "Earn 500 drops this week" (reward: 50 drops)
2. Default dates: `start_date = today`, `end_date = today + 1 year`
3. Week 1: User accumulates drops across the week. Completes when reaching target.
4. Sunday 23:00 UTC: `reset_weekly_challenges()` resets progress.
5. Week 2: Fresh start.

**Time display:** "Resets Sunday" or "Resets in 3d 8h" (time until Sunday midnight)
**If completed this week:** Show "✅ Completed · Resets Sunday"

### MONTHLY Challenges

**Lifecycle:**
1. Admin creates: "Earn 2000 drops this month"
2. Default dates: `start_date = today`, `end_date = last day of month`
3. User accumulates through the month. Single chance.
4. After end_date: challenge disappears from active list. No reset.
5. Admin can create a new monthly challenge for the next month.

**Time display:** "15d left" / "3d 8h left" (countdown to end_date)
**If completed:** Show "✅ Completed"

**Future enhancement:** Optional "auto-renew" flag that creates a new instance each month. Out of scope for now.

### STREAK Challenges

**Lifecycle:**
1. Admin creates: "Train 7 consecutive days" with `streak_days = 7`
2. Default dates: `start_date = today`, `end_date = today + 14 days` (streakDays × 2)
3. User must achieve 7 consecutive days within the 14-day window.
4. If streak breaks, it resets to 0 but user can try again if days remain.
5. After end_date: challenge disappears.

**Time display:** "8d left to complete" (countdown to end_date)
**If completed:** Show "✅ Completed"

### CHECKIN_STREAK Challenges

Same as STREAK but tracked via check-ins instead of workout sessions.

### CHECKIN_COUNT Challenges

**Lifecycle:**
1. Admin creates: "Check in 15 times this month"
2. Default dates: `start_date = today`, `end_date = last day of month`
3. Each check-in increments count. Completes when target reached.
4. After end_date: disappears.

**Time display:** "15d left" (countdown to end_date)
**If completed:** Show "✅ Completed"

### MILESTONE Challenges

**Lifecycle:**
1. Admin creates: "Earn 10,000 total drops at this gym"
2. Default dates: `start_date = today`, **`end_date = NULL`**
3. Challenge is ALWAYS active. No deadline.
4. Progress based on `gym_memberships.local_drops_balance` (all-time).
5. Once completed, badge awarded. Challenge shows as completed forever.

**Time display:** **No countdown. Show "Ongoing" / "∞" / "Bez roka"**
**If completed:** Show "✅ Completed"

---

## Execution Plan

### Phase 1: DBA Agent — Schema + Date Defaults

**Migration:** `20260312000004_challenge_lifecycle_fixes.sql`

#### 1a. Make `end_date` nullable for milestone challenges

```sql
-- Allow NULL end_date for milestones (permanent challenges)
ALTER TABLE public.gym_challenges
  ALTER COLUMN end_date DROP NOT NULL;

-- Update existing milestone challenges to NULL end_date
UPDATE public.gym_challenges
SET end_date = NULL
WHERE challenge_type = 'milestone';
```

#### 1b. Update the active challenges query (RPC or view)

Currently mobile filters with `.gte('end_date', today)`. With NULL end_dates, this will exclude milestones.

Create a helper view or update the mobile query logic to handle NULL:
```sql
-- Milestones with NULL end_date should always be included
-- Option: use COALESCE in queries
-- WHERE start_date <= today AND (end_date >= today OR end_date IS NULL)
```

This is a mobile-side query change, not a DB migration. But document it here for awareness.

#### 1c. Fix daily/weekly default end_dates for existing challenges

```sql
-- Fix daily challenges that expire same day (set to 1 year from start)
UPDATE public.gym_challenges
SET end_date = (start_date::date + INTERVAL '1 year')::date
WHERE challenge_type = 'daily'
  AND end_date <= start_date::date + INTERVAL '1 day';

-- Fix weekly challenges that expire same week (set to 1 year from start)
UPDATE public.gym_challenges
SET end_date = (start_date::date + INTERVAL '1 year')::date
WHERE challenge_type = 'weekly'
  AND end_date <= start_date::date + INTERVAL '7 days';
```

#### 1d. Update reset functions to handle recurring properly

Verify `reset_daily_challenges()` and `reset_weekly_challenges()`:
- They should reset `is_completed` to `false` (allow re-earning)
- They should reset `current_drops` / `current_value` to 0
- They should NOT reset `current_streak_days` (that's for streak type)
- Confirm they only target challenges within their date range

Read the current functions in `20260304200001_schedule_challenge_resets.sql` and verify correctness.

#### DBA Validation
```
□ end_date is nullable on gym_challenges
□ Existing milestones have end_date = NULL
□ Existing daily challenges have end_date = start + 1 year
□ Existing weekly challenges have end_date = start + 1 year
□ reset_daily_challenges() resets is_completed and current_drops
□ reset_weekly_challenges() resets is_completed and current_drops
□ Types regenerated
```

---

### Phase 2: Admin Agent — Fix Date Defaults + Add Date Inputs

**File:** `apps/admin-panel/lib/actions/challenge-actions.ts`

#### 2a. Fix default end_date computation

Replace the current date logic (lines 88-119) with:

```typescript
if (validated.endDate) {
  endDate = new Date(validated.endDate);
} else {
  switch (validated.challengeType) {
    case 'daily':
    case 'weekly':
      // Recurring: active for 1 year by default
      endDate = new Date(now);
      endDate.setFullYear(endDate.getFullYear() + 1);
      break;

    case 'monthly':
    case 'checkin_count':
      // Period: end of current month
      endDate = new Date(now);
      endDate.setMonth(endDate.getMonth() + 1);
      endDate.setDate(0);
      break;

    case 'streak':
    case 'checkin_streak':
      // Window: streakDays × 2
      endDate = new Date(now);
      const streakDays = validated.streakDays || 3;
      endDate.setDate(endDate.getDate() + streakDays * 2);
      break;

    case 'milestone':
      // Permanent: no end date
      endDate = null;
      break;

    default:
      endDate = new Date(now);
      endDate.setFullYear(endDate.getFullYear() + 1);
  }
}

if (endDate) {
  endDate.setHours(23, 59, 59, 999);
}
```

Handle `endDate = null` in the INSERT — pass `null` for milestone challenges.

#### 2b. Add optional date inputs to challenge form

**File:** `apps/admin-panel/components/modules/ChallengesManager.tsx`

Add collapsible "Advanced: Custom Dates" section below challenge type selection:

```tsx
<details className="mt-4">
  <summary className="text-sm text-gray-400 cursor-pointer">
    Custom date range (optional)
  </summary>
  <div className="flex gap-4 mt-2">
    <div>
      <label>Start Date</label>
      <input type="date" value={form.startDate} onChange={...} />
      <p className="text-xs text-gray-500">Default: today</p>
    </div>
    <div>
      <label>End Date</label>
      <input type="date" value={form.endDate} onChange={...}
             disabled={form.challengeType === 'milestone'} />
      <p className="text-xs text-gray-500">
        {form.challengeType === 'milestone'
          ? 'Milestone challenges have no end date'
          : form.challengeType === 'daily' || form.challengeType === 'weekly'
            ? `Default: 1 year (progress resets ${form.challengeType === 'daily' ? 'daily' : 'weekly'})`
            : 'Default: auto-calculated'}
      </p>
    </div>
  </div>
</details>
```

For milestone: show "∞ No end date" and disable the end_date input.

#### 2c. Show lifecycle info per challenge type

Add a small info banner that changes based on selected challenge type:

```typescript
const lifecycleInfo: Record<string, string> = {
  daily: 'Progress resets every day at midnight. Users can earn rewards repeatedly.',
  weekly: 'Progress resets every Sunday. Users can earn rewards each week.',
  monthly: 'One chance to complete within the month. Does not reset.',
  streak: 'User must achieve consecutive days within the time window.',
  checkin_streak: 'User must check in on consecutive days within the time window.',
  checkin_count: 'Count check-ins within the date range. Does not reset.',
  milestone: 'Permanent challenge. No deadline — users work toward it indefinitely.',
};
```

#### Admin Validation
```
□ Creating daily challenge → end_date = 1 year from now
□ Creating weekly challenge → end_date = 1 year from now
□ Creating milestone challenge → end_date = NULL in database
□ Custom dates section works for all types
□ Milestone type disables end_date input
□ Lifecycle info banner shows for each type
□ TypeScript: 0 errors
```

---

### Phase 3: Mobile Agent — Type-Aware Time Display

**Files:**
- `apps/mobile-app/app/challenges.tsx`
- `apps/mobile-app/app/challenge-detail.tsx`
- `apps/mobile-app/app/home.tsx`
- `apps/mobile-app/hooks/useChallengeProgress.ts`
- `apps/mobile-app/locales/sr/challenges.json`
- `apps/mobile-app/locales/en/challenges.json`

#### 3a. Fix query to include milestones with NULL end_date

**File:** `challenges.tsx` and `useChallengeProgress.ts`

Current query:
```typescript
.lte('start_date', today)
.gte('end_date', today)
```

This excludes milestones with `end_date = NULL`. Replace with:
```typescript
.lte('start_date', today)
.or(`end_date.gte.${today},end_date.is.null`)
```

Apply in both `challenges.tsx` (line 81) and `useChallengeProgress.ts` (line 72).

#### 3b. Create type-aware time display function

Replace the single `getTimeRemaining()` with a type-aware version:

```typescript
const getChallengeTimeDisplay = (
  challengeType: string,
  endDate: string | null,
  isCompleted: boolean
): { text: string; style: 'countdown' | 'recurring' | 'permanent' | 'completed' } | null => {

  if (isCompleted) {
    // Recurring types can show "completed + resets"
    if (challengeType === 'daily') {
      const resetTime = getTimeUntilMidnight();
      return { text: t('completedResetsIn', { time: resetTime }), style: 'completed' };
    }
    if (challengeType === 'weekly') {
      const resetTime = getTimeUntilSunday();
      return { text: t('completedResetsSunday', { time: resetTime }), style: 'completed' };
    }
    return { text: t('completed'), style: 'completed' };
  }

  // PERMANENT: milestone — no time display
  if (challengeType === 'milestone') {
    return { text: t('ongoing'), style: 'permanent' };
  }

  // No end_date
  if (!endDate) {
    return { text: t('ongoing'), style: 'permanent' };
  }

  const end = new Date(endDate + 'T23:59:59');
  const now = new Date();
  const diff = end.getTime() - now.getTime();

  if (diff <= 0) return { text: t('ended'), style: 'countdown' };

  // RECURRING: daily/weekly — show reset time, not end time
  if (challengeType === 'daily') {
    const resetTime = getTimeUntilMidnight();
    return { text: t('resetsIn', { time: resetTime }), style: 'recurring' };
  }
  if (challengeType === 'weekly') {
    const resetTime = getTimeUntilSunday();
    return { text: t('resetsIn', { time: resetTime }), style: 'recurring' };
  }

  // PERIOD / WINDOW: monthly, streak, checkin_* — standard countdown
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) return { text: t('timeLeft', { days, hours, minutes }), style: 'countdown' };
  if (hours > 0) return { text: t('hoursLeft', { hours, minutes }), style: 'countdown' };
  return { text: t('minutesLeft', { minutes }), style: 'countdown' };
};

// Helper: time until midnight (Europe/Belgrade)
const getTimeUntilMidnight = (): string => {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const diff = midnight.getTime() - now.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m`;
};

// Helper: time until next Sunday midnight
const getTimeUntilSunday = (): string => {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ...
  const daysUntilSunday = dayOfWeek === 0 ? 7 : 7 - dayOfWeek;
  const sunday = new Date(now);
  sunday.setDate(sunday.getDate() + daysUntilSunday);
  sunday.setHours(0, 0, 0, 0);
  const diff = sunday.getTime() - now.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h`;
};
```

#### 3c. Update time badge rendering

**In `challenges.tsx`, `challenge-detail.tsx`, and `home.tsx`:**

Replace the old time badge with the new type-aware one:

```tsx
const timeInfo = getChallengeTimeDisplay(
  challenge.challenge_type,
  challenge.end_date,
  challenge.is_completed
);

{timeInfo && (
  <View style={[
    styles.timeBadge,
    timeInfo.style === 'completed' && styles.timeBadgeCompleted,
    timeInfo.style === 'permanent' && styles.timeBadgePermanent,
    timeInfo.style === 'recurring' && styles.timeBadgeRecurring,
  ]}>
    <Ionicons
      name={
        timeInfo.style === 'completed' ? 'checkmark-circle' :
        timeInfo.style === 'permanent' ? 'infinite' :
        timeInfo.style === 'recurring' ? 'refresh' :
        'time-outline'
      }
      size={12}
      color={
        timeInfo.style === 'completed' ? '#4ade80' :
        timeInfo.style === 'permanent' ? theme.colors.textSecondary :
        theme.colors.textSecondary
      }
    />
    <Text style={[
      styles.timeRemaining,
      timeInfo.style === 'completed' && { color: '#4ade80' },
    ]}>
      {timeInfo.text}
    </Text>
  </View>
)}
```

#### 3d. Update i18n strings

**`locales/sr/challenges.json` — add:**
```json
{
  "ongoing": "Bez roka",
  "resetsIn": "Resetuje se za {{time}}",
  "completedResetsIn": "✅ Završeno · Ponovo za {{time}}",
  "completedResetsSunday": "✅ Završeno · Ponovo u nedelju ({{time}})",
  "completed": "✅ Završeno"
}
```

**`locales/en/challenges.json` — add:**
```json
{
  "ongoing": "Ongoing",
  "resetsIn": "Resets in {{time}}",
  "completedResetsIn": "✅ Done · Resets in {{time}}",
  "completedResetsSunday": "✅ Done · Resets Sunday ({{time}})",
  "completed": "✅ Completed"
}
```

**`locales/sr/home.json` and `locales/en/home.json`:**
Add the same keys under a `challenges` or relevant section if home uses its own namespace.

#### 3e. Update `useChallengeProgress` interface

Ensure `is_completed` is available for the time display logic. It already is in the interface — verify it's populated from `challenge_progress` data correctly.

#### Mobile Validation
```
□ Milestone challenge: shows "Bez roka" / "Ongoing" with ∞ icon, no countdown
□ Daily challenge (not completed): shows "Resetuje se za 6h 30m"
□ Daily challenge (completed): shows "✅ Završeno · Ponovo za 6h 30m"
□ Weekly challenge (not completed): shows "Resetuje se za 3d 8h"
□ Weekly challenge (completed): shows "✅ Završeno · Ponovo u nedelju"
□ Monthly challenge: shows "15d 8h 30m preostalo"
□ Streak challenge: shows "8d 6h preostalo"
□ Checkin challenges: same as their parent type
□ NULL end_date challenges still appear in list (query fix)
□ Home screen shows correct type-aware time badges
□ Challenge detail screen shows correct time
□ All strings localized in SR and EN
□ TypeScript: 0 errors
```

---

## Execution Order

```
1. DBA Agent  — Phase 1: Schema fix (nullable end_date, fix existing data, verify resets)
2. Admin Agent — Phase 2: Fix date defaults + add date inputs (after DBA)
3. Mobile Agent — Phase 3: Type-aware time display (after DBA, parallel with Admin)
```

Phase 2 and Phase 3 can run in parallel since they modify different workspaces. Both depend on Phase 1 (DBA) completing first because:
- Mobile needs to know end_date can be NULL
- Admin needs to know end_date can be NULL for milestone inserts

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Daily challenge, 11:59 PM | Shows "Resets in 1m" |
| Daily challenge, completed, 11:59 PM | Shows "✅ Done · Resets in 1m" |
| Weekly challenge, Sunday night | Shows "Resets in 2h" |
| Monthly challenge, last day | Shows "23h left" |
| Milestone challenge, 50% progress | Shows "Ongoing" (no countdown) |
| Milestone challenge, completed | Shows "✅ Completed" |
| Streak challenge, window expired | Not shown (filtered by end_date < today) |
| Challenge with NULL end_date, not milestone | Shows "Ongoing" (graceful fallback) |
| Admin sets custom end_date on daily | Countdown uses end_date but shows "Resets in" for daily cycle, "Active until {date}" as subtitle |

---

## Visual Summary

```
┌─────────────────────────────────────────┐
│ 🏋️ Daily: Earn 100 Drops          daily │
│ ██████░░░░ 60/100 drops                 │
│ 🔄 Resets in 6h 30m                     │  ← Recurring icon + reset time
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ 📅 Weekly: 500 Drops This Week   weekly │
│ ██████████ 500/500 drops                │
│ ✅ Done · Resets Sunday (3d 8h)         │  ← Completed + next reset
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ 📆 Monthly: 2000 Drops          monthly │
│ ████░░░░░░ 800/2000 drops               │
│ ⏱️ 15d 8h left                          │  ← Standard countdown
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ 🔥 7-Day Streak                  streak │
│ █████░░░░░ 5/7 days                     │
│ ⏱️ 8d left to complete                  │  ← Window countdown
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ 🏆 10,000 Drop Milestone     milestone  │
│ ███████░░░ 7200/10000 drops             │
│ ∞ Ongoing                               │  ← Permanent, no countdown
└─────────────────────────────────────────┘
```
