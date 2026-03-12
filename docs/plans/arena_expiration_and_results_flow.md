# Arena Expiration & Results Flow — Comprehensive Plan

## Context

When an arena's `end_date` passes, the system needs to:
1. Finalize the arena (compute rankings, create prize redemptions)
2. Notify winners and all participants
3. Show completed arena results in the mobile app
4. Give admins tools to view results, contact winners, and re-notify

### Current State (What Already Works)

| Component | Status |
|-----------|--------|
| `finalize_arena()` RPC | ✅ Ranks participants, creates `arena_results`, creates `redemptions` with `source_type = 'arena_prize'` |
| `finalize-arena` Edge Function | ✅ Finds ended arenas, calls RPC, attempts push notifications |
| Cron job `finalize-arena-check` | ✅ Runs daily at 00:30 UTC |
| Admin Results tab | ✅ Shows final rank, user, gym, score, prize, redemption code, status |
| Admin Finalize button | ✅ Manual trigger for finalization |
| Mobile Redemptions screen | ✅ Shows `arena_prize` redemptions |

### Critical Gaps Found

| # | Gap | Impact |
|---|-----|--------|
| 1 | **BUG**: `finalize-arena` Edge Function filters winners by `status = 'claimed'`, but new arena redemptions are `pending` | Winners are NEVER notified via push |
| 2 | `get_available_arenas()` filters out ended arenas (`end_date >= CURRENT_DATE`) | Users never see completed arenas in the app |
| 3 | No `arena_prize` deep link in `notifications.ts` | Push notification tap goes to `/home` instead of arena results |
| 4 | No "Completed Arenas" section in mobile app | After an arena ends, it silently disappears |
| 5 | No dedicated arena results view for users | Users only see prizes buried in Redemptions screen |
| 6 | No "Notify Winners" or "Notify All" button in admin | Admin can't re-send notifications after finalization |
| 7 | No winner contact info in admin results | Admin has no email/phone to contact winners externally |
| 8 | `PUSH_NOTIFICATIONS_ENABLED = false` in mobile app | All push is disabled globally (separate issue, not blocking architecture) |

---

## Complete Arena Lifecycle (Target State)

```
Arena Created → Upcoming → Active → End Date Passes → Cron Finalizes → Results Visible
                                                            │
                                                            ├─ Push to all participants (rank + results)
                                                            ├─ Push to winners (prize won!)
                                                            ├─ Mobile: "Completed" section appears
                                                            ├─ Mobile: Arena detail shows results tab
                                                            └─ Admin: Results tab + contact info + notify button
```

### Post-Expiration Flow (Detailed)

**00:30 UTC (day after end_date):**
1. Cron triggers `finalize-arena` Edge Function
2. Edge Function finds arenas where `end_date < CURRENT_DATE` AND `is_finalized = false`
3. For each arena, calls `finalize_arena()` RPC:
   - Ranks all participants by `current_score` DESC
   - Creates `arena_results` entries with `final_rank`, `final_score`, `prize_description`
   - For prize winners: creates `redemptions` entry with `source_type = 'arena_prize'`, `status = 'pending'`
   - Links `arena_results.redemption_id` to the redemption
   - Sets `is_finalized = true`, `finalized_at = NOW()`
4. Edge Function sends push notifications:
   - **Winners** (those with prizes): "🏆 You won a prize in {arena_name}!"
   - **All participants**: "Arena {arena_name} has ended. Check your final ranking!"
5. Notification taps navigate to `/arena/{id}` (arena detail with results)

**User Opens App:**
1. Arenas screen shows three sections: **Upcoming** → **Active** → **Completed**
2. Completed arenas show final rank badge, "ENDED" label, and "View Results" CTA
3. Arena detail screen shows results tab with:
   - User's final rank and score
   - Full leaderboard (final standings)
   - Prize won (if any) with redemption code
   - Link to Redemptions for prize claim

**Admin Panel:**
1. Results tab already shows rankings + redemption codes (✅ exists)
2. NEW: Winner contact info (email from profiles)
3. NEW: "Notify Winners" button to re-send push notifications
4. NEW: "Notify All Participants" button

---

## Execution Plan

### Step 1: Supabase — Fix `finalize-arena` Bug + Notifications (supabase-dba)

**File:** `backend/supabase/functions/finalize-arena/index.ts`

**1a. Fix winner notification bug (CRITICAL)**

Change the redemptions query filter from:
```typescript
.eq('status', 'claimed')  // ❌ BUG: new redemptions are 'pending'
```
to:
```typescript
.eq('status', 'pending')  // ✅ FIX: match actual status after finalization
```

**1b. Add notifications for ALL participants (not just winners)**

After notifying winners, also fetch all participants and send a "results available" push:
```typescript
// Fetch ALL participants' push tokens (not just winners)
const { data: allParticipants } = await supabase
  .from('arena_participants')
  .select('user_id, profiles!inner(expo_push_token)')
  .eq('arena_id', arena.id)
  .not('profiles.expo_push_token', 'is', null);

// Send "results available" notification to non-winners
const nonWinnerTokens = allParticipants
  .filter(p => !winnerUserIds.includes(p.user_id))
  .map(p => p.profiles?.expo_push_token)
  .filter(t => t?.startsWith('ExponentPushToken'));

// Push: "Arena ended — check your ranking!"
// data: { type: 'arena_ended', arena_id, arena_name }
```

**1c. Add `notify_arena_participants` RPC for admin re-notify**

Create a new database function or edge function that admins can trigger to re-send push notifications for a finalized arena. This is called from the admin "Notify" buttons.

---

### Step 2: Supabase — Update `get_available_arenas()` to Include Completed (supabase-dba)

**File:** New migration `YYYYMMDDHHMMSS_arena_completed_visibility.sql`

Update `get_available_arenas()` to also return finalized arenas from the last 30 days:

```sql
-- Current WHERE clause:
WHERE sa.end_date >= CURRENT_DATE AND sa.is_active = true

-- New WHERE clause:
WHERE sa.is_active = true
  AND (
    sa.end_date >= CURRENT_DATE                           -- upcoming + active
    OR (sa.is_finalized = true AND sa.end_date >= CURRENT_DATE - INTERVAL '30 days')  -- completed (last 30 days)
  )
```

Update `arena_status` CASE expression to properly return `'ended'` for finalized arenas.

Ensure `arena_status` in the result set includes:
- `'upcoming'` — `start_date > CURRENT_DATE`
- `'active'` — `start_date <= CURRENT_DATE AND end_date >= CURRENT_DATE`
- `'ended'` — `is_finalized = true AND end_date < CURRENT_DATE`

---

### Step 3: Supabase — Create `get_user_arena_result()` RPC (supabase-dba)

**File:** Same migration or new migration

New RPC for the mobile app arena detail screen (results tab for a specific user):

```sql
CREATE OR REPLACE FUNCTION get_user_arena_result(p_arena_id UUID, p_user_id UUID)
RETURNS TABLE (
  final_rank INTEGER,
  final_score NUMERIC,
  total_participants BIGINT,
  prize_description TEXT,
  redemption_code TEXT,
  redemption_status TEXT,
  top_participants JSONB  -- top 10 with rank, username, avatar, score, gym
)
```

This provides everything the mobile arena results view needs in one call.

---

### Step 4: Mobile App — Add `arena_prize` and `arena_ended` Deep Links (mobile-coder)

**File:** `apps/mobile-app/lib/notifications.ts`

Add cases to `getDeepLinkFromNotification()`:

```typescript
case 'arena_prize':
  if (data.arena_id) {
    return `/arena/${data.arena_id}`;
  }
  return '/redemptions';

case 'arena_ended':
  if (data.arena_id) {
    return `/arena/${data.arena_id}`;
  }
  return '/arenas';
```

Also add `'arena_prize' | 'arena_ended'` to the `NotificationTrigger` type.

---

### Step 5: Mobile App — Add "Completed" Section to Arenas Screen (mobile-coder)

**File:** `apps/mobile-app/app/arenas.tsx`

Add a third section below "Active Now":

```
🔜 Coming Soon      (upcoming arenas with pulsing border)
⚡ Active Now        (active arenas)
🏁 Completed         (finalized arenas from last 30 days)
```

Completed arena cards show:
- Dimmed/greyed styling (lower opacity or desaturated colors)
- "ENDED" badge (top-right, replacing opt-in badge)
- User's final rank (if participated): "#3 of 47"
- "View Results" CTA instead of "Join Arena"
- Prizes with winner indicators (🏆 next to won prize)

Update `useAvailableArenas` hook — filter arenas into three groups:
```typescript
const completedArenas = useMemo(() => arenas.filter(a => a.arena_status === 'ended'), [arenas]);
```

---

### Step 6: Mobile App — Arena Detail Results View (mobile-coder)

**File:** `apps/mobile-app/app/arena/[id]/index.tsx`

When the arena is finalized (`is_finalized === true`), the arena detail screen transforms:

**Header area:**
- "ARENA ENDED" banner with finalized date
- User's final rank prominently displayed: "#3 of 47 participants"
- User's final score

**Prizes section** (enhanced):
- Each prize shows winner username (if public)
- User's won prize highlighted with glow effect
- Redemption code displayed with copy button (if user won)
- "Show in Redemptions" link

**Leaderboard** (final standings):
- Frozen final rankings (from `arena_results`)
- User's row highlighted
- Top 3 podium with medals

**Data fetching:**
- Call `get_user_arena_result()` RPC for user-specific data
- Call `get_arena_results()` for full leaderboard

---

### Step 7: Admin Panel — Winner Contact Info + Notify Buttons (admin-coder)

**File:** `apps/admin-panel/components/modules/ArenaDetail.tsx`

**7a. Add winner contact info to Results tab**

In the results table, add columns:
- Email (from `profiles.email` via `auth.users`)
- Phone (from `profiles.phone` if exists)

Update `getArenaResults` action to join with profiles for contact info.

**7b. Add "Notify Winners" button**

Above the results table (for finalized arenas):
- "📢 Notify Winners" — re-sends push to users with prizes
- "📢 Notify All Participants" — re-sends results-available push to everyone
- Both call a new server action that invokes the `finalize-arena` edge function (or a dedicated `notify-arena` edge function)
- Show toast: "Notifications sent to X participants"

**7c. Add "Copy Emails" button**

Quick action to copy all winner emails to clipboard (for external contact via email):
- "📋 Copy Winner Emails" — copies comma-separated winner emails

---

### Step 8: Locale Updates (mobile-coder)

**Files:** `apps/mobile-app/locales/en/arena.json`, `apps/mobile-app/locales/sr/arena.json`

New keys:
```json
{
  "completed": "Completed",
  "completedArenas": "Completed",
  "arenaEnded": "This arena has ended",
  "viewResults": "View Results",
  "finalRank": "Final Rank",
  "finalScore": "Final Score",
  "ofParticipants": "of {{count}} participants",
  "yourPrize": "Your Prize",
  "redemptionCode": "Redemption Code",
  "copied": "Copied!",
  "noResults": "Results not available yet",
  "endedOn": "Ended on {{date}}"
}
```

---

## Dependencies & Order

```
Step 1 (Supabase: Fix bug)          ← START HERE, no dependencies
Step 2 (Supabase: Completed arenas) ← no dependencies
Step 3 (Supabase: User result RPC)  ← no dependencies
    │
    ├──→ Step 4 (Mobile: Deep links)    ← depends on Step 1 (notification types)
    ├──→ Step 5 (Mobile: Completed UI)  ← depends on Step 2 (API returns completed)
    ├──→ Step 6 (Mobile: Results view)  ← depends on Step 2 + Step 3
    ├──→ Step 7 (Admin: Contact/Notify) ← depends on Step 1c (notify RPC)
    └──→ Step 8 (Mobile: Locales)       ← depends on Steps 5 + 6
```

---

## Agent Tasks & Execution Order

### 🟢 Phase 1: Supabase Agent (run FIRST)

Run the **supabase agent** with the following instructions:

> **Task: Arena Expiration & Results — Backend Changes**
>
> Read `docs/plans/arena_expiration_and_results_flow.md` and execute Steps 1, 2, and 3.
>
> **Step 1**: Fix `finalize-arena` edge function:
> - In `backend/supabase/functions/finalize-arena/index.ts`, change `.eq('status', 'claimed')` to `.eq('status', 'pending')` on line 118
> - Add notification for ALL participants (not just winners) — send `type: 'arena_ended'` push to non-winners
> - Create a reusable `notify-arena-participants` edge function (or extend `finalize-arena`) that can be called by admin to re-send notifications
>
> **Step 2**: Create migration `YYYYMMDDHHMMSS_arena_completed_visibility.sql`:
> - Update `get_available_arenas()` to return finalized arenas from last 30 days
> - Ensure `arena_status` returns `'ended'` for these arenas
>
> **Step 3**: In same or new migration:
> - Create `get_user_arena_result(p_arena_id, p_user_id)` RPC that returns: final_rank, final_score, total_participants, prize_description, redemption_code, redemption_status, top_participants JSONB (top 10)
>
> After all changes, run `supabase db push` to apply.

---

### 🔵 Phase 2: Mobile Agent (run AFTER Supabase Agent)

Run the **mobile agent** with the following instructions:

> **Task: Arena Expiration & Results — Mobile App Changes**
>
> Read `docs/plans/arena_expiration_and_results_flow.md` and execute Steps 4, 5, 6, and 8.
>
> **Step 4**: In `apps/mobile-app/lib/notifications.ts`:
> - Add `'arena_prize' | 'arena_ended'` to `NotificationTrigger` type
> - Add cases in `getDeepLinkFromNotification()`: both route to `/arena/${data.arena_id}` (with fallback)
> - Add `arena_id` and `arena_name` to `NotificationData` interface
>
> **Step 5**: In `apps/mobile-app/app/arenas.tsx`:
> - Add `completedArenas` filter: `arenas.filter(a => a.arena_status === 'ended')`
> - Add "🏁 Completed" section below "Active Now"
> - Completed cards: dimmed styling, "ENDED" badge, final rank display, "View Results" CTA
> - Follow existing glassmorphism design system
>
> **Step 6**: In `apps/mobile-app/app/arena/[id]/index.tsx`:
> - When `is_finalized === true`, show results mode:
>   - "ARENA ENDED" banner, user's final rank/score, prize info with redemption code
>   - Final leaderboard (frozen standings)
>   - Call `get_user_arena_result` RPC for data
> - Update `useAvailableArenas` hook type to include `is_finalized` if not already present
>
> **Step 8**: Update locale files:
> - `apps/mobile-app/locales/en/arena.json` — add completed/results keys
> - `apps/mobile-app/locales/sr/arena.json` — add Serbian translations

---

### 🟡 Phase 3: Admin Agent (run AFTER Supabase Agent)

Run the **admin agent** with the following instructions:

> **Task: Arena Expiration & Results — Admin Panel Changes**
>
> Read `docs/plans/arena_expiration_and_results_flow.md` and execute Step 7.
>
> **Step 7a**: In `apps/admin-panel/components/modules/ArenaDetail.tsx`:
> - Add email column to Results tab (join profiles for contact info)
> - Update `getArenaResults` in `arena-invitation-actions.ts` to include `profiles.email`
>
> **Step 7b**: Add notification buttons above Results table:
> - "Notify Winners" — calls edge function to re-send push to winners
> - "Notify All Participants" — calls edge function to re-send to all
> - Add server action `notifyArenaParticipants(arenaId, winnersOnly: boolean)` in `arena-actions.ts`
> - Show toast with count of notifications sent
>
> **Step 7c**: Add "Copy Winner Emails" button:
> - Copies comma-separated emails of prize winners to clipboard
> - Toast confirmation

---

## Testing Requirements

### Supabase
- [ ] Finalize an ended arena and verify push notifications are sent to winners (`status = 'pending'`)
- [ ] Verify `get_available_arenas()` returns finalized arenas (last 30 days) with `arena_status = 'ended'`
- [ ] Verify `get_user_arena_result()` returns correct data for a participated user
- [ ] Verify non-participant gets empty result from `get_user_arena_result()`

### Mobile
- [ ] Arenas screen shows "Completed" section with finalized arenas
- [ ] Completed arena card shows final rank and "View Results"
- [ ] Arena detail for finalized arena shows results (rank, score, prizes, leaderboard)
- [ ] Push notification tap for `arena_prize` navigates to arena detail
- [ ] Push notification tap for `arena_ended` navigates to arena detail
- [ ] Arenas older than 30 days don't appear in completed section

### Admin
- [ ] Results tab shows winner email
- [ ] "Notify Winners" button sends push and shows toast
- [ ] "Notify All" button sends push and shows toast
- [ ] "Copy Winner Emails" copies correct emails

---

## Notes

- Push notifications are currently globally disabled (`PUSH_NOTIFICATIONS_ENABLED = false`). The architecture is built regardless — once the Apple Developer Organization account is active and the flag is enabled, all push flows will work.
- The 30-day window for showing completed arenas can be adjusted. Consider making it configurable per arena or global setting.
- `ArenaLivePreview` component exists in admin but is unused — could be connected to preview completed arena cards.
