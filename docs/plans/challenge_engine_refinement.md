# Challenge Engine Refinement Plan

**Created:** 2025-01-27  
**Status:** Analysis & Planning  
**Goal:** Refine Challenges system to match SWEATDROP Challenge Engine specification

---

## Executive Summary

The current challenge system has **critical architectural issues** that prevent it from correctly implementing the new specification:

1. **Dual Challenge Systems**: Two separate progress tracking systems exist in parallel
2. **Type Confusion**: Both `challenge_type` ENUM and `frequency` TEXT exist in the same table
3. **Specification Mismatch**: System tracks MINUTES instead of DROPS
4. **Missing Types**: No support for "monthly" or "milestone" challenge types
5. **Incomplete Streak Logic**: Streak tracking is not properly implemented

**New Specification Requirements:**
- **Daily**: Sum of drops in a single day
- **Weekly/Monthly**: Cumulative drops in a fixed date range
- **Streak**: Consecutive days of training (min 1 drop per day)
- **Milestone**: All-time drops in a specific gym

---

## Current State Analysis

### Schema Issues

#### Issue 1: Dual Challenge Progress Tables

**Current State:**
- `challenge_progress` table (old system):
  - Tracks `current_drops` (INTEGER)
  - Used by `add_drops()` function
  - References `challenges.challenge_type` ENUM
  
- `user_challenge_progress` table (new system):
  - Tracks `current_minutes` (INTEGER)
  - Used by `update_challenge_progress_minutes()` function
  - References `challenges.frequency` TEXT

**Problem:** Two separate systems tracking different metrics, causing confusion and data inconsistency.

**Location:**
- `backend/supabase/migrations/20240101000001_sweatdrop_schema.sql` (lines 120-130) - `challenge_progress`
- `backend/supabase/migrations/20240101000007_cardio_challenge_system.sql` (lines 12-24) - `user_challenge_progress`

---

#### Issue 2: Type Enum Confusion

**Current State:**
- `challenge_type` ENUM: `('daily', 'weekly', 'streak')` - defined in initial schema
- `frequency` TEXT with CHECK constraint: `('daily', 'weekly', 'one-time', 'streak')` - added later
- Both fields exist in `challenges` table simultaneously

**Problem:** 
- Admin panel uses `frequency` field
- `add_drops()` function checks `challenge_type` field
- No consistency between the two

**Location:**
- `backend/supabase/migrations/20240101000001_sweatdrop_schema.sql` (line 8, 107)
- `backend/supabase/migrations/20240101000007_cardio_challenge_system.sql` (line 6)
- `apps/admin-panel/lib/actions/challenge-actions.ts` (line 75) - sets both fields

---

#### Issue 3: Specification Mismatch

**Current Implementation:**
- Challenges track `required_minutes` and `current_minutes`
- `update_challenge_progress_minutes()` updates minutes-based progress
- `add_drops()` updates drops-based progress but doesn't differentiate challenge types correctly

**New Specification:**
- All challenges should track **DROPS**, not minutes
- Daily: Sum of drops in a single day
- Weekly/Monthly: Cumulative drops in date range
- Streak: Consecutive days with min 1 drop
- Milestone: All-time drops in gym

**Problem:** System is built for minutes-based cardio challenges, not drops-based challenges.

---

#### Issue 4: Missing Challenge Types

**Current Types:**
- `daily`, `weekly`, `streak`, `one-time` (via `frequency` field)
- `daily`, `weekly`, `streak` (via `challenge_type` ENUM)

**Required Types:**
- `daily` ✅ (exists but wrong implementation)
- `weekly` ✅ (exists but wrong implementation)
- `monthly` ❌ (missing)
- `streak` ⚠️ (exists but incomplete)
- `milestone` ❌ (missing)

---

#### Issue 5: Incomplete Streak Logic

**Current Implementation:**
- `update_challenge_progress_minutes()` has TODO comment: "TODO: Implement proper streak tracking (consecutive days logic)"
- Streak challenges use: `current_minutes >= (required_minutes * streak_days)`
- This is incorrect - should track consecutive days, not cumulative minutes

**Required Logic:**
- Track consecutive days where user earned at least 1 drop
- Reset streak if user misses a day
- Complete when streak reaches `streak_days` threshold

**Location:**
- `backend/supabase/migrations/20240101000008_add_streak_challenges.sql` (line 164)

---

### Logic Issues

#### Issue 6: `add_drops()` Doesn't Handle Challenge Types

**Current Implementation:**
```sql
-- Update challenge progress
UPDATE public.challenge_progress cp
SET current_drops = current_drops + p_amount
FROM public.challenges c
WHERE cp.challenge_id = c.id
  AND cp.user_id = p_user_id
  AND c.is_active = true
  AND c.start_date <= CURRENT_DATE
  AND c.end_date >= CURRENT_DATE
  AND cp.is_completed = false;
```

**Problems:**
1. Doesn't check `challenge_type` or `frequency` - updates ALL active challenges
2. Doesn't handle daily reset (should only count drops from today)
3. Doesn't handle weekly/monthly date ranges correctly
4. Doesn't handle streak logic at all
5. Doesn't handle milestone (all-time) logic

**Location:**
- `backend/supabase/migrations/20240101000003_dual_wallet_system.sql` (lines 118-128)

---

#### Issue 7: No Daily Reset Logic

**Current State:**
- `reset_daily_challenges()` function exists but resets `user_challenge_progress` (minutes-based)
- No reset logic for `challenge_progress` (drops-based)
- Daily challenges should reset `current_drops` to 0 at midnight

**Location:**
- `backend/supabase/migrations/20240101000007_cardio_challenge_system.sql` (lines 206-220)

---

#### Issue 8: No Milestone Tracking

**Current State:**
- No support for "all-time" challenges
- No way to track cumulative drops across all sessions in a gym
- Would need to query `drops_transactions` or `gym_memberships.local_drops_balance` on-the-fly

**Problem:** Milestone challenges need to track total drops earned in a gym, not just challenge progress.

---

### Admin Panel Issues

#### Issue 9: Form Doesn't Support New Types

**Current Form Fields:**
- `frequency`: `'daily' | 'weekly' | 'one-time' | 'streak'`
- `requiredMinutes`: number (for minutes-based challenges)
- `dropsBounty`: number (reward)
- `streakDays`: number (for streak challenges)

**Missing:**
- No `monthly` option
- No `milestone` option
- No `targetDrops` field (only `requiredMinutes`)
- Form is built for minutes-based challenges, not drops-based

**Location:**
- `apps/admin-panel/components/modules/ChallengesManager.tsx` (lines 11-20)
- `apps/admin-panel/lib/actions/challenge-actions.ts` (lines 7-19)

---

## Proposed Solution

### Phase 1: Schema Unification

#### Step 1.1: Create Unified Challenge Type Enum

**Action:** Replace both `challenge_type` ENUM and `frequency` TEXT with a single unified enum.

**Migration:** `YYYYMMDDHHMMSS_unify_challenge_types.sql`

```sql
-- Drop old enum and create new one
DROP TYPE IF EXISTS challenge_type CASCADE;

CREATE TYPE challenge_type AS ENUM (
  'daily',      -- Sum of drops in a single day
  'weekly',     -- Cumulative drops in a week (fixed date range)
  'monthly',    -- Cumulative drops in a month (fixed date range)
  'streak',     -- Consecutive days of training (min 1 drop per day)
  'milestone'   -- All-time drops in a specific gym
);

-- Add new unified column (if not exists)
ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS challenge_type_new challenge_type;

-- Migrate data from old fields
UPDATE public.challenges
SET challenge_type_new = CASE
  WHEN frequency = 'daily' THEN 'daily'::challenge_type
  WHEN frequency = 'weekly' THEN 'weekly'::challenge_type
  WHEN frequency = 'streak' THEN 'streak'::challenge_type
  WHEN frequency = 'one-time' THEN 'monthly'::challenge_type  -- Map one-time to monthly
  ELSE 'daily'::challenge_type  -- Default fallback
END
WHERE challenge_type_new IS NULL;

-- Drop old columns
ALTER TABLE public.challenges
  DROP COLUMN IF EXISTS challenge_type,  -- Old ENUM
  DROP COLUMN IF EXISTS frequency;       -- Old TEXT

-- Rename new column
ALTER TABLE public.challenges
  RENAME COLUMN challenge_type_new TO challenge_type;

-- Add NOT NULL constraint
ALTER TABLE public.challenges
  ALTER COLUMN challenge_type SET NOT NULL;
```

**Files to Modify:**
- New migration file

**Success Criteria:**
- Single `challenge_type` ENUM with all 5 types
- All existing challenges migrated correctly
- No data loss

---

#### Step 1.2: Unify Challenge Progress Tables

**Action:** Consolidate `challenge_progress` and `user_challenge_progress` into a single table.

**Decision:** Keep `challenge_progress` (drops-based) and deprecate `user_challenge_progress` (minutes-based).

**Migration:** `YYYYMMDDHHMMSS_unify_challenge_progress.sql`

```sql
-- Add gym_id to challenge_progress (for milestone challenges)
ALTER TABLE public.challenge_progress
  ADD COLUMN IF NOT EXISTS gym_id UUID REFERENCES public.gyms(id) ON DELETE CASCADE;

-- Migrate gym_id from challenges table
UPDATE public.challenge_progress cp
SET gym_id = c.gym_id
FROM public.challenges c
WHERE cp.challenge_id = c.id
  AND cp.gym_id IS NULL;

-- Add NOT NULL constraint
ALTER TABLE public.challenge_progress
  ALTER COLUMN gym_id SET NOT NULL;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_challenge_progress_gym_id 
  ON public.challenge_progress(gym_id);

-- Add columns for streak tracking
ALTER TABLE public.challenge_progress
  ADD COLUMN IF NOT EXISTS current_streak_days INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_activity_date DATE;

-- Add index for streak queries
CREATE INDEX IF NOT EXISTS idx_challenge_progress_last_activity_date 
  ON public.challenge_progress(last_activity_date);

-- Note: user_challenge_progress table will be deprecated but not deleted
-- to preserve existing data. New challenges will use challenge_progress only.
```

**Files to Modify:**
- New migration file

**Success Criteria:**
- `challenge_progress` has `gym_id` column
- `challenge_progress` has streak tracking columns
- All existing progress records have `gym_id` set

---

#### Step 1.3: Update Challenges Table Schema

**Action:** Remove minutes-based fields and add drops-based fields.

**Migration:** `YYYYMMDDHHMMSS_update_challenges_schema.sql`

```sql
-- Remove minutes-based fields (keep for backward compatibility, mark as deprecated)
-- Note: We'll keep them but add comments that they're deprecated

COMMENT ON COLUMN public.challenges.required_minutes IS 'DEPRECATED: Use target_drops instead. Kept for backward compatibility.';
COMMENT ON COLUMN public.challenges.drops_bounty IS 'DEPRECATED: Use reward_drops instead. Kept for backward compatibility.';

-- Ensure target_drops and reward_drops are used
-- target_drops: Required drops to complete challenge
-- reward_drops: Drops awarded upon completion

-- Add milestone-specific field
ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS milestone_threshold INTEGER;

COMMENT ON COLUMN public.challenges.milestone_threshold IS 'For milestone challenges: total drops required (all-time in gym)';

-- Update constraint to ensure target_drops is set for non-milestone challenges
ALTER TABLE public.challenges
  DROP CONSTRAINT IF EXISTS challenges_target_drops_check;

ALTER TABLE public.challenges
  ADD CONSTRAINT challenges_target_drops_check 
  CHECK (
    (challenge_type = 'milestone' AND milestone_threshold IS NOT NULL) OR
    (challenge_type != 'milestone' AND target_drops IS NOT NULL)
  );
```

**Files to Modify:**
- New migration file

**Success Criteria:**
- `target_drops` is the primary field for challenge targets
- `milestone_threshold` exists for milestone challenges
- Constraints ensure data integrity

---

### Phase 2: Logic Refinement

#### Step 2.1: Create Dedicated `update_challenge_progress()` Function

**Action:** Create a new function that properly handles all challenge types based on drops.

**Migration:** `YYYYMMDDHHMMSS_create_update_challenge_progress_function.sql`

**Function Signature:**
```sql
CREATE OR REPLACE FUNCTION public.update_challenge_progress(
  p_user_id UUID,
  p_gym_id UUID,
  p_drops_earned INTEGER,
  p_session_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(
  challenge_id UUID,
  challenge_name TEXT,
  challenge_type challenge_type,
  current_progress INTEGER,
  target_progress INTEGER,
  is_completed BOOLEAN,
  completed_now BOOLEAN,
  reward_drops INTEGER
) AS $$
```

**Logic by Challenge Type:**

1. **Daily Challenges:**
   - Only count drops earned on `p_session_date`
   - Reset `current_drops` to 0 if last update was not today
   - Complete when `current_drops >= target_drops`

2. **Weekly Challenges:**
   - Sum drops from `start_date` to `end_date` (week range)
   - Complete when cumulative `current_drops >= target_drops`

3. **Monthly Challenges:**
   - Sum drops from `start_date` to `end_date` (month range)
   - Complete when cumulative `current_drops >= target_drops`

4. **Streak Challenges:**
   - Track consecutive days with at least 1 drop
   - If `p_session_date` is the day after `last_activity_date`, increment `current_streak_days`
   - If `p_session_date` is more than 1 day after, reset `current_streak_days` to 1
   - Complete when `current_streak_days >= streak_days`

5. **Milestone Challenges:**
   - Query `gym_memberships.local_drops_balance` for total all-time drops in gym
   - Complete when `local_drops_balance >= milestone_threshold`

**Files to Create:**
- New migration file with complete function implementation

**Success Criteria:**
- Function handles all 5 challenge types correctly
- No race conditions in streak tracking
- Proper date range handling for weekly/monthly

---

#### Step 2.2: Modify `add_drops()` to Call New Function

**Action:** Replace challenge progress logic in `add_drops()` with call to `update_challenge_progress()`.

**Migration:** `YYYYMMDDHHMMSS_refactor_add_drops_challenge_logic.sql`

**Changes:**
```sql
-- In add_drops() function, replace challenge progress logic with:
IF p_transaction_type != 'challenge' AND p_gym_id IS NOT NULL THEN
  -- Update challenge progress using new function
  PERFORM public.update_challenge_progress(
    p_user_id,
    p_gym_id,
    p_amount,
    CURRENT_DATE
  );
  
  -- Award rewards for newly completed challenges
  -- (logic to award reward_drops for completed challenges)
END IF;
```

**Files to Modify:**
- `backend/supabase/migrations/20240101000003_dual_wallet_system.sql` (reference)
- New migration file

**Success Criteria:**
- `add_drops()` uses new `update_challenge_progress()` function
- Challenge rewards are awarded correctly
- No duplicate progress updates

---

#### Step 2.3: Implement Streak Tracking Without Race Conditions

**Action:** Use SQL-based streak tracking with proper date comparison.

**Strategy:**
1. Store `last_activity_date` in `challenge_progress` table
2. Use `CURRENT_DATE` for all date comparisons (server-side, consistent)
3. Use `ON CONFLICT` with `DO UPDATE` for atomic updates
4. Use row-level locking if needed

**Implementation:**
```sql
-- In update_challenge_progress() function, for streak challenges:

-- Get or create progress record
INSERT INTO public.challenge_progress (user_id, challenge_id, gym_id, current_streak_days, last_activity_date)
VALUES (p_user_id, v_challenge.id, p_gym_id, 1, p_session_date)
ON CONFLICT (user_id, challenge_id)
DO UPDATE SET
  current_streak_days = CASE
    -- If same day, don't increment (already counted)
    WHEN challenge_progress.last_activity_date = p_session_date THEN challenge_progress.current_streak_days
    -- If next day, increment streak
    WHEN challenge_progress.last_activity_date = p_session_date - INTERVAL '1 day' THEN challenge_progress.current_streak_days + 1
    -- If gap, reset to 1
    ELSE 1
  END,
  last_activity_date = p_session_date,
  updated_at = NOW()
WHERE challenge_progress.challenge_id = v_challenge.id
  AND challenge_progress.user_id = p_user_id;
```

**Files to Create:**
- Included in Step 2.1 migration

**Success Criteria:**
- Streak tracking is atomic (no race conditions)
- Handles same-day multiple workouts correctly
- Resets streak on gap correctly

---

#### Step 2.4: Create Daily Reset Function

**Action:** Create function to reset daily challenges at midnight.

**Migration:** `YYYYMMDDHHMMSS_create_daily_reset_function.sql`

```sql
CREATE OR REPLACE FUNCTION public.reset_daily_challenges()
RETURNS void AS $$
BEGIN
  -- Reset current_drops to 0 for daily challenges
  UPDATE public.challenge_progress cp
  SET current_drops = 0,
      is_completed = false,
      completed_at = NULL,
      updated_at = NOW()
  FROM public.challenges c
  WHERE cp.challenge_id = c.id
    AND c.challenge_type = 'daily'
    AND c.is_active = true
    AND cp.last_activity_date < CURRENT_DATE;  -- Only reset if not updated today
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule via pg_cron (if available) or external cron job
-- Runs daily at 00:00:00
```

**Files to Create:**
- New migration file

**Success Criteria:**
- Function resets daily challenges correctly
- Can be called by cron job
- Doesn't affect in-progress challenges

---

### Phase 3: Admin Panel Updates

#### Step 3.1: Update Challenge Form Schema

**Action:** Update Zod schema and form to support new challenge types.

**File:** `apps/admin-panel/components/modules/ChallengesManager.tsx`

**Changes:**
```typescript
const challengeSchema = z.object({
  name: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  challengeType: z.enum(['daily', 'weekly', 'monthly', 'streak', 'milestone']),
  targetDrops: z.number().int().positive().optional(),  // For daily/weekly/monthly
  milestoneThreshold: z.number().int().positive().optional(),  // For milestone
  streakDays: z.number().int().positive().optional(),  // For streak
  rewardDrops: z.number().int().min(0),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  machineType: z.enum(['treadmill', 'bike', 'any']).optional(),  // Optional for drops-based
});

// Conditional validation:
// - daily/weekly/monthly: require targetDrops
// - streak: require streakDays
// - milestone: require milestoneThreshold
```

**Files to Modify:**
- `apps/admin-panel/components/modules/ChallengesManager.tsx`
- `apps/admin-panel/lib/actions/challenge-actions.ts`

**Success Criteria:**
- Form supports all 5 challenge types
- Validation ensures required fields are set
- Form submits correct data structure

---

#### Step 3.2: Update Challenge Form UI

**Action:** Update form fields to match new schema.

**Changes:**
1. Replace `frequency` dropdown with `challengeType` dropdown
2. Add `targetDrops` field (replaces `requiredMinutes`)
3. Add `milestoneThreshold` field (for milestone challenges)
4. Keep `streakDays` field (for streak challenges)
5. Update field visibility based on selected challenge type

**File:** `apps/admin-panel/components/modules/ChallengesManager.tsx`

**UI Flow:**
```
Challenge Type: [Dropdown: daily, weekly, monthly, streak, milestone]

If daily/weekly/monthly:
  - Target Drops: [Number input]
  
If streak:
  - Streak Days: [Number input]
  
If milestone:
  - Milestone Threshold: [Number input]

Reward Drops: [Number input] (always visible)
Start Date: [Date picker]
End Date: [Date picker]
```

**Files to Modify:**
- `apps/admin-panel/components/modules/ChallengesManager.tsx`

**Success Criteria:**
- Form UI matches new schema
- Conditional fields show/hide correctly
- User can create all 5 challenge types

---

#### Step 3.3: Update Challenge Display Table

**Action:** Update table to show correct challenge type and target.

**Changes:**
1. Display `challenge_type` instead of `frequency`
2. Display `target_drops` or `milestone_threshold` instead of `required_minutes`
3. Show appropriate labels based on challenge type

**File:** `apps/admin-panel/components/modules/ChallengesManager.tsx`

**Files to Modify:**
- `apps/admin-panel/components/modules/ChallengesManager.tsx`

**Success Criteria:**
- Table displays correct challenge information
- Challenge types are clearly labeled
- Targets are shown in drops (not minutes)

---

## Implementation Order

### Critical Path:
1. **Phase 1.1** → Unify challenge types (blocks everything)
2. **Phase 1.2** → Unify progress tables (blocks Phase 2)
3. **Phase 1.3** → Update schema (blocks Phase 2)
4. **Phase 2.1** → Create new function (blocks Phase 2.2)
5. **Phase 2.2** → Refactor add_drops() (blocks testing)
6. **Phase 2.3** → Implement streak logic (part of 2.1)
7. **Phase 2.4** → Daily reset function (independent)
8. **Phase 3.1-3.3** → Admin panel updates (can be done in parallel)

### Recommended Sequence:
1. Complete Phase 1 (all steps) - Schema unification
2. Complete Phase 2 (all steps) - Logic refinement
3. Complete Phase 3 (all steps) - Admin panel updates

---

## Testing Checklist

### Schema Testing
- [ ] All challenge types exist in enum
- [ ] `challenge_progress` has `gym_id` column
- [ ] `challenge_progress` has streak tracking columns
- [ ] Old `user_challenge_progress` data is preserved
- [ ] Constraints ensure data integrity

### Logic Testing
- [ ] Daily challenges reset at midnight
- [ ] Daily challenges only count today's drops
- [ ] Weekly challenges sum drops in week range
- [ ] Monthly challenges sum drops in month range
- [ ] Streak challenges track consecutive days correctly
- [ ] Streak resets on gap correctly
- [ ] Milestone challenges query all-time drops correctly
- [ ] Challenge rewards are awarded on completion

### Admin Panel Testing
- [ ] Form supports all 5 challenge types
- [ ] Validation works correctly
- [ ] Challenge creation works
- [ ] Challenge display shows correct information
- [ ] Challenge editing works

---

## Migration Strategy

### Data Migration

**Existing Challenges:**
- Map `frequency = 'daily'` → `challenge_type = 'daily'`
- Map `frequency = 'weekly'` → `challenge_type = 'weekly'`
- Map `frequency = 'streak'` → `challenge_type = 'streak'`
- Map `frequency = 'one-time'` → `challenge_type = 'monthly'` (or prompt admin to choose)

**Existing Progress:**
- Migrate `user_challenge_progress.current_minutes` → `challenge_progress.current_drops` (if possible)
- Or: Start fresh for drops-based challenges
- Preserve `user_challenge_progress` table for historical data

### Backward Compatibility

**Strategy:** Keep old columns with deprecation comments, remove in future migration.

**Timeline:**
- Phase 1: Add new columns, migrate data
- Phase 2: Update logic to use new columns
- Phase 3: Update admin panel
- Future: Remove deprecated columns after verification

---

## Risk Assessment

### High Risk
- **Data Loss**: Migrating from minutes-based to drops-based may lose existing progress
  - **Mitigation**: Preserve `user_challenge_progress` table, don't delete

- **Race Conditions**: Streak tracking could have race conditions
  - **Mitigation**: Use `ON CONFLICT DO UPDATE` with atomic operations

### Medium Risk
- **Breaking Changes**: Admin panel form changes may break existing workflows
  - **Mitigation**: Test thoroughly, provide migration guide

- **Performance**: Milestone challenges query `gym_memberships` on every update
  - **Mitigation**: Add index, consider caching

### Low Risk
- **Type Confusion**: Old `challenge_type` vs new `challenge_type`
  - **Mitigation**: Clear migration path, update all references

---

## Notes for Implementation

### Key Files Reference

**Backend:**
- `backend/supabase/migrations/20240101000001_sweatdrop_schema.sql` - Initial schema
- `backend/supabase/migrations/20240101000003_dual_wallet_system.sql` - `add_drops()` function
- `backend/supabase/migrations/20240101000007_cardio_challenge_system.sql` - Minutes-based system
- `backend/supabase/migrations/20240101000008_add_streak_challenges.sql` - Streak support

**Admin Panel:**
- `apps/admin-panel/components/modules/ChallengesManager.tsx` - Challenge form
- `apps/admin-panel/lib/actions/challenge-actions.ts` - Server actions

### Dependencies

**External:**
- pg_cron extension (for daily reset) - may not be available in all Supabase instances
- Alternative: External cron job calling Edge Function

**Internal:**
- `gym_memberships` table (for milestone challenges)
- `drops_transactions` table (for querying drops history)

---

## Success Criteria

### MVP Success:
- ✅ All 5 challenge types are supported
- ✅ Challenges track drops (not minutes)
- ✅ Daily challenges reset correctly
- ✅ Streak challenges track consecutive days
- ✅ Milestone challenges query all-time drops
- ✅ Admin panel can create all challenge types
- ✅ Challenge rewards are awarded correctly

### Future Enhancements (Post-MVP):
- Machine type filtering for drops-based challenges
- Challenge templates
- Bulk challenge creation
- Challenge analytics dashboard

---

---

## Detailed Analysis: Badges Integration

### Current Badges System State

**Existing Implementation:**
- ✅ `user_badges` table exists (migration: `20250127140001_create_user_badges_table.sql`)
- ✅ `challenges.badge_image_url` field exists (migration: `20250127140000_add_badge_image_to_challenges.sql`)
- ✅ `add_drops()` function already awards badges (migration: `20250127140002_add_badge_awarding_to_add_drops.sql`)
- ✅ Badge awarding logic: Inserts into `user_badges` when `challenge_progress.is_completed = true` and `completed_at = NOW()`

**Current Badge Awarding Logic:**
```sql
-- From 20250127140002_add_badge_awarding_to_add_drops.sql (lines 79-92)
INSERT INTO public.user_badges (user_id, challenge_id, earned_at)
SELECT 
  p_user_id,
  cp.challenge_id,
  NOW()
FROM public.challenge_progress cp
JOIN public.challenges c ON cp.challenge_id = c.id
WHERE cp.user_id = p_user_id
  AND cp.is_completed = true
  AND cp.completed_at = NOW()
  AND c.gym_id = p_gym_id
ON CONFLICT (user_id, challenge_id) DO NOTHING;
```

**Problem:** Current badge awarding only works for challenges that use `current_drops >= target_drops` completion logic. It won't work correctly for:
- **Streak challenges**: Completion is based on `current_streak_days >= streak_days`, not `current_drops`
- **Milestone challenges**: Completion is based on `gym_memberships.local_drops_balance >= milestone_threshold`, not `current_drops`

**Solution:** Badge awarding must be integrated into `update_challenge_progress()` function, not just `add_drops()`.

---

## Detailed Analysis: add_drops() Logic Rewrite

### Current add_drops() Function Analysis

**File:** `backend/supabase/migrations/20240101000003_dual_wallet_system.sql` (lines 68-179)

**Current Flow:**
1. Updates `profiles.total_drops` (global balance)
2. Updates `gym_memberships.local_drops_balance` (local balance, if `gym_id` provided)
3. Inserts into `drops_transactions` (audit trail)
4. Updates `challenge_progress.current_drops` (simple increment, no type checking)
5. Marks challenges as completed if `current_drops >= target_drops`
6. Awards badges (from newer migration)
7. Awards challenge rewards

**Critical Issues:**

1. **No Type Differentiation:**
   - Updates ALL active challenges regardless of type
   - Daily challenges should only count today's drops
   - Weekly/Monthly should only count drops in date range
   - Streak should track consecutive days, not cumulative drops
   - Milestone should query all-time balance, not increment progress

2. **No Daily Reset Check:**
   - Doesn't check if last update was today
   - Should reset `current_drops` to 0 if `last_activity_date < CURRENT_DATE`

3. **No Streak Logic:**
   - Doesn't check `last_activity_date` for streak challenges
   - Doesn't increment `current_streak_days`
   - Doesn't reset streak on gap

4. **No Milestone Logic:**
   - Doesn't query `gym_memberships.local_drops_balance`
   - Doesn't check `milestone_threshold`

### Proposed add_drops() Refactoring

**New Flow:**
```sql
CREATE OR REPLACE FUNCTION public.add_drops(
  p_user_id UUID,
  p_gym_id UUID,
  p_amount INTEGER,
  p_transaction_type TEXT,
  p_reference_id UUID DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_membership_id UUID;
  v_completed_challenges RECORD;
BEGIN
  -- 1. Update global balance
  UPDATE public.profiles
  SET total_drops = total_drops + p_amount,
      updated_at = NOW()
  WHERE id = p_user_id;

  -- 2. Update local balance (if gym_id provided)
  IF p_gym_id IS NOT NULL THEN
    v_membership_id := public.get_or_create_gym_membership(p_user_id, p_gym_id);
    UPDATE public.gym_memberships
    SET local_drops_balance = local_drops_balance + p_amount,
        updated_at = NOW()
    WHERE id = v_membership_id;
  END IF;

  -- 3. Record transaction
  INSERT INTO public.drops_transactions (...)
  VALUES (...);

  -- 4. Update challenge progress (ONLY if not a challenge reward)
  IF p_transaction_type != 'challenge' AND p_gym_id IS NOT NULL THEN
    -- Call new update_challenge_progress() function
    -- This function handles all challenge types correctly
    FOR v_completed_challenges IN
      SELECT * FROM public.update_challenge_progress(
        p_user_id,
        p_gym_id,
        p_amount,
        CURRENT_DATE
      )
      WHERE completed_now = true
    LOOP
      -- Award badge (if challenge has badge_image_url)
      INSERT INTO public.user_badges (user_id, challenge_id, earned_at)
      SELECT p_user_id, v_completed_challenges.challenge_id, NOW()
      FROM public.challenges c
      WHERE c.id = v_completed_challenges.challenge_id
        AND c.badge_image_url IS NOT NULL
      ON CONFLICT (user_id, challenge_id) DO NOTHING;

      -- Award challenge reward drops
      IF v_completed_challenges.reward_drops > 0 THEN
        PERFORM public.add_drops(
          p_user_id,
          p_gym_id,
          v_completed_challenges.reward_drops,
          'challenge',
          v_completed_challenges.challenge_id,
          'Challenge reward: ' || v_completed_challenges.challenge_name
        );
      END IF;
    END LOOP;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Key Changes:**
- Removes direct challenge progress updates from `add_drops()`
- Delegates to `update_challenge_progress()` function
- Badge awarding happens in `add_drops()` after challenge completion
- Challenge rewards are awarded via recursive `add_drops()` call

---

## Detailed Analysis: update_challenge_progress() Pseudocode

### Function Pseudocode

```sql
FUNCTION update_challenge_progress(
  p_user_id UUID,
  p_gym_id UUID,
  p_drops_earned INTEGER,
  p_session_date DATE
)
RETURNS TABLE(...)

BEGIN
  -- Loop through all active challenges for this gym
  FOR each challenge WHERE gym_id = p_gym_id AND is_active = true AND date_range_valid DO
    
    -- Get or create progress record
    progress = GET_OR_CREATE progress(user_id, challenge_id, gym_id)
    
    CASE challenge.challenge_type:
      
      CASE 'daily':
        -- Check if last update was today
        IF progress.last_activity_date < p_session_date THEN
          -- Reset to 0 (new day)
          progress.current_drops = 0
        END IF
        
        -- Only count drops from today
        IF progress.last_activity_date = p_session_date THEN
          progress.current_drops = progress.current_drops + p_drops_earned
        ELSE
          progress.current_drops = p_drops_earned  -- First workout today
        END IF
        
        progress.last_activity_date = p_session_date
        
        -- Check completion
        IF progress.current_drops >= challenge.target_drops THEN
          progress.is_completed = true
          progress.completed_at = NOW()
          completed_now = true
        END IF
        
      CASE 'weekly':
        -- Sum drops in week range (start_date to end_date)
        -- Only count if session_date is within challenge date range
        IF p_session_date BETWEEN challenge.start_date AND challenge.end_date THEN
          progress.current_drops = progress.current_drops + p_drops_earned
          progress.last_activity_date = p_session_date
          
          IF progress.current_drops >= challenge.target_drops THEN
            progress.is_completed = true
            progress.completed_at = NOW()
            completed_now = true
          END IF
        END IF
        
      CASE 'monthly':
        -- Same as weekly, but for month range
        IF p_session_date BETWEEN challenge.start_date AND challenge.end_date THEN
          progress.current_drops = progress.current_drops + p_drops_earned
          progress.last_activity_date = p_session_date
          
          IF progress.current_drops >= challenge.target_drops THEN
            progress.is_completed = true
            progress.completed_at = NOW()
            completed_now = true
          END IF
        END IF
        
      CASE 'streak':
        -- Track consecutive days
        IF progress.last_activity_date IS NULL THEN
          -- First time: start streak
          progress.current_streak_days = 1
          progress.last_activity_date = p_session_date
        ELSE IF progress.last_activity_date = p_session_date THEN
          -- Same day: don't increment (already counted)
          -- Do nothing (streak already counted for today)
        ELSE IF progress.last_activity_date = p_session_date - 1 DAY THEN
          -- Next day: increment streak
          progress.current_streak_days = progress.current_streak_days + 1
          progress.last_activity_date = p_session_date
        ELSE
          -- Gap detected: reset streak
          progress.current_streak_days = 1
          progress.last_activity_date = p_session_date
        END IF
        
        -- Check completion (streak_days is stored in challenges.streak_days)
        IF progress.current_streak_days >= challenge.streak_days THEN
          progress.is_completed = true
          progress.completed_at = NOW()
          completed_now = true
        END IF
        
        -- Note: For streak, we don't track current_drops
        -- We only track current_streak_days
        
      CASE 'milestone':
        -- Query all-time drops from gym_memberships
        all_time_drops = SELECT local_drops_balance 
                         FROM gym_memberships 
                         WHERE user_id = p_user_id AND gym_id = p_gym_id
        
        -- Update progress.current_drops to reflect all-time balance (for display)
        progress.current_drops = all_time_drops
        
        -- Check completion
        IF all_time_drops >= challenge.milestone_threshold THEN
          progress.is_completed = true
          progress.completed_at = NOW()
          completed_now = true
        END IF
        
    END CASE
    
    -- Save progress
    UPDATE challenge_progress SET ... WHERE id = progress.id
    
    -- Return progress info
    RETURN challenge_id, challenge_name, current_progress, target_progress, ...
    
  END FOR
END
```

### Key Implementation Details

**Streak Logic (Race Condition Prevention):**
- Use `ON CONFLICT DO UPDATE` for atomic updates
- Compare dates using `CURRENT_DATE` (server-side, consistent)
- Use `last_activity_date` to detect gaps
- Increment only if `last_activity_date = p_session_date - 1 DAY`

**Daily Reset Logic:**
- Check `last_activity_date < CURRENT_DATE` before counting drops
- Reset `current_drops = 0` if new day
- Update `last_activity_date = CURRENT_DATE`

**Milestone Logic:**
- Query `gym_memberships.local_drops_balance` (not increment)
- Update `progress.current_drops` for display purposes
- Check `local_drops_balance >= milestone_threshold`

---

## API/RPC Updates Required

### New RPC Functions Needed

#### 1. `get_challenge_progress_for_user()`

**Purpose:** Get current progress for all active challenges for a user in a gym.

**Signature:**
```sql
CREATE OR REPLACE FUNCTION public.get_challenge_progress_for_user(
  p_user_id UUID,
  p_gym_id UUID,
  p_challenge_type challenge_type DEFAULT NULL  -- Optional filter
)
RETURNS TABLE(
  challenge_id UUID,
  challenge_name TEXT,
  challenge_type challenge_type,
  challenge_description TEXT,
  target_progress INTEGER,  -- target_drops or milestone_threshold or streak_days
  current_progress INTEGER,  -- current_drops or current_streak_days
  progress_percentage NUMERIC,
  is_completed BOOLEAN,
  completed_at TIMESTAMPTZ,
  reward_drops INTEGER,
  badge_image_url TEXT,
  start_date DATE,
  end_date DATE
) AS $$
```

**Logic:**
- Join `challenges` with `challenge_progress`
- Calculate `progress_percentage` based on challenge type
- For streak: `(current_streak_days / streak_days) * 100`
- For milestone: `(local_drops_balance / milestone_threshold) * 100`
- For daily/weekly/monthly: `(current_drops / target_drops) * 100`

**Files to Create:**
- `backend/supabase/migrations/YYYYMMDDHHMMSS_create_get_challenge_progress_rpc.sql`

---

#### 2. `get_active_challenges_for_user()` (Update Existing)

**Purpose:** Get active challenges with progress (replaces existing function).

**Current:** `backend/supabase/migrations/20240101000008_add_streak_challenges.sql` (lines 22-93)

**Changes Needed:**
- Remove `current_minutes` field (use `current_drops` or `current_streak_days`)
- Add `challenge_type` field
- Add `badge_image_url` field
- Update logic to use `challenge_progress` instead of `user_challenge_progress`
- Handle all 5 challenge types

**Files to Modify:**
- New migration file to replace existing function

---

#### 3. `get_challenge_completion_stats()` (Update Existing)

**Purpose:** Get statistics for challenge completion (for admin dashboard).

**Current:** `backend/supabase/migrations/20240101000007_cardio_challenge_system.sql` (lines 308-329)

**Changes Needed:**
- Update to use `challenge_progress` instead of `user_challenge_progress`
- Handle milestone challenges (query `gym_memberships` for all-time stats)

**Files to Modify:**
- New migration file to update existing function

---

### Mobile App API Updates

**Current Usage:**
- Mobile app uses `get_active_challenges_for_user()` RPC (via `useChallengeProgress` hook)
- Hook location: `apps/mobile-app/hooks/useChallengeProgress.ts`

**Required Updates:**
1. Update `useChallengeProgress` hook to handle new return format
2. Update challenge progress display to show drops (not minutes)
3. Update streak display to show `current_streak_days / streak_days`
4. Update milestone display to show all-time drops

**Files to Modify:**
- `apps/mobile-app/hooks/useChallengeProgress.ts`
- `apps/mobile-app/app/challenges.tsx`
- `apps/mobile-app/app/home.tsx` (challenge cards)

---

### Admin Panel API Updates

**Current Usage:**
- Admin panel uses `get_challenge_completion_stats()` RPC
- Server action: `apps/admin-panel/lib/actions/challenge-actions.ts`

**Required Updates:**
1. Update `getChallengeCompletionStats` function to use new RPC signature
2. Update challenge display to show correct progress metrics
3. Add badge statistics (how many users earned badge)

**Files to Modify:**
- `apps/admin-panel/lib/actions/challenge-actions.ts`
- `apps/admin-panel/components/modules/ChallengesManager.tsx`

---

## UI Recommendations

### Admin Panel Form Updates

#### Current Form Issues

**File:** `apps/admin-panel/components/modules/ChallengesManager.tsx`

**Current Fields:**
- `frequency`: Dropdown with `['daily', 'weekly', 'one-time', 'streak']`
- `requiredMinutes`: Number input (for minutes-based)
- `dropsBounty`: Number input (reward)
- `streakDays`: Number input (only shown for streak)

**Problems:**
1. Uses `frequency` instead of `challenge_type`
2. No `monthly` option
3. No `milestone` option
4. Uses `requiredMinutes` instead of `targetDrops`
5. Form logic is built for minutes-based challenges

#### Recommended Form Structure

```typescript
// Form Schema
const challengeSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  challengeType: z.enum(['daily', 'weekly', 'monthly', 'streak', 'milestone']),
  
  // Conditional fields based on challengeType
  targetDrops: z.number().int().positive().optional(),  // For daily/weekly/monthly
  milestoneThreshold: z.number().int().positive().optional(),  // For milestone
  streakDays: z.number().int().positive().optional(),  // For streak
  
  rewardDrops: z.number().int().min(0),
  badgeImageUrl: z.string().url().optional(),  // NEW: Badge image upload
  
  startDate: z.string().optional(),
  endDate: z.string().optional(),
}).refine((data) => {
  // Conditional validation
  if (data.challengeType === 'daily' || data.challengeType === 'weekly' || data.challengeType === 'monthly') {
    return data.targetDrops !== undefined && data.targetDrops > 0;
  }
  if (data.challengeType === 'streak') {
    return data.streakDays !== undefined && data.streakDays > 0;
  }
  if (data.challengeType === 'milestone') {
    return data.milestoneThreshold !== undefined && data.milestoneThreshold > 0;
  }
  return true;
}, {
  message: "Required field missing for selected challenge type"
});
```

#### Form UI Flow

```
┌─────────────────────────────────────────┐
│ Challenge Type *                         │
│ [Dropdown: daily, weekly, monthly,       │
│           streak, milestone]             │
└─────────────────────────────────────────┘
              │
              ├─ daily/weekly/monthly ──┐
              │                         │
              ├─ streak ────────────────┤
              │                         │
              └─ milestone ──────────────┤
                                        │
        ┌───────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────┐
│ IF daily/weekly/monthly:                │
│   Target Drops * [Number input]         │
│   "Total drops required to complete"    │
│                                         │
│ IF streak:                              │
│   Streak Days * [Number input]         │
│   "Consecutive days required"           │
│                                         │
│ IF milestone:                           │
│   Milestone Threshold * [Number input] │
│   "All-time drops required in gym"     │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Reward Drops * [Number input]           │
│ "Drops awarded when completed"         │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Badge Image URL [File upload or URL]   │
│ "Optional: Badge icon for completion"   │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Start Date [Date picker]                │
│ End Date [Date picker]                  │
└─────────────────────────────────────────┘
```

**Implementation Notes:**
- Use `watch('challengeType')` to show/hide conditional fields
- Add validation messages for each challenge type
- Add help text explaining each type
- Add badge image upload (file upload or URL input)

**Files to Modify:**
- `apps/admin-panel/components/modules/ChallengesManager.tsx` (lines 321-457)
- `apps/admin-panel/lib/actions/challenge-actions.ts` (lines 7-101)

---

### Mobile App UI Updates

#### Workout Screen Updates

**Current:** `apps/mobile-app/app/workout.tsx`

**Recommended Changes:**
1. **Active Challenges Overlay:**
   - Show progress bars for active challenges
   - For daily: "X / Y drops today"
   - For weekly/monthly: "X / Y drops (period)"
   - For streak: "X / Y days streak"
   - For milestone: "X / Y all-time drops"

2. **Challenge Progress Display:**
   - Update `useChallengeProgress` hook to use new RPC
   - Display drops (not minutes)
   - Show streak days for streak challenges

**Files to Modify:**
- `apps/mobile-app/app/workout.tsx` (challenge progress display)
- `apps/mobile-app/hooks/useChallengeProgress.ts` (RPC call)

---

#### Session Summary Updates

**Current:** `apps/mobile-app/app/session-summary.tsx`

**Recommended Changes:**
1. **Challenge Completion Display:**
   - Show completed challenges with badge images
   - Display: "Challenge Completed! +X drops + Badge"
   - Show badge animation for newly earned badges

2. **Progress Update:**
   - Show progress for all active challenges
   - Display: "Daily: 50/100 drops", "Streak: 3/7 days", etc.

**Files to Modify:**
- `apps/mobile-app/app/session-summary.tsx` (add challenge completion section)

---

#### Challenges Screen Updates

**Current:** `apps/mobile-app/app/challenges.tsx`

**Recommended Changes:**
1. **Challenge Type Labels:**
   - Display challenge type clearly (Daily, Weekly, Monthly, Streak, Milestone)
   - Show appropriate progress metrics

2. **Progress Bars:**
   - For daily/weekly/monthly: Show drops progress
   - For streak: Show days progress
   - For milestone: Show all-time drops progress

**Files to Modify:**
- `apps/mobile-app/app/challenges.tsx` (challenge display logic)

---

## Badges Integration with Challenge Types

### Badge Awarding Logic by Challenge Type

**Current Implementation:**
- Badges are awarded in `add_drops()` when `challenge_progress.is_completed = true`
- Works for challenges that use `current_drops >= target_drops`

**Required Updates:**

1. **Daily/Weekly/Monthly Challenges:**
   - ✅ Already works (uses `current_drops >= target_drops`)
   - Badge awarded when challenge completed

2. **Streak Challenges:**
   - ❌ Currently doesn't work (completion is `current_streak_days >= streak_days`)
   - **Fix:** Update badge awarding to check `current_streak_days` for streak challenges

3. **Milestone Challenges:**
   - ❌ Currently doesn't work (completion is `local_drops_balance >= milestone_threshold`)
   - **Fix:** Update badge awarding to check milestone completion

### Updated Badge Awarding Logic

**Location:** In `update_challenge_progress()` function return value, then in `add_drops()`

**Pseudocode:**
```sql
-- In update_challenge_progress() function:
-- Return completed_now = true for any challenge type when completed

-- In add_drops() function:
FOR each completed challenge (where completed_now = true) DO
  -- Award badge (if challenge has badge_image_url)
  INSERT INTO user_badges (user_id, challenge_id, earned_at)
  VALUES (p_user_id, challenge_id, NOW())
  ON CONFLICT (user_id, challenge_id) DO NOTHING;
END FOR
```

**Key Point:** Badge awarding should work the same for all challenge types - it's triggered by `completed_now = true` from `update_challenge_progress()`.

---

## Summary of Required Changes

### Database Changes Summary

1. **Enum Update:**
   - Add `'monthly'` and `'milestone'` to `challenge_type` ENUM
   - Remove `frequency` TEXT field
   - Migrate existing data

2. **Schema Updates:**
   - Add `gym_id` to `challenge_progress` table
   - Add `current_streak_days` and `last_activity_date` to `challenge_progress`
   - Add `milestone_threshold` to `challenges` table
   - Add `streak_days` to `challenges` table (if not exists)

3. **Constraints:**
   - Ensure `target_drops` is set for daily/weekly/monthly
   - Ensure `milestone_threshold` is set for milestone
   - Ensure `streak_days` is set for streak

### SQL Logic Rewrite Summary

1. **New Function:** `update_challenge_progress()`
   - Handles all 5 challenge types
   - Returns completion status
   - Atomic streak tracking

2. **Refactored Function:** `add_drops()`
   - Calls `update_challenge_progress()`
   - Awards badges based on completion
   - Awards challenge rewards

3. **New Function:** `reset_daily_challenges()`
   - Resets daily challenges at midnight
   - Can be called by cron job

### API/RPC Updates Summary

1. **New RPC:** `get_challenge_progress_for_user()`
   - Returns progress for all challenge types
   - Includes badge information

2. **Updated RPC:** `get_active_challenges_for_user()`
   - Uses `challenge_progress` instead of `user_challenge_progress`
   - Handles all 5 challenge types

3. **Updated RPC:** `get_challenge_completion_stats()`
   - Uses `challenge_progress` instead of `user_challenge_progress`
   - Handles milestone challenges

### UI Updates Summary

1. **Admin Panel:**
   - Replace `frequency` with `challengeType` enum
   - Replace `requiredMinutes` with `targetDrops`
   - Add `milestoneThreshold` field
   - Add `badgeImageUrl` field
   - Conditional field display based on challenge type

2. **Mobile App:**
   - Update `useChallengeProgress` hook
   - Update challenge display to show drops (not minutes)
   - Update streak display to show days
   - Update milestone display to show all-time drops
   - Add badge display in session summary

---

**Last Updated:** 2025-01-27  
**Next Review:** After Phase 1 completion
