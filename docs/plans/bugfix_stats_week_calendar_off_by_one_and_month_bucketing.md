# Bugfix: Stats Week Calendar Off-by-One Day + Month Activity Wrong Bucketing

## Context

**Reported:** The "This Week" chart on the Stats screen shows activity shifted +1 day (trained Thu/Fri/Sat → shows Fri/Sat/Sun). The "Month Activity" chart shows 10 drops in W1 and 51 in W2, but all 3 training sessions (Thu/Fri/Sat — days 8–10) fall within W2, so W2 should show 61 drops.

**Root Cause:** `useMyStats.ts` uses UTC date bucketing (`new Date(…).toISOString().slice(0,10)`) for the `activityChart` data, but the chart slot labels (Mon–Sun) are computed from `startOfWeek()` which uses local device time. Belgrade is UTC+2, so `startOfWeek()` returns a Date whose `.toISOString()` lands on the *previous* UTC calendar day. Result: every bar label is mapped to the UTC key one day earlier — drops earned Thursday UTC appear under the "Fri" bar.

The same UTC mismatch affects month chart bucketing: `d.getDate()` on a UTC-interpreted Date can assign a late-evening Belgrade workout to the previous UTC day, potentially shifting it into the wrong `Math.ceil(day/7)` week bucket.

**Proof the fix is correct:** The codebase already fixed the identical bug for `activeDateStrings` (line 304–309 in `useMyStats.ts`) by switching to `toBelgradeDayKey()`. The activity chart just wasn't updated at the same time.

## Dependencies

- [x] `toBelgradeDayKey()` already exists in `@/lib/streak/computeBestStreak`
- [x] `useMyStats.ts` already imports `toBelgradeDayKey`
- No database changes required
- No new dependencies required

## Execution Plan

### Step 1: Fix week activity chart bucketing (mobile-coder)

**File:** `apps/mobile-app/hooks/useMyStats.ts` — lines 384–400 (the `period === 'week'` chart block)

**Current (broken):**
```typescript
// Line 387: todayStr uses startOfToday() → local midnight → UTC ISO → wrong UTC date
const todayStr = startOfToday().toISOString().slice(0, 10);
const weekStart = startOfWeek();
const dayDropMap = new Map<string, number>();
for (const tx of txRows) {
  if (!tx.created_at) continue;
  const key = new Date(tx.created_at).toISOString().slice(0, 10); // ← UTC date!
  dayDropMap.set(key, (dayDropMap.get(key) ?? 0) + (tx.amount ?? 0));
}
activityChart = DAY_LABELS.map((label, i) => {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + i);
  const key = d.toISOString().slice(0, 10); // ← UTC date of a local-midnight Date → off by one
  return { day: label, drops: dayDropMap.get(key) ?? 0, isToday: key === todayStr };
});
```

**Fix:**
1. Bucket tx rows by Belgrade day key: `toBelgradeDayKey(tx.created_at)` instead of UTC ISO slice.
2. Compute chart slot keys using Belgrade day formatting:
   - Derive the Monday of the week in Belgrade local terms (YYYY-MM-DD string).
   - For each slot i=0..6, add i days to that Monday string and produce YYYY-MM-DD keys.
3. Compute `todayStr` via `toBelgradeDayKey(new Date().toISOString())`.

**Implementation sketch:**
```typescript
if (period === 'week') {
  const todayStr = toBelgradeDayKey(new Date().toISOString());

  // Build a YYYY-MM-DD key for Monday of the current week in Belgrade
  // (reuse startOfWeek() but derive the key from local formatting, not UTC)
  const weekStartDate = startOfWeek();
  const weekStartKey = toBelgradeDayKey(weekStartDate.toISOString());

  // Bucket drops by Belgrade day
  const dayDropMap = new Map<string, number>();
  for (const tx of txRows) {
    if (!tx.created_at) continue;
    const key = toBelgradeDayKey(tx.created_at);
    dayDropMap.set(key, (dayDropMap.get(key) ?? 0) + (tx.amount ?? 0));
  }

  // Generate 7 slot keys by incrementing date from weekStartKey
  activityChart = DAY_LABELS.map((label, i) => {
    const slotDate = new Date(weekStartKey + 'T12:00:00Z'); // noon avoids DST edge
    slotDate.setUTCDate(slotDate.getUTCDate() + i);
    const key = slotDate.toISOString().slice(0, 10); // pure calendar arithmetic
    return { day: label, drops: dayDropMap.get(key) ?? 0, isToday: key === todayStr };
  });
  activityChartActive = activityChart.filter((b) => b.drops > 0).length;
}
```

### Step 2: Fix month activity chart bucketing (mobile-coder)

**File:** `apps/mobile-app/hooks/useMyStats.ts` — lines 402–420 (the `period === 'month'` chart block)

**Current (broken):**
```typescript
const d = new Date(tx.created_at);
if (d.getFullYear() !== now.getFullYear() || d.getMonth() !== now.getMonth()) continue;
const weekNum = Math.ceil(d.getDate() / 7); // ← d.getDate() is UTC day-of-month
```

**Fix:** Parse `tx.created_at` into a Belgrade YYYY-MM-DD key, then extract the day-of-month from that string to determine the week bucket.

```typescript
} else if (period === 'month') {
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const totalWeeks = Math.ceil(daysInMonth / 7);
  const weekBuckets = new Map<number, number>();

  // Derive "current month" string prefix for Belgrade-TZ filtering
  const monthPrefix = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;

  for (const tx of txRows) {
    if (!tx.created_at) continue;
    const belgKey = toBelgradeDayKey(tx.created_at); // "YYYY-MM-DD"
    if (!belgKey.startsWith(monthPrefix)) continue;
    const dayOfMonth = parseInt(belgKey.slice(8, 10), 10);
    const weekNum = Math.ceil(dayOfMonth / 7);
    weekBuckets.set(weekNum, (weekBuckets.get(weekNum) ?? 0) + (tx.amount ?? 0));
  }

  const todayBelg = toBelgradeDayKey(new Date().toISOString());
  const todayDay = parseInt(todayBelg.slice(8, 10), 10);
  const todayWeekNum = Math.ceil(todayDay / 7);

  activityChart = [];
  for (let w = 1; w <= totalWeeks; w++) {
    activityChart.push({ day: `W${w}`, drops: weekBuckets.get(w) ?? 0, isToday: w === todayWeekNum });
  }
  activityChartActive = activityChart.filter((b) => b.drops > 0).length;
}
```

### Step 3: Fix "all" (monthly trend) chart bucketing (mobile-coder)

**File:** `apps/mobile-app/hooks/useMyStats.ts` — lines 422–438 (the `period === 'all'` chart block)

**Current (broken):** Same UTC date issue — `new Date(tx.created_at).getFullYear()` / `.getMonth()` are UTC-based.

**Fix:** Use `toBelgradeDayKey(tx.created_at)` to extract YYYY-MM for bucketing:
```typescript
const belgKey = toBelgradeDayKey(tx.created_at); // "YYYY-MM-DD"
const key = belgKey.slice(0, 7); // "YYYY-MM"
```

### Step 4: Fix `dateDropMap` used by weekDays legacy array (mobile-coder)

**File:** `apps/mobile-app/hooks/useMyStats.ts` — lines 344–359

The per-date map used for the `weekDays` array (backward compat) also uses UTC bucketing:
```typescript
const key = new Date(s.started_at).toISOString().slice(0, 10); // ← UTC
```

**Fix:** Switch to `toBelgradeDayKey(s.started_at)`.

### Step 5: Verify `toBelgradeDayKey` handles both ISO strings and Date objects (mobile-coder)

**File:** `apps/mobile-app/lib/streak/computeBestStreak.ts`

Verify the function signature accepts the formats used above. If it only accepts ISO strings, ensure callers pass ISO strings (not Date objects). No change needed if it already handles `string` input.

## Testing Requirements

1. **Manual QA** — Open My Stats → Week tab:
   - Train on a known day (e.g., Thursday) and verify the bar appears under "Thu" (not "Fri").
   - Train late evening (after 10 PM Belgrade time) — verify the bar appears under the correct Belgrade day, not the next day.
2. **Manual QA** — Open My Stats → Month tab:
   - Verify drops from day 8 appear in W2, not W1.
   - Verify the sum of all week bars equals the hero number.
3. **Regression** — Verify the `activeDays` count still uses Belgrade bucketing (it already does, no change needed there).
4. **Edge case** — DST transition day (last Sunday of March / October): verify no day is skipped or doubled in the week chart.

## Workspace Assignment

- **mobile-coder** — All 5 steps (all changes in `apps/mobile-app/hooks/useMyStats.ts`)
- **supabase-dba** — No changes needed
- **admin-coder** — No changes needed
