# Bugfix & Enhancement Plan: Transaction List, Cancel Redemption, Push Notifications

**Created:** 2026-04-02
**Priority:** High (pre-launch quality)
**Workspaces Affected:** `apps/mobile-app/`, `backend/supabase/`, `apps/admin-panel/` (minor)

---

## Overview

Three issues to address before production polish is complete:

1. **Transaction List & Drops Breakdown** — Users see "spendable" drops on the home ring but "total earned" in stats/wallet, causing confusion. Need a clear breakdown and a proper transaction ledger.
2. **Cancel Redemption & Monthly Award Expiry** — Users cannot cancel pending redemptions from the app. Monthly leaderboard awards show as "expired" at month end but there's no actual expiry job — need to investigate and fix.
3. **Push Notifications for Logged-Out Users** — Push tokens are never cleared on logout, so logged-out users continue receiving notifications for an account they're no longer active on.

---

## Bug #1: Transaction List & Drops Breakdown Clarity

### Context

The home screen `ActivityRings` center number shows `localDrops` (gym-scoped spendable balance from `gym_memberships.local_drops_balance`). However, the wallet "Global" tab shows `profiles.total_drops` labeled as "Total Balance," and the "Earned" section sums positive `drops_transactions`. There is no view that shows the user *why* their spendable balance differs from their earned total — redemptions, expirations, and refunds are invisible from the home/stats perspective.

**User confusion scenario:** User earns 500 drops, redeems a 200-drop reward, sees "300" on home ring but "500" in wallet earned stats. No transaction log explains the 200-drop deduction.

### Current State

| Surface | What's shown | Source |
|---------|-------------|--------|
| Home ring center | Spendable at current gym | `gym_memberships.local_drops_balance` via `useLocalDrops` |
| Wallet hero (gym scope) | Spendable at current gym | `gym_memberships.local_drops_balance` via `useLocalDrops` |
| Wallet hero (global scope) | Total drops (lifetime aggregate) | `profiles.total_drops` |
| Wallet "Earned" section | Sum of positive txns by period | `drops_transactions` (positive only, specific types) |
| Wallet "Activity" section | Paginated tx list (all types) | `drops_transactions` (signed amounts, all types) |

**What's missing:**
- No "Spent" or "Deducted" breakdown alongside "Earned"
- Wallet Activity list exists but is buried below the fold
- No dedicated "Transaction History" screen accessible from home
- No running balance column shown per transaction
- Home stats (`QuickStatsRow`) show "today's drops" earned but never "spent today"

### Dependencies

- None — all data already exists in `drops_transactions` table (which includes negative amounts for redemptions, expirations, and refunds)
- `balance_after` column exists on `drops_transactions` (added in migration `20260302000005`) but is not displayed in wallet Activity list

### Execution Plan

#### Step 1: Enhance Wallet Drops Breakdown (mobile-coder)

**File:** `apps/mobile-app/app/wallet.tsx`

**Changes:**
1. **Add "Spent" row** alongside the existing "Earned" row in the wallet summary section:
   - Query `drops_transactions` for negative amounts (types: `redemption`, `reward_claim`, `expired`, `arena_entry`) summed by period (today / week / month / all-time), filtered by gym when in gym scope
   - Display as "Spent" with the same period tabs as "Earned"
   - Use a red/warm accent color to differentiate from earned (green)

2. **Add "Net Balance" indicator** below Earned/Spent:
   - `Net = Earned - |Spent|` per period
   - Helps user understand balance movement

3. **Promote Activity list visibility:**
   - Add a section header "Transaction History" with a "See All" link
   - Show last 5 transactions inline with `balance_after` displayed
   - "See All" navigates to a dedicated full-screen transaction list

#### Step 2: Create Transaction History Screen (mobile-coder)

**File (new):** `apps/mobile-app/app/transactions.tsx`

**Design:**
- Full-screen FlatList of `drops_transactions` for the user
- Gym-scoped filter (default to active gym) with option to see "All gyms"
- Each row shows:
  - Transaction type icon (reuse `TX_ICONS` map from wallet)
  - Description text (from `drops_transactions.description` column)
  - Amount with +/- sign and color (green for positive, red for negative)
  - `balance_after` value (running balance)
  - Timestamp (relative: "2h ago", "Yesterday", or date)
- Paginated with infinite scroll (reuse wallet's pagination pattern, `PAGE_SIZE = 20`)
- Pull-to-refresh
- Type filter pills at top: All | Earned | Spent | Rewards | Expired
- Follow glassmorphism design system (`BlurView`, `ImageBackground`, `FadeInDown`)

**Localization:**
- Add keys to `apps/mobile-app/locales/en/transactions.json` (new namespace)
- Add keys to `apps/mobile-app/locales/sr/transactions.json`

#### Step 3: Add Transaction History Entry Point from Home (mobile-coder)

**File:** `apps/mobile-app/app/home.tsx`

**Changes:**
- Below `QuickStatsRow` or as a new small card, add a "Recent Activity" mini-section:
  - Show last 2-3 transactions (earned + spent) with amount and type icon
  - Tap navigates to `/transactions`
- Alternative: Make the `QuickStatsRow` "today's drops" pill tappable → navigates to `/transactions?filter=today`

#### Step 4: Register Route (mobile-coder)

**File:** `apps/mobile-app/app/_layout.tsx`

- Add `<Stack.Screen name="transactions" options={{ headerShown: false }} />` to the Stack navigator

#### Step 5: Clarify Home Ring Tooltip (mobile-coder)

**File:** `apps/mobile-app/components/ActivityRings.tsx`

**Changes:**
- When user taps the center number, show a brief tooltip or info badge: "Spendable at [Gym Name]"
- Helps users understand the number is gym-scoped, not lifetime total

### Data Contract

**Query for Spent breakdown (wallet):**
```sql
SELECT
  SUM(CASE WHEN created_at >= $today THEN ABS(amount) ELSE 0 END) as spent_today,
  SUM(CASE WHEN created_at >= $week_start THEN ABS(amount) ELSE 0 END) as spent_week,
  SUM(CASE WHEN created_at >= $month_start THEN ABS(amount) ELSE 0 END) as spent_month,
  SUM(ABS(amount)) as spent_all_time
FROM drops_transactions
WHERE user_id = $user_id
  AND amount < 0
  AND ($gym_id IS NULL OR gym_id = $gym_id)
  AND transaction_type IN ('redemption', 'reward_claim', 'expired', 'arena_entry');
```

**Query for Transaction History (paginated):**
```sql
SELECT id, transaction_type, amount, balance_after, description, created_at, gym_id
FROM drops_transactions
WHERE user_id = $user_id
  AND ($gym_id IS NULL OR gym_id = $gym_id)
  AND ($type_filter IS NULL OR transaction_type = ANY($type_filter))
ORDER BY created_at DESC
LIMIT $page_size OFFSET $offset;
```

### Testing Requirements

- [ ] Wallet shows accurate Earned and Spent totals for each period
- [ ] Transaction history screen loads, paginates, and filters correctly
- [ ] `balance_after` column is accurate (verify against actual `local_drops_balance`)
- [ ] Home screen entry point navigates to transactions
- [ ] Ring center tap shows gym-scoped tooltip
- [ ] All new strings localized in EN and SR
- [ ] Design follows glassmorphism system (BlurView, FadeInDown, branding colors)

---

## Bug #2: Cancel Redemption & Monthly Award "Expired" Status

### Context

**Cancel Redemption:** Users currently have no way to cancel a pending redemption from the mobile app. Only gym staff can cancel via the admin panel's `cancel_redemption` RPC. Users who change their mind are stuck with a pending code until staff cancels or confirms it.

**Monthly Award Expiry:** Monthly leaderboard awards are inserted as `redemptions` rows with `status = 'claimed'` and `source_type = 'leaderboard_prize'`. There is no database job that transitions redemptions to `expired` status. However, `expired` exists in the TypeScript `ClaimStatus` type and may be appearing in the UI if some other mechanism sets it. The mobile `redemptions.tsx` screen only has styling for `pending`, `confirmed`, and `cancelled` — any other status (like `expired` or `claimed`) falls through without specific styling.

**Investigation needed:** Why does "expired" appear at end of month? Possible causes:
1. The `expire_stale_drops` function (90-day `expires_at` on `drops_transactions`) — but this affects drops, not redemptions
2. A `rewards.available_until` date on the prize that has passed — but leaderboard prizes use `reward_id = NULL`
3. A manual status update somewhere not yet found
4. UI misinterpretation — `claimed` status renders without specific styling and might look like `expired` to the user

### Dependencies

- `cancel_redemption` RPC already exists in database (migration `20260325000024`)
- `redemptions.status` column accepts arbitrary text (no enum constraint found)
- Leaderboard prize distribution uses `status = 'claimed'` (migration `20260303100001`)

### Execution Plan

#### Step 1: Investigate "Expired" Source (supabase-dba)

**Action:** Run diagnostic query on production/staging to find redemptions with `status = 'expired'`:
```sql
SELECT id, user_id, status, source_type, created_at, updated_at, description
FROM redemptions
WHERE status = 'expired'
ORDER BY updated_at DESC
LIMIT 20;
```

Also check if any trigger, cron job, or function updates redemption status:
```sql
SELECT proname, prosrc
FROM pg_proc
WHERE prosrc ILIKE '%expired%' AND prosrc ILIKE '%redemptions%';
```

Check if `rewards.available_until` is set on any leaderboard reward configs:
```sql
SELECT lr.*, r.available_until
FROM leaderboard_rewards lr
LEFT JOIN rewards r ON r.id = lr.reward_id
WHERE lr.period = 'monthly';
```

**Document findings** before proceeding with fix.

#### Step 2: Add "Expired" Status Handling to Redemptions UI (mobile-coder)

**File:** `apps/mobile-app/app/redemptions.tsx`

**Changes:**
1. Add `expired` and `claimed` to `STATUS_CONFIG`:
   ```typescript
   expired: { color: '#94a3b8', icon: 'alert-circle-outline', bgAlpha: 0.08 },
   claimed: { color: '#60a5fa', icon: 'gift-outline', bgAlpha: 0.1 },
   ```
2. For `claimed` status (leaderboard/arena prizes), show a distinct visual: "Prize Awarded" label instead of a redemption code
3. For `expired` status, show clear "Expired" badge with explanation text

**Localization:**
- Add `expired`, `claimed`, `prizeAwarded` keys to `locales/en/redemptions.json` and `locales/sr/redemptions.json`

#### Step 3: Add User-Side Cancel Redemption (mobile-coder)

**File:** `apps/mobile-app/app/redemptions.tsx`

**Changes:**
1. For `pending` redemptions, add a "Cancel" button below the redemption code
2. On tap, show confirmation modal: "Cancel this redemption? Your [X] drops will be refunded."
3. Call `supabase.rpc('cancel_redemption', { p_redemption_id: id })` (RPC already exists)
4. On success, refresh the redemptions list and show success toast
5. On error, show error modal with message

**Important:** The existing `cancel_redemption` RPC checks:
- Redemption exists
- Status is not already `confirmed` or `cancelled`
- Refunds drops to `local_drops_balance` and `available_drops`
- Inserts refund transaction

The RPC currently requires `p_cancelled_by` and `p_cancellation_reason` parameters — need to verify:

**File to check:** `backend/supabase/migrations/20260325000024_fix_cancel_redemption_drop_end_session.sql`

If it requires a staff user ID for `p_cancelled_by`, we need a **new variant** or to allow user self-cancellation:

#### Step 3a: Create User Self-Cancel RPC (supabase-dba) — if needed

**File (new migration):** `backend/supabase/migrations/YYYYMMDDHHMMSS_user_cancel_own_redemption.sql`

**Function:** `cancel_own_redemption(p_redemption_id UUID)`

**Logic:**
1. Verify `auth.uid()` matches `redemptions.user_id`
2. Verify `status = 'pending'` (only pending can be cancelled)
3. Verify redemption was created less than 24h ago (optional: time-limit for self-cancel)
4. Refund `drops_spent` to `gym_memberships.local_drops_balance` and `profiles.available_drops`
5. Insert positive `drops_transactions` row (type: `refund`)
6. Restore `rewards.stock` if applicable
7. Set `status = 'cancelled'`, `cancelled_by = auth.uid()`, `cancellation_reason = 'User cancelled'`

**RLS:** Users can only cancel their own pending redemptions.

#### Step 4: Fix Monthly Award Expiry Logic (supabase-dba) — based on Step 1 findings

**If monthly awards should expire** (e.g., unclaimed prizes after 30 days):

**File (new migration):** `backend/supabase/migrations/YYYYMMDDHHMMSS_expire_unclaimed_leaderboard_prizes.sql`

**Function:** `expire_unclaimed_prizes()`
```sql
UPDATE redemptions
SET status = 'expired', updated_at = NOW()
WHERE source_type IN ('leaderboard_prize', 'arena_prize')
  AND status = 'claimed'
  AND created_at < NOW() - INTERVAL '30 days';
```

**Schedule:** Add to existing cron or create new daily job.

**If monthly awards should NOT expire** (they're permanent records):
- Remove any code/trigger that sets `status = 'expired'` (found in Step 1)
- Ensure `claimed` renders clearly in the UI as "Prize Awarded — [description]"

#### Step 5: Add Cancel Confirmation to Admin Panel (admin-coder) — minor

**File:** `apps/admin-panel/components/modules/RedemptionVerifier.tsx` (or `RedemptionsManager`)

**Changes:**
- When staff cancels a redemption, show the reason it was cancelled (if user-initiated: "Cancelled by member")
- No functional change needed — just improve the display of cancellation source

### Testing Requirements

- [ ] Diagnostic query results documented (Step 1)
- [ ] `expired` and `claimed` statuses render correctly in redemptions UI
- [ ] User can cancel pending redemption from mobile app
- [ ] Cancelled redemption refunds drops (verify `local_drops_balance` and `available_drops`)
- [ ] Cancelled redemption restores reward stock
- [ ] Cannot cancel already-confirmed or already-cancelled redemptions
- [ ] Monthly leaderboard prizes display correctly with "Prize Awarded" label
- [ ] If expiry job is added: prizes older than 30 days transition to `expired`
- [ ] Localization parity (EN/SR)

---

## Bug #3: Fix Push Notifications for Logged-Out Users

### Context

When a user logs out (`signOut` in `authStore.ts`), the app calls `supabase.auth.signOut()` and resets local state, but **never clears `profiles.expo_push_token`**. The token remains in the database, so backend jobs (streak reminders, re-engagement, drops expiry warnings, happy hour reminders) continue sending push notifications to the device even though the user is logged out.

**Impact:**
- Logged-out users receive notifications for an account they're not actively using
- If another user logs in on the same device, both accounts may receive notifications on the same device (the new user's token overwrites — but there's a window where the old token is still active)
- Privacy concern: notifications leak activity info to someone who may have logged out intentionally

### Current Flow

1. **Login/App Start:** `_layout.tsx` checks if push permission is granted → if yes, calls `registerForPushNotifications()` → `savePushToken(userId, token)` → writes to `profiles.expo_push_token`
2. **Logout:** `authStore.signOut()` → `supabase.auth.signOut()` → `get().reset()` → token **NOT** cleared from database
3. **Backend jobs:** Query `profiles.expo_push_token IS NOT NULL` → send to all tokens including logged-out users

### Dependencies

- `profiles.expo_push_token` column exists
- `savePushToken` function exists in `lib/notifications.ts`
- `authStore.signOut` exists in `lib/stores/authStore.ts`

### Execution Plan

#### Step 1: Clear Push Token on Logout (mobile-coder)

**File:** `apps/mobile-app/lib/stores/authStore.ts`

**Changes to `signOut` function:**

Before `supabase.auth.signOut()`, clear the push token in the database:

```typescript
signOut: async () => {
  try {
    // Clear push token before signing out (while we still have auth)
    const userId = get().session?.user?.id;
    if (userId) {
      await supabase
        .from('profiles')
        .update({ expo_push_token: null })
        .eq('id', userId);
    }

    // ... existing Google sign out ...
    await supabase.auth.signOut();
    get().reset();
  } catch (err) {
    log.error('[AuthStore] signOut error:', err);
    get().reset();
  }
},
```

**Critical ordering:** The token clear must happen **before** `supabase.auth.signOut()` because after signout, the user no longer has auth to update their own profile (RLS would block it).

#### Step 2: Add clearPushToken Helper (mobile-coder)

**File:** `apps/mobile-app/lib/notifications.ts`

**Add new exported function:**

```typescript
export async function clearPushToken(userId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ expo_push_token: null })
      .eq('id', userId);

    if (error) {
      log.error('[Notifications] Failed to clear push token:', error.message);
    } else {
      log.debug('[Notifications] Push token cleared from profile');
    }
  } catch (error) {
    log.error('[Notifications] Error clearing push token:', error);
  }
}
```

**Update `authStore.ts`** to import and use this helper for clean separation.

#### Step 3: Guard Backend Jobs Against Stale Tokens (supabase-dba / edge functions)

**Files to update:**
- `backend/supabase/functions/streak-reminder/index.ts`
- `backend/supabase/functions/re-engagement/index.ts`
- `backend/supabase/functions/drops-expiry-warning/index.ts`
- `backend/supabase/functions/send-happy-hour-reminders/index.ts`
- `backend/supabase/functions/distribute-leaderboard-prizes/index.ts`
- `backend/supabase/functions/finalize-arena/index.ts`

**Changes:**

All these functions query profiles with `expo_push_token IS NOT NULL`. Add an additional guard:

1. **Check last sign-in:** Add a filter on `auth.users.last_sign_in_at` or `profiles.updated_at` to skip users who haven't been active recently (defense in depth)
2. **Validate token format:** Already done via `isExpoPushToken()` in `_shared/expo-push.ts` — no change needed
3. **Handle Expo push receipts:** When Expo returns `DeviceNotRegistered`, proactively clear the token:

**File:** `backend/supabase/functions/send-push/index.ts`

After sending, check Expo response tickets for `DeviceNotRegistered` status and clear those tokens:

```typescript
// After batch send, check for invalid tokens
for (const ticket of tickets) {
  if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
    // Clear this token from profiles
    await supabaseAdmin
      .from('profiles')
      .update({ expo_push_token: null })
      .eq('expo_push_token', ticket.expoPushToken);
  }
}
```

This is a **defense-in-depth** measure — even if the client-side clear fails (network error during logout, app crash), the server will eventually clean up stale tokens.

#### Step 4: Add Token Cleanup Migration (supabase-dba) — one-time cleanup

**File (new migration):** `backend/supabase/migrations/YYYYMMDDHHMMSS_cleanup_stale_push_tokens.sql`

**Purpose:** One-time cleanup of push tokens for users who haven't signed in recently.

```sql
-- Clear push tokens for users who haven't signed in for 90+ days
UPDATE public.profiles p
SET expo_push_token = NULL
FROM auth.users u
WHERE p.id = u.id
  AND p.expo_push_token IS NOT NULL
  AND u.last_sign_in_at < NOW() - INTERVAL '90 days';
```

### Testing Requirements

- [ ] After logout, `profiles.expo_push_token` is NULL for that user
- [ ] After logout, backend jobs do NOT send push to that device
- [ ] After re-login on same device, token is re-registered correctly
- [ ] If logout fails midway (network error), token clear is best-effort (non-blocking)
- [ ] `DeviceNotRegistered` tokens are cleaned up server-side
- [ ] One-time migration clears stale tokens without affecting active users
- [ ] Push still works correctly for logged-in users after these changes

---

## Implementation Priority & Sequencing

| # | Task | Workspace | Blocked By | Effort |
|---|------|-----------|------------|--------|
| 1 | Bug #3 Step 1-2: Clear token on logout | mobile-app | — | Small |
| 2 | Bug #3 Step 3: Guard backend + receipt cleanup | supabase functions | — | Medium |
| 3 | Bug #3 Step 4: One-time token cleanup migration | supabase | — | Small |
| 4 | Bug #2 Step 1: Investigate expired source | supabase | — | Small |
| 5 | Bug #2 Step 2: Add expired/claimed status UI | mobile-app | — | Small |
| 6 | Bug #2 Step 3/3a: User cancel redemption | mobile-app + supabase | #4 findings | Medium |
| 7 | Bug #2 Step 4: Monthly award expiry fix | supabase | #4 findings | Small-Medium |
| 8 | Bug #1 Step 1: Wallet spent breakdown | mobile-app | — | Medium |
| 9 | Bug #1 Step 2: Transaction history screen | mobile-app | — | Medium-Large |
| 10 | Bug #1 Step 3-4: Home entry point + route | mobile-app | #9 | Small |
| 11 | Bug #1 Step 5: Ring tooltip | mobile-app | — | Small |

**Recommended order:** #1 → #2 → #3 → #4 → #5 → #6 → #7 → #8 → #9 → #10 → #11

Bug #3 (push) is the highest-impact fix (privacy + UX). Bug #2 (cancel + expiry) is next for UX completeness. Bug #1 (transaction list) is the largest feature and can be done last as an enhancement.

---

## Plan Review Checklist

- [x] All steps reference specific files/workspaces
- [x] Database changes assigned to `supabase-dba`
- [x] Mobile changes assigned to `mobile-coder`
- [x] Admin changes assigned to `admin-coder`
- [x] Dependencies clearly listed
- [x] API contracts defined (SQL queries, RPC signatures)
- [x] Testing requirements specified per bug
- [x] Implementation priority and sequencing defined
