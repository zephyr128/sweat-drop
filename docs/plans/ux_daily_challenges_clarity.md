# UX Plan: Clarify "Done daily challenges live in Active tab" confusion

**Date:** 2026-04-17
**Severity:** 🟡 UX polish — no functional bug, but confusing enough that QA filed it as a bug
**Author:** Architect
**Assignee:** `mobile-coder` (primary), `mobile-ui-ux-agent` (step 3 polish)

---

## Context

### The "Bug" QA Reported

> Completed daily challenges do not go to Completed section but instead stay on Active section
> Device: Galaxy S25
> Expected: completed challenges appear in Completed tab
> Actual: completed challenges appear in Active tab

### Why the Behavior Is Actually Correct

Daily and weekly challenges **recur**. If we moved them to the Completed tab the instant they're done, the user would have to look in two places to see today's/this week's challenges, and the "return" of a daily challenge tomorrow would be invisible. The Active tab intentionally keeps recurring challenges visible so the user can see:
- what they still need to do this period, AND
- what they already crushed and will come back tomorrow / Sunday.

The current code (`apps/mobile-app/app/challenges.tsx:222–235`) already encodes this: daily/weekly completed stay in `activeChallenges`; only milestone/monthly/streak/checkin once completed move to `completedChallenges`.

### Why QA (and Users) Still File This as a Bug

Two UX signals are misaligned with reality:

1. **Tab labels describe a status, not content.** "Active" reads as "things I still have to do". "Completed" reads as "things I finished". When a user finishes a daily, their mental model says it should move. It doesn't, and there's no visible explanation why.
2. **Done-state differentiation on the Active card is too subtle.** The only changes today are: green progress fill, faint green gradient, and a small time-pill "Done · Resets in 5h 22m". On a crowded list, the user scans past it.

Result: the user feels the app is bugged (QA response), **or** worse — they don't realize they already completed today's daily and try to do it again, souring the reward loop.

---

## Dependencies

- [x] No backend changes required. The RPC `get_my_challenges` already returns `is_completed` and `completed_at` per challenge — everything is client-side.
- [x] No database migrations.
- [x] No type regeneration.
- [ ] Confirm with design stakeholder that renaming the tabs is acceptable copy-wise (fallback in Step 1 if not).

---

## Execution Plan

### Step 1 — Rename the tabs so names describe CONTENT, not STATUS

**File:** `apps/mobile-app/app/challenges.tsx`
**Locales:** `apps/mobile-app/locales/en/challenges.json`, `apps/mobile-app/locales/sr/challenges.json`

#### Preferred labels

| Current | New (EN) | New (SR) |
| --- | --- | --- |
| `tabActive` = "Active" | "Today" | "Danas" |
| `tabCompleted` = "Completed" | "Milestones" | "Trofeji" |

Rationale:
- "Today" makes it obvious that daily-done cards belong there (they are *today's challenges*, done or not). Weekly-done cards also fit conceptually under "this period".
- "Milestones" / "Trofeji" accurately describes the other tab's actual content — only permanent achievements (milestone, monthly, streak, checkin_streak, checkin_count) ever land there. It also kills the "I completed it, where did it go?" reflex.

#### Fallback labels (if stakeholder rejects "Today")

| Current | Fallback (EN) | Fallback (SR) |
| --- | --- | --- |
| `tabActive` | "Ongoing" | "Trenutni" |
| `tabCompleted` | "Earned" | "Osvojeno" |

Use one pair consistently. Do **not** mix (e.g. "Today" + "Earned").

#### Changes

1. Update `tabActive` and `tabCompleted` in both locale files (EN + SR) — keys stay the same, values change.
2. Also update `active` / `completed` string values used in legacy headings (if any consumers remain) for consistency.
3. No source code change needed in `challenges.tsx` — it already reads `t('tabActive')` / `t('tabCompleted')` on lines 519–520.

#### Empty-state copy update (same files)

| Key | Old | New (EN) | New (SR) |
| --- | --- | --- | --- |
| `noActive` | "No active challenges" | "Nothing for today" | "Ništa za danas" |
| `noCompleted` | "No completed challenges yet" | "No milestones earned yet" | "Još nema osvojenih trofeja" |

**Testing:** Open Challenges screen in both EN and SR → tabs say "Today"/"Milestones" and "Danas"/"Trofeji". Existing navigation by `params.tab = 'active' | 'completed'` continues to work (we are renaming the LABEL, not the key).

---

### Step 2 — Split the "Today" tab into two explicit sections: **TO DO** and **DONE FOR TODAY**

**File:** `apps/mobile-app/app/challenges.tsx`

This is the single biggest ROI change. Physical separation of the two groups removes the need for the user to decode card states.

#### 2a. Replace the `activeChallenges` memo with a grouped structure

Current:
```typescript
const activeChallenges = useMemo(() =>
  challenges.filter((c) => {
    const isCompleted = progress[c.id]?.is_completed || false;
    if (!isCompleted) return true;
    return c.challenge_type === 'daily' || c.challenge_type === 'weekly';
  }),
[challenges, progress]);
```

New: build two disjoint arrays in a single memo so the render pass has them ready:

```typescript
const { pendingChallenges, doneRecurringChallenges } = useMemo(() => {
  const pending: Challenge[] = [];
  const done: Challenge[] = [];
  for (const c of challenges) {
    const isCompleted = progress[c.id]?.is_completed || false;
    if (!isCompleted) {
      pending.push(c);
    } else if (c.challenge_type === 'daily' || c.challenge_type === 'weekly') {
      done.push(c);
    }
    // milestone/monthly/streak completed → goes to completedChallenges memo (unchanged)
  }
  return { pendingChallenges: pending, doneRecurringChallenges: done };
}, [challenges, progress]);
```

Sort `done` by `completed_at` descending so the most recently completed shows first. Leave `pending` in whatever order the RPC returned (back-end already has a sensible order).

#### 2b. Render two sections inside `activePage`

Structure:

```tsx
<ScrollView ...>
  {pendingChallenges.length === 0 && doneRecurringChallenges.length === 0 ? (
    <EmptyState icon="flash-outline" text={t('noActive')} subtext={t('checkBackSoon')} />
  ) : (
    <>
      {/* TO DO section */}
      {pendingChallenges.length > 0 && (
        <>
          <SectionHeader
            label={t('sectionToDo')}
            count={pendingChallenges.length}
            tone="default"
          />
          {pendingChallenges.map(...)}
        </>
      )}

      {/* DONE TODAY section */}
      {doneRecurringChallenges.length > 0 && (
        <>
          <SectionHeader
            label={t('sectionDoneForToday')}
            count={doneRecurringChallenges.length}
            icon="checkmark-circle"
            tone="success"
          />
          {doneRecurringChallenges.map(...)}
        </>
      )}

      {/* Celebration state: nothing to do, something done */}
      {pendingChallenges.length === 0 && doneRecurringChallenges.length > 0 && (
        <AllDoneBanner />
      )}
    </>
  )}
</ScrollView>
```

#### 2c. New `SectionHeader` component (inline, do NOT create a new file unless reused)

- Full-width row with `marginTop: 20, marginBottom: 10`
- Left: uppercase label (`fontStyles.heading`, fontSize 12, letterSpacing 1.5), color depends on `tone`:
  - `default` → `theme.colors.textSecondary`
  - `success` → `#4ade80`
- Left of label: optional `Ionicons` (success tone uses `checkmark-circle` at size 14)
- Right: count pill (`{count}`) at `color: textTertiary`, fontSize 11
- Thin divider line below (1px, `rgba(255,255,255,0.06)`)

#### 2d. Visual hierarchy between sections

- TO DO cards: unchanged from today (`activeCard` style).
- DONE FOR TODAY cards: apply `style={{ opacity: 0.72 }}` to the outer TouchableOpacity AND use the "Done" visual treatment from Step 3 below.

This two-level de-emphasis (opacity + stronger done badge) makes it impossible to mistake a done card for an active one.

#### 2e. `AllDoneBanner` (small helper, shown only when pending=0 && done>0)

Single congratulatory card at the top of the TO DO section slot (where empty would be). Copy:
- EN: "All daily challenges done for today. See you tomorrow!"
- SR: "Sve dnevne izazove si završio za danas. Vidimo se sutra!"
- Icon: `flame` in primary brand color
- Background: glass card with subtle green glow (`rgba(74,222,128,0.08)` overlay)

#### New locale keys to add

```json
{
  "sectionToDo": "To do today",
  "sectionDoneForToday": "Done for today",
  "allDoneTitle": "All done for today",
  "allDoneSubtitle": "See you tomorrow for fresh challenges!"
}
```

SR:
```json
{
  "sectionToDo": "Za danas",
  "sectionDoneForToday": "Završeno danas",
  "allDoneTitle": "Sve gotovo za danas",
  "allDoneSubtitle": "Vidimo se sutra sa novim izazovima!"
}
```

(For weekly challenges in the done section, reuse the same header — "Done for today" covers both daily and weekly in user-speak. The time-pill on the card itself already says "Resets Sunday" vs "Resets in 5h".)

**Testing:**
- User with 3 daily challenges completes 2 → Today tab shows "TO DO TODAY · 1" with one card, then "DONE FOR TODAY · 2" with two dimmed cards.
- User completes the last one → "All done for today" banner appears at the top of the TO DO slot, DONE section shows all 3.
- User has 0 daily/weekly → old empty state still shows.
- Pull-to-refresh still works (single `refreshControl` shared by both sections).

---

### Step 3 — Make the "done" card unmistakably done (visual polish)

**File:** `apps/mobile-app/app/challenges.tsx`
**Assignee:** `mobile-ui-ux-agent` after Step 2 lands

Current "done" signal is: green progress fill + tiny time-pill with checkmark. On a 3.2" thumb-reach card, scan-time differentiation is ~0.5s. We want <100ms.

#### 3a. Add a diagonal "DONE" ribbon to the card's top-right corner

- Position: `absolute`, top-right of the card, overlapping the `badgeImage` area
- Dimensions: ~90px wide, 22px tall, rotated 45°
- Background: solid `#22c55e`, shadow `rgba(74,222,128,0.4)` radius 8
- Text: "DONE" / "URAĐENO", `fontStyles.heading`, fontSize 10, letterSpacing 2, color `#000`
- Only rendered when `isCompleted === true`
- On iOS, clip with `borderRadius` on the parent card; on Android `overflow: 'hidden'` works the same way — both are already in use.

#### 3b. Replace the thin progress bar with a "DONE" banner when completed

Today:
```
████████████████████  100% ✓
```

When done, swap `progressTrack` / `progressFill` / `progressMetaRow` for a single full-width success strip:

```
┌───────────────────────────────┐
│  ✓ 500 / 500 drops     DONE   │
└───────────────────────────────┘
```

- Height: 34px
- Background: `rgba(74,222,128,0.14)` with `borderWidth: 1, borderColor: 'rgba(74,222,128,0.35)'`
- Left: checkmark icon + `{current} / {target} {unit}` in `#4ade80`
- Right: uppercase "DONE" label (optional if Step 3a ribbon is in — reduce redundancy)

Keep the incomplete progress bar exactly as-is. Only completed cards get this treatment.

#### 3c. Time pill gets stronger styling for recurring-done state

Current:
```
✓ Done · Resets in 5h 22m
```

New:
- `backgroundColor: 'rgba(74,222,128,0.16)'`
- `borderWidth: 1, borderColor: 'rgba(74,222,128,0.35)'`
- `color: '#4ade80'` (currently also green but pill itself looks dim)
- Icon: keep `refresh` (rotates on render if Reanimated is already set up — optional)
- Text: drop the "Done · " prefix (redundant with the ribbon) and just show "Resets in 5h 22m"
  - Update `completedResetsIn` value: EN "Resets in {{time}}", SR "Ponovo za {{time}}"
  - Update `completedResetsSunday`: EN "Resets Sunday ({{time}})", SR "Ponovo u nedelju ({{time}})"

#### 3d. "Come back tomorrow" hint (optional, if card real estate allows)

Under the time-pill row, add one line of tertiary text:
- Daily: "Come back tomorrow for +{{drops}} more"
- Weekly: "Resets Sunday at 00:00"

Keep it visible only when the card is completed, `color: textTertiary`, fontSize 11, italic optional.

New locale keys:
```json
{
  "comeBackTomorrow": "Come back tomorrow for +{{drops}} more",
  "resetsSundayExplicit": "Resets Sunday at 00:00",
  "doneRibbon": "DONE"
}
```

SR:
```json
{
  "comeBackTomorrow": "Vrati se sutra za +{{drops}} još",
  "resetsSundayExplicit": "Resetuje se u nedelju u 00:00",
  "doneRibbon": "GOTOVO"
}
```

**Testing:**
- Complete one daily → ribbon appears, progress bar becomes success strip, time pill is clearly green.
- Screenshot comparison: before vs after on real device — distinguishing a done card from a pending card at arm's length must be obvious.
- Verify ribbon does not overflow on narrow phones (iPhone SE 1st gen, Galaxy A51).

---

### Step 4 — First-time tooltip (OPTIONAL, ship only if product wants it)

**File:** `apps/mobile-app/app/challenges.tsx`

Dismissable info banner at the top of the Today tab, shown only on first visit.

- Copy (EN): "💡 Daily and weekly challenges reset each period. Completed ones stay here so you see when they return."
- Copy (SR): "💡 Dnevni i nedeljni izazovi se resetuju. Završeni ostaju ovde tako da vidiš kad se vraćaju."
- Persistence: `AsyncStorage` key `challenges_ftue_seen_v1` = `'true'` after dismissal or after 10s dwell.
- Style: glass card matching design system, close (X) on the right, `FadeInDown` entrance.
- Show only in Today tab, never in Milestones tab.
- NOT shown if `pendingChallenges.length + doneRecurringChallenges.length === 0` (don't teach an empty state).

Skip this step if the product owner considers it noise. The value of Steps 1–3 is already substantial without it.

---

## Workspace Assignment

| Step | Workspace | Agent |
| --- | --- | --- |
| 1 (rename) | `apps/mobile-app/locales/` | `mobile-coder` |
| 2 (sections) | `apps/mobile-app/app/challenges.tsx` + locales | `mobile-coder` |
| 3 (done polish) | `apps/mobile-app/app/challenges.tsx` + locales | `mobile-ui-ux-agent` |
| 4 (FTUE, optional) | `apps/mobile-app/app/challenges.tsx` + locales | `mobile-coder` |

**Do not touch:** `apps/admin-panel/`, `backend/supabase/`. No migrations, no Edge Functions, no admin UI.

---

## Data Model Changes

**None.** All fields (`is_completed`, `completed_at`, `challenge_type`, `reward_drops`) already exist in the `get_my_challenges` RPC response and are consumed in `challenges.tsx`.

---

## API Contracts

**Unchanged.** `supabase.rpc('get_my_challenges', { p_gym_id: gymId })` continues to return the same shape.

---

## Testing Requirements

### Functional regression

- [ ] Completing a daily still awards drops and does not remove the card from the Today tab (grouping moves it into DONE section, does not delete).
- [ ] Completing a milestone still moves the card to the Milestones tab (Step 1 renames label but the keys `active` / `completed` used by `params.tab` navigation remain).
- [ ] Pull-to-refresh works in both tabs.
- [ ] Deep linking via `challenges?tab=completed` still opens the (renamed) Milestones tab.
- [ ] `FadeInDown` animation delays remain sensible with section headers inserted (cards should still stagger, section headers should not animate multiple times per re-render).

### UX acceptance

- [ ] QA-scenario reproduction: complete a daily on Galaxy S25 → Today tab explicitly shows it under "DONE FOR TODAY · 1" with ribbon + green strip. QA cannot mistake it for an active challenge.
- [ ] Complete all dailies → "All done for today" banner renders above DONE section.
- [ ] Milestones tab renamed correctly; no user ever sees "Completed" as a tab label again.
- [ ] Localization parity: EN and SR both have all new keys present, no fallback English text leaks into SR UI.

### Visual/Platform

- [ ] Tested on Galaxy S25 (reporter device), iPhone 14, iPhone SE (narrow), Pixel 6.
- [ ] Dark mode only — app is dark by design.
- [ ] Ribbon does not clip or overflow on any tested device.
- [ ] `opacity: 0.72` on done cards remains legible on pure-black background.

### Automated

- None required, but add a minimal snapshot test for `SectionHeader` if a testing harness exists.

---

## Rollout Strategy

Ship all steps in a single PR (it's one screen, one area) OR split as:

1. **Step 1 alone** — 10-minute hotfix, immediate reduction in user confusion. Can be cherry-picked into an OTA update without a native build.
2. **Step 2 + 3** — primary improvement, ship together since they reference each other visually.
3. **Step 4** — optional follow-up.

All three are JS-only (no native changes), so ship via EAS Update / OTA.

---

## Out of Scope

- Re-designing the Milestones tab itself (cards there are already fine).
- Changing the challenge-detail screen (unaffected).
- Adding filter chips (All / Daily / Weekly / Streak) — worth considering later, not needed to solve the current confusion.
- Copy changes on admin panel for challenge management.

---

## Plan Review Checklist

- [x] All steps reference specific files/workspaces
- [x] No DB changes — N/A
- [x] Mobile changes assigned to `mobile-coder` + `mobile-ui-ux-agent`
- [x] Dependencies listed
- [x] API contracts unchanged, noted
- [x] Testing requirements specified (functional + UX + visual + localization)
- [x] Localization keys explicitly enumerated for both EN and SR
- [x] Rollout allows for an incremental path (Step 1 hotfix standalone)
