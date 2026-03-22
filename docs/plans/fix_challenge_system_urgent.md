# FIX: Challenge System — URGENT (Demo za 2 dana)

**Datum:** 2026-03-11
**Prioritet:** CRITICAL
**Reference:** master_execution_plan.md lines 150-152

## Root Causes (Multiple)

### RC1: `dbChallengeTypeMap` (Admin → DB)
`challenge-actions.ts` converts `checkin_streak` → `'streak'` and `checkin_count` → `'monthly'` before saving. Backend functions filter by actual type → never find them.

### RC2: Missing reward logic (DB)
`update_checkin_challenge_progress()` does not award `reward_drops`, badges, or `drops_transactions` on completion.

### RC3: No type exclusion (DB)
`update_challenge_progress()` does not exclude check-in types → applies wrong scoring logic to them.

### RC4: Admin stats query wrong table (DB)
`get_challenge_completion_stats` RPC queries deprecated `user_challenge_progress` table instead of `challenge_progress`. Returns 0/0 for all gym challenges.

### RC5: Streak date boundary (DB)
`streak_days` scoring and `checkin_streak` both read `profiles.streak_days` — a global value that does NOT respect the challenge's `start_date`. A pre-existing streak incorrectly counts toward a new challenge.

### RC6: Mobile type handling gaps
- `workout.tsx`: treats ALL challenges as drops-based (shows "target 5 drops" for streak challenges)
- `session-summary.tsx`: only handles `'streak'`, not `'checkin_streak'`
- `ActiveChallengesOverlay.tsx`: same — missing `'checkin_streak'` and `'checkin_count'`

## Status

| Fix | Status |
|-----|--------|
| RC6: Mobile type handling | ✅ DONE (workout.tsx, session-summary.tsx, ActiveChallengesOverlay.tsx) |
| RC4: Admin target calc | ✅ DONE (getChallengeDetailedProgress in challenge-actions.ts) |
| RC1: dbChallengeTypeMap | ⏳ Needs Admin Agent |
| RC2+RC3+RC4+RC5: DB functions | ⏳ Needs DBA Agent (migration below) |

## Execution Order

```
PHASE 1: Admin Agent (immediate — fixes future challenge creation)
PHASE 2: DBA Agent  (fixes DB data + functions — must go after Phase 1)
PHASE 3: Types      (regenerate database.types.ts)
```

Mobile app needs NO changes — it already handles `checkin_streak`/`checkin_count` correctly.

---

## PHASE 1 — Admin Agent

### Task 1A: Remove `dbChallengeTypeMap` (CRITICAL)

**File:** `apps/admin-panel/lib/actions/challenge-actions.ts`

Remove the mapping in BOTH `createChallenge()` and `updateChallenge()`:

**In `createChallenge()` (around lines 180-184):**
Delete:
```typescript
const dbChallengeTypeMap: Record<string, string> = {
  checkin_streak: 'streak',
  checkin_count: 'monthly',
};
const dbChallengeType = dbChallengeTypeMap[validated.challengeType] || validated.challengeType;
```
Change `challenge_type: dbChallengeType` to `challenge_type: validated.challengeType`.

**In `updateChallenge()` (around lines 354-358):**
Same deletion. Change `challenge_type: dbChallengeType` to `challenge_type: validated.challengeType`.

### Task 1B: Remove `getEffectiveChallengeType` workaround

**File:** `apps/admin-panel/components/modules/ChallengesManager.tsx`

After the fix, `challenge_type` will correctly be `'checkin_streak'` or `'checkin_count'` in the DB, so the `criteria.type` workaround is no longer needed.

Delete the function (around lines 97-102):
```typescript
function getEffectiveChallengeType(challenge: Challenge): string {
  const criteriaType = challenge.criteria?.type;
  if (criteriaType === 'checkin_streak' || criteriaType === 'checkin_count') {
    return criteriaType;
  }
  return challenge.challenge_type;
}
```

Replace ALL calls to `getEffectiveChallengeType(challenge)` with `challenge.challenge_type`.

Search for all occurrences of `getEffectiveChallengeType` and `effectiveType` and replace.
Also remove `criteria` from the Challenge interface if it's only used for this workaround.

### Task 1C: Fix `challenges/page.tsx` end_date mapping

**File:** `apps/admin-panel/app/dashboard/gym/[id]/challenges/page.tsx`

Line 140: `end_date: c.end_date || ''` converts `null` to empty string `''`. This can break edit flow for milestone challenges (which have NULL end_date).

Change to: `end_date: c.end_date ?? null`

Make sure the Challenge interface in ChallengesManager.tsx supports `end_date: string | null`.

---

## PHASE 2 — DBA Agent

### Task 2A: Fix existing challenges in DB

Create migration: `20260312000007_fix_checkin_challenge_types.sql`

```sql
-- ═══════════════════════════════════════════════════════════
-- Migration: 20260312000007_fix_checkin_challenge_types.sql
-- Description: Fix challenge_type for check-in challenges that were
--   incorrectly stored as 'streak' or 'monthly' due to admin panel bug.
--   Also fix update_checkin_challenge_progress to award rewards,
--   and update_challenge_progress to exclude check-in types.
--
-- ROOT CAUSE: challenge-actions.ts mapped checkin_streak→streak,
--   checkin_count→monthly before saving. The criteria JSONB has the
--   correct type, so we use it to fix the challenge_type column.
-- ═══════════════════════════════════════════════════════════

-- ============================================================
-- 1. Fix existing challenges with wrong challenge_type
-- ============================================================

-- checkin_streak challenges stored as 'streak'
UPDATE public.gym_challenges
SET challenge_type = 'checkin_streak'
WHERE challenge_type = 'streak'
  AND criteria IS NOT NULL
  AND criteria->>'type' = 'checkin_streak';

-- checkin_count challenges stored as 'monthly'
UPDATE public.gym_challenges
SET challenge_type = 'checkin_count'
WHERE challenge_type = 'monthly'
  AND criteria IS NOT NULL
  AND criteria->>'type' = 'checkin_count';
```

### Task 2B: Fix `update_challenge_progress()` — exclude check-in types

In the same migration, replace the function. The ONLY change from the current version
(in `20260312000006_challenge_lifecycle_fixes.sql`) is adding a filter to the FOR loop:

```sql
-- ============================================================
-- 2. Fix update_challenge_progress() — exclude check-in types
--    These are handled by update_checkin_challenge_progress()
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_challenge_progress(
  p_user_id    UUID,
  p_gym_id     UUID,
  p_drops      INTEGER,
  p_session_id UUID
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_challenge  RECORD;
  v_progress   RECORD;
  v_new_value  NUMERIC;
  v_new_streak INTEGER;
  v_tier       JSONB;
  v_tier_name  TEXT;
  v_tier_drops INTEGER;
  v_tier_rank  INTEGER;
  v_prev_rank  INTEGER;
  v_today      DATE := (NOW() AT TIME ZONE 'Europe/Belgrade')::DATE;
BEGIN
  FOR v_challenge IN
    SELECT * FROM public.gym_challenges
    WHERE gym_id = p_gym_id
      AND is_active = true
      AND challenge_type NOT IN ('checkin_streak', 'checkin_count')  -- ← NEW: exclude check-in types
      AND start_date <= v_today
      AND (end_date >= v_today OR end_date IS NULL)
  LOOP
    -- ... rest of function body is IDENTICAL to current version in 20260312000006 ...
    -- Copy the entire body from lines 209-410 of 20260312000006_challenge_lifecycle_fixes.sql
    -- Do NOT change any other logic — only the FOR loop filter above.

    INSERT INTO public.challenge_progress
      (challenge_id, user_id, gym_id, current_drops, current_value)
    VALUES
      (v_challenge.id, p_user_id, p_gym_id, 0, 0)
    ON CONFLICT (user_id, challenge_id) DO NOTHING;

    SELECT * INTO v_progress
    FROM public.challenge_progress
    WHERE challenge_id = v_challenge.id
      AND user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
      INSERT INTO public.challenge_progress
        (challenge_id, user_id, gym_id, current_drops, current_value)
      VALUES
        (v_challenge.id, p_user_id, p_gym_id, 0, 0)
      ON CONFLICT (user_id, challenge_id) DO NOTHING
      RETURNING * INTO v_progress;

      IF NOT FOUND THEN
        RAISE WARNING 'Failed to create challenge_progress for challenge_id=%, user_id=%', v_challenge.id, p_user_id;
        CONTINUE;
      END IF;
    END IF;

    v_new_value := COALESCE(v_progress.current_value, 0);
    v_new_streak := NULL;

    CASE COALESCE(v_challenge.scoring_model, 'total_drops')
      WHEN 'total_drops' THEN
        v_new_value := v_new_value + p_drops;
      WHEN 'distance_km' THEN
        v_new_value := v_new_value + COALESCE(
          (SELECT (raw_metrics->>'total_distance')::NUMERIC / 1000.0
           FROM public.sessions WHERE id = p_session_id),
          0
        );
      WHEN 'days_visited' THEN
        v_new_value := (
          SELECT COUNT(DISTINCT DATE(started_at AT TIME ZONE 'Europe/Belgrade'))
          FROM public.sessions
          WHERE user_id = p_user_id
            AND gym_id = p_gym_id
            AND DATE(started_at AT TIME ZONE 'Europe/Belgrade') >= v_challenge.start_date
            AND DATE(started_at AT TIME ZONE 'Europe/Belgrade') <= COALESCE(v_challenge.end_date, v_today)
            AND drops_earned > 0
        );
      WHEN 'streak_days' THEN
        SELECT COALESCE(streak_days, 0) INTO v_new_streak
        FROM public.profiles
        WHERE id = p_user_id;
        v_new_value := v_new_streak;
      ELSE
        v_new_value := v_new_value + p_drops;
    END CASE;

    UPDATE public.challenge_progress
    SET current_value = v_new_value,
        current_drops = CASE
          WHEN COALESCE(v_challenge.scoring_model, 'total_drops') = 'total_drops'
          THEN (current_drops + p_drops)
          ELSE current_drops
        END,
        current_streak_days = CASE
          WHEN COALESCE(v_challenge.scoring_model, 'total_drops') = 'streak_days'
          THEN COALESCE(v_new_streak, current_streak_days, 0)
          ELSE current_streak_days
        END,
        updated_at = NOW()
    WHERE challenge_id = v_challenge.id
      AND user_id = p_user_id;

    IF v_challenge.tiers IS NULL
      AND NOT v_progress.is_completed
    THEN
      DECLARE
        v_progress_value NUMERIC;
      BEGIN
        IF COALESCE(v_challenge.scoring_model, 'total_drops') = 'streak_days' THEN
          v_progress_value := COALESCE(v_new_streak, v_progress.current_streak_days, 0);
        ELSE
          v_progress_value := v_new_value;
        END IF;

        IF v_progress_value >= v_challenge.target_drops THEN
          UPDATE public.challenge_progress
          SET is_completed = true,
              completed_at = NOW()
          WHERE challenge_id = v_challenge.id
            AND user_id = p_user_id;

          INSERT INTO public.user_badges
            (user_id, gym_challenge_id, earned_at)
          VALUES
            (p_user_id, v_challenge.id, NOW())
          ON CONFLICT (user_id, gym_challenge_id) WHERE gym_challenge_id IS NOT NULL
          DO NOTHING;

          IF NOT v_progress.drops_awarded AND v_challenge.reward_drops > 0 THEN
            UPDATE public.challenge_progress
            SET drops_awarded = true
            WHERE challenge_id = v_challenge.id AND user_id = p_user_id;

            UPDATE public.profiles
            SET total_drops     = total_drops + v_challenge.reward_drops,
                available_drops = available_drops + v_challenge.reward_drops,
                weekly_drops    = weekly_drops + v_challenge.reward_drops,
                monthly_drops   = monthly_drops + v_challenge.reward_drops
            WHERE id = p_user_id;

            UPDATE public.gym_memberships
            SET local_drops_balance = local_drops_balance + v_challenge.reward_drops
            WHERE user_id = p_user_id AND gym_id = p_gym_id;

            INSERT INTO public.drops_transactions
              (user_id, gym_id, amount, transaction_type, reference_id, description)
            VALUES
              (p_user_id, p_gym_id, v_challenge.reward_drops, 'challenge',
               v_challenge.id, 'Challenge complete: ' || v_challenge.name);
          END IF;
        END IF;
      END;
    END IF;

    IF v_challenge.tiers IS NOT NULL AND NOT COALESCE(v_progress.drops_awarded, false) THEN
      v_prev_rank := CASE COALESCE(v_progress.tier_achieved, '')
        WHEN 'gold'   THEN 3
        WHEN 'silver' THEN 2
        WHEN 'bronze' THEN 1
        ELSE 0
      END;

      FOR v_tier IN
        SELECT value FROM jsonb_array_elements(v_challenge.tiers) AS value
        ORDER BY (value->>'target')::NUMERIC ASC
      LOOP
        v_tier_name  := lower(v_tier->>'label');
        v_tier_drops := COALESCE((v_tier->>'drops')::INTEGER, 0);
        v_tier_rank  := CASE v_tier_name
          WHEN 'gold'   THEN 3
          WHEN 'silver' THEN 2
          WHEN 'bronze' THEN 1
          ELSE 0
        END;

        DECLARE
          v_tier_progress_value NUMERIC;
        BEGIN
          IF COALESCE(v_challenge.scoring_model, 'total_drops') = 'streak_days' THEN
            v_tier_progress_value := COALESCE(v_new_streak, v_progress.current_streak_days, 0);
          ELSE
            v_tier_progress_value := v_new_value;
          END IF;

          IF v_tier_progress_value >= (v_tier->>'target')::NUMERIC
            AND v_tier_rank > v_prev_rank
          THEN
            UPDATE public.challenge_progress
            SET tier_achieved = v_tier_name
            WHERE challenge_id = v_challenge.id
              AND user_id = p_user_id;

            IF v_tier_drops > 0 THEN
              UPDATE public.profiles
              SET total_drops     = total_drops + v_tier_drops,
                  available_drops = available_drops + v_tier_drops,
                  weekly_drops    = weekly_drops + v_tier_drops,
                  monthly_drops   = monthly_drops + v_tier_drops
              WHERE id = p_user_id;

              UPDATE public.gym_memberships
              SET local_drops_balance = local_drops_balance + v_tier_drops
              WHERE user_id = p_user_id AND gym_id = p_gym_id;

              INSERT INTO public.drops_transactions
                (user_id, gym_id, amount, transaction_type, reference_id, description)
              VALUES
                (p_user_id, p_gym_id, v_tier_drops, 'challenge',
                 v_challenge.id, v_tier_name || ' tier: ' || v_challenge.name);
            END IF;

            v_prev_rank := v_tier_rank;
          END IF;
        END;
      END LOOP;

      IF v_prev_rank >= 3 THEN
        UPDATE public.challenge_progress
        SET drops_awarded = true, is_completed = true, completed_at = NOW()
        WHERE challenge_id = v_challenge.id AND user_id = p_user_id;

        INSERT INTO public.user_badges
          (user_id, gym_challenge_id, earned_at)
        VALUES
          (p_user_id, v_challenge.id, NOW())
        ON CONFLICT (user_id, gym_challenge_id) WHERE gym_challenge_id IS NOT NULL
        DO NOTHING;
      END IF;
    END IF;

  END LOOP;
END;
$$;
```

### Task 2C: Fix `update_checkin_challenge_progress()` — award rewards + handle NULL end_date

The current version (in `20260312000005`) has two problems:
1. Line 384: `AND end_date >= v_today` excludes NULL end_dates
2. No reward/badge logic on completion

Replace the function in the same migration:

```sql
-- ============================================================
-- 3. Fix update_checkin_challenge_progress() — award rewards,
--    handle NULL end_date
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_checkin_challenge_progress(
  p_user_id UUID, p_gym_id UUID
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_challenge    RECORD;
  v_streak       INTEGER;
  v_count        INTEGER;
  v_target       INTEGER;
  v_current      INTEGER;
  v_was_complete BOOLEAN;
  v_today        DATE := (NOW() AT TIME ZONE 'Europe/Belgrade')::DATE;
BEGIN
  SELECT streak_days INTO v_streak FROM public.profiles WHERE id = p_user_id;

  FOR v_challenge IN
    SELECT * FROM public.gym_challenges
    WHERE gym_id = p_gym_id AND is_active = true
      AND challenge_type IN ('checkin_streak', 'checkin_count')
      AND start_date <= v_today
      AND (end_date >= v_today OR end_date IS NULL)  -- ← FIX: handle NULL end_date
  LOOP
    -- Get current completion state before update
    SELECT COALESCE(is_completed, false) INTO v_was_complete
    FROM public.challenge_progress
    WHERE user_id = p_user_id AND challenge_id = v_challenge.id;

    IF v_challenge.challenge_type = 'checkin_streak' THEN
      v_current := v_streak;
      v_target  := v_challenge.streak_days;

      INSERT INTO public.challenge_progress
        (user_id, challenge_id, gym_id, current_value, current_streak_days, updated_at)
      VALUES
        (p_user_id, v_challenge.id, p_gym_id, v_streak, v_streak, NOW())
      ON CONFLICT ON CONSTRAINT challenge_progress_user_id_challenge_id_key DO UPDATE
        SET current_value       = v_streak,
            current_streak_days = v_streak,
            is_completed = (v_streak >= v_challenge.streak_days),
            completed_at = CASE
              WHEN NOT challenge_progress.is_completed AND v_streak >= v_challenge.streak_days
              THEN NOW()
              ELSE challenge_progress.completed_at
            END,
            updated_at = NOW();

    ELSIF v_challenge.challenge_type = 'checkin_count' THEN
      SELECT COUNT(*) INTO v_count FROM public.gym_checkins
      WHERE user_id = p_user_id AND gym_id = p_gym_id
        AND DATE(checked_in_at AT TIME ZONE 'Europe/Belgrade')
            BETWEEN v_challenge.start_date AND v_today;

      v_current := v_count;
      v_target  := v_challenge.target_drops;

      INSERT INTO public.challenge_progress
        (user_id, challenge_id, gym_id, current_value, current_drops, updated_at)
      VALUES
        (p_user_id, v_challenge.id, p_gym_id, v_count, v_count, NOW())
      ON CONFLICT ON CONSTRAINT challenge_progress_user_id_challenge_id_key DO UPDATE
        SET current_value  = v_count,
            current_drops  = v_count,
            is_completed = (v_count >= v_challenge.target_drops),
            completed_at = CASE
              WHEN NOT challenge_progress.is_completed AND v_count >= v_challenge.target_drops
              THEN NOW()
              ELSE challenge_progress.completed_at
            END,
            updated_at = NOW();
    ELSE
      CONTINUE;
    END IF;

    -- Award rewards on FIRST completion (not previously complete)
    IF NOT COALESCE(v_was_complete, false) AND v_current >= v_target THEN

      -- Award badge
      INSERT INTO public.user_badges
        (user_id, gym_challenge_id, earned_at)
      VALUES
        (p_user_id, v_challenge.id, NOW())
      ON CONFLICT (user_id, gym_challenge_id) WHERE gym_challenge_id IS NOT NULL
      DO NOTHING;

      -- Award reward drops
      IF v_challenge.reward_drops > 0 THEN
        UPDATE public.challenge_progress
        SET drops_awarded = true
        WHERE challenge_id = v_challenge.id AND user_id = p_user_id;

        UPDATE public.profiles
        SET total_drops     = total_drops + v_challenge.reward_drops,
            available_drops = available_drops + v_challenge.reward_drops,
            weekly_drops    = weekly_drops + v_challenge.reward_drops,
            monthly_drops   = monthly_drops + v_challenge.reward_drops
        WHERE id = p_user_id;

        UPDATE public.gym_memberships
        SET local_drops_balance = local_drops_balance + v_challenge.reward_drops
        WHERE user_id = p_user_id AND gym_id = p_gym_id;

        INSERT INTO public.drops_transactions
          (user_id, gym_id, amount, transaction_type, reference_id, description)
        VALUES
          (p_user_id, p_gym_id, v_challenge.reward_drops, 'challenge',
           v_challenge.id, 'Challenge complete: ' || v_challenge.name);
      END IF;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_checkin_challenge_progress(UUID, UUID) TO authenticated;
```

### Task 2D: Reset wrong progress data for affected challenges

```sql
-- ============================================================
-- 4. Reset incorrect progress for challenges that were
--    incorrectly tracked by update_challenge_progress()
-- ============================================================

-- These challenges were processed with wrong scoring logic.
-- Reset their progress so they start fresh with correct tracking.
UPDATE public.challenge_progress cp
SET current_value       = 0,
    current_drops       = 0,
    current_streak_days = 0,
    is_completed        = false,
    completed_at        = NULL,
    drops_awarded       = false,
    tier_achieved       = NULL,
    updated_at          = NOW()
FROM public.gym_challenges gc
WHERE cp.challenge_id = gc.id
  AND gc.challenge_type IN ('checkin_streak', 'checkin_count');
```

---

## PHASE 3 — Types Regeneration

After Phase 2 migration is applied:

```bash
cd backend/supabase
supabase gen types typescript --local > ../types/database.types.ts
```

Or manually add to `backend/types/database.types.ts`:

Change:
```
challenge_type: "daily" | "weekly" | "monthly" | "streak" | "milestone"
```
To:
```
challenge_type: "daily" | "weekly" | "monthly" | "streak" | "milestone" | "checkin_streak" | "checkin_count"
```

(Appears at approximately lines 3329 and 3933)

---

## Mobile App — FIXES APPLIED ✅

The following files were already fixed in this session:

### workout.tsx — exclude streak/checkin from dynamic target
Streak and check-in challenges don't progress via workouts, so they should not set the workout target.
Only `daily`, `weekly`, `monthly`, `milestone` challenges set the workout target now.

### session-summary.tsx — handle checkin_streak
Was only checking `challenge_type === 'streak'`. Now also checks `'checkin_streak'` for target/current calculation.

### ActiveChallengesOverlay.tsx — handle checkin_streak and checkin_count
Was only checking `'streak'`. Now shows "days" unit for streak types and "check-ins" unit for checkin_count.

### Admin: getChallengeDetailedProgress target calc
Was only checking `challenge_type === 'streak'` for streak_days target. Now also handles `'checkin_streak'`.

---

## PHASE 2 ADDENDUM — Additional DBA Tasks

### Task 2E: Fix `get_challenge_completion_stats` RPC (CRITICAL for admin stats)

The current RPC (defined in `20240101000007_cardio_challenge_system.sql`) queries the deprecated
`user_challenge_progress` table. All gym challenges use `challenge_progress`. This is why admin
stats show 0/0 for all challenges.

Add to the same migration (`20260312000007`):

```sql
-- ============================================================
-- 5. Fix get_challenge_completion_stats — wrong table
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_challenge_completion_stats(
  p_challenge_id UUID
)
RETURNS TABLE(
  total_users INTEGER,
  completed_users INTEGER,
  completion_percentage NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(DISTINCT cp.user_id)::INTEGER AS total_users,
    COUNT(DISTINCT CASE WHEN cp.is_completed THEN cp.user_id END)::INTEGER AS completed_users,
    CASE
      WHEN COUNT(DISTINCT cp.user_id) > 0 THEN
        ROUND(
          (COUNT(DISTINCT CASE WHEN cp.is_completed THEN cp.user_id END)::NUMERIC
           / COUNT(DISTINCT cp.user_id)::NUMERIC) * 100,
          2
        )
      ELSE 0
    END AS completion_percentage
  FROM public.challenge_progress cp
  WHERE cp.challenge_id = p_challenge_id;
END;
$$;
```

### Task 2F: Fix streak date boundary (streak_days and checkin_streak)

**Problem:** Both `update_challenge_progress` (scoring_model = 'streak_days') and
`update_checkin_challenge_progress` (challenge_type = 'checkin_streak') read
`profiles.streak_days` — a **global** value. A pre-existing streak from before
the challenge's `start_date` incorrectly counts toward the challenge.

**Fix:** Replace `profiles.streak_days` with a proper calculation that only counts
consecutive visit days starting from the challenge's `start_date`.

In `update_challenge_progress`, replace the `streak_days` scoring case:

```sql
WHEN 'streak_days' THEN
  -- Calculate streak bounded by challenge start_date
  WITH visit_dates AS (
    SELECT DISTINCT DATE(started_at AT TIME ZONE 'Europe/Belgrade') AS vd
    FROM public.sessions
    WHERE user_id = p_user_id
      AND gym_id = p_gym_id
      AND DATE(started_at AT TIME ZONE 'Europe/Belgrade') >= v_challenge.start_date
      AND is_active = false AND drops_earned > 0
    UNION
    SELECT DISTINCT DATE(checked_in_at AT TIME ZONE 'Europe/Belgrade') AS vd
    FROM public.gym_checkins
    WHERE user_id = p_user_id AND gym_id = p_gym_id
      AND DATE(checked_in_at AT TIME ZONE 'Europe/Belgrade') >= v_challenge.start_date
  ),
  numbered AS (
    SELECT vd, vd - (ROW_NUMBER() OVER (ORDER BY vd))::INT AS grp
    FROM visit_dates
  ),
  streak_groups AS (
    SELECT grp, COUNT(*) AS streak_len, MAX(vd) AS last_date
    FROM numbered
    GROUP BY grp
  )
  SELECT COALESCE(MAX(streak_len), 0) INTO v_new_streak
  FROM streak_groups
  WHERE last_date = v_today;

  v_new_value := COALESCE(v_new_streak, 0);
```

In `update_checkin_challenge_progress`, replace the `checkin_streak` section:

```sql
IF v_challenge.challenge_type = 'checkin_streak' THEN
  -- Calculate checkin streak bounded by challenge start_date
  WITH visit_dates AS (
    SELECT DISTINCT DATE(checked_in_at AT TIME ZONE 'Europe/Belgrade') AS vd
    FROM public.gym_checkins
    WHERE user_id = p_user_id AND gym_id = p_gym_id
      AND DATE(checked_in_at AT TIME ZONE 'Europe/Belgrade') >= v_challenge.start_date
    UNION
    SELECT DISTINCT DATE(started_at AT TIME ZONE 'Europe/Belgrade') AS vd
    FROM public.sessions
    WHERE user_id = p_user_id AND gym_id = p_gym_id
      AND DATE(started_at AT TIME ZONE 'Europe/Belgrade') >= v_challenge.start_date
      AND is_active = false AND drops_earned > 0
  ),
  numbered AS (
    SELECT vd, vd - (ROW_NUMBER() OVER (ORDER BY vd))::INT AS grp
    FROM visit_dates
  ),
  streak_groups AS (
    SELECT grp, COUNT(*) AS streak_len, MAX(vd) AS last_date
    FROM numbered
    GROUP BY grp
  )
  SELECT COALESCE(MAX(streak_len), 0) INTO v_streak
  FROM streak_groups
  WHERE last_date = v_today;

  v_current := v_streak;
  v_target  := v_challenge.streak_days;

  INSERT INTO public.challenge_progress ...
```

### Date Boundary Audit Summary

| Scoring Model | Bounded? | Notes |
|---|---|---|
| `total_drops` | ✅ Implicit | Additive from 0; only accumulates during active period |
| `distance_km` | ✅ Implicit | Same additive approach |
| `days_visited` | ✅ Explicit | Query uses `>= start_date AND <= end_date` |
| `streak_days` | ❌ **FIX NEEDED** | Uses global `profiles.streak_days` |
| `checkin_streak` | ❌ **FIX NEEDED** | Uses global `profiles.streak_days` |
| `checkin_count` | ✅ Explicit | Query uses `BETWEEN start_date AND today` |

---

## Validation Checklist

After all phases are complete:

- [ ] Create a `checkin_streak` challenge in admin → verify DB has `challenge_type = 'checkin_streak'` (not `'streak'`)
- [ ] Create a `checkin_count` challenge in admin → verify DB has `challenge_type = 'checkin_count'` (not `'monthly'`)
- [ ] Scan QR code at gym → verify `update_checkin_challenge_progress()` is called and progress updates
- [ ] Complete a check-in challenge → verify reward drops are awarded and badge is created
- [ ] Complete a regular workout → verify `update_challenge_progress()` does NOT process check-in challenges
- [ ] Verify milestone challenges still work (NULL end_date)
- [ ] Verify daily/weekly challenges still reset correctly
- [ ] Mobile app shows correct challenge type labels for check-in challenges
- [ ] Admin panel "View stats" shows correct counts (not 0/0)
- [ ] New streak challenge starts at 0, not pre-existing streak
- [ ] Streak only counts consecutive visit days AFTER challenge start_date
- [ ] Workout screen does NOT show streak/checkin challenges as "target X drops"
