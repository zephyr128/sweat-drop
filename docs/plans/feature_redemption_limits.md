# Feature: Redemption Limits for Store Items

**Datum:** 2026-03-12
**Prioritet:** Feature
**Lokacija:** Backend + Admin Panel + Mobile App

## Context

Currently the `rewards` table has a simple `is_one_time BOOLEAN` column (added in
`20260302000006_extend_rewards_schema.sql`) but it is **never exposed in the admin panel
UI** — the `StoreManager.tsx` form and `store-actions.ts` don't include it. The `claim_reward`
function already checks `is_one_time` and blocks duplicate pending claims, but there is
no concept of time-based limits (per day, per week, per month).

### Current State

| What exists | Where | Status |
|---|---|---|
| `rewards.is_one_time` column | DB migration `20260302000006` | Exists but unused by admin UI |
| `is_one_time` check in `claim_reward` | `20260311000004_fix_claim_reward_ambiguous_column.sql` | Works, checks `EXISTS` on `(user_id, reward_id)` |
| Duplicate pending check | Same `claim_reward` | Blocks second `pending` claim for same reward |
| Admin store form | `StoreManager.tsx` + `store-actions.ts` | No `is_one_time` or limit field |
| Mobile store | `store.tsx` | No limit display, relies on server errors |

### Goal

Replace the binary `is_one_time` with a flexible `redemption_limit` system:

```
No limit       → user can claim unlimited times (subject to stock/balance)
Once (ever)    → user can claim exactly once, ever (replaces is_one_time)
Once per day   → user can claim once per calendar day
Once per week  → user can claim once per calendar week
Once per month → user can claim once per calendar month
```

---

## Dependencies

- `rewards` table — `is_one_time` column (to be superseded)
- `redemptions` table — `user_id`, `reward_id`, `status`, `created_at`
- `claim_reward()` function — needs limit check logic
- `StoreManager.tsx` — needs new form field
- `store-actions.ts` — needs to persist new column
- `store.tsx` (mobile) — needs to display limit info

---

## Execution Order

```
PHASE 1: DBA Agent   — Add column, update claim_reward
PHASE 2: Admin Agent — Add dropdown to store form, update actions
PHASE 3: Mobile Agent — Display limit info, handle new errors, i18n
```

---

## PHASE 1 — DBA Agent

### Migration: `backend/supabase/migrations/20260324000002_redemption_limits.sql`

### Task 1A: Add `redemption_limit` column to `rewards`

```sql
-- Add flexible redemption limit column
-- Replaces the binary is_one_time with richer options
ALTER TABLE public.rewards
  ADD COLUMN IF NOT EXISTS redemption_limit TEXT DEFAULT 'unlimited' NOT NULL;

-- Add CHECK constraint for valid values
ALTER TABLE public.rewards
  ADD CONSTRAINT chk_rewards_redemption_limit
  CHECK (redemption_limit IN ('unlimited', 'once', 'once_per_day', 'once_per_week', 'once_per_month'));

COMMENT ON COLUMN public.rewards.redemption_limit IS
  'Controls how often each user can claim this reward: '
  'unlimited = no limit, once = one claim ever, '
  'once_per_day/week/month = one claim per calendar period';

-- Migrate existing is_one_time data
UPDATE public.rewards
SET redemption_limit = 'once'
WHERE is_one_time = true;

-- Keep is_one_time for backward compatibility but mark as deprecated
COMMENT ON COLUMN public.rewards.is_one_time IS
  'DEPRECATED: Use redemption_limit instead. Kept for backward compat.';
```

### Task 1B: Update `claim_reward` function

Replace the simple `is_one_time` check with the full limit logic.
The key change is in steps 5-6 of the function.

```sql
CREATE OR REPLACE FUNCTION public.claim_reward(
  p_user_id   UUID,
  p_reward_id UUID,
  p_gym_id    UUID
)
RETURNS TABLE(
  success         BOOLEAN,
  redemption_id   UUID,
  redemption_code TEXT,
  error_message   TEXT
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reward        RECORD;
  v_membership    RECORD;
  v_code          TEXT;
  v_redemption_id UUID;
  v_balance_after INTEGER;
  v_existing      INTEGER;
  v_period_start  TIMESTAMPTZ;
BEGIN
  -- 1. LOCK REWARD ROW
  SELECT * INTO v_reward
  FROM public.rewards
  WHERE id = p_reward_id AND gym_id = p_gym_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'Reward not found'::TEXT;
    RETURN;
  END IF;

  -- 2. ACTIVE CHECK
  IF NOT v_reward.is_active THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'Reward is not active'::TEXT;
    RETURN;
  END IF;

  -- 3. AVAILABILITY WINDOW CHECK
  IF v_reward.available_from IS NOT NULL AND v_reward.available_from > NOW() THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'Reward is not yet available'::TEXT;
    RETURN;
  END IF;

  IF v_reward.available_until IS NOT NULL AND v_reward.available_until < NOW() THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'Reward has expired'::TEXT;
    RETURN;
  END IF;

  -- 4. STOCK CHECK
  IF v_reward.stock IS NOT NULL AND v_reward.stock <= 0 THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'Out of stock'::TEXT;
    RETURN;
  END IF;

  -- 5. REDEMPTION LIMIT CHECK (replaces old is_one_time logic)
  IF v_reward.redemption_limit != 'unlimited' THEN

    -- Determine the period start for time-based limits
    CASE v_reward.redemption_limit
      WHEN 'once' THEN
        -- "Once ever" — check ALL redemptions regardless of time
        v_period_start := '-infinity'::TIMESTAMPTZ;
      WHEN 'once_per_day' THEN
        v_period_start := DATE_TRUNC('day', NOW() AT TIME ZONE 'Europe/Belgrade')
                          AT TIME ZONE 'Europe/Belgrade';
      WHEN 'once_per_week' THEN
        v_period_start := DATE_TRUNC('week', NOW() AT TIME ZONE 'Europe/Belgrade')
                          AT TIME ZONE 'Europe/Belgrade';
      WHEN 'once_per_month' THEN
        v_period_start := DATE_TRUNC('month', NOW() AT TIME ZONE 'Europe/Belgrade')
                          AT TIME ZONE 'Europe/Belgrade';
    END CASE;

    SELECT COUNT(*) INTO v_existing
    FROM public.redemptions r
    WHERE r.user_id = p_user_id
      AND r.reward_id = p_reward_id
      AND r.status IN ('pending', 'confirmed')
      AND (v_reward.redemption_limit = 'once' OR r.created_at >= v_period_start);

    IF v_existing > 0 THEN
      RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT,
        CASE v_reward.redemption_limit
          WHEN 'once'           THEN 'You can only claim this reward once'
          WHEN 'once_per_day'   THEN 'You already claimed this reward today'
          WHEN 'once_per_week'  THEN 'You already claimed this reward this week'
          WHEN 'once_per_month' THEN 'You already claimed this reward this month'
        END::TEXT;
      RETURN;
    END IF;
  ELSE
    -- 6. DUPLICATE PENDING CHECK (for unlimited rewards, keep existing behavior)
    IF EXISTS (
      SELECT 1 FROM public.redemptions r
      WHERE r.user_id = p_user_id
        AND r.reward_id = p_reward_id
        AND r.status = 'pending'
    ) THEN
      RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT,
        'You already have a pending claim for this reward'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- 7. LOCK MEMBERSHIP ROW
  SELECT * INTO v_membership
  FROM public.gym_memberships
  WHERE user_id = p_user_id AND gym_id = p_gym_id
  FOR UPDATE;

  IF NOT FOUND OR v_membership.local_drops_balance < v_reward.price_drops THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT,
      format('Insufficient drops. You have %s, need %s',
        COALESCE(v_membership.local_drops_balance, 0), v_reward.price_drops)::TEXT;
    RETURN;
  END IF;

  -- 8. DEDUCT FROM LOCAL BALANCE
  UPDATE public.gym_memberships
  SET local_drops_balance = local_drops_balance - v_reward.price_drops,
      updated_at = NOW()
  WHERE user_id = p_user_id AND gym_id = p_gym_id;

  UPDATE public.profiles
  SET available_drops = GREATEST(0, available_drops - v_reward.price_drops),
      updated_at = NOW()
  WHERE id = p_user_id;

  -- 9. DECREMENT STOCK
  IF v_reward.stock IS NOT NULL THEN
    UPDATE public.rewards
    SET stock = stock - 1,
        updated_at = NOW()
    WHERE id = p_reward_id;
  END IF;

  -- 10. GENERATE UNIQUE 4-CHAR CODE
  LOOP
    v_code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 4));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.redemptions r
      WHERE r.redemption_code = v_code AND r.status = 'pending'
    );
  END LOOP;

  -- 11. CREATE REDEMPTION RECORD
  INSERT INTO public.redemptions
    (user_id, reward_id, gym_id, drops_spent, status, redemption_code)
  VALUES
    (p_user_id, p_reward_id, p_gym_id, v_reward.price_drops, 'pending', v_code)
  RETURNING id INTO v_redemption_id;

  -- 12. LEDGER ENTRY
  SELECT available_drops INTO v_balance_after
  FROM public.profiles WHERE id = p_user_id;

  INSERT INTO public.drops_transactions
    (user_id, gym_id, amount, transaction_type, reference_id, balance_after, description)
  VALUES
    (p_user_id, p_gym_id, -v_reward.price_drops, 'reward_claim',
     v_redemption_id, v_balance_after, 'Reward: ' || v_reward.name);

  -- 13. RETURN SUCCESS
  RETURN QUERY SELECT true, v_redemption_id, v_code, NULL::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_reward(UUID, UUID, UUID) TO authenticated;
```

**Key changes from current version:**
- Step 5: replaced `IF v_reward.is_one_time AND EXISTS(...)` with a `CASE` on `redemption_limit`
- Time-based limits use `DATE_TRUNC` at `Europe/Belgrade` timezone (matches existing app conventions)
- For `once`: checks ALL previous claims (any status except `cancelled`)
- For `once_per_day/week/month`: checks claims within the current calendar period
- Counts both `pending` and `confirmed` claims — a pending claim from today blocks another today claim
- The old `is_one_time` is still read in legacy code paths but the new function ignores it

### Task 1C: Add index for efficient limit checks

```sql
CREATE INDEX IF NOT EXISTS idx_redemptions_user_reward_created
  ON public.redemptions(user_id, reward_id, created_at)
  WHERE status IN ('pending', 'confirmed');

COMMENT ON INDEX idx_redemptions_user_reward_created IS
  'Supports redemption limit checks in claim_reward: '
  'fast count of user claims per reward in time window';
```

### Validation

```sql
-- Test 1: Create reward with 'once_per_day' limit, claim it, try claiming again
-- → second claim should fail with "You already claimed this reward today"

-- Test 2: Create reward with 'once' limit, claim it, confirm it, try again
-- → should fail with "You can only claim this reward once"

-- Test 3: 'unlimited' reward should allow multiple claims (but not duplicate pending)

-- Test 4: 'once_per_week' — claim on Monday, try again on Tuesday (same week)
-- → should fail. Wait until next Monday → should succeed.

-- Verify migration:
SELECT id, name, is_one_time, redemption_limit FROM rewards;
-- All is_one_time=true rows should have redemption_limit='once'
```

---

## PHASE 2 — Admin Agent

### Task 2A: Update `store-actions.ts`

**File:** `apps/admin-panel/lib/actions/store-actions.ts`

Add `redemptionLimit` to both `createStoreItemSchema` and `updateStoreItemSchema` Zod schemas:

```typescript
// Add to Zod schema:
redemptionLimit: z.enum(['unlimited', 'once', 'once_per_day', 'once_per_week', 'once_per_month']).default('unlimited'),
```

In the `createStoreItem` function, add to the insert object:

```typescript
redemption_limit: validated.redemptionLimit,
```

In the `updateStoreItem` function, add to the update object:

```typescript
redemption_limit: validated.redemptionLimit,
```

### Task 2B: Update `StoreManager.tsx` form

**File:** `apps/admin-panel/components/modules/StoreManager.tsx`

Add `redemptionLimit` to the form's Zod schema and default values:

```typescript
// In form schema:
redemptionLimit: z.enum(['unlimited', 'once', 'once_per_day', 'once_per_week', 'once_per_month']).default('unlimited'),

// In default values:
redemptionLimit: 'unlimited',
```

Add the Redemption Limit dropdown to the create/edit modal, after the stock field:

```
┌────────────────────────────────────────┐
│  Redemption Limit                       │
│  ┌──────────────────────────────────┐  │
│  │  No limit                     ▼  │  │
│  └──────────────────────────────────┘  │
│  How often can each member claim this?  │
└────────────────────────────────────────┘
```

**Dropdown options with labels:**

| Value | Label | Description hint |
|---|---|---|
| `unlimited` | No limit | Members can claim multiple times |
| `once` | Once (ever) | Each member can claim exactly once |
| `once_per_day` | Once per day | Resets daily at midnight |
| `once_per_week` | Once per week | Resets every Monday |
| `once_per_month` | Once per month | Resets on the 1st |

**UI implementation:**

```tsx
<div>
  <label className="block text-sm font-medium text-zinc-400 mb-1">
    Redemption Limit
  </label>
  <select
    {...register('redemptionLimit')}
    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white"
  >
    <option value="unlimited">No limit</option>
    <option value="once">Once (ever)</option>
    <option value="once_per_day">Once per day</option>
    <option value="once_per_week">Once per week</option>
    <option value="once_per_month">Once per month</option>
  </select>
  <p className="text-xs text-zinc-500 mt-1">
    How often can each member claim this reward?
  </p>
</div>
```

When editing an existing reward, populate the dropdown from the reward's `redemption_limit` field.

### Task 2C: Show limit badge in store item list

In the store items table/grid in `StoreManager.tsx`, add a small badge showing the limit:

- `unlimited` → no badge (default, don't clutter)
- `once` → `🔒 One-time` badge in `text-amber-400`
- `once_per_day` → `📅 Daily` badge
- `once_per_week` → `📅 Weekly` badge
- `once_per_month` → `📅 Monthly` badge

### Task 2D: Update store item display in redemptions table (if applicable)

If the admin redemptions view (`RedemptionTerminal` or similar) shows the reward name,
optionally show the limit badge next to it. This is low priority.

---

## PHASE 3 — Mobile Agent

### Task 3A: Display limit info on store items

**File:** `apps/mobile-app/app/store.tsx`

When fetching rewards, include `redemption_limit` in the select query.

Display the limit info on each store item card:

```
┌────────────────────────────┐
│  ☕ Free Coffee      50 💧  │
│  "Enjoy a free coffee..."   │
│                              │
│  📅 Once per day             │  ← limit badge (only shown if not 'unlimited')
│                              │
│  [Claim]                     │
└────────────────────────────┘
```

For items already claimed within the current period, show the button as disabled:

```
│  [✓ Claimed today]          │  ← grayed out, no action
```

**To check if already claimed in current period client-side:** query `redemptions` for
this user + reward where `status IN ('pending', 'confirmed')` and `created_at` is within
the current period. Or, simpler: just attempt the claim and handle the server error
gracefully (existing pattern).

**Recommended approach:** Keep it simple — let the server `claim_reward` do the validation.
On error, show the specific error message from the RPC (`"You already claimed this reward today"`).
Optionally, after a successful fetch of rewards, also fetch the user's recent redemptions
to pre-disable buttons (better UX, avoids the alert).

### Task 3B: Handle new error messages

The `claim_reward` function now returns more specific error messages. The mobile app
already shows `data.error_message` in an Alert. Ensure these new messages display well:

- `"You can only claim this reward once"`
- `"You already claimed this reward today"`
- `"You already claimed this reward this week"`
- `"You already claimed this reward this month"`

### Task 3C: Add i18n strings

**Files:** `apps/mobile-app/locales/en/store.json`, `apps/mobile-app/locales/sr/store.json`

Add translations for limit labels and error messages:

```json
// en/store.json additions:
{
  "limitOnce": "One-time only",
  "limitDaily": "Once per day",
  "limitWeekly": "Once per week",
  "limitMonthly": "Once per month",
  "alreadyClaimed": "Already claimed",
  "claimedToday": "Claimed today",
  "claimedThisWeek": "Claimed this week",
  "claimedThisMonth": "Claimed this month"
}
```

```json
// sr/store.json additions:
{
  "limitOnce": "Samo jednom",
  "limitDaily": "Jednom dnevno",
  "limitWeekly": "Jednom nedeljno",
  "limitMonthly": "Jednom mesečno",
  "alreadyClaimed": "Već preuzeto",
  "claimedToday": "Preuzeto danas",
  "claimedThisWeek": "Preuzeto ove nedelje",
  "claimedThisMonth": "Preuzeto ovog meseca"
}
```

### Task 3D: Pre-disable claimed items (optional UX enhancement)

For better UX (no alert needed), after loading store items, fetch the user's
redemptions for the current day/week/month and cross-reference:

```typescript
const { data: myRedemptions } = await supabase
  .from('redemptions')
  .select('reward_id, created_at, status')
  .eq('user_id', session.user.id)
  .eq('gym_id', activeGymId)
  .in('status', ['pending', 'confirmed']);

// For each reward, check if already claimed within its limit period
function isClaimedInPeriod(reward: Reward, redemptions: Redemption[]): boolean {
  if (reward.redemption_limit === 'unlimited') return false;

  const matching = redemptions.filter(r => r.reward_id === reward.id);
  if (matching.length === 0) return false;

  if (reward.redemption_limit === 'once') return true;

  const now = new Date();
  const periodStart = getPeriodStart(reward.redemption_limit, now);
  return matching.some(r => new Date(r.created_at) >= periodStart);
}
```

---

## Testing Requirements

### DBA
- [ ] `redemption_limit` column exists with correct CHECK constraint
- [ ] Existing `is_one_time = true` rewards migrated to `redemption_limit = 'once'`
- [ ] `claim_reward` blocks `once` rewards after first claim
- [ ] `claim_reward` blocks `once_per_day` rewards on same calendar day
- [ ] `claim_reward` blocks `once_per_week` rewards in same calendar week
- [ ] `claim_reward` blocks `once_per_month` rewards in same calendar month
- [ ] `claim_reward` allows re-claim after period resets (next day/week/month)
- [ ] `unlimited` rewards still allow multiple claims (no regression)
- [ ] Cancelled claims don't count toward the limit
- [ ] Error messages are specific to the limit type

### Admin
- [ ] Redemption Limit dropdown appears in create form
- [ ] Redemption Limit dropdown appears in edit form with correct value
- [ ] Creating item with `once_per_day` saves correctly to DB
- [ ] Limit badge shows in store item list
- [ ] `unlimited` items show no badge (clean default)

### Mobile
- [ ] Store item cards show limit info when not `unlimited`
- [ ] Claim button disabled/labeled when already claimed in current period
- [ ] Error messages display correctly for each limit type
- [ ] Claim works normally for `unlimited` items (no regression)
- [ ] i18n strings display in both English and Serbian

---

## Files Summary

| Phase | Agent | File | Action |
|-------|-------|------|--------|
| 1 | DBA | `backend/supabase/migrations/20260324000002_redemption_limits.sql` | Add column, update claim_reward, add index |
| 2 | Admin | `apps/admin-panel/lib/actions/store-actions.ts` | Add `redemptionLimit` to schemas + insert/update |
| 2 | Admin | `apps/admin-panel/components/modules/StoreManager.tsx` | Add dropdown + limit badge |
| 3 | Mobile | `apps/mobile-app/app/store.tsx` | Display limit, handle errors, pre-disable |
| 3 | Mobile | `apps/mobile-app/locales/en/store.json` | Add i18n strings |
| 3 | Mobile | `apps/mobile-app/locales/sr/store.json` | Add i18n strings |
