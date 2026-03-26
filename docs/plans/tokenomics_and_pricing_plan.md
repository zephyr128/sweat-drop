# Tokenomics and Pricing Plan (Production)

**Date:** 2026-03-12  
**Priority:** Critical  
**Workspaces:** Backend + Admin + Product Ops

## Context

We need a production-grade drop economy:
- predictable issuance,
- sustainable redemption cost,
- anti-whale controls,
- simple admin controls for gym owners.

This plan defines a practical v1 tokenomics system for launch.

## Objectives

1. Keep user motivation high (daily engagement).
2. Keep redemption liabilities bounded per gym.
3. Prevent abuse and economy inflation.
4. Make pricing understandable for gym owners.

## Core Economic Model (v1)

### 1) Drops Earning Boundaries

Set global defaults (override per gym allowed in admin):
- `max_drops_per_session`: 120
- `max_rewarded_sessions_per_day`: 4
- `max_drops_per_day`: 300
- `max_drops_per_week`: 1500
- `max_checkin_drops_per_day`: 1 check-in reward/day

Rationale:
- enough to feel progress daily,
- hard to farm unlimited drops,
- easy for operators to reason about.

### 2) Challenge Reward Boundaries

Constraints:
- `reward_drops` cannot exceed 30% of average weekly base earnings.
- monthly/seasonal events may exceed this only with superadmin approval.
- stack cap: challenge rewards + session rewards still cannot exceed daily/weekly caps.

### 3) Redemption Price Bands

Define baseline by category:
- Coffee / drink: 120–220 drops
- Protein snack / bar: 180–320 drops
- Day pass / guest pass: 500–900 drops
- PT intro session: 1200–2200 drops
- Merch small: 700–1500 drops
- Premium merch: 1800–4000 drops

Gym owner may configure item price only inside allowed band unless superadmin unlocks.

### 4) Target Redemption Rates

Healthy operating range:
- Weekly redemption conversion: 8%–18% of active users.
- Monthly drops burn/mint ratio target: 20%–45%.
  - <20% burn = inflation risk.
  - >45% burn = economy too tight, motivation drops.

### 5) Anti-Whale Deceleration (optional v1.1)

If user hits 90% of daily cap:
- reduce incremental earning multiplier (e.g. 0.7x) until daily reset.

If user exceeds weekly threshold repeatedly:
- send for risk review, do not hard ban automatically.

## Phase 1 — Data Model and Config (supabase-dba)

Create migration:
- `backend/supabase/migrations/20260324000011_tokenomics_controls.sql`

Add tables:

1) `tokenomics_config`
- `gym_id` nullable (null = global default)
- caps and band settings:
  - `max_drops_per_session`,
  - `max_drops_per_day`,
  - `max_drops_per_week`,
  - `max_rewarded_sessions_per_day`,
  - `price_band_json` (category min/max),
  - `enabled_at`, `updated_at`.

2) `drop_limit_counters`
- materialized counters by user/day/week for fast checks.

3) `economy_snapshots_daily`
- gym/day metrics:
  - minted_drops,
  - burned_drops,
  - unique_earners,
  - unique_redeemers,
  - burn_mint_ratio,
  - top1_share_pct.

Update `award_drops`:
- apply cap logic before final mint.

Update `claim_reward`:
- ensure price floors and sanity checks, log burn metrics.

## Phase 2 — Admin Controls (admin-coder)

### 2.1 New Economy settings page

Route:
- `apps/admin-panel/app/dashboard/gym/[id]/economy/page.tsx`

Sections:
1. **Issuance Caps**
   - per session/day/week
2. **Reward Pricing Assistant**
   - suggest price based on target redemption window
3. **Health Indicators**
   - burn/mint ratio
   - top user concentration
   - outlier alerts

### 2.2 Store Price Guardrails

In StoreManager:
- when creating/editing reward, validate price against category band.
- show helper text:
  - “Recommended: 150–220 for coffee based on your gym activity.”

### 2.3 Economy Alerts Widget

Dashboard widget:
- “Economy Health”
  - Green: in target zone.
  - Yellow: inflation or over-tight.
  - Red: extreme imbalance.

## Phase 3 — Analytics and Calibration (reviewer + product + data)

### 3.1 90-day Simulation

Run scenarios:
- low engagement gym,
- average gym,
- high engagement gym,
- abuse attempt spikes.

Outputs:
- expected liabilities,
- average days to first redemption,
- top-user concentration.

### 3.2 Pilot tuning loop

Weekly cadence:
1. review metrics,
2. adjust caps/pricing bands,
3. re-run simulation,
4. publish parameter changelog.

## Initial Recommended Defaults (Launch)

Use these for first production cohort:

- Session drops cap: 120
- Daily drops cap: 300
- Weekly drops cap: 1500
- Max rewarded sessions/day: 4
- Check-in drops: 1/day
- Challenge reward cap:
  - daily challenge <= 40
  - weekly <= 120
  - monthly <= 300

These are starting points, not permanent values.

## Success Metrics

- Burn/Mint ratio in 20%–45% band.
- Median time-to-first-redemption: 7–21 days.
- Top 1% users hold <20% of newly minted weekly drops.
- Fraud-adjusted drop reversals <1.5% of minted volume.

## Deal Breakers (No-Go)

- [ ] No hard issuance caps in backend.
- [ ] Store prices fully unconstrained with no warnings.
- [ ] No daily economy snapshot or alerting.
- [ ] No documented fallback if inflation spikes in first 2 weeks.

## Deliverables

- Tokenomics DB config + enforcement.
- Admin Economy page.
- Store pricing guardrails.
- Simulation report + launch defaults.
