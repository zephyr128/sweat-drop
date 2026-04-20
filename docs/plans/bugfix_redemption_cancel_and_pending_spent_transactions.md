# Bugfix Plan: Cancelled Redemption Still Visible + Pending Redemption Shown as "Spent"

**Created:** 2026-04-20
**Priority:** High (QA blocker pre-launch)
**Mobile Status:** Steps 4–6 complete (Steps 1–3 backend pending — supabase-dba)
**Workspaces Affected:** `apps/mobile-app/`, `backend/supabase/`
**Source:** QA report (Galaxy S25, mobile app)
**Related plans:**
- `docs/plans/bugfix_transaction_list_cancel_redemption_push_notifications.md` (earlier transaction-history / self-cancel work)
- `docs/plans/exec_verification_gate_fulfillment_v1.md` (verification & fulfilment state machine)

---

## Overview

Two QA-reported regressions in the rewards + wallet flow:

| # | Bug | Surface |
|---|-----|---------|
| 1 | After the user cancels a **pending** redemption from *My Redemptions → Pending*, the item stays on-screen. | `apps/mobile-app/app/redemptions.tsx` |
| 2 | Immediately after claiming a reward (still pending pickup), a `Reward: … -200` row shows up under *Wallet → Transactions → Spent*. QA expected no "Spent" transaction until the redemption is confirmed. | `apps/mobile-app/app/transactions.tsx`, `get_wallet_summary` RPC |

QA suggestion accompanying Bug #2:
> "Maybe it would be better if you separate **Earned** and **Refunded** transactions."

Today, `refund` is bundled into the `earned` filter — that's semantically wrong and reinforces Bug #2's confusion, so this plan also addresses the split.

---

## Current State (what the code does today)

### Redemption lifecycle (store reward)

1. **Claim** (`claim_reward` RPC, `20260331100000_gate_claim_reward_on_verification.sql`)
   - Verification gate (unverified users cannot claim store rewards)
   - Deducts drops from `gym_memberships.local_drops_balance` **and** `profiles.available_drops`
   - Inserts `redemptions` row with `status = 'pending'`
   - Inserts `drops_transactions` row with `transaction_type = 'reward_claim'`, `amount = -price_drops`, `reference_id = redemption_id`
2. **Confirm** at reception (`confirm_redemption` RPC) → `status = 'confirmed'`
3. **Cancel by user** (`cancel_own_redemption` RPC, `20260402000001`)
   - Requires `status = 'pending'` (rejects `pending_verification`, `confirmed`, `cancelled`)
   - Refunds drops to both `profiles` and `gym_memberships`
   - Inserts `drops_transactions` row with `transaction_type = 'refund'`, `amount = +price_drops`, `reference_id = reward_id` (note: not the redemption id — see Risk section)
   - Sets `redemptions.status = 'cancelled'`

### Mobile surfaces

- **`redemptions.tsx`** — *My Redemptions* screen, filter tabs: All / Pending / Confirmed / Cancelled / Expired
  - "Pending" filter query: `.in('status', ['pending', 'pending_verification'])`
  - On cancel success: `showModal(cancelSuccess)` + `void load(activeFilter)` (fire-and-forget refresh)
  - Cancel button is rendered for `pending_verification`, `pending_not_fulfilled`, `pending_ready` display states (see `lib/redemption-state.ts`)
- **`transactions.tsx`** — Full transaction ledger. Filter tabs: All / Earned / Spent / Rewards / Expired
  - Current `FILTER_TYPES`:
    ```
    earned:  ['session','checkin','challenge','bonus','arena','referral_reward','streak','milestone','refund','leaderboard_prize']
    spent:   ['redemption','reward_claim','arena_entry']      // + AND amount < 0
    rewards: ['redemption','reward_claim','leaderboard_prize']
    expired: ['expired']
    ```
- **`wallet.tsx`** — "Earned / Spent / Net" section driven by `get_wallet_summary` RPC (`20260413000014_wallet_summary_refunds.sql`)
  - Earned excludes `refund` (already correct)
  - Spent = `SUM(ABS(negative))` minus `SUM(refund)` → self-cancels when a pending claim is cancelled, but while it is *still pending* it inflates "Spent"

---

## Dependencies

- [x] Existing RPC `cancel_own_redemption` (migration `20260402000001`)
- [x] Existing RPC `claim_reward` (migration `20260331100000`)
- [x] Existing RPC `get_wallet_summary` (migration `20260413000014`)
- [x] `redemptions.status` domain known (`pending`, `pending_verification`, `confirmed`, `cancelled`, `expired`) — see `20260418000001_verification_gate_and_fulfillment.sql`
- [x] `drops_transactions.reference_id` holds the `redemption_id` for `reward_claim` / `redemption` rows (confirmed in `claim_reward` step 12)
- [ ] **No new columns required** — all joins can be done on `reference_id`

---

## Root-Cause Analysis

### Bug #1 — item stays visible after cancel

Two contributing causes, both to be fixed:

1. **UI never applies an optimistic update.** The handler in `redemptions.tsx::doCancel` does:
   ```ts
   if (result?.success) {
     showModal({ title: t('cancelSuccess'), ... });
     void load(activeFilter);   // fire-and-forget
   }
   ```
   `load()` flips `loading: true`, which paints an activity spinner *over* the list briefly and then replaces the rows. On older/slow Android devices (reported on Galaxy S25), the confirmation modal sits above the list and the user taps "OK" before the refetch finishes. If the refetch races against a subsequent state update (e.g. the `setCancellingId(null)` in `finally`), and the user scrolls before `setTab({ loading: false, data: rows })` applies, the stale row is visible under the modal backdrop — which QA reads as "still displayed". An **optimistic filter** (drop the cancelled id from `ts.data` synchronously, before showing the modal) makes the UX correct regardless of refetch timing.

2. **`cancel_own_redemption` rejects `pending_verification`** (RPC line 67: `IF v_redemption.status != 'pending'`). Although store-reward claims are always gated to `status='pending'` today, leaderboard/arena prizes surface in the Pending filter with `status='pending_verification'`, and the UI renders a working **Cancel** button for them (`canCancel = displayState === 'pending_verification' || …`). Tapping it silently fails ("Only pending redemptions can be cancelled") — the user sees a red error modal, closes it, the item is still there. Broaden the RPC to accept both.

### Bug #2 — pending reward claim shown as "Spent"

- `claim_reward` writes `drops_transactions(amount = -price, transaction_type = 'reward_claim')` *at claim time*, before staff confirmation.
- `transactions.tsx` "Spent" filter matches that row (`transaction_type IN ('redemption','reward_claim','arena_entry')` AND `amount < 0`).
- `get_wallet_summary` also counts it under "Spent" until a refund cancels it out.

From the user's mental model a pending redemption is *reserved*, not spent. The drops are real-deducted from the balance for anti-double-spend safety, but the UX should label the row as **Pending** until the redemption is confirmed, and exclude it from "Spent" totals.

### QA suggestion — separate Earned / Refunded

`refund` currently sits inside the `earned` filter array → refunds appear as "earned drops", which inflates the Earned bucket visually and confuses users about what they've truly earned vs what was returned after a cancel. Introduce a dedicated **Refunded** filter.

---

## Execution Plan

### Step 1 — Backend: broaden `cancel_own_redemption` to accept `pending_verification`  *(supabase-dba)*

**File (new):** `backend/supabase/migrations/20260420000001_cancel_own_redemption_allow_pending_verification.sql`

**Changes:**
- `CREATE OR REPLACE FUNCTION public.cancel_own_redemption(p_redemption_id UUID)` with the same body as `20260402000001`, except:
  - Replace the hard `IF v_redemption.status != 'pending'` guard with:
    ```
    IF v_redemption.status NOT IN ('pending', 'pending_verification') THEN
      RETURN QUERY SELECT false, 'Only pending redemptions can be cancelled'::TEXT;
      RETURN;
    END IF;
    ```
  - Preserve the existing `confirmed` / `cancelled` early-return branches (clearer error messages).
- Keep ownership + refund + stock restore + audit-trail steps byte-identical.
- **Fix polymorphism bug in the refund ledger row**: today it sets `reference_id = v_redemption.reward_id`. For leaderboard/arena prizes `reward_id IS NULL`, and for all cases it's the wrong pointer (should be the redemption, like the outgoing `reward_claim` row). Update to:
  ```
  reference_id = p_redemption_id
  ```
  This makes Bug #2's join (Step 2) reliable.

**AGENT NOTE header** must list:
- Mobile impact: redemptions.tsx now safe to cancel `pending_verification` rows.
- Wallet summary impact (see Step 2).

**Verification:**
```
supabase db push
-- then in psql:
SELECT proname, pg_get_functiondef(oid)
FROM pg_proc WHERE proname = 'cancel_own_redemption';
```

---

### Step 2 — Backend: patch `get_wallet_summary` to exclude pending `reward_claim` rows from "Spent"  *(supabase-dba)*

**File (new):** `backend/supabase/migrations/20260420000002_wallet_summary_exclude_pending_reward_claims.sql`

**Changes to the `txns` CTE** inside `get_wallet_summary` — add a `LEFT JOIN public.redemptions r ON r.id = dt.reference_id AND dt.transaction_type IN ('reward_claim','redemption')` and expose `r.status AS redemption_status`.

**Changes to the `agg` CTE / `spent_*` expressions** — treat a negative `reward_claim`/`redemption` row as "Spent" only when `redemption_status IS NULL` (non-redemption spending like `arena_entry`) OR `redemption_status = 'confirmed'`. Pseudocode for each period:

```
spent_today = GREATEST(0,
  COALESCE(SUM(ABS(amount)) FILTER (
    WHERE amount < 0
      AND created_at >= day_start
      AND (
        transaction_type NOT IN ('reward_claim','redemption')
        OR redemption_status = 'confirmed'
      )
  ), 0)
  - COALESCE(SUM(amount) FILTER (
      WHERE transaction_type = 'refund' AND amount > 0 AND created_at >= day_start
        AND redemption_status IS DISTINCT FROM 'cancelled'   -- see note
    ), 0)
)
```

> **Note on the refund subtraction:** after Step 1's fix, a cancelled-redemption refund's `reference_id` points at the redemption whose `status = 'cancelled'`. Since we no longer counted the `reward_claim` as "spent" while it was pending, we must also **no longer subtract that refund** (otherwise spent goes negative and we'd clamp to 0, losing signal). Adjust the refund subtraction filter to exclude refunds whose paired redemption is `cancelled` — those refunds should instead land in the new "Refunded" bucket on the ledger side (Step 3/4). Earned should continue to exclude `refund` as today.

Keep `net` as `SUM(amount)` across all rows (unchanged — the ledger is authoritative for balance delta).

**Regression safety:**
- For existing rows where `reference_id` points at a non-redemption UUID, the LEFT JOIN produces `NULL` and the row is treated exactly as today.
- Arena entry fees (`transaction_type = 'arena_entry'`) are **not** linked to a redemption → unaffected.

**Verification (supabase-dba):**
- After `supabase db push`, run a spot query that claims a reward, reads `get_wallet_summary(gym_id)`, and asserts `spent` is unchanged by the pending claim.
- Cancel the redemption, re-read, and assert `spent` stays unchanged.
- Confirm the redemption from admin (set status=confirmed without issuing refund), re-read, assert `spent` increased by `drops_spent`.

---

### Step 3 — Backend: new RPC `get_user_transactions` with redemption status  *(supabase-dba)*

**File (new):** `backend/supabase/migrations/20260420000003_get_user_transactions_rpc.sql`

**Rationale:** `drops_transactions.reference_id` is polymorphic, so PostgREST cannot auto-join to `redemptions`. A thin RPC keeps the mobile query simple and performant (uses existing index `idx_drops_transactions_user_id_created_at`).

**Function signature:**
```sql
CREATE OR REPLACE FUNCTION public.get_user_transactions(
  p_gym_id      UUID    DEFAULT NULL,
  p_types       TEXT[]  DEFAULT NULL,     -- NULL = all
  p_amount_sign TEXT    DEFAULT NULL,     -- 'negative', 'positive', or NULL
  p_limit       INT     DEFAULT 20,
  p_offset      INT     DEFAULT 0
)
RETURNS TABLE(
  id                  UUID,
  transaction_type    TEXT,
  amount              INTEGER,
  balance_after       INTEGER,
  description         TEXT,
  created_at          TIMESTAMPTZ,
  gym_id              UUID,
  reference_id        UUID,
  redemption_status   TEXT    -- NULL for non-redemption txns
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    dt.id, dt.transaction_type, dt.amount, dt.balance_after, dt.description,
    dt.created_at, dt.gym_id, dt.reference_id,
    r.status::TEXT AS redemption_status
  FROM public.drops_transactions dt
  LEFT JOIN public.redemptions r
    ON r.id = dt.reference_id
   AND dt.transaction_type IN ('reward_claim','redemption','refund')
  WHERE dt.user_id = auth.uid()
    AND (p_gym_id IS NULL OR dt.gym_id = p_gym_id)
    AND (p_types  IS NULL OR dt.transaction_type = ANY(p_types))
    AND (p_amount_sign IS NULL
         OR (p_amount_sign = 'negative' AND dt.amount <  0)
         OR (p_amount_sign = 'positive' AND dt.amount >= 0))
  ORDER BY dt.created_at DESC
  LIMIT GREATEST(1, p_limit) OFFSET GREATEST(0, p_offset);
$$;

GRANT EXECUTE ON FUNCTION public.get_user_transactions(UUID, TEXT[], TEXT, INT, INT) TO authenticated;
```

**Type generation:**
```
supabase gen types typescript --linked > backend/types/database.types.ts
```

---

### Step 4 — Mobile: optimistic cancel + filter fix in `redemptions.tsx`  *(mobile-coder)*

**File:** `apps/mobile-app/app/redemptions.tsx`

**Changes inside `doCancel`:**
1. After `result?.success === true`:
   - **Optimistically remove** the cancelled row from *all* tab caches so it disappears from every filter view the user may swipe to:
     ```ts
     setTabStates((prev) => {
       const next = { ...prev };
       for (const key of Object.keys(next) as StatusFilter[]) {
         next[key] = {
           ...next[key],
           data: next[key].data.filter((row: any) => row.id !== redemption.id),
         };
       }
       return next;
     });
     ```
   - Then `showModal(cancelSuccess)`.
   - Then `await load(activeFilter)` (await, don't fire-and-forget, so any server-side divergence is reconciled before the user interacts again). If the user is on the "Cancelled" tab, also run `load('cancelled')` so the cancelled item appears in that tab.
2. In the error branch, additionally call `load(activeFilter)` to avoid leaving the UI in an inconsistent state.

**No change** to the cancel button visibility logic — Step 1 now makes the RPC accept `pending_verification`, so existing UI is correct.

**AGENT NOTE** referencing this plan above `doCancel`.

**Verification:**
- Reproduce QA steps on Galaxy S25 emulator; cancel a store-reward pending redemption — row vanishes immediately.
- Cancel a leaderboard `pending_verification` row — row vanishes immediately, refund shows in Wallet.

---

### Step 5 — Mobile: filter taxonomy & pending badge in `transactions.tsx`  *(mobile-coder)*

**File:** `apps/mobile-app/app/transactions.tsx`

**A. Switch data source to `get_user_transactions` RPC**
- Replace the direct `.from('drops_transactions').select(…)` with `supabase.rpc('get_user_transactions', { p_gym_id, p_types, p_amount_sign, p_limit, p_offset })`.
- `TxRow` interface gains `redemption_status: string | null` and `reference_id: string | null`.

**B. Update `TxFilter` and `FILTER_TYPES`**
```ts
type TxFilter = 'all' | 'earned' | 'spent' | 'pending' | 'refunded' | 'rewards' | 'expired';

const FILTER_TYPES: Record<TxFilter, { types: string[] | null; sign?: 'negative' | 'positive'; onlyConfirmed?: boolean }> = {
  all:      { types: null },
  earned:   { types: ['session','checkin','challenge','bonus','arena','referral_reward','streak','milestone','leaderboard_prize'], sign: 'positive' }, // refund removed
  spent:    { types: ['reward_claim','redemption','arena_entry'], sign: 'negative', onlyConfirmed: true },
  pending:  { types: ['reward_claim','redemption'],               sign: 'negative', onlyConfirmed: false }, // filter by redemption_status in render-layer (see below)
  refunded: { types: ['refund'],      sign: 'positive' },   // NEW bucket per QA suggestion
  rewards:  { types: ['reward_claim','redemption','leaderboard_prize'] },
  expired:  { types: ['expired'] },
};
```

- `FILTER_OPTIONS` gets two new entries ("Pending", "Refunded") with appropriate icon/color (e.g. `time-outline`/`#fbbf24` and `arrow-undo-outline`/`#60a5fa`).

**C. Client-side `redemption_status` filtering**
- The RPC returns rows with `redemption_status`. For the **Spent** filter, drop any row where `transaction_type ∈ ('reward_claim','redemption')` and `redemption_status !== 'confirmed'`.
- For the **Pending** filter, keep only rows where `transaction_type ∈ ('reward_claim','redemption')` and `redemption_status IN ('pending','pending_verification')`.
- Because this post-filters after pagination, page sizes can look short on Pending; it's acceptable for MVP volumes. (If this becomes a problem later, push the status predicate into the RPC.)

**D. Pending badge on rows**
- In `renderItem`, if `tx.transaction_type === 'reward_claim'` and `tx.redemption_status === 'pending' | 'pending_verification'`, replace the amount colour from red (`#FF3B30`) with amber (`#fbbf24`) and prefix the label with `t('pendingBadge')` (e.g. "Pending · Smoothie Bar Credit"). If `redemption_status === 'cancelled'`, dim the row (0.5 opacity) and strike-through the amount; this gives the user a clear audit trail.

**E. Localization**
- Add to `apps/mobile-app/locales/en/transactions.json`:
  - `filterPending`, `filterPendingDesc`
  - `filterRefunded`, `filterRefundedDesc`
  - `pendingBadge` — "Pending"
  - `txType.reward_claim` (currently only `redemption` is keyed) — "Reward claim"
- Mirror keys into `apps/mobile-app/locales/sr/transactions.json`.

**F. Remove `refund` from the Earned array** (already implicit from the new table, but confirm during code review).

**AGENT NOTE** above `FILTER_TYPES` explaining the onlyConfirmed / pending split and why `redemption_status` post-filtering is used.

**Verification:**
- Claim a store reward → *Wallet → Transactions → Spent* shows **no** `Reward: … -200` row.
- Same row appears under **Pending** filter with amber styling.
- Cancel the redemption → Pending row is replaced by a `Refund: +200` row under the **Refunded** filter; Spent remains empty for that claim.
- Confirm the redemption (staff) → row migrates to **Spent** with red styling.

---

### Step 6 — Mobile: align Wallet summary labels (optional polish)  *(mobile-coder)*

**File:** `apps/mobile-app/app/wallet.tsx`

- No logic change: the Step 2 migration already fixes the numbers under Earned / Spent / Net.
- Optional: add a small subtitle under "Spent" — `t('spentHint')` → "Only confirmed purchases" — so users understand why a fresh claim doesn't appear here. Localize EN + SR.

---

### Step 7 — Admin panel audit *(admin-coder — no code change expected)*

**File to re-read (no edit unless a regression is found):** `apps/admin-panel/app/dashboard/redemptions/*`

- Verify the admin redemption list still filters by `status` correctly (`pending`, `pending_verification`, `confirmed`, `cancelled`). No schema changes in this plan affect those columns.
- Verify the admin "Spent drops" analytics (if any) still aggregate off `drops_transactions` or off the new `get_wallet_summary` / `get_user_transactions` RPCs; if off `drops_transactions` directly, note whether it should also exclude pending `reward_claim` rows for consistency — **out of scope** unless admin-coder finds a user-facing surface that does.

---

## Data Contracts Summary

| RPC | Purpose | New/Changed |
|-----|---------|-------------|
| `cancel_own_redemption(p_redemption_id UUID)` | Accepts `pending` **and** `pending_verification`; refund row's `reference_id` now = redemption id. | Changed (Step 1) |
| `get_wallet_summary(p_gym_id UUID)` | Spent excludes pending `reward_claim`/`redemption`; refund subtraction ignores refunds tied to cancelled redemptions. | Changed (Step 2) |
| `get_user_transactions(p_gym_id, p_types, p_amount_sign, p_limit, p_offset)` | Returns drops_transactions + `redemption_status`. | **New** (Step 3) |

---

## Testing Requirements

### Bug #1 regression tests
- [ ] Cancel a `pending` store-reward redemption → row removed from Pending tab **before** modal closes.
- [ ] Cancel a `pending_verification` leaderboard prize redemption → RPC succeeds; drops refund applied (if `drops_spent > 0`, usually 0 for prizes).
- [ ] Attempt to cancel a `confirmed` redemption → error modal "Cannot cancel a confirmed redemption"; UI unchanged.
- [ ] Cancel under flaky network (airplane mode on after tap) → error branch also reconciles list.

### Bug #2 regression tests
- [ ] Fresh claim → **Spent** tab and Wallet "Spent" total unchanged.
- [ ] Fresh claim → **Pending** tab shows row with amber badge and Pending label.
- [ ] Cancel the claim → Pending row disappears; **Refunded** tab shows `+X` refund row.
- [ ] Confirm the claim from admin → row leaves Pending, appears under **Spent** with red badge; Wallet "Spent" increases by `drops_spent`.
- [ ] Arena entry fee (`arena_entry`) still counts as Spent (unchanged).
- [ ] `refund` rows no longer visible under Earned filter.
- [ ] Serbian localization parity verified for new keys.

### Cross-cutting
- [ ] `supabase gen types typescript --linked` re-run, committed, and `database.types.ts` compiles in both apps.
- [ ] Admin panel redemptions list still renders all statuses.
- [ ] No new lint/type errors in `apps/mobile-app/`.

---

## Rollout Order

1. Step 1 migration → push, verify function.
2. Step 2 migration → push, run wallet summary spot-check.
3. Step 3 migration → push, regenerate types.
4. Steps 4–6 mobile changes → ship together in a single build; Steps 2–3 are forward-compatible with the current app (`get_user_transactions` is additive; patched `get_wallet_summary` preserves shape).
5. Step 7 audit — only edits if a regression is found.

---

## Risks & Mitigations

- **Polymorphic `reference_id`.** Any non-redemption UUID stored there won't match a `redemptions.id` → LEFT JOIN returns NULL → row treated as today. Safe.
- **Post-filtering pagination (Step 5C).** Large pending backlogs could cause short pages. Volumes are small in MVP; revisit if >100 pending per user.
- **Existing refund rows** (before Step 1 fix) have `reference_id = reward_id`. They will NOT be linked to `redemptions` via the new JOIN → they behave exactly as today (treated as unpaired refund, show under Refunded, subtracted from Spent in wallet summary). Acceptable; no backfill needed.
- **Historical `drops_transactions` with `transaction_type='redemption'`** (pre-`reward_claim` rename) will now also honour the confirmed-only rule. All such existing rows are attached to long-confirmed redemptions, so they still count as Spent. Verified by spot-check in QA.

---

## Out of Scope

- Reserving drops in a separate "escrow" column (larger economy refactor).
- Backfilling historic refund rows to set `reference_id = redemption_id`.
- Admin panel analytics rework.
- Notification copy changes on cancel/confirm.
