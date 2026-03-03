# Phase 3 — Full System Audit + Sweat Arenas Design

**Author:** System Architect  
**Date:** 2026-03-03  
**Status:** READY FOR EXECUTION  
**Prerequisite:** All Phase 0–2 migrations applied successfully.

---

## TABLE OF CONTENTS

1. [AUDIT LOG — All Phase 0–2 Implementations](#1-audit-log)
2. [BUGS FOUND — Must Fix Before Moving On](#2-bugs-found)
3. [DESIGN — Leaderboard Prize Distribution](#3-leaderboard-prize-distribution)
4. [DESIGN — Sweat Arenas System](#4-sweat-arenas-system)
5. [EXECUTION ORDER](#5-execution-order)
6. [AGENT PROMPT — Supabase DBA](#6-agent-prompt-supabase-dba)
7. [AGENT PROMPT — Mobile Agent](#7-agent-prompt-mobile-agent)
8. [AGENT PROMPT — Admin Panel Agent](#8-agent-prompt-admin-panel-agent)

---

## 1. AUDIT LOG

### 1.1 Phase 0 — Schema Foundation (7 migrations)

| # | Migration | Status | Notes |
|---|-----------|--------|-------|
| 0.1 | `20260302000001_add_profile_mvp_columns.sql` | ✅ CLEAN | available_drops, weekly/monthly_drops, streak_days, last_visit_date, expo_push_token, is_newcomer. Indexes + backfill correct. |
| 0.2 | `20260302000002_extend_gyms_schema.sql` | ✅ CLEAN | subscription_plan (CHECK), is_active. Backfill from is_suspended. |
| 0.3 | `20260302000003_extend_machines_schema.sql` | ✅ CLEAN | ble_protocol, protocol_verified, zone, registered_by/at. Type constraint expanded. |
| 0.4 | `20260302000004_extend_sessions_schema.sql` | ✅ CLEAN | calories (NUMERIC), multiplier (NUMERIC default 1.0), raw_metrics (JSONB). |
| 0.5 | `20260302000005_extend_drops_transactions.sql` | ✅ CLEAN | gym_id, balance_after, expires_at. Backfill expiry for existing session txns. |
| 0.6 | `20260302000006_extend_rewards_schema.sql` | 🔴 BUG | `idx_redemptions_unique_pending` uses `WHERE status = 'pending'` but no records ever have status `'pending'`. See Bug #1. |
| 0.7 | `20260302000007_extend_challenges_schema.sql` | ✅ CLEAN | scoring_model, tiers (JSONB), sponsor_name/logo, prize_description. challenge_progress gets current_value, tier_achieved, drops_awarded. |

### 1.2 Phase 1 — Core Logic (3 migrations)

| # | Migration | Status | Notes |
|---|-----------|--------|-------|
| 1.1 | `20260302000008_phase1_core_award_drops.sql` | ✅ CLEAN | `award_drops()` — server-side drops calculation, streak multiplier, distributes to profiles + gym_memberships + ledger. Calls `update_challenge_progress()` and `evaluate_badges()`. Idempotent. |
| 1.2 | `20260302000009_phase1_claim_reward.sql` | 🟡 MINOR BUG | `claim_reward()` works but can make `available_drops` negative after expiry. See Bug #2. |
| 1.3 | `20260302000010_phase1_fix_leaderboard_rpcs.sql` | ✅ CLEAN | Both RPCs now support `weekly`/`monthly`/`all_time` periods via weekly_drops/monthly_drops/total_drops. Support newcomer filtering. |

### 1.3 Phase 2 — Cron Jobs & Edge Functions (1 migration + 4 edge functions)

| # | Migration / Function | Status | Notes |
|---|---------------------|--------|-------|
| 2.1 | `20260302000011_phase2_cron_jobs.sql` | ✅ FIXED | Dollar-quoting fix applied. Helper functions: `cleanup_abandoned_sessions()`, `expire_stale_drops()`, `update_newcomer_status()`. 5 cron jobs scheduled. |
| 2.6 | `send-push/index.ts` | ✅ CLEAN | Expo push notification sender with batching. |
| 2.7 | `streak-reminder/index.ts` | ✅ CLEAN | Daily evening notification for at-risk streaks. |
| 2.8 | `re-engagement/index.ts` | ✅ CLEAN | 7-day and 14-day inactivity nudges. |
| 2.9 | `drops-expiry-warning/index.ts` | ✅ CLEAN | 30-day and 7-day expiry warnings. |

### 1.4 Post-Phase Fixes (2 migrations)

| # | Migration | Status | Notes |
|---|-----------|--------|-------|
| — | `20260302000012_update_get_machine_status_ble_protocol.sql` | ✅ CLEAN | Adds `ble_protocol` to `get_machine_status()` return type. |
| — | `20260303000001_fix_user_badges_and_seed_achievements.sql` | ✅ CLEAN | Drops NOT NULL on challenge_id, adds partial unique indexes, recreates `evaluate_badges()` with proper ON CONFLICT, seeds 12 global achievements. |

### 1.5 Shared Types

| File | Status | Notes |
|------|--------|-------|
| `backend/types/sweatdrop.ts` | 🟡 NEEDS UPDATE | Missing Sweat Arenas types. `LeaderboardReward` interface doesn't match `leaderboard_rewards` DB table schema. |

### 1.6 Documentation

| File | Status | Notes |
|------|--------|-------|
| `MIGRATION_NOTES.md` | 🟡 STALE | Last updated 2025-01-28. Missing all 13 new migrations from 2026-03-02/03. |
| `docs/plans/mvp_full_audit_and_build_plan.md` | ✅ Current | Phase 0/1/2 marked complete. |

---

## 2. BUGS FOUND

### 🔴 Bug #1 — CRITICAL: Unique redemption index targets wrong status

**File:** `20260302000006_extend_rewards_schema.sql`  
**Line:** `CREATE UNIQUE INDEX IF NOT EXISTS idx_redemptions_unique_pending ON public.redemptions(user_id, reward_id) WHERE status = 'pending';`  
**Problem:** The `ClaimStatus` enum has `'claimed' | 'redeemed' | 'cancelled' | 'expired'`. There is **no `'pending'` status**. The `claim_reward()` function inserts redemptions with `status = 'claimed'`. So this unique index protects against a status that never exists — meaning **duplicate claimed redemptions are NOT prevented**.  
**Fix:** Drop and recreate index with `WHERE status = 'claimed'`.  
**Impact:** Without fix, a race condition could create two claimed redemptions for the same user+reward.

### 🟡 Bug #2 — MEDIUM: `claim_reward()` can make available_drops negative

**File:** `20260302000009_phase1_claim_reward.sql`  
**Problem:** `UPDATE profiles SET available_drops = available_drops - v_reward.price_drops` has no `GREATEST(0, ...)` guard. After `expire_stale_drops()` runs and reduces `available_drops`, a user could still have `local_drops_balance` > 0 (because expiry doesn't touch local balance). Claiming a reward would then make `available_drops` negative.  
**Fix:** Add `GREATEST(0, available_drops - v_reward.price_drops)` guard.  
**Impact:** Cosmetic data inconsistency. Not critical for MVP since `available_drops` isn't displayed anywhere yet, but should be fixed.

### 🟡 Bug #3 — MEDIUM: Drop expiry doesn't deduct from local_drops_balance

**File:** `20260302000011_phase2_cron_jobs.sql` → `expire_stale_drops()`  
**Problem:** Only deducts from `profiles.available_drops`. Doesn't touch `gym_memberships.local_drops_balance`. After 90 days, a user's local balance could still have "expired" drops that are spendable.  
**Fix:** The expiry function should also deduct from the gym's local balance using the `gym_id` from the expired transaction.  
**Impact:** Users could spend drops that should have expired. MVP-acceptable since expiry is 90 days and most active users will have newer drops, but should be fixed.

### 🟢 Bug #4 — LOW: Mobile leaderboard doesn't use RPC

**File:** `apps/mobile-app/app/leaderboard.tsx`  
**Problem:** Queries `gym_memberships` directly instead of calling `get_local_leaderboard()` RPC. The RPC supports period filtering, newcomer filtering, avatar URLs, and streak days that the direct query doesn't.  
**Fix:** Mobile agent task — switch to RPC calls.

### 🟢 Bug #5 — LOW: LeaderboardReward TypeScript type doesn't match DB

**File:** `backend/types/sweatdrop.ts`  
**Problem:** The `LeaderboardReward` interface has `reward_drops: number` and `reward_description: string` but the actual `leaderboard_rewards` table has `reward_name: TEXT`, `reward_description: TEXT`, `reward_type: TEXT`, `value: TEXT`.  
**Fix:** Align the TypeScript interface with the actual table schema.

### 🟢 Bug #6 — LOW: Missing leaderboard reward distribution automation

**Problem:** The `leaderboard_rewards` table exists with prize definitions for top 3 positions, but there is **no cron job or edge function** that awards these prizes at period end.  
**Fix:** Create `distribute-leaderboard-prizes` edge function + cron schedule.

---

## 3. LEADERBOARD PRIZE DISTRIBUTION

### 3.1 Concept

Each gym owner configures prizes for Top 1, 2, 3 positions per period (weekly/monthly) via `leaderboard_rewards` table (already exists). At period end, the system must:

1. Snapshot the final leaderboard
2. Match positions to configured prizes
3. Create redemption entries for winners
4. Send push notifications
5. Reset period drops (already handled by cron)

### 3.2 New Table: `leaderboard_snapshots`

```sql
CREATE TABLE public.leaderboard_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  gym_id UUID REFERENCES public.gyms(id) ON DELETE CASCADE NOT NULL,
  period TEXT NOT NULL CHECK (period IN ('weekly', 'monthly')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  rankings JSONB NOT NULL,
  -- JSONB: [{ "rank": 1, "user_id": "...", "username": "...", "drops": 1234 }, ...]
  prizes_distributed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(gym_id, period, period_end)
);
```

### 3.3 New Edge Function: `distribute-leaderboard-prizes`

**Schedule:** Runs right AFTER the weekly/monthly reset cron jobs.
- Weekly: Sunday 23:05 UTC (5 min after weekly_drops reset)
- Monthly: Last day 23:05 UTC (5 min after monthly_drops reset)

**Logic:**
1. For each gym with `is_active = true`:
2. Get final leaderboard (before reset, use snapshot)
3. Match top positions to `leaderboard_rewards` entries
4. Create `redemptions` entries for winners
5. Send push notifications to winners
6. Save snapshot to `leaderboard_snapshots`

### 3.4 RPC: `get_leaderboard_with_prizes(p_gym_id UUID, p_period TEXT)`

Returns the current leaderboard merged with configured prizes to show "Top 3 win: ..." in the UI.

---

## 4. SWEAT ARENAS SYSTEM

### 4.1 Concept (from Landing Page)

A **Sweat Arena** is a brand-sponsored competition:
- A **sponsor** (supplement brand, spa, sports shop) pays to host a branded leaderboard competition
- **Members opt-in** to compete for the sponsor's prizes
- Competition lasts **30 days** (configurable)
- **Scoring models:** Total Drops, Days Visited, Variety Score (unique machines used), Longest Streak
- **Three scopes:** Local (1 gym), Regional (3–5 gyms), Network (all SweatDrop gyms)
- Winners receive **unique redemption codes** to claim prizes at the sponsor's location
- Sponsor receives a **data report** (participant count, sessions, demographics)
- Gym owner earns **70% revenue** from local arenas

### 4.2 Opt-In Design Decision

**DECISION: Explicit opt-in required for ALL arenas.**

Reasons:
- Members consent to have their data shared with sponsors
- Only engaged members compete → better ROI for sponsors
- Members see arena card on home screen → tap "Join Arena" → opted in
- Non-opted members see the arena but can't compete and aren't in reports
- Opt-in is free and one-tap

### 4.3 New Tables

#### Table: `sweat_arenas`
```sql
CREATE TABLE public.sweat_arenas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  
  -- Scope
  arena_scope TEXT NOT NULL CHECK (arena_scope IN ('local', 'regional', 'network')),
  
  -- Scoring
  scoring_model TEXT NOT NULL CHECK (scoring_model IN (
    'total_drops', 'days_visited', 'variety_score', 'streak_days'
  )),
  
  -- Sponsor
  sponsor_name TEXT NOT NULL,
  sponsor_logo TEXT,
  sponsor_contact_email TEXT,
  
  -- Prizes (JSONB array of position-based prizes)
  -- [{ "rank": 1, "prize": "Free 3-month membership", "value": "€120" },
  --  { "rank": 2, "prize": "Protein package", "value": "€60" },
  --  { "rank": 3, "prize": "Shaker bottle", "value": "€15" }]
  prizes JSONB NOT NULL DEFAULT '[]',
  
  -- Dates
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  is_finalized BOOLEAN DEFAULT false,
  finalized_at TIMESTAMPTZ,
  
  -- Revenue (for SweatDrop admin tracking)
  sponsor_fee_cents INTEGER DEFAULT 0,
  
  -- Admin
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### Table: `arena_gyms` (participating gyms)
```sql
CREATE TABLE public.arena_gyms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  arena_id UUID REFERENCES public.sweat_arenas(id) ON DELETE CASCADE NOT NULL,
  gym_id UUID REFERENCES public.gyms(id) ON DELETE CASCADE NOT NULL,
  approved_by UUID REFERENCES public.profiles(id), -- gym owner approval
  approved_at TIMESTAMPTZ,
  UNIQUE(arena_id, gym_id)
);
```

#### Table: `arena_participants` (member opt-in)
```sql
CREATE TABLE public.arena_participants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  arena_id UUID REFERENCES public.sweat_arenas(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  gym_id UUID REFERENCES public.gyms(id) ON DELETE CASCADE NOT NULL,
  
  -- Live score (updated by trigger or cron)
  current_score NUMERIC DEFAULT 0 NOT NULL,
  
  opted_in_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(arena_id, user_id)
);
```

#### Table: `arena_results` (finalized rankings)
```sql
CREATE TABLE public.arena_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  arena_id UUID REFERENCES public.sweat_arenas(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  final_rank INTEGER NOT NULL,
  final_score NUMERIC NOT NULL,
  prize_description TEXT, -- NULL if rank > prize count
  redemption_code TEXT,   -- unique 6-char code for prize claim
  is_claimed BOOLEAN DEFAULT false,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(arena_id, user_id)
);
```

### 4.4 Arena Score Update Logic

**Option A (Real-time via trigger):** After each `award_drops()`, check if user is a participant in any active arena and update `arena_participants.current_score`.

**Option B (Periodic via cron):** Run every 15 minutes, recalculate scores for all active arenas.

**DECISION: Option A (real-time) for `total_drops` and `streak_days`, Option B (periodic) for `days_visited` and `variety_score`.**

Scoring calculation:
- `total_drops`: SUM of drops earned during arena period at arena gyms
- `days_visited`: COUNT DISTINCT dates with sessions during arena period at arena gyms
- `variety_score`: COUNT DISTINCT machine_id used during arena period at arena gyms
- `streak_days`: MAX streak achieved during arena period (snapshot from profiles)

### 4.5 Arena RPCs

```sql
-- Opt into an arena
opt_into_arena(p_arena_id UUID)
  → { success: boolean, error?: string }

-- Get arena leaderboard
get_arena_leaderboard(p_arena_id UUID, p_limit INTEGER DEFAULT 50)
  → TABLE(rank, user_id, username, avatar_url, score, gym_name)

-- Get arenas available to user (active + user's gyms)
get_available_arenas(p_user_id UUID)
  → TABLE(arena_id, name, sponsor_name, sponsor_logo, scoring_model, 
          start_date, end_date, participant_count, user_opted_in, user_rank, prizes)

-- Finalize arena (called by cron/edge function at end_date)
finalize_arena(p_arena_id UUID)
  → { winners: [{ rank, user_id, prize, code }] }
```

### 4.6 Arena Edge Function: `finalize-arena`

**Schedule:** Daily at 00:30 UTC  
**Logic:**
1. Find arenas where `end_date < CURRENT_DATE AND is_finalized = false`
2. For each: calculate final rankings, create `arena_results` entries, generate redemption codes
3. Send push notifications to winners
4. Mark arena as finalized
5. (Future) Generate sponsor report

### 4.7 Integration with `award_drops()`

After the existing step 13 in `award_drops()`, add:

```sql
-- 13b. UPDATE ARENA SCORES (for total_drops and streak_days arenas)
PERFORM public.update_arena_scores(v_session.user_id, v_session.gym_id, v_final_drops);
```

New helper function:
```sql
CREATE FUNCTION public.update_arena_scores(
  p_user_id UUID, p_gym_id UUID, p_drops INTEGER
) RETURNS VOID AS $$
  UPDATE arena_participants ap
  SET current_score = current_score + p_drops
  FROM sweat_arenas sa
  JOIN arena_gyms ag ON ag.arena_id = sa.id
  WHERE ap.arena_id = sa.id
    AND ap.user_id = p_user_id
    AND ag.gym_id = p_gym_id
    AND sa.is_active = true
    AND sa.is_finalized = false
    AND sa.start_date <= CURRENT_DATE
    AND sa.end_date >= CURRENT_DATE
    AND sa.scoring_model = 'total_drops';
    
  -- For streak_days: update with current profile streak
  UPDATE arena_participants ap
  SET current_score = GREATEST(ap.current_score, (
    SELECT streak_days FROM profiles WHERE id = p_user_id
  ))
  FROM sweat_arenas sa
  JOIN arena_gyms ag ON ag.arena_id = sa.id
  WHERE ap.arena_id = sa.id
    AND ap.user_id = p_user_id
    AND ag.gym_id = p_gym_id
    AND sa.is_active = true
    AND sa.is_finalized = false
    AND sa.start_date <= CURRENT_DATE
    AND sa.end_date >= CURRENT_DATE
    AND sa.scoring_model = 'streak_days';
$$ LANGUAGE sql SECURITY DEFINER;
```

### 4.8 Cron Job: `update-arena-scores-periodic`

**Schedule:** Every 15 minutes  
**Purpose:** Update scores for `days_visited` and `variety_score` arenas.

```sql
-- days_visited: count distinct dates
UPDATE arena_participants ap
SET current_score = sub.day_count
FROM (
  SELECT ap2.id AS participant_id,
    COUNT(DISTINCT DATE(s.started_at)) AS day_count
  FROM arena_participants ap2
  JOIN sweat_arenas sa ON sa.id = ap2.arena_id
  JOIN arena_gyms ag ON ag.arena_id = sa.id
  JOIN sessions s ON s.user_id = ap2.user_id 
    AND s.gym_id = ag.gym_id
    AND DATE(s.started_at) >= sa.start_date
    AND DATE(s.started_at) <= sa.end_date
    AND s.drops_earned > 0
  WHERE sa.scoring_model = 'days_visited'
    AND sa.is_active = true AND NOT sa.is_finalized
  GROUP BY ap2.id
) sub
WHERE ap.id = sub.participant_id;

-- variety_score: count distinct machines
UPDATE arena_participants ap
SET current_score = sub.machine_count
FROM (
  SELECT ap2.id AS participant_id,
    COUNT(DISTINCT s.machine_id) AS machine_count
  FROM arena_participants ap2
  JOIN sweat_arenas sa ON sa.id = ap2.arena_id
  JOIN arena_gyms ag ON ag.arena_id = sa.id
  JOIN sessions s ON s.user_id = ap2.user_id 
    AND s.gym_id = ag.gym_id
    AND DATE(s.started_at) >= sa.start_date
    AND DATE(s.started_at) <= sa.end_date
    AND s.drops_earned > 0
    AND s.machine_id IS NOT NULL
  WHERE sa.scoring_model = 'variety_score'
    AND sa.is_active = true AND NOT sa.is_finalized
  GROUP BY ap2.id
) sub
WHERE ap.id = sub.participant_id;
```

---

## 5. EXECUTION ORDER

### Phase 3.0 — Bug Fixes (Supabase DBA) ← DO THIS FIRST

1. **Fix Bug #1:** Drop and recreate `idx_redemptions_unique_pending` with `WHERE status = 'claimed'`
2. **Fix Bug #2:** Add `GREATEST(0, ...)` guard to `claim_reward()` available_drops deduction
3. **Fix Bug #3:** Update `expire_stale_drops()` to also deduct from `gym_memberships.local_drops_balance`
4. **Fix Bug #5:** Update `LeaderboardReward` type in `sweatdrop.ts`

### Phase 3.1 — Leaderboard Prizes (Supabase DBA)

1. Create `leaderboard_snapshots` table
2. Create `distribute_leaderboard_prizes()` helper function
3. Create `distribute-leaderboard-prizes` edge function
4. Schedule cron jobs for weekly/monthly distribution

### Phase 3.2 — Sweat Arenas Schema (Supabase DBA)

1. Create `sweat_arenas` table + RLS
2. Create `arena_gyms` table + RLS
3. Create `arena_participants` table + RLS
4. Create `arena_results` table + RLS
5. Create `opt_into_arena()` RPC
6. Create `get_arena_leaderboard()` RPC
7. Create `get_available_arenas()` RPC
8. Create `update_arena_scores()` helper
9. Update `award_drops()` to call `update_arena_scores()`
10. Create `update_arena_scores_periodic()` for days_visited/variety_score
11. Create `finalize_arena()` RPC
12. Create `finalize-arena` edge function
13. Schedule cron jobs

### Phase 3.3 — Mobile Agent Tasks

1. **Fix Bug #4:** Switch leaderboard to use RPCs
2. Add arena cards to home screen
3. Arena detail + opt-in screen
4. Arena leaderboard screen
5. Arena winner notification + code display
6. Leaderboard prize display (top 3 prizes shown on leaderboard)

### Phase 3.4 — Admin Panel Agent Tasks

1. Leaderboard prizes CRUD (improve existing `LeaderboardRewardsForm`)
2. Leaderboard snapshot history view
3. Sweat Arena CRUD (superadmin + gym_owner for local)
4. Arena participants list + live leaderboard
5. Arena finalization + results view
6. Challenge CRUD form (currently list-only, no create/edit)

### Phase 3.5 — Shared Types Update

1. Update `backend/types/sweatdrop.ts` with all new types
2. Update `MIGRATION_NOTES.md` with all new migrations

---

## 6. AGENT PROMPT — SUPABASE DBA

> **Role:** Supabase DBA Agent  
> **Context Files:** Read `docs/plans/phase3_audit_and_arenas_plan.md` sections 2, 3, and 4.  
> **Rule File:** `.cursor/rules/supabase-dba.mdc`

### PHASE 3.0 — BUG FIXES (1 migration file)

**Create file:** `backend/supabase/migrations/20260303100000_phase3_bugfixes.sql`

```sql
-- ============================================================
-- BUG FIX #1: idx_redemptions_unique_pending targets wrong status
-- ============================================================
-- The index uses WHERE status = 'pending' but no records ever have that status.
-- claim_reward() inserts with status = 'claimed'.
-- Without this fix, duplicate claimed redemptions are NOT prevented.

DROP INDEX IF EXISTS idx_redemptions_unique_pending;

CREATE UNIQUE INDEX idx_redemptions_unique_claimed
  ON public.redemptions(user_id, reward_id)
  WHERE status = 'claimed';

-- ============================================================
-- BUG FIX #2: claim_reward() can make available_drops negative
-- ============================================================
-- After expire_stale_drops() reduces available_drops, claiming a reward
-- could make available_drops go below 0.

CREATE OR REPLACE FUNCTION public.claim_reward(
  p_user_id  UUID,
  p_reward_id UUID,
  p_gym_id   UUID
)
RETURNS TABLE(
  success         BOOLEAN,
  redemption_id   UUID,
  redemption_code TEXT,
  error_message   TEXT
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
-- [COPY the FULL function body from 20260302000009 but change line:]
--   SET available_drops = available_drops - v_reward.price_drops
-- TO:
--   SET available_drops = GREATEST(0, available_drops - v_reward.price_drops)
$$;

-- ============================================================
-- BUG FIX #3: expire_stale_drops() must also deduct from local balance
-- ============================================================

CREATE OR REPLACE FUNCTION public.expire_stale_drops()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- 1. Deduct from profiles.available_drops (global)
  WITH expired_by_user AS (
    SELECT
      user_id,
      SUM(amount) AS total_expiring
    FROM public.drops_transactions
    WHERE expires_at IS NOT NULL
      AND expires_at < NOW()
      AND expires_at > NOW() - INTERVAL '25 hours'
      AND amount > 0
      AND transaction_type = 'session'
    GROUP BY user_id
  ),
  updated AS (
    UPDATE public.profiles p
    SET available_drops = GREATEST(0, p.available_drops - e.total_expiring)
    FROM expired_by_user e
    WHERE p.id = e.user_id
    RETURNING p.id
  )
  SELECT COUNT(*) INTO v_count FROM updated;

  -- 2. Deduct from gym_memberships.local_drops_balance (gym-scoped)
  WITH expired_by_user_gym AS (
    SELECT
      user_id,
      gym_id,
      SUM(amount) AS total_expiring
    FROM public.drops_transactions
    WHERE expires_at IS NOT NULL
      AND expires_at < NOW()
      AND expires_at > NOW() - INTERVAL '25 hours'
      AND amount > 0
      AND transaction_type = 'session'
      AND gym_id IS NOT NULL
    GROUP BY user_id, gym_id
  )
  UPDATE public.gym_memberships gm
  SET local_drops_balance = GREATEST(0, gm.local_drops_balance - e.total_expiring)
  FROM expired_by_user_gym e
  WHERE gm.user_id = e.user_id
    AND gm.gym_id = e.gym_id;

  RETURN v_count;
END;
$$;
```

**CRITICAL RULE:** For Bug Fix #2, you MUST read the full `claim_reward()` function from `20260302000009_phase1_claim_reward.sql` and copy it entirely, changing ONLY the `available_drops` deduction line. Do not rewrite from scratch.

---

### PHASE 3.1 — LEADERBOARD PRIZES (1 migration + 1 edge function)

**Create file:** `backend/supabase/migrations/20260303100001_leaderboard_prize_distribution.sql`

**Contents:**
1. Create `leaderboard_snapshots` table (see section 3.2)
2. Create `distribute_leaderboard_prizes(p_gym_id UUID, p_period TEXT)` function:
   - Gets final leaderboard (call existing `get_local_leaderboard`)
   - Matches rank positions to `leaderboard_rewards` entries
   - Creates `redemptions` entries for winners (status = 'claimed', with generated codes)
   - Inserts snapshot into `leaderboard_snapshots`
3. Create `get_leaderboard_with_prizes(p_gym_id UUID, p_period TEXT)` RPC:
   - Returns leaderboard merged with prize info from `leaderboard_rewards`
4. RLS policies for `leaderboard_snapshots`:
   - Superadmin: all access
   - Gym admin: own gym only
   - Authenticated users: read own gym

**Create file:** `backend/supabase/functions/distribute-leaderboard-prizes/index.ts`

**Logic:**
1. Get all active gyms
2. Determine period from request body or current time (Sunday = weekly, last day = monthly)
3. For each gym: call `distribute_leaderboard_prizes()` RPC
4. Send push notifications to winners via `send-push`
5. Return summary

**Schedule cron jobs (add to existing cron migration or new one):**
- Weekly: `0 23 * * 0` (Sunday 23:00 UTC — just before weekly reset)

> **NOTE:** The distribution must run BEFORE the weekly reset cron (which runs at 23:00). Schedule at 22:55 UTC or use a transaction that snapshots first.

Actually, **REVISED**: snapshot the leaderboard BEFORE resetting. Change approach:

The `distribute_leaderboard_prizes()` function should:
1. Snapshot the current leaderboard
2. Create redemptions
3. The existing weekly cron then resets drops

So the prize distribution cron should run at **22:55 UTC** (5 min before reset), NOT after.

---

### PHASE 3.2 — SWEAT ARENAS SCHEMA (1 migration)

**Create file:** `backend/supabase/migrations/20260303100002_sweat_arenas_system.sql`

**Contents:** Create all 4 arena tables as defined in section 4.3 above, with:

1. `sweat_arenas` table + indexes + RLS:
   - Superadmin: full access
   - Gym owner: can create local arenas for their gym
   - Authenticated: can read active arenas for their gyms

2. `arena_gyms` table + indexes + RLS:
   - Same pattern as above

3. `arena_participants` table + indexes + RLS:
   - Authenticated users: can insert own opt-in, read own participation
   - Read: any authenticated user can see participants (for leaderboard)

4. `arena_results` table + indexes + RLS:
   - Read: participants can see results
   - Write: only service_role (via edge function)

5. `opt_into_arena(p_arena_id UUID)` RPC:
   - Validates arena is active and user's gym is participating
   - Inserts into `arena_participants`
   - Returns success/error

6. `get_arena_leaderboard(p_arena_id UUID, p_limit INTEGER DEFAULT 50)` RPC:
   - Returns ranked participants with username, avatar, score, gym_name

7. `get_available_arenas(p_user_id UUID)` RPC:
   - Returns arenas available to user (active + user's gyms participating)
   - Includes: user's opt-in status, participant count, user's rank

8. `update_arena_scores(p_user_id UUID, p_gym_id UUID, p_drops INTEGER)` helper:
   - Called by `award_drops()` for real-time score updates
   - Handles `total_drops` and `streak_days` scoring models

9. `update_arena_scores_periodic()` function:
   - Recalculates `days_visited` and `variety_score` for all active arenas
   - Called by cron every 15 minutes

10. `finalize_arena(p_arena_id UUID)` function:
    - Calculates final rankings
    - Creates `arena_results` entries with generated redemption codes
    - Marks arena as finalized

11. Update `award_drops()` — add step 13b calling `update_arena_scores()`

12. Schedule cron jobs:
    - `update-arena-scores-periodic`: `*/15 * * * *`
    - `finalize-arena-check`: Daily at 00:30 UTC

**Create file:** `backend/supabase/functions/finalize-arena/index.ts`

**Logic:**
1. Find arenas where `end_date < CURRENT_DATE AND is_finalized = false`
2. For each: call `finalize_arena()` RPC
3. Send push notifications to winners
4. Return summary

---

### SHARED TYPES UPDATE

**Update file:** `backend/types/sweatdrop.ts`

Add these types:
```typescript
// Sweat Arenas
export type ArenaScope = 'local' | 'regional' | 'network';
export type ArenaScoringModel = 'total_drops' | 'days_visited' | 'variety_score' | 'streak_days';

export interface SweatArena { ... }
export interface ArenaGym { ... }
export interface ArenaParticipant { ... }
export interface ArenaResult { ... }
export interface ArenaPrize { rank: number; prize: string; value?: string; }

// RPCs
export interface OptIntoArenaResult { success: boolean; error?: string; }
export interface ArenaLeaderboardEntry { rank: number; user_id: string; username: string; avatar_url: string | null; score: number; gym_name: string; }
export interface AvailableArena { ... }
export interface FinalizeArenaResult { winners: ArenaResultEntry[]; }

// Leaderboard Prizes
export interface LeaderboardSnapshot { ... }
export interface LeaderboardWithPrizes extends LeaderboardEntry { prize?: string; prize_value?: string; }

// Fix Bug #5: Align LeaderboardReward with DB
export interface LeaderboardReward {
  id: string;
  gym_id: string;
  rank_position: number;
  reward_name: string;
  reward_description: string | null;
  reward_type: string;
  value: string | null;
  is_active: boolean;
  period: LeaderboardPeriod;
}
```

---

## 7. AGENT PROMPT — MOBILE AGENT

> **Role:** React Native / Expo Mobile Coder  
> **Context Files:** Read `docs/plans/phase3_audit_and_arenas_plan.md` sections 3, 4, and 5.  
> **Rule File:** `.cursor/rules/mobile-coder.mdc`  
> **Workspace:** `apps/mobile-app/`

### TASK 3.3.1 — Fix Leaderboard to Use RPCs (Bug #4)

**File:** `apps/mobile-app/app/leaderboard.tsx`

**Changes:**
1. Replace direct `gym_memberships` query with `supabase.rpc('get_local_leaderboard', { p_gym_id, p_period, p_limit: 100 })`
2. Replace direct `profiles` query with `supabase.rpc('get_global_leaderboard', { p_period, p_limit: 100 })`
3. The RPC returns: `user_id, username, avatar_url, drops, rank, is_newcomer, streak_days`
4. Add avatar display using `avatar_url` from RPC response
5. Add streak icon (🔥) next to users with active streaks
6. Add "Newcomers" tab filter (pass `p_newcomer_only: true`)
7. Period selector should actually pass the period to RPC:
   - `'daily'` is not supported by backend → show weekly/monthly/all_time
   - Or keep daily but query differently (direct from `drops_transactions` for today)

**CRITICAL:** Do NOT use `<div>` or web elements. Use `<View>`, `<Text>`, `<Pressable>`, etc.

### TASK 3.3.2 — Add Leaderboard Prize Display

**File:** `apps/mobile-app/app/leaderboard.tsx` (modify)

**Changes:**
1. Call `supabase.rpc('get_leaderboard_with_prizes', { p_gym_id, p_period })` OR fetch `leaderboard_rewards` separately
2. Show prize badges next to top 3:
   - 🥇 Position 1: "{prize_name}" 
   - 🥈 Position 2: "{prize_name}"
   - 🥉 Position 3: "{prize_name}"
3. If no prizes configured, show nothing
4. Add "Prizes reset every {period}" note at bottom

### TASK 3.3.3 — Arena Cards on Home Screen

**File:** `apps/mobile-app/app/home.tsx` (modify existing)

**Changes:**
1. Fetch available arenas: `supabase.rpc('get_available_arenas', { p_user_id })`
2. Show horizontal carousel of arena cards below the challenges section
3. Each card shows:
   - Sponsor logo + name
   - Arena name
   - "X days left" countdown
   - "Y participants"
   - User's current rank (if opted in) or "Join Arena" button
   - Scoring model icon (💧 total_drops, 📅 days_visited, 🏋️ variety, 🔥 streak)
4. Tapping card navigates to arena detail screen

**Styling:** Use existing cyber-dark theme. Arena card should have sponsor branding color as accent (if provided), otherwise use gym's primary color.

### TASK 3.3.4 — Arena Detail + Opt-In Screen

**Create file:** `apps/mobile-app/app/arena/[id].tsx`

**Contents:**
1. Arena header: sponsor logo, arena name, description
2. Prize list (from `arena.prizes` JSONB)
3. Scoring model explanation
4. "X participants · Y days left"
5. If not opted in: large "Join Arena" button → calls `supabase.rpc('opt_into_arena', { p_arena_id })`
6. If opted in: show mini leaderboard (top 10 + user's position)
7. Full leaderboard link → navigates to arena leaderboard

### TASK 3.3.5 — Arena Leaderboard Screen

**Create file:** `apps/mobile-app/app/arena/[id]/leaderboard.tsx`

**Contents:**
1. Full-screen leaderboard using same style as existing `leaderboard.tsx`
2. Fetch: `supabase.rpc('get_arena_leaderboard', { p_arena_id, p_limit: 100 })`
3. Show sponsor branding at top
4. Prize badges on top 3 (from `arena.prizes` JSONB)
5. Current user's position highlighted
6. If arena is finalized, show "Competition ended" + final results

### TASK 3.3.6 — Arena Winner Notification

**Modify:** Push notification handler in the app

**Changes:**
1. Handle new notification type `'arena_winner'`
2. Deep link to arena results screen
3. Show redemption code in-app

---

## 8. AGENT PROMPT — ADMIN PANEL AGENT

> **Role:** Next.js 15 Admin Panel Coder  
> **Context Files:** Read `docs/plans/phase3_audit_and_arenas_plan.md` sections 3, 4, and 5.  
> **Rule File:** `.cursor/rules/admin-coder.mdc`  
> **Workspace:** `apps/admin-panel/`

### TASK 3.4.1 — Fix Leaderboard Rewards Form

**File:** `apps/admin-panel/components/forms/LeaderboardRewardsForm.tsx` (modify existing)

**Changes:**
1. Current form only supports `monthly` period. Add period selector: weekly | monthly
2. Fix form to load existing rewards by period
3. Add reward type dropdown with common types: coffee, protein, discount, merch, experience, custom
4. Add "Preview" section showing how prizes appear on mobile leaderboard
5. Add validation: rank 1 is required, ranks 2 and 3 are optional

### TASK 3.4.2 — Leaderboard Snapshot History

**Create file:** `apps/admin-panel/app/dashboard/gym/[id]/leaderboard-history/page.tsx`

**Contents:**
1. List of past leaderboard snapshots from `leaderboard_snapshots` table
2. For each snapshot: period, date, top 3 with names and drops
3. Show whether prizes were distributed
4. Sidebar link: "Leaderboard History" under Leaderboard Rewards

### TASK 3.4.3 — Challenge CRUD Form (Currently Missing!)

**IMPORTANT:** The admin panel currently only has a list view for challenges (`ChallengesManager`). There is NO create or edit form. This is a critical gap.

**Create file:** `apps/admin-panel/app/dashboard/gym/[id]/challenges/new/page.tsx`
**Create file:** `apps/admin-panel/app/dashboard/gym/[id]/challenges/[challengeId]/edit/page.tsx`
**Create file:** `apps/admin-panel/components/forms/ChallengeForm.tsx`

**ChallengeForm contents:**
1. Name (TEXT input)
2. Challenge Type selector: `individual | group | streak`
3. Scoring Model dropdown: `total_drops | distance_km | days_visited | streak_days`
4. Start Date / End Date pickers
5. Target (number input, label changes based on scoring model):
   - total_drops → "Target Drops"
   - distance_km → "Target Distance (km)"
   - days_visited → "Target Days"
   - streak_days → "Target Streak Days"
6. Tiers editor (optional, toggle):
   - Bronze: target + drops reward
   - Silver: target + drops reward
   - Gold: target + drops reward
7. Reward Drops (if no tiers)
8. Badge Image upload (Supabase Storage)
9. Sponsor fields (optional): name, logo, prize description
10. Active toggle
11. Submit → insert into `gym_challenges`

**Validation with Zod:**
```typescript
const challengeSchema = z.object({
  name: z.string().min(3).max(100),
  challenge_type: z.enum(['individual', 'group', 'streak']),
  scoring_model: z.enum(['total_drops', 'distance_km', 'days_visited', 'streak_days']),
  start_date: z.string(),
  end_date: z.string(),
  target_drops: z.number().positive().optional(),
  reward_drops: z.number().min(0),
  tiers: z.array(z.object({ label: z.string(), target: z.number(), drops: z.number() })).optional(),
  badge_image_url: z.string().url().optional(),
  sponsor_name: z.string().optional(),
  sponsor_logo: z.string().url().optional(),
  prize_description: z.string().optional(),
});
```

### TASK 3.4.4 — Sweat Arenas Management (Superadmin + Gym Owner)

**Create file:** `apps/admin-panel/app/dashboard/arenas/page.tsx` (superadmin view — all arenas)
**Create file:** `apps/admin-panel/app/dashboard/gym/[id]/arenas/page.tsx` (gym owner view — local arenas)
**Create file:** `apps/admin-panel/components/forms/ArenaForm.tsx`

**ArenaForm contents:**
1. Arena Name
2. Description (textarea)
3. Scope selector: Local | Regional | Network (gym_owner can only select Local)
4. Scoring Model dropdown: `total_drops | days_visited | variety_score | streak_days`
5. Sponsor fields: name, logo URL, contact email
6. Prizes editor (dynamic list):
   - Rank 1: prize description + value
   - Rank 2: prize description + value
   - Rank 3: prize description + value
   - + Add more positions
7. Start Date / End Date pickers
8. Participating Gyms (for local: auto-set to current gym, for regional/network: gym selector)
9. Sponsor Fee (superadmin only)
10. Submit → insert into `sweat_arenas` + `arena_gyms`

**Arena list page contents:**
1. Active arenas with: name, sponsor, dates, participant count, status
2. Ended arenas with: results summary, prizes claimed
3. Filter by: scope, status, date range

### TASK 3.4.5 — Arena Participants & Live Leaderboard

**Create file:** `apps/admin-panel/app/dashboard/arenas/[arenaId]/page.tsx`

**Contents:**
1. Arena details header
2. Live leaderboard (fetched from `get_arena_leaderboard` RPC)
3. Participant list with scores
4. If ended: final results + prize claim status
5. Export button (CSV) for sponsor report

### TASK 3.4.6 — Sidebar Navigation Update

**File:** `apps/admin-panel/components/Sidebar.tsx` (modify)

**Changes:**
1. Add "Arenas" link for superadmin (under Challenges)
2. Add "Local Arenas" link for gym_owner (under Challenges)
3. Add "Leaderboard History" link for gym_admin

---

## NOTES FOR ALL AGENTS

### CRITICAL RULES
- **Supabase DBA:** All SQL must be in migration files under `backend/supabase/migrations/`. Use `IF NOT EXISTS` / `OR REPLACE` for idempotency. Dollar-quote with unique tags for nested blocks.
- **Mobile Agent:** NEVER use `<div>`, `<span>`, or web elements. ALWAYS use React Native components. Use StyleSheet API. Use `@supabase/supabase-js` (NOT `@supabase/ssr`).
- **Admin Agent:** Use Next.js App Router. Use Tailwind CSS. Use `@supabase/ssr` for server-side. Use React Query for client-side data fetching. Use Zod for form validation.

### DEPENDENCY ORDER
1. **Supabase DBA Phase 3.0** (bug fixes) ← run migrations first
2. **Supabase DBA Phase 3.1** (leaderboard prizes) ← can start in parallel with 3.2
3. **Supabase DBA Phase 3.2** (arenas schema)
4. **Mobile Agent Phase 3.3** ← AFTER all DBA phases complete
5. **Admin Agent Phase 3.4** ← AFTER all DBA phases complete (can run in parallel with Mobile)

### TESTING CHECKLIST
- [ ] Bug #1: Attempt two simultaneous reward claims → only one should succeed
- [ ] Bug #2: Set user's available_drops to 0, claim reward → available_drops should be 0 (not negative)
- [ ] Bug #3: Wait for drop expiry → both available_drops AND local_drops_balance decrease
- [ ] Leaderboard prizes: End a weekly period → top 3 get redemption entries
- [ ] Arena opt-in: User opts into arena → appears in arena leaderboard
- [ ] Arena scoring: User completes session → arena score updates in real-time (for total_drops)
- [ ] Arena finalization: Arena end_date passes → winners determined, codes generated, notifications sent
