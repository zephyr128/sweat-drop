# Feature: Leaderboard Earned-Score Fix + 90-Day Drops Expiry Visibility

## Context

Two critical economy issues were reported:
1. User had `2000` drops, redeemed reward, balance dropped to `800`, and leaderboard also dropped to `800`.
   - This is incorrect: redemption spend should not reduce leaderboard achievement score.
2. Product requires drops to reset/expire every 3 months and users must be clearly informed.

Root cause (current state):
- In `get_leaderboard()` gym scope for `all_time` currently uses `gym_memberships.local_drops_balance` (spendable wallet), not earned history.
- Wallet expiry (90 days) already exists via `drops_transactions.expires_at` + `expire_stale_drops()` + warning edge function, but UX and leaderboard semantics are not aligned and not explicit enough to users.

---

## Product Decision

1. **Leaderboard score must be based on earned drops**, not current spendable balance.
2. **Wallet balance remains spendable and can decrease via redemption/expiry**.
3. **Quarterly anti-accumulation policy** is implemented as rolling 90-day expiry for earn transactions.
4. Users must see:
   - what is expiring,
   - when it expires,
   - why leaderboard rank does not equal current wallet balance.

---

## Dependencies

- Existing `drops_transactions.expires_at` and expiry cron are active.
- Existing push warnings edge function `drops-expiry-warning` exists.
- Existing `get_leaderboard()` RPC is used by mobile/admin.

---

## Execution Plan

### Step 1: Leaderboard Data Semantics Fix (supabase-dba)

**Workspace:** `backend/supabase/`

1. Create migration `YYYYMMDDHHMMSS_fix_leaderboard_earned_not_balance.sql`.
2. Update `public.get_leaderboard(...)` for `p_type='gym'`:
   - Keep weekly/monthly from profile aggregates (or transaction-based if preferred for consistency).
   - Replace gym `all_time` score source:
     - from `gym_memberships.local_drops_balance`
     - to earned score (recommended: sum of positive session/checkin transactions for that gym).
3. Add helper function (recommended):
   - `get_user_earned_drops_gym(p_user_id, p_gym_id, p_period)` returning earned-only values.
4. Ensure global leaderboard remains earned-based (`profiles.total_drops`) or migrate to transaction-sum if needed.
5. Validate deterministic behavior:
   - redemption reduces wallet, leaderboard score unchanged.

---

### Step 2: Quarterly (90-day) Expiry Contract Hardening (supabase-dba)

**Workspace:** `backend/supabase/`

1. Ensure all earning transaction types that must expire have `expires_at = created_at + interval '90 days'`:
   - `session`
   - `checkin` (if minted as wallet credit)
   - any other positive mint types included in policy.
2. Confirm `expire_stale_drops()` covers all eligible mint sources and adjusts:
   - `profiles.available_drops`
   - `gym_memberships.local_drops_balance`
3. Add explicit audit reason metadata for expiry deductions in `drops_transactions`:
   - transaction_type: `expiry_deduction`
   - description with original source reference if possible.
4. Add verification SQL scripts for 90-day policy and one-day expiry window behavior.

---

### Step 3: User Transparency APIs (supabase-dba)

**Workspace:** `backend/supabase/`

1. Add RPC `get_user_expiring_drops(p_user_id, p_gym_id)` returning:
   - `expiring_in_7d`
   - `expiring_in_30d`
   - `next_expiry_date`
   - optional list buckets by date.
2. Add RPC `get_user_drops_ledger_summary(p_user_id, p_gym_id)`:
   - `wallet_balance` (spendable)
   - `earned_score_weekly`
   - `earned_score_monthly`
   - `earned_score_all_time` (or rolling mode per product setting).
3. Use security-definer auth.uid checks; do not expose other users’ detailed wallet data.

---

### Step 4: Mobile UX Alignment (mobile-coder)

**Workspace:** `apps/mobile-app/`

1. Leaderboard screen:
   - show subtitle/help: "Leaderboard ranks by earned drops, not current wallet balance."
2. Wallet screen:
   - add expiry card:
     - "X drops expire in 7 days"
     - "Y drops expire in 30 days"
     - "Next expiry: DATE"
3. Session summary and home:
   - optional non-intrusive reminder when user has upcoming expiry.
4. Notification deep-link handling:
   - expiry notification opens wallet with expiry section highlighted.
5. Add i18n keys (EN/SR) for leaderboard-vs-wallet explanation and expiry labels.

---

### Step 5: Admin Visibility (admin-coder)

**Workspace:** `apps/admin-panel/`

1. Economy / Members analytics:
   - add KPI: `drops expiring in next 30 days`.
2. Member detail:
   - show split:
     - wallet balance
     - earned leaderboard score
     - upcoming expiry buckets.
3. Add tooltip in leaderboard modules:
   - "Score uses earned drops; spending rewards does not reduce rank."

---

### Step 6: Testing and Release Safety (test-automation-agent + reviewer)

**Workspace:** cross-workspace

1. DB tests:
   - earn 2000, redeem 1200 -> wallet 800, leaderboard score remains earned value.
   - expiry job deducts only expired amounts.
2. Mobile integration tests:
   - leaderboard explanation visible
   - wallet expiry card values match RPC.
3. Regression:
   - prize distribution unaffected by leaderboard score source change.
4. Reviewer:
   - verify no data leakage and no ranking regressions.

---

## API Contracts

### `get_leaderboard(...)` (updated semantics)
- Gym all-time must use earned score source (not wallet balance).

### `get_user_expiring_drops(...)`
- `expiring_in_7d: int`
- `expiring_in_30d: int`
- `next_expiry_date: timestamptz | null`

### `get_user_drops_ledger_summary(...)`
- `wallet_balance: int`
- `earned_score_weekly: int`
- `earned_score_monthly: int`
- `earned_score_all_time: int`

---

## Agent Execution Order

1. **supabase-dba** (leaderboard semantics + expiry RPCs)
2. **mobile-coder** (leaderboard/wallet transparency UX)
3. **admin-coder** (ops visibility + member detail clarity)
4. **test-automation-agent** (e2e + DB verification)
5. **reviewer** (final risk/regression review)

---

## Success Criteria

- Redemption no longer lowers leaderboard score.
- 90-day expiry policy is consistently enforced and visible.
- Users clearly understand difference between wallet balance and leaderboard score.
- Admin can monitor upcoming expiry pressure and member impact.
