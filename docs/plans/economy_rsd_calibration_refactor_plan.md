# Feature: Economy RSD Calibration Refactor

## Context

Current Economy Settings shows unrealistic monetary equivalents (e.g. coffee ~= 12 RSD) because:
- `Drops ↔ RSD` starts from a fixed UI default (`10 drops = 1 RSD`).
- Conversion is not persisted per gym (session-local slider behavior).
- Price bands are tuned in drops, but owner evaluates business value in RSD.
- No calibration flow ties earning limits, reward pricing, and local market prices.

This creates poor trust in the economy screen and makes decision-making harder for gym owners.

---

## Why this is happening (root causes)

1. Conversion is UI-only and not source-of-truth in DB.
2. No gym-level exchange-rate configuration (`drops_per_rsd` / `rsd_per_drop`).
3. No anchor-based onboarding (e.g. "coffee should be 180-220 RSD").
4. Price bands and cap recommendations are displayed without local purchasing-context guardrails.

---

## Target Product Behavior

1. Every gym has a persisted exchange rate used consistently across admin pages.
2. Owner can calibrate economy with a short wizard:
   - target coffee price in RSD
   - target number of workouts to earn coffee
   - expected average drops per workout
3. System computes and suggests `drops_per_rsd` + updated bands.
4. RSD labels are clearly marked as "estimated business reference", not accounting truth.
5. Out-of-range warnings reflect both drop and RSD perspective.
6. Reward pricing supports explicit discount logic:
   - examples: coffee -20%, coffee -50%, membership -50%
   - final drop price is derived from base RSD price + discount + gym conversion.

---

## Dependencies

- Existing tokenomics tables and admin economy page are active.
- Economy publish flow exists (`updateEconomyConfig`).
- Reward categories and price-band validation already exist.
- Reward creation/edit in admin currently stores drop prices and needs extension.

---

## Discount Pricing Model (NEW)

### Canonical formulas

- `effective_rsd = base_price_rsd * (1 - discount_percent / 100)`
- `effective_drops = round(effective_rsd * drops_per_rsd)`

Where:
- `base_price_rsd` = full regular price (e.g. coffee 200 RSD, membership 4000 RSD)
- `discount_percent` in range `0..95`
- `drops_per_rsd` = gym conversion from tokenomics calibration

### Examples

If `drops_per_rsd = 2.0`:
- Coffee 200 RSD, 20% off:
  - `effective_rsd = 160`
  - `effective_drops = 320`
- Coffee 200 RSD, 50% off:
  - `effective_rsd = 100`
  - `effective_drops = 200`
- Membership 4000 RSD, 50% off:
  - `effective_rsd = 2000`
  - `effective_drops = 4000`

### Business rules

1. Discount is always applied to base price (never chained).
2. Final drops must be >= 1 and rounded consistently (nearest integer or nearest 5 if configured).
3. Optional category floor in RSD-equivalent prevents absurdly low prices.
4. Keep `price_drops` as operational redemption field for backward compatibility.
5. Store snapshots for audit (base RSD, discount, conversion at save time).

---

## Execution Plan

### Step 1: Data Model + Contracts (supabase-dba)

**Workspace:** `backend/supabase/`

1. Create migration: `YYYYMMDDHHMMSS_add_economy_currency_calibration.sql`.
2. Add gym-level persisted fields (preferred in `tokenomics_config`):
   - `drops_per_rsd NUMERIC(10,4) NOT NULL DEFAULT 2.0000`
   - `currency_code TEXT NOT NULL DEFAULT 'RSD'`
   - `calibration_version INTEGER NOT NULL DEFAULT 1`
   - optional `calibration_meta JSONB NOT NULL DEFAULT '{}'::jsonb` (anchors and assumptions)
3. Add constraints:
   - `drops_per_rsd > 0.05 AND drops_per_rsd < 1000`
4. Backfill:
   - existing rows get `drops_per_rsd = 2.0` (safe neutral baseline)
5. Add optional helper RPC:
   - `preview_economy_calibration(...) RETURNS jsonb`
   - computes suggested `drops_per_rsd`, coffee band in drops, and impact summary.
6. Extend `rewards` with discount-aware fields:
   - `base_price_rsd NUMERIC(10,2) NULL`
   - `discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 95)`
   - `price_calc_mode TEXT NOT NULL DEFAULT 'manual_drops' CHECK (price_calc_mode IN ('manual_drops','discount_from_rsd'))`
   - `final_price_rsd_snapshot NUMERIC(10,2) NULL`
   - `drops_per_rsd_snapshot NUMERIC(10,4) NULL`
7. Add helper function:
   - `compute_reward_price_drops(p_gym_id uuid, p_base_price_rsd numeric, p_discount_percent numeric) returns table(effective_rsd numeric, effective_drops int, drops_per_rsd numeric)`
8. Migration backfill strategy:
   - Existing rewards remain `price_calc_mode='manual_drops'`.
   - New discount flow is opt-in and backward compatible.
9. Optional trigger:
   - On insert/update in discount mode, recalc `price_drops` from formula and persist snapshots.

---

### Step 2: Admin Economy UX Refactor (admin-coder)

**Workspace:** `apps/admin-panel/`

1. Replace local-only `dropsPerRsd` state with persisted value from backend config.
2. Load/save conversion through existing economy actions:
   - include `dropsPerRsd` in `getEconomyConfig` response
   - publish persists `drops_per_rsd`
3. Add "Calibration Wizard" in Economy page:
   - inputs:
     - coffee target price (RSD)
     - workouts to earn coffee
     - average drops/workout (default from 30d data)
   - output:
     - suggested `drops_per_rsd`
     - suggested coffee/protein/day-pass bands in drops
4. Add "Apply Suggestions" action:
   - updates conversion + selected price bands in one publish transaction.
5. Improve labels:
   - "Estimated value (RSD, reference only)"
   - show both drops and RSD in all price-band rows and compliance table.
6. Guardrails copy:
   - if coffee falls below local floor (e.g. < 120 RSD), show warning badge.
7. Add discount pricing support in store forms:
   - Pricing mode toggle:
     - `Manual (drops)`
     - `Discount from RSD`
   - Inputs for discount mode:
     - `Base price (RSD)`
     - `Discount (%)`
   - Live computed outputs:
     - `Final price (RSD)`
     - `Final price (drops)`
8. Add helper presets in discount UI:
   - quick chips: `-10%`, `-20%`, `-30%`, `-50%`
9. Show clear formula preview under input:
   - `base_rsd x (1 - discount%) x drops_per_rsd = final_drops`
10. Compliance table updates:
   - display base RSD, discount %, final drops, final RSD estimate.

---

### Step 3: Economy Actions Alignment (admin-coder + supabase-dba contract)

**Workspace:** `apps/admin-panel/lib/actions/`

1. Extend `EconomyConfig` type:
   - add `dropsPerRsd`, `currencyCode`.
2. Update `getEconomyConfig()`:
   - map DB columns to frontend config.
3. Update `updateEconomyConfig()`:
   - persist conversion fields on publish.
4. Ensure conversion is included in smoke tests and action tests.
5. Extend store actions schemas for new reward fields:
   - `priceCalcMode`, `basePriceRsd`, `discountPercent`
6. On create/update in discount mode:
   - compute via helper RPC/function
   - persist both operational `price_drops` and snapshot fields.
7. Prevent invalid saves:
   - missing base price in discount mode
   - discount outside range
   - computed drops <= 0

---

### Step 4: Optional Mobile Display Consistency (mobile-coder)

**Workspace:** `apps/mobile-app/`

1. If mobile shows any money equivalents for rewards:
   - fetch gym conversion policy and use same `drops_per_rsd`.
2. Keep money labels secondary:
   - primary remains drops.
3. Do not block redemption on RSD conversion mismatch; conversion is informational.

---

### Step 5: QA and Validation (test-automation-agent + reviewer)

**Workspace:** cross-workspace

1. Admin tests:
   - conversion persists after refresh/login.
   - "Apply Suggestions" updates both conversion and bands.
2. DB tests:
   - constraints reject invalid conversion values.
3. Snapshot tests:
   - ensure displayed RSD values update consistently across cards/tables.
4. Reviewer checklist:
   - no hardcoded `10 drops = 1 RSD` in economy module.
   - no hidden local-only conversion state.
5. Discount tests:
   - coffee 20% and 50% scenarios produce expected drop prices.
   - membership 50% scenario matches formula.
   - switching conversion rate re-computes only discount-mode rewards, not manual-mode rewards.
6. Audit tests:
   - snapshots are stored and visible in admin details.
   - historical reward price remains explainable even if conversion changes later.

---

## API / Contract Requirements

### Economy Config Contract (read)
- `maxDropsPerSession`
- `maxDropsPerDay`
- `maxDropsPerWeek`
- `maxRewardedSessionsPerDay`
- `maxCheckinDropsPerDay`
- `priceBandJson`
- `dropsPerRsd` (new)
- `currencyCode` (new)
- optional `calibrationMeta` (new)

### Economy Publish Contract (write)
- existing fields +
- `dropsPerRsd`
- `currencyCode`
- optional `calibrationMeta`

### Reward Create/Update Contract (NEW)
- Existing:
  - `priceDrops`
- New:
  - `priceCalcMode: 'manual_drops' | 'discount_from_rsd'`
  - `basePriceRsd?: number`
  - `discountPercent?: number`
- Derived:
  - `finalPriceRsdSnapshot`
  - `dropsPerRsdSnapshot`

---

## Recommended Initial Calibration (for Serbia market)

Use this as initial default for pilot gyms:
- Coffee target: `180–220 RSD`
- Workouts to earn coffee: `4–6`
- Avg drops/workout target: `70–90`

This typically yields:
- `drops_per_rsd` roughly in range `1.4–2.5`
- which is far more realistic than fixed `10`.

---

## Agent Execution Order

1. **supabase-dba** (schema + optional preview RPC)
2. **admin-coder** (actions + page UX + calibration wizard)
3. **mobile-coder** (only if mobile money labels exist)
4. **test-automation-agent** (regression and calibration scenarios)
5. **reviewer** (final sanity/risk review)

---

## Agent Runbook (copy order)

### Agent 1 - `supabase-dba`
- Deliverables:
  - migration for calibration fields in `tokenomics_config`
  - migration for reward discount model fields
  - helper compute function/RPC
  - optional trigger for discount mode price sync
- Exit criteria:
  - SQL validation queries proving formula outputs for:
    - coffee -20%
    - coffee -50%
    - membership -50%

### Agent 2 - `admin-coder`
- Deliverables:
  - economy page reads/persists gym conversion (no local-only fallback)
  - calibration wizard + Apply Suggestions
  - store form discount mode with live formula preview
  - compliance table extended with base/discount/final columns
- Exit criteria:
  - creating reward in discount mode stores expected `price_drops`.

### Agent 3 - `mobile-coder` (if needed)
- Deliverables:
  - any RSD label uses gym conversion source
  - labels remain informational, drops remain primary
- Exit criteria:
  - no hardcoded conversion in mobile reward UI.

### Agent 4 - `test-automation-agent`
- Deliverables:
  - integration tests for conversion persistence and discount formulas
  - regression tests for manual mode backward compatibility
- Exit criteria:
  - all economy/store tests pass in CI.

### Agent 5 - `reviewer`
- Deliverables:
  - risk review: rounding, precision, backward compatibility, migration safety
  - UX review: no misleading "cheap coffee" outputs
- Exit criteria:
  - explicit approve/reject with findings.

---

## Success Criteria

- Economy page no longer shows absurd RSD equivalents.
- Conversion is persisted per gym and remains stable.
- Gym owners can calibrate quickly without manual trial-and-error.
- Reward pricing decisions become understandable in both drops and RSD.
