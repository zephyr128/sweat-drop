# SWEATDROP MVP — Full System Audit & Build Plan

**Created:** 2026-03-02  
**Updated:** 2026-03-02 — Phase 0, 1, 2 complete. Shared types updated.  
**Author:** Lead System Architect  
**Status:** ✅ SUPABASE DBA PHASES 0–2 COMPLETE — READY FOR MOBILE & ADMIN AGENTS

---

## TABLE OF CONTENTS

1. [Audit Results](#1-audit-results)
2. [Schema Status](#2-schema-status)
3. [Agent Task List](#3-agent-task-list)
4. [Shared TypeScript Types](#4-shared-typescript-types)
5. [API Contracts](#5-api-contracts)
6. [Blockers](#6-blockers)
7. [Questions](#7-questions)

---

## 1. AUDIT RESULTS

### 1.1 What Exists ✅

| Area | Component | Status |
|------|-----------|--------|
| **DB Schema** | `gyms` table | ✅ Exists (with `owner_id`, branding) |
| **DB Schema** | `profiles` table | ✅ Exists (with `role`, `admin_gym_id`, `total_drops`) |
| **DB Schema** | `machines` table | ✅ Exists (with `sensor_id`, `qr_uuid`, `is_busy`, `current_user_id`, `last_heartbeat`) |
| **DB Schema** | `sessions` table | ✅ Exists (with `machine_id`, `drops_earned`, `duration_seconds`) |
| **DB Schema** | `drops_transactions` table | ✅ Exists (basic audit trail) |
| **DB Schema** | `rewards` table | ✅ Exists (with `stock`, `price_drops`) |
| **DB Schema** | `redemptions` table | ✅ Exists (with `redemption_code`, atomic functions) |
| **DB Schema** | `gym_challenges` table | ✅ Exists (renamed from `challenges`, with `criteria` JSONB) |
| **DB Schema** | `challenge_progress` table | ✅ Exists (basic tracking) |
| **DB Schema** | `global_achievements` table | ✅ Exists (with `criteria` JSONB, `badge_image_url`) |
| **DB Schema** | `user_badges` table | ✅ Exists (polymorphic, references both achievements and challenges) |
| **DB Schema** | `gym_memberships` table | ✅ Exists (local drops per gym) |
| **DB Schema** | `gym_branding` table | ✅ Exists |
| **DB Schema** | `leaderboard_rewards` table | ✅ Exists |
| **DB Functions** | `add_drops()` | ✅ Exists (dual-wallet: global + local) |
| **DB Functions** | `end_session()` | ✅ Exists (calls `add_drops()`) |
| **DB Functions** | `create_redemption()` | ✅ Exists (atomic, with stock check) |
| **DB Functions** | `confirm_redemption()` | ✅ Exists |
| **DB Functions** | `cancel_redemption()` | ✅ Exists (with refund) |
| **DB Functions** | `find_redemption_by_code()` | ✅ Exists |
| **DB Functions** | `lock_machine()` / `unlock_machine()` | ✅ Exists |
| **DB Functions** | `update_machine_heartbeat()` | ✅ Exists |
| **DB Functions** | `get_local_leaderboard()` | ✅ Exists |
| **DB Functions** | `get_global_leaderboard()` | ✅ Exists |
| **DB Functions** | `get_gym_analytics()` | ✅ Exists |
| **DB Functions** | `get_user_badges()` | ✅ Exists |
| **DB Functions** | `pair_sensor_to_machine()` | ✅ Exists |
| **DB RBAC** | user_role enum | ✅ `superadmin`, `gym_owner`, `gym_admin`, `receptionist`, `user` |
| **DB RLS** | Multi-tenant isolation | ✅ On most tables |
| **Edge Functions** | `reset-challenges` | ✅ Exists |
| **Mobile** | Onboarding (auth, username, home gym) | ✅ Complete |
| **Mobile** | Home screen (drops ring, stats, activity chart) | ✅ Complete (premium UI) |
| **Mobile** | QR code scan | ✅ Complete |
| **Mobile** | Workout screen (BLE, real-time metrics) | ✅ Complete (CSC protocol) |
| **Mobile** | Session summary (drops, percentile, badges) | ✅ Complete |
| **Mobile** | Wallet screen | ✅ Complete |
| **Mobile** | Rewards store | ✅ Complete |
| **Mobile** | Challenges screen + detail | ✅ Complete |
| **Mobile** | Leaderboard screen | ✅ Complete |
| **Mobile** | Trophy Room | ✅ Complete |
| **Mobile** | Redemptions history | ✅ Complete |
| **Mobile** | Gym selection + preview | ✅ Complete |
| **Mobile** | Settings screen | ✅ Complete |
| **Mobile** | Design system (glassmorphism, branding) | ✅ Complete |
| **Admin** | Auth + RBAC middleware | ✅ Complete |
| **Admin** | Gym owner dashboard (analytics) | ✅ Complete |
| **Admin** | Machine management + BLE pairing | ✅ Complete |
| **Admin** | Rewards CRUD | ✅ Complete |
| **Admin** | Challenges CRUD | ✅ Complete |
| **Admin** | Redemption validation | ✅ Complete |
| **Admin** | Team management | ✅ Complete |
| **Admin** | Gym branding | ✅ Complete |
| **Admin** | Leaderboard rewards | ✅ Complete |
| **Admin** | Superadmin: gyms, machines, owners, achievements | ✅ Complete |

### 1.2 What's Missing ❌

| Area | Component | Priority | Notes |
|------|-----------|----------|-------|
| **DB Schema** | `profiles.available_drops` | 🔴 CRITICAL | Currently `total_drops` is both earned total AND balance. Spec requires separate `total_drops_earned` (never decreases) + `available_drops` (wallet balance). **This is a fundamental architecture change.** |
| **DB Schema** | `profiles.weekly_drops` / `monthly_drops` | 🔴 CRITICAL | Required for proper leaderboard periods. Currently leaderboards use `total_drops` / `local_drops_balance` only. |
| **DB Schema** | `profiles.streak_days` / `last_visit_date` | 🟡 HIGH | No streak tracking infrastructure |
| **DB Schema** | `profiles.level` | 🟢 LOW | Leveling system not required for MVP launch |
| **DB Schema** | `profiles.expo_push_token` | 🟡 HIGH | Required for push notifications |
| **DB Schema** | `profiles.is_newcomer` | 🟡 HIGH | Required for newcomer leaderboard |
| **DB Schema** | `gyms.code` (4-digit join code) | 🔴 CRITICAL | Spec requires members join via gym code, not gym selection |
| **DB Schema** | `gyms.subscription_plan` | 🟢 LOW | Feature gating. Has `subscription_type` on gyms RPC but not as column. |
| **DB Schema** | `machines.ble_protocol` enum | 🟡 HIGH | Need to know which protocol parser to use per machine |
| **DB Schema** | `machines.zone` / `label` | 🟢 LOW | Nice to have for gym mapping |
| **DB Schema** | `machines.status` enum | 🟢 LOW | Currently `is_active` boolean; spec wants 'pending'/'active'/'offline' |
| **DB Schema** | `sessions.calories` / `raw_metrics` / `multiplier` | 🟡 HIGH | No calorie tracking, no raw BLE data storage, no multiplier |
| **DB Schema** | `sessions.synced` flag | 🟢 LOW | For offline mode (not MVP) |
| **DB Schema** | `drops_transactions.gym_id` | 🟡 HIGH | Can't filter transaction history by gym |
| **DB Schema** | `drops_transactions.balance_after` | 🟡 HIGH | No balance snapshot for audit trail |
| **DB Schema** | `drops_transactions.expires_at` | 🟡 HIGH | No drop expiry system |
| **DB Schema** | `challenges.tiers` (JSONB) | 🟡 HIGH | Spec wants Bronze/Silver/Gold tier system |
| **DB Schema** | `challenges.scoring_model` | 🟡 HIGH | 'total_drops' / 'distance_km' / 'days_visited' |
| **DB Schema** | `challenges.sponsor_*` fields | 🟢 LOW | Sponsor info for challenges |
| **DB Schema** | `challenge_progress.tier_achieved` | 🟡 HIGH | Track which tier user reached |
| **DB Schema** | `challenge_progress.drops_awarded` flag | 🟢 LOW | Prevent double-awarding |
| **DB Schema** | `rewards.sponsor_*` fields | 🟢 LOW | Sponsor info for rewards |
| **DB Schema** | `rewards.available_from` / `available_until` | 🟡 HIGH | Time-limited rewards |
| **DB Logic** | `award_drops()` atomic function | 🔴 CRITICAL | Current `add_drops()` doesn't handle: multipliers, idempotency, dual balances (total_earned vs available), expiry, server-side calculation |
| **DB Logic** | Server-side drops calculation | 🔴 CRITICAL | **Currently drops are calculated CLIENT-SIDE in the mobile app.** Spec says server-side only (Edge Function). Major security issue. |
| **DB Logic** | Session idempotency | 🔴 CRITICAL | Same session can award drops multiple times currently |
| **DB Logic** | Multiplier system | 🟡 HIGH | Streak multipliers, challenge multipliers, gym boost |
| **DB Logic** | Badge evaluation post-session | 🟡 HIGH | Currently badge awarding is rudimentary in `add_drops()` |
| **DB Logic** | Weekly drops reset cron (Monday 00:00) | 🔴 CRITICAL | No weekly period tracking exists |
| **DB Logic** | Monthly drops reset cron (1st of month) | 🔴 CRITICAL | No monthly period tracking exists |
| **DB Logic** | Drop expiry cron (daily) | 🟡 HIGH | No expiry system |
| **DB Logic** | `claim_reward` with `FOR UPDATE` locks | 🟡 HIGH | Current `create_redemption()` doesn't use row-level locks |
| **DB Logic** | Streak calculation | 🟡 HIGH | No `last_visit_date` tracking, no consecutive day counter |
| **BLE** | FTMS protocol (0x1826) | 🔴 CRITICAL | Life Fitness, Technogym, Matrix, Horizon — most common in gyms |
| **BLE** | FitShow protocol | 🟡 HIGH | Shua V9 and Chinese brands |
| **BLE** | Elliptical / Cross Trainer data parsing | 🟡 HIGH | Only treadmill + bike currently supported |
| **Mobile** | Push notifications system | 🔴 CRITICAL | `expo-notifications` not installed, no token registration, no notification handlers |
| **Mobile** | Workout History screen | 🟡 HIGH | Calendar view with session cards |
| **Mobile** | Profile screen (dedicated) | 🟡 HIGH | Stats, badges, history link |
| **Mobile** | Shareable workout card | 🟢 LOW | Instagram Stories format |
| **Mobile** | Onboarding tutorial | 🟢 LOW | First-time user walkthrough |
| **Mobile** | Gym join via code | 🔴 CRITICAL | Currently uses gym selection, spec wants 4-digit code |
| **Admin** | Retention dashboard | 🟡 HIGH | Visits this month vs last month |
| **Admin** | At-risk members list | 🟡 HIGH | 7+ days inactive |
| **Admin** | Member list with activity data | 🟡 HIGH | Searchable, filterable |
| **Admin** | Challenge monitoring dashboard | 🟡 HIGH | View progress, close challenges |
| **Admin** | Staff redemption code verification | 🟡 HIGH | Simple 4-char code entry for staff |
| **Admin** | Web Bluetooth full registration flow | 🟡 HIGH | Complete sensor registration via Web Bluetooth |
| **Backend** | Push notification Edge Functions | 🔴 CRITICAL | None exist |
| **Backend** | Scheduled cron jobs (weekly/monthly reset, expiry, re-engagement) | 🔴 CRITICAL | Only `reset-challenges` edge function exists |
| **Shared** | `types/sweatdrop.ts` shared types file | 🟡 HIGH | No shared types exist |

### 1.3 What Needs Fixing ⚠️

| Issue | Severity | Description |
|-------|----------|-------------|
| **Drops Wallet Architecture** | 🔴 CRITICAL | `profiles.total_drops` currently acts as BOTH the all-time earned counter AND the wallet balance. When a reward is redeemed, `total_drops` should NOT decrease (it's the leaderboard score), but `available_drops` should. Currently, only `gym_memberships.local_drops_balance` decreases on spend, but there's no global `available_drops`. The leaderboard uses `total_drops` which is correct, but there's no way for a user to know their global spendable balance. |
| **Client-Side Drops Calculation** | 🔴 CRITICAL | `workout.tsx` calculates `finalEarnedDrops` on the client and sends it to `end_session()`. This is a security vulnerability — a user can modify the drops amount. Drops MUST be calculated server-side based on session metrics. |
| **`add_drops()` Function Complexity** | 🟡 HIGH | The function has been rewritten multiple times (7+ migrations touching it). The final version in `20250128000008` uses `gym_challenges` table but still has issues: no idempotency, no multiplier, uses a loop to recursively call itself for challenge rewards (risk of infinite recursion if not careful). |
| **Dual Challenge Systems** | 🟡 HIGH | Two separate tracking tables exist: `challenge_progress` (drops-based) and `user_challenge_progress` (minutes-based from migration 0007). These were partially unified but the codebase still references both patterns. |
| **Leaderboard Period Tracking** | 🟡 HIGH | `get_local_leaderboard()` and `get_global_leaderboard()` take a `p_period` parameter but always return all-time data. The period parameter is documented as "reserved for future filtering" — it does nothing. |
| **Machine Type Constraint** | 🟢 LOW | `machines.type` CHECK constraint only allows `'treadmill'` and `'bike'`. Need to add `'elliptical'` and `'weight'` for full gym support. |
| **Redemption Uniqueness** | 🟢 LOW | Spec wants `unique(user_id, reward_id)` to prevent claiming same reward twice. Current schema doesn't enforce this. |
| **No Gym Join Code** | 🟡 HIGH | Spec says members join gyms via a 4-digit code. Currently, mobile app uses a gym selector/browser. This is a UX architecture mismatch. |

---

## 2. SCHEMA STATUS

### 2.1 Tables That Exist ✅

| Table | Match with Spec | Notes |
|-------|----------------|-------|
| `public.gyms` | 60% | Missing: `code`, `subscription_plan`, `is_active` (uses `is_suspended`) |
| `public.profiles` | 40% | Missing: `available_drops`, `weekly_drops`, `monthly_drops`, `level`, `streak_days`, `last_visit_date`, `expo_push_token`, `is_newcomer`. `gym_id` is `home_gym_id`. `display_name` is `username`. |
| `public.machines` | 55% | Missing: `label`, `zone`, `ble_device_name`, `ble_protocol`, `protocol_verified`, `status`, `registered_by`, `registered_at`. Has extra: `unique_qr_code`, `qr_uuid`, `is_busy`, `current_user_id`, `last_heartbeat`. |
| `public.sessions` | 50% | Missing: `calories`, `multiplier`, `raw_metrics`, `synced`. Has extra: `equipment_id`, `is_active`. |
| `public.drops_transactions` | 50% | Spec calls it `drops_ledger`. Missing: `gym_id`, `balance_after`, `expires_at`. |
| `public.rewards` | 70% | Missing: `sponsor_name`, `sponsor_logo`, `available_from`, `available_until`. Naming: `name` vs `title`, `price_drops` vs `drops_cost`. |
| `public.redemptions` | 65% | Spec calls it `reward_claims`. Missing: `unique(user_id, reward_id)`. Status values differ. |
| `public.gym_challenges` | 40% | Was `challenges`, renamed. Missing: `type` (individual/group/streak), `scoring_model`, `tiers`, `sponsor_*`, `prize_description`. Has extra minutes-based fields. |
| `public.challenge_progress` | 50% | Missing: `current_value` (numeric), `tier_achieved`, `drops_awarded`. Has: `current_drops` (integer). |
| `public.global_achievements` | 80% | Maps to spec's `badge_definitions`. Similar structure with `criteria` JSONB. Naming differs. |
| `public.user_badges` | 70% | Maps to spec's `member_badges`. Polymorphic references. Missing: `session_id`, explicit `unique(user_id, badge_id)`. |
| `public.gym_memberships` | N/A | Not in spec. Extra table for local drops per gym. **Keep — it's our dual-wallet system.** |
| `public.gym_branding` | N/A | Not in spec. Extra table for gym UI customization. **Keep — it's used by mobile design system.** |
| `public.leaderboard_rewards` | N/A | Not in spec explicitly. Tracks top-3 rewards. **Keep.** |

### 2.2 Tables To Create 🆕

| Table | Priority | Reason |
|-------|----------|--------|
| None new required | — | Spec tables map to existing tables. Modifications needed, not new tables. |

### 2.3 Column Changes Needed 🔧

#### `profiles` — ADD COLUMNS:

```sql
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS available_drops INTEGER DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS weekly_drops INTEGER DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS monthly_drops INTEGER DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS streak_days INTEGER DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS last_visit_date DATE,
  ADD COLUMN IF NOT EXISTS expo_push_token TEXT,
  ADD COLUMN IF NOT EXISTS is_newcomer BOOLEAN DEFAULT true NOT NULL;
-- BACKFILL: SET available_drops = total_drops for existing users (one-time)
-- BACKFILL: SET is_newcomer = (created_at > NOW() - INTERVAL '30 days')
```

#### `gyms` — ADD COLUMNS:

```sql
ALTER TABLE public.gyms
  ADD COLUMN IF NOT EXISTS code TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS subscription_plan TEXT DEFAULT 'starter'
    CHECK (subscription_plan IN ('starter', 'growth', 'pro', 'elite')),
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true NOT NULL;
-- BACKFILL: Generate unique 4-digit codes for existing gyms
-- BACKFILL: SET is_active = NOT is_suspended (then drop is_suspended)
```

#### `machines` — ADD COLUMNS:

```sql
ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS ble_protocol TEXT
    CHECK (ble_protocol IN ('ftms', 'fitshow', 'magene', 'ksfit')),
  ADD COLUMN IF NOT EXISTS protocol_verified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS zone TEXT,
  ADD COLUMN IF NOT EXISTS registered_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS registered_at TIMESTAMPTZ;
-- UPDATE type CHECK constraint: add 'elliptical', 'weight'
```

#### `sessions` — ADD COLUMNS:

```sql
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS calories NUMERIC,
  ADD COLUMN IF NOT EXISTS multiplier NUMERIC DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS raw_metrics JSONB;
```

#### `drops_transactions` — ADD COLUMNS:

```sql
ALTER TABLE public.drops_transactions
  ADD COLUMN IF NOT EXISTS gym_id UUID REFERENCES public.gyms(id),
  ADD COLUMN IF NOT EXISTS balance_after INTEGER,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
-- BACKFILL: set expires_at = created_at + INTERVAL '90 days' for session earnings
```

#### `rewards` — ADD COLUMNS:

```sql
ALTER TABLE public.rewards
  ADD COLUMN IF NOT EXISTS sponsor_name TEXT,
  ADD COLUMN IF NOT EXISTS sponsor_logo TEXT,
  ADD COLUMN IF NOT EXISTS available_from TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS available_until TIMESTAMPTZ;
```

#### `gym_challenges` — ADD COLUMNS:

```sql
ALTER TABLE public.gym_challenges
  ADD COLUMN IF NOT EXISTS scoring_model TEXT DEFAULT 'total_drops'
    CHECK (scoring_model IN ('total_drops', 'distance_km', 'days_visited')),
  ADD COLUMN IF NOT EXISTS tiers JSONB,
  ADD COLUMN IF NOT EXISTS sponsor_name TEXT,
  ADD COLUMN IF NOT EXISTS sponsor_logo TEXT,
  ADD COLUMN IF NOT EXISTS prize_description TEXT;
```

#### `challenge_progress` — ADD COLUMNS:

```sql
ALTER TABLE public.challenge_progress
  ADD COLUMN IF NOT EXISTS current_value NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tier_achieved TEXT,
  ADD COLUMN IF NOT EXISTS drops_awarded BOOLEAN DEFAULT false;
```

---

## 3. AGENT TASK LIST

### Build Order Overview

```
PHASE 0: Schema Foundation (Supabase DBA)     — Week 1, Days 1-2
PHASE 1: Core Logic (Supabase DBA)            — Week 1, Days 2-3
PHASE 2: Cron Jobs & Edge Functions (Supabase DBA) — Week 1, Days 3-4
PHASE 3: Mobile Critical Path (Mobile Agent)  — Week 1-2, Days 3-7
PHASE 4: Admin Panel Updates (Admin Agent)    — Week 1-2, Days 3-7
PHASE 5: Push Notifications (All Agents)      — Week 2, Days 5-7
PHASE 6: Polish & Testing                     — Week 2, Days 6-7
```

---

### PHASE 0: Schema Foundation

**Agent: Supabase DBA**

#### Task 0.1: Add Missing Profile Columns ⏱️ 30min
**File:** `backend/supabase/migrations/YYYYMMDDHHMMSS_add_profile_mvp_columns.sql`
- Add `available_drops INTEGER DEFAULT 0 NOT NULL`
- Add `weekly_drops INTEGER DEFAULT 0 NOT NULL`
- Add `monthly_drops INTEGER DEFAULT 0 NOT NULL`
- Add `streak_days INTEGER DEFAULT 0 NOT NULL`
- Add `last_visit_date DATE`
- Add `expo_push_token TEXT`
- Add `is_newcomer BOOLEAN DEFAULT true NOT NULL`
- **Backfill:** `UPDATE profiles SET available_drops = total_drops`
- **Backfill:** `UPDATE profiles SET is_newcomer = (created_at > NOW() - INTERVAL '30 days')`
- Add index: `idx_profiles_weekly_drops`, `idx_profiles_monthly_drops`

#### Task 0.2: Add Gym Join Code ⏱️ 20min
**File:** `backend/supabase/migrations/YYYYMMDDHHMMSS_add_gym_join_code.sql`
- Add `gyms.code TEXT UNIQUE`
- Add `gyms.subscription_plan TEXT DEFAULT 'starter'` with CHECK constraint
- Add `gyms.is_active BOOLEAN DEFAULT true NOT NULL`
- Create function `generate_gym_code()` — generates unique 4-digit alphanumeric code
- Backfill: Generate codes for existing gyms
- RLS: Members can look up gym by code

#### Task 0.3: Extend Machines Schema ⏱️ 20min
**File:** `backend/supabase/migrations/YYYYMMDDHHMMSS_extend_machines_schema.sql`
- Add `ble_protocol TEXT` with CHECK constraint
- Add `protocol_verified BOOLEAN DEFAULT false`
- Add `zone TEXT`
- Add `registered_by UUID`, `registered_at TIMESTAMPTZ`
- **DROP and recreate** type CHECK constraint to include `'elliptical'`, `'weight'`

#### Task 0.4: Extend Sessions Schema ⏱️ 15min
**File:** `backend/supabase/migrations/YYYYMMDDHHMMSS_extend_sessions_schema.sql`
- Add `calories NUMERIC`
- Add `multiplier NUMERIC DEFAULT 1.0`
- Add `raw_metrics JSONB`

#### Task 0.5: Extend Drops Transactions ⏱️ 15min
**File:** `backend/supabase/migrations/YYYYMMDDHHMMSS_extend_drops_transactions.sql`
- Add `gym_id UUID REFERENCES public.gyms(id)`
- Add `balance_after INTEGER`
- Add `expires_at TIMESTAMPTZ`
- Add index: `idx_drops_transactions_gym_id`, `idx_drops_transactions_expires_at`

#### Task 0.6: Extend Rewards & Challenges ⏱️ 20min
**File:** `backend/supabase/migrations/YYYYMMDDHHMMSS_extend_rewards_challenges.sql`
- Rewards: add `sponsor_name`, `sponsor_logo`, `available_from`, `available_until`
- Gym challenges: add `scoring_model`, `tiers`, `sponsor_name`, `sponsor_logo`, `prize_description`
- Challenge progress: add `current_value`, `tier_achieved`, `drops_awarded`

---

### PHASE 1: Core Logic

**Agent: Supabase DBA**

#### Task 1.1: Rewrite `award_drops()` Function 🔴 CRITICAL ⏱️ 2hrs
**File:** `backend/supabase/migrations/YYYYMMDDHHMMSS_rewrite_award_drops.sql`

This is the most important function in the system. It replaces the current `add_drops()`.

**Requirements:**
```sql
CREATE OR REPLACE FUNCTION public.award_drops(
  p_session_id UUID
)
RETURNS TABLE(drops_earned INTEGER, multiplier NUMERIC, badges_earned UUID[])
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_session RECORD;
  v_base_drops INTEGER;
  v_multiplier NUMERIC := 1.0;
  v_final_drops INTEGER;
  v_streak_multiplier NUMERIC := 1.0;
  v_balance_after INTEGER;
BEGIN
  -- 1. IDEMPOTENCY CHECK: Has this session already been awarded?
  SELECT * INTO v_session FROM public.sessions
  WHERE id = p_session_id FOR UPDATE;
  
  IF v_session.drops_earned > 0 THEN
    -- Already awarded, return existing values
    RETURN QUERY SELECT v_session.drops_earned, v_session.multiplier, ARRAY[]::UUID[];
    RETURN;
  END IF;

  -- 2. SERVER-SIDE DROPS CALCULATION
  -- base_drops = calories × 2.5 (or duration-based fallback)
  v_base_drops := GREATEST(1, ROUND(COALESCE(v_session.calories, v_session.duration_seconds / 60.0 * 5) * 2.5));

  -- 3. CALCULATE MULTIPLIERS
  -- Streak multiplier
  SELECT streak_days INTO v_streak_multiplier FROM profiles WHERE id = v_session.user_id;
  IF v_streak_multiplier >= 14 THEN v_multiplier := v_multiplier * 2.0;
  ELSIF v_streak_multiplier >= 7 THEN v_multiplier := v_multiplier * 1.5;
  ELSIF v_streak_multiplier >= 3 THEN v_multiplier := v_multiplier * 1.2;
  END IF;

  -- Challenge multiplier (if user is in an active challenge with a multiplier)
  -- Gym boost multiplier (set by admin)

  v_final_drops := ROUND(v_base_drops * v_multiplier);

  -- 4. UPDATE SESSION (marks as processed)
  UPDATE public.sessions
  SET drops_earned = v_final_drops,
      multiplier = v_multiplier,
      ended_at = COALESCE(ended_at, NOW()),
      is_active = false
  WHERE id = p_session_id;

  -- 5. UPDATE PROFILE BALANCES
  UPDATE public.profiles
  SET total_drops_earned = total_drops_earned + v_final_drops,
      available_drops = available_drops + v_final_drops,
      weekly_drops = weekly_drops + v_final_drops,
      monthly_drops = monthly_drops + v_final_drops,
      last_visit_date = CURRENT_DATE,
      -- Streak logic
      streak_days = CASE
        WHEN last_visit_date = CURRENT_DATE THEN streak_days -- Same day, no change
        WHEN last_visit_date = CURRENT_DATE - 1 THEN streak_days + 1 -- Consecutive day
        ELSE 1 -- Streak broken or first visit
      END
  WHERE id = v_session.user_id;

  -- 6. UPDATE GYM MEMBERSHIP LOCAL BALANCE
  UPDATE public.gym_memberships
  SET local_drops_balance = local_drops_balance + v_final_drops
  WHERE user_id = v_session.user_id AND gym_id = v_session.gym_id;

  -- If no membership exists, create one
  IF NOT FOUND THEN
    INSERT INTO public.gym_memberships (user_id, gym_id, local_drops_balance)
    VALUES (v_session.user_id, v_session.gym_id, v_final_drops);
  END IF;

  -- 7. GET BALANCE AFTER
  SELECT available_drops INTO v_balance_after FROM profiles WHERE id = v_session.user_id;

  -- 8. INSERT LEDGER ENTRY
  INSERT INTO public.drops_transactions
    (user_id, gym_id, amount, transaction_type, reference_id, balance_after, expires_at, description)
  VALUES
    (v_session.user_id, v_session.gym_id, v_final_drops, 'session', p_session_id,
     v_balance_after, NOW() + INTERVAL '90 days', 'Workout session');

  -- 9. UPDATE CHALLENGE PROGRESS (see Task 1.2)
  PERFORM public.update_challenge_progress_on_session(v_session.user_id, v_session.gym_id, v_final_drops, p_session_id);

  -- 10. EVALUATE BADGES (see Task 1.3)
  PERFORM public.evaluate_badges_for_user(v_session.user_id, p_session_id);

  RETURN QUERY SELECT v_final_drops, v_multiplier, ARRAY[]::UUID[];
END;
$$;
```

**CRITICAL CHANGES:**
- Drops calculated SERVER-SIDE (calories × 2.5 with multipliers)
- Session idempotency (checks `drops_earned > 0` with `FOR UPDATE` lock)
- Updates BOTH `total_drops_earned` (never decreases) AND `available_drops` (wallet)
- Updates `weekly_drops` and `monthly_drops` for leaderboard periods
- Updates streak tracking (`streak_days`, `last_visit_date`)
- Records `balance_after` in transaction ledger
- Sets `expires_at` for drop expiry

#### Task 1.2: Create `update_challenge_progress_on_session()` ⏱️ 1hr
**File:** Same migration or separate
- Called by `award_drops()` after drops are awarded
- Finds all active challenges for the user's gym
- Updates `challenge_progress.current_value` based on `scoring_model`:
  - `total_drops`: Add drops earned
  - `distance_km`: Extract from `sessions.raw_metrics`
  - `days_visited`: Increment by 1 (if not already counted today)
- Check tier completion (Bronze → Silver → Gold from `tiers` JSONB)
- Award tier rewards if tier threshold crossed
- Set `drops_awarded = true` to prevent double-awarding

#### Task 1.3: Create `evaluate_badges_for_user()` ⏱️ 1hr
**File:** Same migration or separate
- Check all active `global_achievements` against user's stats
- Evaluate `criteria` JSONB conditions:
  - `{"type": "session_count", "value": 1}` → count sessions
  - `{"type": "total_drops", "value": 1000}` → check total_drops_earned
  - `{"type": "streak_days", "value": 7}` → check streak_days
  - `{"type": "gym_count", "value": 3}` → count distinct gyms
- If criteria met and user doesn't already have badge → INSERT into `user_badges`
- Award `reward_drops` from the achievement

#### Task 1.4: Rewrite `claim_reward()` with FOR UPDATE ⏱️ 30min
**File:** `backend/supabase/migrations/YYYYMMDDHHMMSS_rewrite_claim_reward.sql`
- Use `SELECT ... FOR UPDATE` on rewards row to prevent race conditions
- Deduct from `profiles.available_drops` (NOT `total_drops_earned`)
- Deduct from `gym_memberships.local_drops_balance`
- Record negative transaction in `drops_transactions` with `balance_after`
- Generate unique 4-char alphanumeric redemption code (shorter than current `RED-XXXXXXXX`)
- Check `unique(user_id, reward_id)` (add constraint if needed)

#### Task 1.5: Create `join_gym_by_code()` RPC ⏱️ 30min
**File:** `backend/supabase/migrations/YYYYMMDDHHMMSS_join_gym_by_code.sql`
- Takes `p_code TEXT`
- Looks up gym by 4-digit code
- Sets `profiles.home_gym_id`
- Creates `gym_memberships` entry
- Returns gym info

#### Task 1.6: Fix Leaderboard RPCs ⏱️ 30min
**File:** `backend/supabase/migrations/YYYYMMDDHHMMSS_fix_leaderboard_rpcs.sql`
- `get_local_leaderboard(p_gym_id, p_period)`:
  - `'weekly'` → ORDER BY `profiles.weekly_drops`
  - `'monthly'` → ORDER BY `profiles.monthly_drops`
  - `'all_time'` → ORDER BY `gym_memberships.local_drops_balance`
- `get_global_leaderboard(p_period)`:
  - Similar but using `profiles.weekly_drops`, `monthly_drops`, `total_drops_earned`
- Add `is_newcomer` filter option for separate newcomer board

---

### PHASE 2: Cron Jobs & Edge Functions

**Agent: Supabase DBA**

#### Task 2.1: Weekly Reset Cron ⏱️ 30min
**File:** `backend/supabase/functions/weekly-reset/index.ts`
- Runs every Monday 00:00 UTC+1
- `UPDATE profiles SET weekly_drops = 0`
- Configure via Supabase Dashboard > Database > Extensions > pg_cron

**SQL (pg_cron):**
```sql
SELECT cron.schedule(
  'weekly-drops-reset',
  '0 23 * * 0', -- Sunday 23:00 UTC = Monday 00:00 UTC+1
  $$UPDATE public.profiles SET weekly_drops = 0$$
);
```

#### Task 2.2: Monthly Reset Cron ⏱️ 15min
```sql
SELECT cron.schedule(
  'monthly-drops-reset',
  '0 23 28-31 * *', -- Needs to run on last day of month at 23:00 UTC
  $$UPDATE public.profiles SET monthly_drops = 0 WHERE EXTRACT(DAY FROM NOW() + INTERVAL '1 hour') = 1$$
);
```

#### Task 2.3: Newcomer Status Update Cron ⏱️ 15min
```sql
SELECT cron.schedule(
  'update-newcomer-status',
  '0 3 * * *', -- Daily at 3 AM UTC
  $$UPDATE public.profiles SET is_newcomer = false WHERE is_newcomer = true AND created_at < NOW() - INTERVAL '30 days'$$
);
```

#### Task 2.4: Drop Expiry Cron ⏱️ 30min
```sql
-- Daily: expire drops older than 90 days
SELECT cron.schedule(
  'expire-drops',
  '0 4 * * *',
  $$
  WITH expired AS (
    SELECT user_id, SUM(amount) as expired_amount
    FROM public.drops_transactions
    WHERE expires_at < NOW()
      AND expires_at IS NOT NULL
      AND amount > 0
      AND transaction_type = 'session'
    GROUP BY user_id
  )
  UPDATE public.profiles p
  SET available_drops = GREATEST(0, available_drops - e.expired_amount)
  FROM expired e
  WHERE p.id = e.user_id;
  -- Then mark transactions as expired
  $$
);
```

#### Task 2.5: Push Notification Edge Functions ⏱️ 2hrs
**Files:**
- `backend/supabase/functions/send-push/index.ts` — Generic push sender
- `backend/supabase/functions/streak-reminder/index.ts` — Daily 09:00 "streak at risk"
- `backend/supabase/functions/re-engagement/index.ts` — 7-day/14-day inactive nudges

**Generic Push Function:**
```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

serve(async (req) => {
  const { tokens, title, body, data } = await req.json();

  const messages = tokens.map((token: string) => ({
    to: token,
    sound: 'default',
    title,
    body,
    data,
  }));

  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(messages),
  });

  return new Response(JSON.stringify(await response.json()));
});
```

#### Task 2.6: Streak Reminder Cron ⏱️ 15min
```sql
SELECT cron.schedule(
  'streak-at-risk-reminder',
  '0 8 * * *', -- Daily 08:00 UTC (09:00 UTC+1)
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/streak-reminder',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')),
    body := '{}'
  );
  $$
);
```

---

### PHASE 3: Mobile Critical Path

**Agent: Mobile Agent**

#### Task 3.1: Install Push Notifications 🔴 CRITICAL ⏱️ 1hr
**Files:**
- `apps/mobile-app/package.json` — Add `expo-notifications`, `expo-device`
- `apps/mobile-app/app/_layout.tsx` — Register for push token on app load
- `apps/mobile-app/lib/notifications.ts` — Push registration + handler module

**Token Registration Flow:**
1. On app load → request permissions
2. Get Expo push token
3. Store in `profiles.expo_push_token` via Supabase
4. Handle incoming notifications (foreground + background)

#### Task 3.2: Gym Join by Code Screen 🔴 CRITICAL ⏱️ 1hr
**Files:**
- Modify `apps/mobile-app/app/(onboarding)/home-gym.tsx`
- Add 4-digit code input (PIN-style, auto-advance)
- Call `supabase.rpc('join_gym_by_code', { p_code: code })`
- Show gym info preview → confirm join
- Fallback: "Don't have a code? Browse gyms"

#### Task 3.3: Fix Drops Calculation — Move to Server 🔴 CRITICAL ⏱️ 2hrs
**Files:**
- `apps/mobile-app/app/workout.tsx` — Remove client-side drops calculation
- On session end: Call `supabase.rpc('award_drops', { p_session_id })` instead of `supabase.rpc('end_session', { p_session_id, p_drops_earned })`
- Store calories and raw BLE metrics in session during workout
- During workout, show an ESTIMATED drops counter (local calculation for UX), but final drops come from server

**Real-time metrics to save:**
```typescript
// On workout end, update session with raw metrics
await supabase.from('sessions').update({
  calories: calculatedCalories,
  raw_metrics: {
    avg_speed: averageSpeed,
    max_speed: maxSpeed,
    avg_cadence: averageCadence,
    total_distance: totalDistance,
    avg_incline: averageIncline,
  }
}).eq('id', sessionId);

// Then call server-side award
const { data } = await supabase.rpc('award_drops', { p_session_id: sessionId });
// data.drops_earned = final server-calculated drops
// data.multiplier = applied multiplier
```

#### Task 3.4: Workout History Screen 🟡 HIGH ⏱️ 2hrs
**File:** `apps/mobile-app/app/workout-history.tsx`
- Calendar view showing workout days (dots/markers)
- Scrollable list of session cards below calendar
- Each card: machine type icon, duration, drops earned, date
- Pull-to-refresh
- Follow design system (glassmorphism, branding)

#### Task 3.5: Profile Screen 🟡 HIGH ⏱️ 1.5hrs
**File:** `apps/mobile-app/app/profile.tsx`
- Profile hero: avatar, username, level, member since
- Stats grid: total drops earned, streak days, workouts count, hours trained
- Recent badges row (horizontal scroll)
- Quick links: Workout History, Trophy Room, Settings
- Follow design system

#### Task 3.6: Session End Screen Enhancement ⏱️ 1hr
**File:** `apps/mobile-app/app/session-summary.tsx`
- Show rank change ("You moved up to #5!")
- Show multiplier breakdown (streak ×1.5, challenge ×1.2)
- Show badge earned animation (if any)
- Show challenge progress update

#### Task 3.7: BLE Protocol Expansion (FTMS) 🔴 CRITICAL ⏱️ 3hrs
**File:** `apps/mobile-app/lib/ble-service.ts`
- Add FTMS protocol parser (Service UUID: 0x1826)
  - Treadmill Data Characteristic (0x2ACD): speed, incline, distance
  - Indoor Bike Data (0x2AD2): cadence, power, distance
  - Cross Trainer Data (0x2ACE): speed, cadence, distance
- Protocol selection based on `machine.ble_protocol`
- Abstract interface: `BLEProtocol { startMonitoring(), stopMonitoring(), parseData() }`

#### Task 3.8: Shareable Workout Card 🟢 LOW ⏱️ 2hrs
**File:** `apps/mobile-app/components/ShareableWorkoutCard.tsx`
- Instagram Stories format (9:16 ratio)
- Branded with gym colors
- Show: drops earned, duration, machine type, rank
- Use `react-native-view-shot` to capture as image
- Share via `expo-sharing`

---

### PHASE 4: Admin Panel Updates

**Agent: Admin Panel Agent**

#### Task 4.1: Retention Dashboard 🟡 HIGH ⏱️ 2hrs
**File:** `apps/admin-panel/app/dashboard/gym/[id]/retention/page.tsx`
**File:** `apps/admin-panel/components/modules/RetentionDashboard.tsx`
- KPI cards: Active members (7d), visits this month vs last month, avg sessions/member
- At-risk members list (last_visit_date > 7 days ago)
- Chart: daily unique visitors over 30 days
- Churn rate calculation

#### Task 4.2: Member List Page 🟡 HIGH ⏱️ 1.5hrs
**File:** `apps/admin-panel/app/dashboard/gym/[id]/members/page.tsx`
**File:** `apps/admin-panel/components/modules/MemberList.tsx`
- Searchable/filterable table of gym members
- Columns: name, drops earned, last visit, streak, status (active/at-risk/churned)
- Quick actions: view profile, send push notification
- Sort by: drops, last visit, join date

#### Task 4.3: Challenge Monitoring Dashboard 🟡 HIGH ⏱️ 1hr
**File:** Update `apps/admin-panel/components/modules/ChallengesManager.tsx`
- Show challenge progress stats (% completion, avg progress)
- Participant list with individual progress
- Tier achievement counts (Bronze: 45, Silver: 12, Gold: 3)
- Close challenge button (end early)

#### Task 4.4: Staff Redemption Verification 🟡 HIGH ⏱️ 1hr
**File:** `apps/admin-panel/app/dashboard/gym/[id]/verify/page.tsx`
**File:** `apps/admin-panel/components/modules/RedemptionVerifier.tsx`
- Simple 4-character code input (large, centered)
- Auto-submit on 4 chars entered
- Show: member name, reward name, claimed date
- Confirm/reject buttons
- Staff role access (receptionist can use this)

#### Task 4.5: Reward Form Enhancements ⏱️ 30min
**File:** Update `apps/admin-panel/components/modules/RewardsManager.tsx` (or equivalent)
- Add sponsor fields (name, logo upload)
- Add availability dates (from/until)
- Preview card showing how reward looks in mobile app

#### Task 4.6: Challenge Form Enhancements ⏱️ 45min
**File:** Update `apps/admin-panel/components/modules/ChallengesManager.tsx`
- Add scoring model dropdown
- Add tiers editor (Bronze/Silver/Gold with targets and rewards)
- Add sponsor fields
- Add prize description
- Show type selector: 'individual' | 'group' | 'streak'

#### Task 4.7: Superadmin — Web Bluetooth Machine Registration ⏱️ 2hrs
**File:** Update `apps/admin-panel/app/dashboard/super/machines/page.tsx`
- Web Bluetooth scan button (uses `navigator.bluetooth.requestDevice()`)
- Protocol detection (try FTMS → FitShow → Magene)
- Save `ble_device_name`, `ble_protocol`, mark `protocol_verified = true`
- Test data stream confirmation

---

### PHASE 5: Push Notifications Integration

**Agents: All**

#### Task 5.1: Session End Push (Backend) ⏱️ 30min
- After `award_drops()` completes → trigger push
- Message: "Great workout! You earned {drops} drops 💧"

#### Task 5.2: Badge Earned Push (Backend) ⏱️ 30min
- After `evaluate_badges_for_user()` awards a badge → trigger push
- Message: "🏆 New Badge! You earned {badge_name}"

#### Task 5.3: Rank Change Push (Backend) ⏱️ 1hr
- After drops are awarded, check if user's rank changed on leaderboard
- Message: "📊 You're now #{rank} on {gym_name} leaderboard!"

#### Task 5.4: Mobile Notification Handlers ⏱️ 1hr
- Handle incoming push in foreground (in-app banner)
- Handle background tap → navigate to relevant screen
- Deep link routing for each notification type

---

### PHASE 6: Landing Page

**Agent: Landing Page Agent**

#### Task 6.1: Gym Owner Landing Page (if not already complete) 🟢 LOW
- Review existing landing page at `apps/landing-page/`
- Ensure pricing plans match spec (starter/growth/pro/elite)
- Add feature comparison table
- Contact/demo scheduling form

---

## 4. SHARED TYPESCRIPT TYPES

**File to create:** `backend/types/sweatdrop.ts`

```typescript
// ===== ENUMS =====

export type UserRole = 'superadmin' | 'gym_owner' | 'gym_admin' | 'receptionist' | 'user';
export type SubscriptionPlan = 'starter' | 'growth' | 'pro' | 'elite';
export type MachineType = 'treadmill' | 'bike' | 'elliptical' | 'weight';
export type MachineStatus = 'pending' | 'active' | 'offline';
export type BLEProtocol = 'ftms' | 'fitshow' | 'magene' | 'ksfit';
export type TransactionType = 'session' | 'badge' | 'streak' | 'challenge' | 'reward_claim' | 'manual';
export type ClaimStatus = 'claimed' | 'redeemed' | 'expired';
export type ChallengeType = 'individual' | 'group' | 'streak';
export type ScoringModel = 'total_drops' | 'distance_km' | 'days_visited';
export type LeaderboardPeriod = 'weekly' | 'monthly' | 'all_time';
export type NotificationTrigger =
  | 'session_ended'
  | 'badge_earned'
  | 'rank_overtaken'
  | 'reward_claimed'
  | 'streak_at_risk'
  | 'weekly_results'
  | 'inactive_7d'
  | 'inactive_14d'
  | 'drops_expiring_30d'
  | 'drops_expiring_7d';

// ===== CORE MODELS =====

export interface Gym {
  id: string;
  name: string;
  city: string | null;
  code: string;
  logo_url: string | null;
  subscription_plan: SubscriptionPlan;
  is_active: boolean;
  created_at: string;
}

export interface Profile {
  id: string;
  email: string | null;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  home_gym_id: string | null;
  total_drops_earned: number;
  available_drops: number;
  weekly_drops: number;
  monthly_drops: number;
  level: number;
  streak_days: number;
  last_visit_date: string | null;
  expo_push_token: string | null;
  is_newcomer: boolean;
  role: UserRole;
  created_at: string;
}

export interface Machine {
  id: string;
  gym_id: string;
  type: MachineType;
  name: string;
  zone: string | null;
  ble_device_name: string | null;
  ble_protocol: BLEProtocol | null;
  protocol_verified: boolean;
  is_active: boolean;
  is_busy: boolean;
  current_user_id: string | null;
}

export interface Session {
  id: string;
  user_id: string;
  machine_id: string | null;
  gym_id: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  calories: number | null;
  drops_earned: number;
  multiplier: number;
  raw_metrics: RawMetrics | null;
}

export interface RawMetrics {
  avg_speed?: number;
  max_speed?: number;
  avg_cadence?: number;
  total_distance?: number;
  avg_incline?: number;
}

export interface DropsLedger {
  id: string;
  user_id: string;
  gym_id: string | null;
  amount: number;
  type: TransactionType;
  reference_id: string | null;
  balance_after: number;
  expires_at: string | null;
  created_at: string;
}

export interface Reward {
  id: string;
  gym_id: string;
  title: string;
  description: string | null;
  sponsor_name: string | null;
  sponsor_logo: string | null;
  drops_cost: number;
  stock: number | null;
  available_from: string | null;
  available_until: string | null;
  is_active: boolean;
}

export interface RewardClaim {
  id: string;
  user_id: string;
  reward_id: string;
  gym_id: string;
  redemption_code: string;
  status: ClaimStatus;
  claimed_at: string;
  redeemed_at: string | null;
}

export interface Challenge {
  id: string;
  gym_id: string;
  title: string;
  type: ChallengeType;
  scoring_model: ScoringModel;
  tiers: ChallengeTier[] | null;
  sponsor_name: string | null;
  sponsor_logo: string | null;
  prize_description: string | null;
  drops_reward: number;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
}

export interface ChallengeTier {
  label: string;    // 'Bronze' | 'Silver' | 'Gold'
  target: number;   // e.g., 5 (km), 1000 (drops)
  drops: number;    // reward drops for this tier
}

export interface ChallengeProgress {
  id: string;
  challenge_id: string;
  user_id: string;
  current_value: number;
  tier_achieved: string | null;
  completed: boolean;
  drops_awarded: boolean;
}

export interface Badge {
  id: string;
  key: string;
  name: string;
  description: string | null;
  icon_url: string;
  drops_bonus: number;
  condition: BadgeCondition;
}

export interface BadgeCondition {
  type: 'session_count' | 'total_drops' | 'streak_days' | 'gym_count' | 'distance_km';
  value: number;
  gym_id?: string; // Optional: gym-specific badge
}

export interface MemberBadge {
  id: string;
  user_id: string;
  badge_id: string;
  session_id: string | null;
  earned_at: string;
}

// ===== LEADERBOARD =====

export interface LeaderboardEntry {
  user_id: string;
  username: string;
  avatar_url: string | null;
  drops: number;
  rank: number;
  is_newcomer: boolean;
}

// ===== RPC RESPONSES =====

export interface AwardDropsResult {
  drops_earned: number;
  multiplier: number;
  badges_earned: string[];
}

export interface ClaimRewardResult {
  success: boolean;
  redemption_id: string | null;
  redemption_code: string | null;
  error_message: string | null;
}

export interface JoinGymResult {
  success: boolean;
  gym: Gym | null;
  error_message: string | null;
}
```

---

## 5. API CONTRACTS

### 5.1 RPC Functions (Supabase → Mobile/Admin)

| Function | Input | Output | Called By |
|----------|-------|--------|-----------|
| `award_drops(p_session_id)` | session UUID | `{drops_earned, multiplier, badges_earned[]}` | Mobile (after workout) |
| `claim_reward(p_user_id, p_reward_id, p_gym_id)` | IDs | `{success, redemption_id, code, error}` | Mobile (store) |
| `join_gym_by_code(p_code)` | 4-char string | `{success, gym, error}` | Mobile (onboarding) |
| `get_local_leaderboard(p_gym_id, p_period, p_limit)` | gym ID, period | `LeaderboardEntry[]` | Mobile/Admin |
| `get_global_leaderboard(p_period, p_limit)` | period | `LeaderboardEntry[]` | Mobile |
| `get_user_badges(p_user_id)` | user ID | `MemberBadge[]` with badge details | Mobile (trophy room) |
| `find_redemption_by_code(p_code)` | 4-char code | redemption details | Admin (staff verify) |
| `confirm_redemption(p_id, p_confirmed_by)` | IDs | `{success, error}` | Admin (staff verify) |
| `get_gym_analytics(p_gym_id, p_time_filter)` | gym ID, filter | analytics JSON | Admin (dashboard) |

### 5.2 Edge Functions (HTTP)

| Function | Method | Path | Purpose |
|----------|--------|------|---------|
| `send-push` | POST | `/functions/v1/send-push` | Send Expo push notification |
| `streak-reminder` | POST | `/functions/v1/streak-reminder` | Daily streak-at-risk check |
| `re-engagement` | POST | `/functions/v1/re-engagement` | Inactive user nudges |
| `reset-challenges` | POST | `/functions/v1/reset-challenges` | Reset expired challenges |

### 5.3 Supabase Realtime Channels

| Channel | Event | Data | Subscriber |
|---------|-------|------|------------|
| `leaderboard:{gym_id}` | `rank_update` | `{user_id, new_rank, old_rank}` | Mobile (leaderboard screen) |
| `badges:{user_id}` | `badge_earned` | `{badge_id, badge_name, drops_bonus}` | Mobile (any screen) |

---

## 6. BLOCKERS — ✅ ALL RESOLVED

### Blocker 1: Wallet Architecture ✅ RESOLVED → Option B

**Decision:** Keep `total_drops` as-is. Add `available_drops` as new column.
- `total_drops` = all-time earned counter, leaderboard score (never decreases)
- `available_drops` = spendable wallet balance (reserved for future global spending)
- On earn: increment BOTH `total_drops` AND `available_drops`
- On spend: decrement `available_drops` ONLY — `total_drops` never changes
- Backfill: `SET available_drops = total_drops` for existing users
- **Do NOT rename `total_drops`.** Naming inconsistency accepted.

### Blocker 2: Drops Calculation ✅ RESOLVED → Option B (Hybrid)

**Decision:** Hybrid approach. Mobile shows estimated drops in real-time during workout. Server re-calculates authoritatively on session end.
- During workout: mobile shows live estimated drops (same formula: `calories × 2.5 × multiplier`)
- On session end: mobile saves `raw_metrics` to session, then calls `award_drops(p_session_id)`
- Server re-calculates using its own formula → that value is final
- Session summary shows server value. Small discrepancy is acceptable.
- Add UI note: "Final drops calculated after session ends."
- Mobile formula should mirror server formula as closely as possible.

### Blocker 3: Gym Join ✅ RESOLVED → REMOVED FROM MVP

**Decision:** No gym join code screen. Remove from scope entirely.
- Gym joining happens automatically on first machine QR scan (QR contains `gym_id + machine_id`)
- Onboarding ends at: name + avatar (2 steps instead of 4)
- ❌ Removed: `gyms.code` column (keep in schema but don't expose)
- ❌ Removed: `join_gym_by_code()` RPC
- ❌ Removed: Code entry screen in onboarding
- ❌ Removed: Task 3.2 from mobile task list

### Blocker 4: available_drops Scope ✅ RESOLVED → Option A

**Decision:** Gym-scoped spending only for MVP.
- Rewards are gym-specific. Spend from `gym_memberships.local_drops_balance`
- `available_drops` column kept in schema but NOT wired to spending logic
- Set `available_drops = total_drops` and increment on earn, don't decrement on spend yet
- Future: global rewards, cross-gym arenas will use `available_drops`

### Blocker 5: Session Abandonment Cleanup 🆕 ADDED

**Problem:** If member starts session, phone dies/crashes, machine stays locked forever.
**Solution:** Cron job every 5 minutes:
```sql
SELECT * FROM machines
WHERE is_busy = true AND last_heartbeat < NOW() - INTERVAL '5 minutes'
→ unlock_machine() on each
→ end_session() with existing data
→ award_drops() for partial session
```
- Mobile app sends heartbeat every 60 seconds during active session
- Server auto-ends session after 5 min no heartbeat
- Added to Phase 2 cron jobs

---

## 7. QUESTIONS — ✅ ALL ANSWERED

| # | Question | Answer |
|---|----------|--------|
| Q1 | BLE Protocol Priority | **FTMS first** (Life Fitness, Technogym, Matrix, Horizon). Then FitShow (Shua V9, Vortex gym). Magene CSC already done. |
| Q2 | Calories Tracking | **Fallback formula:** Treadmill: `duration_min × 8 × (avg_speed / 8.0)`. Bike/Elliptical: `duration_min × 7`. Show `~312 cal` (with tilde) for estimates. |
| Q3 | Multi-Gym Members | **Yes.** `home_gym_id` = primary gym. `gym_memberships` = all gyms visited. On visiting new gym, prompt: "Switch gyms for this session?" |
| Q4 | Reward Claim Uniqueness | **No global unique.** Add `rewards.is_one_time BOOLEAN DEFAULT false`. If `is_one_time`: once ever. Otherwise: can re-claim after previous is redeemed. Block duplicate pending claims only. |
| Q5 | Newcomer Leaderboard | **Separate tab.** Visible only to members where `is_newcomer = true`. Tabs: Weekly \| Monthly \| All-Time \| Newcomer (conditional). After 30 days, tab disappears. |
| Q6 | Drop Expiry UX | **Push at 30d and 7d.** Banner on home/wallet screen: "{X} drops expire in {Y} days → View Store". Expired drops shown grey in ledger. |
| Q7 | Subscription Plans | **No feature gates for MVP.** All pilot gyms get full PRO. Add `checkFeatureAccess(gym, feature)` stub that always returns true. Enforce after first 3 paying gyms. |

---

## APPENDIX A: Migration File Inventory

Current migrations (67 files) — many are hotfixes for the same features. After this audit, recommend a **migration squash** post-MVP to reduce to ~10-15 clean migrations.

## APPENDIX B: Files To Modify (Per Agent)

### Supabase DBA
```
backend/supabase/migrations/  (7 new migration files — Phase 0)
backend/supabase/functions/   (4-5 new Edge Functions — Phase 2)
backend/types/sweatdrop.ts    (✅ CREATED — shared types)
```

### Mobile Agent
```
apps/mobile-app/package.json             (add expo-notifications, expo-device, expo-sharing, react-native-view-shot)
apps/mobile-app/app/_layout.tsx           (push notification registration)
apps/mobile-app/app/workout.tsx           (keep live estimate, add raw_metrics saving, call award_drops on end)
apps/mobile-app/app/session-summary.tsx   (multiplier display, rank change, enhanced badge display)
apps/mobile-app/app/workout-history.tsx   (NEW — calendar view)
apps/mobile-app/app/profile.tsx           (NEW — dedicated profile)
apps/mobile-app/lib/ble-service.ts        (add FTMS, FitShow protocols)
apps/mobile-app/lib/notifications.ts      (NEW — push notification module)
apps/mobile-app/components/ShareableWorkoutCard.tsx (NEW — low priority)
```

### Admin Agent
```
apps/admin-panel/app/dashboard/gym/[id]/retention/page.tsx    (NEW)
apps/admin-panel/app/dashboard/gym/[id]/members/page.tsx      (NEW)
apps/admin-panel/app/dashboard/gym/[id]/verify/page.tsx       (NEW)
apps/admin-panel/components/modules/RetentionDashboard.tsx     (NEW)
apps/admin-panel/components/modules/MemberList.tsx             (NEW)
apps/admin-panel/components/modules/RedemptionVerifier.tsx     (NEW)
apps/admin-panel/components/modules/ChallengesManager.tsx      (UPDATE — monitoring, tiers)
apps/admin-panel/components/modules/RewardsManager.tsx         (UPDATE — sponsor, dates, is_one_time)
apps/admin-panel/app/dashboard/super/machines/page.tsx         (UPDATE — Web Bluetooth)
```

---

**END OF AUDIT**

**Execution Status:**

### Supabase DBA Agent — ALL PHASES COMPLETE ✅

| Phase | Task | Status | File |
|-------|------|--------|------|
| **Phase 0** | Migration 0.1 — Profile MVP Columns | ✅ APPLIED | `20260302000001_add_profile_mvp_columns.sql` |
| **Phase 0** | Migration 0.2 — Extend Gyms Schema | ✅ APPLIED | `20260302000002_extend_gyms_schema.sql` |
| **Phase 0** | Migration 0.3 — Extend Machines Schema | ✅ APPLIED | `20260302000003_extend_machines_schema.sql` |
| **Phase 0** | Migration 0.4 — Extend Sessions Schema | ✅ APPLIED | `20260302000004_extend_sessions_schema.sql` |
| **Phase 0** | Migration 0.5 — Extend Drops Transactions | ✅ APPLIED | `20260302000005_extend_drops_transactions.sql` |
| **Phase 0** | Migration 0.6 — Extend Rewards Schema | ✅ APPLIED | `20260302000006_extend_rewards_schema.sql` |
| **Phase 0** | Migration 0.7 — Extend Challenges Schema | ✅ APPLIED | `20260302000007_extend_challenges_schema.sql` |
| **Phase 1** | Function 1.1 — `award_drops()` | ✅ CREATED | `20260302000008_phase1_core_award_drops.sql` |
| **Phase 1** | Function 1.2 — `update_challenge_progress()` | ✅ CREATED | `20260302000008_phase1_core_award_drops.sql` |
| **Phase 1** | Function 1.3 — `evaluate_badges()` | ✅ CREATED | `20260302000008_phase1_core_award_drops.sql` |
| **Phase 1** | Function 1.4 — `claim_reward()` | ✅ CREATED | `20260302000009_phase1_claim_reward.sql` |
| **Phase 1** | Function 1.5 — `get_local_leaderboard()` fix | ✅ CREATED | `20260302000010_phase1_fix_leaderboard_rpcs.sql` |
| **Phase 1** | Function 1.6 — `get_global_leaderboard()` fix | ✅ CREATED | `20260302000010_phase1_fix_leaderboard_rpcs.sql` |
| **Phase 2** | Helper — `cleanup_abandoned_sessions()` | ✅ CREATED | `20260302000011_phase2_cron_jobs.sql` |
| **Phase 2** | Helper — `expire_stale_drops()` | ✅ CREATED | `20260302000011_phase2_cron_jobs.sql` |
| **Phase 2** | Helper — `update_newcomer_status()` | ✅ CREATED | `20260302000011_phase2_cron_jobs.sql` |
| **Phase 2** | Cron 2.1 — Weekly drops reset | ✅ SCHEDULED | `20260302000011_phase2_cron_jobs.sql` |
| **Phase 2** | Cron 2.2 — Monthly drops reset | ✅ SCHEDULED | `20260302000011_phase2_cron_jobs.sql` |
| **Phase 2** | Cron 2.3 — Newcomer status update | ✅ SCHEDULED | `20260302000011_phase2_cron_jobs.sql` |
| **Phase 2** | Cron 2.4 — Drop expiry | ✅ SCHEDULED | `20260302000011_phase2_cron_jobs.sql` |
| **Phase 2** | Cron 2.5 — Session abandonment cleanup | ✅ SCHEDULED | `20260302000011_phase2_cron_jobs.sql` |
| **Phase 2** | Edge Function 2.6 — `send-push` | ✅ CREATED | `functions/send-push/index.ts` |
| **Phase 2** | Edge Function 2.7 — `streak-reminder` | ✅ CREATED | `functions/streak-reminder/index.ts` |
| **Phase 2** | Edge Function 2.8 — `re-engagement` | ✅ CREATED | `functions/re-engagement/index.ts` |
| **Phase 2** | Edge Function 2.9 — `drops-expiry-warning` | ✅ CREATED | `functions/drops-expiry-warning/index.ts` |
| **Types** | `backend/types/sweatdrop.ts` | ✅ UPDATED | All interface contracts aligned |

### Notes on Implementation Decisions

1. **`cleanup_abandoned_sessions()`** — Created as a proper function (not inline cron SQL) to safely handle `award_drops()` calls with exception handling per stale machine. Uses `FOR UPDATE ... SKIP LOCKED` to avoid contention.

2. **`get_local_leaderboard()` / `get_global_leaderboard()`** — Changed from `leaderboard_period` ENUM parameter to `TEXT` for backward compatibility and flexibility. Used `ROW_NUMBER()` instead of `RANK()` to guarantee unique rank ordering (tiebreak on username).

3. **Cron scheduling** — Wrapped in `DO $$ ... $$` block with `pg_extension` check. If `pg_cron` is not enabled, migration completes with a WARNING instead of failing. Crons must then be manually scheduled or triggered via external scheduler.

4. **Edge Functions** — All functions follow the same pattern: CORS preflight, service role client, delegation to `send-push` for actual delivery. The `drops-expiry-warning` function uses direct Supabase query (not custom RPC) for simplicity.

5. **Shared types** — Removed all `@pending-migration` annotations. Added `WorkoutMetrics`, `BLEProtocolHandler`, `SendPushRequest/Response`, `checkFeatureAccess()` stub. Aligned `ClaimStatus` with actual `claim_reward()` function behavior (`'claimed'` not `'pending'`).

### READY FOR NEXT AGENTS: YES

Mobile Agent and Admin Agent can now start their tasks. All Supabase schema, RPCs, cron jobs, and Edge Functions are in place.
