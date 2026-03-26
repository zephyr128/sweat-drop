# SWEATDROP DATABASE AUDIT REPORT
Generated: 2026-03-04
Status: READ-ONLY ANALYSIS (SQL queries need to be run manually)

═══════════════════════════════════════════════

## EXECUTIVE SUMMARY

This audit identifies unused tables, columns, functions, indexes, and views in the SweatDrop database. All findings are based on codebase analysis. **SQL queries must be run manually** to verify actual database state.

**Key Findings:**
- `add_drops()` function exists but is SUPERSEDED by `award_drops()`
- `challenge_id` column in `user_badges` appears to be LEGACY (superseded by `gym_challenge_id`)
- `challenges` table was renamed to `gym_challenges` (verify old table doesn't exist)
- Several columns in `gym_challenges` may be DUPLICATE or LEGACY
- `incorrect_challenge_rewards` view exists but may be UNUSED

═══════════════════════════════════════════════

## ── TABLES ──────────────────────────────────────

**Note:** Row counts require running Query A from `AUDIT_QUERIES.sql`

| Table | Status | Used In | Notes |
|-------|--------|---------|-------|
| profiles | USED | Mobile app, Admin panel | Core user table |
| gyms | USED | Mobile app, Admin panel | Core gym table |
| gym_challenges | USED | Mobile app, Admin panel | Challenge engine |
| challenge_progress | USED | Mobile app, Backend functions | Progress tracking |
| sessions | USED | Mobile app, Admin panel | Workout sessions |
| rewards | USED | Mobile app, Admin panel | Store items |
| redemptions | USED | Mobile app, Admin panel | Reward redemptions |
| gym_memberships | USED | Mobile app | Local drops balance |
| drops_transactions | USED | Mobile app, Admin panel | Audit trail |
| user_badges | USED | Mobile app | Badge tracking |
| global_achievements | USED | Mobile app | Global badges |
| user_progress | USED | Mobile app | Achievement progress |
| machines | USED | Mobile app, Admin panel | BLE machines |
| equipment | UNCLEAR | Legacy scan code? | May be legacy |
| gym_staff | LEGACY | Old RBAC system? | Check if still used |
| staff_invitations | USED | Admin panel | Invitation system |
| leaderboard_rewards | USED | Admin panel | Top 3 rewards |
| owner_branding | USED | Mobile app, Admin panel | **KEEP** - Primary branding table |
| gym_branding | PARTIALLY USED | Admin panel (BrandingForm.tsx:31) | **REVIEW** - May be legacy, owner_branding is primary |
| workout_plans | USED | Mobile app | SmartCoach plans |
| workout_plan_templates | USED | Admin panel | Plan templates |
| day_templates | USED | Admin panel | Day templates |
| arenas | USED | Mobile app, Admin panel | Sweat Arenas |
| arena_participants | USED | Mobile app, Admin panel | Arena participation |
| arena_leaderboard | USED | Mobile app, Admin panel | Arena rankings |

**UNUSED / EMPTY TABLES (verify with Query A):**
- `challenges` - Should NOT exist (renamed to `gym_challenges` in 20250128000002)
- `gym_staff` - May be legacy (replaced by profiles.role + admin_gym_id)

═══════════════════════════════════════════════

## ── COLUMNS TO INVESTIGATE ──────────────────────

### Table: gym_challenges

| Column | Status | Used In | Recommendation |
|--------|--------|---------|----------------|
| challenge_type | USED | Mobile app (challenges.tsx, challenge-detail.tsx) | **KEEP** - Actively used |
| target_drops | USED | Mobile app, Backend functions | **KEEP** - Core field |
| milestone_threshold | USED | Mobile app (challenges.tsx line 239, challenge-detail.tsx line 161) | **KEEP** - Used for milestone challenges |
| streak_days | USED | Mobile app (challenges.tsx line 241, challenge-detail.tsx line 163) | **KEEP** - Used for streak challenges |
| criteria | USED | Admin panel (challenge-actions.ts:109,248) | **KEEP** - Used for challenge criteria JSONB |
| scoring_model | USED | Mobile app (arenas, leaderboard) | **KEEP** - Used for arenas |
| tiers | USED | Mobile app (TrophyRoom.tsx) | **KEEP** - Used for tiered challenges |
| reward_drops | USED | Backend functions | **KEEP** - Core field |
| name | USED | Mobile app, Admin panel | **KEEP** - Core field |
| description | USED | Mobile app, Admin panel | **KEEP** - Core field |
| start_date | USED | Backend functions | **KEEP** - Core field |
| end_date | USED | Backend functions | **KEEP** - Core field |
| is_active | USED | Mobile app, Admin panel | **KEEP** - Core field |
| sponsor_name | USED | Admin panel (challenge-actions.ts:173,302, arena-actions.ts:167) | **KEEP** - Used for co-branded challenges/arenas |
| sponsor_logo | USED | Admin panel (challenge-actions.ts:174,303, arena-actions.ts:168) | **KEEP** - Used for co-branded challenges/arenas |
| prize_description | USED | Admin panel (challenge-actions.ts:177,306) | **KEEP** - Used for challenge prize descriptions |

**Evidence:**
- `challenge_type`: Used in `apps/mobile-app/app/challenges.tsx:76,109,149,238,247,279`
- `target_drops`: Used in `apps/mobile-app/app/challenges.tsx:76,159,243`
- `milestone_threshold`: Used in `apps/mobile-app/app/challenges.tsx:132,239`
- `streak_days`: Used in `apps/mobile-app/app/challenges.tsx:241`
- `scoring_model`: Used in `apps/mobile-app/app/arenas.tsx:88`, `apps/mobile-app/app/leaderboard.tsx:379`
- `tiers`: Referenced in `apps/mobile-app/components/TrophyRoom.tsx` (needs verification)

### Table: user_badges

| Column | Status | Notes |
|--------|--------|-------|
| challenge_id | LEGACY | Always NULL, superseded by gym_challenge_id |
| gym_challenge_id | USED | Current FK for gym challenges |
| global_achievement_id | USED | FK for global achievements |

**Evidence:**
- `gym_challenge_id`: Used in `apps/mobile-app/hooks/useUserProgress.ts:157,159,186`
- `global_achievement_id`: Used in `apps/mobile-app/hooks/useUserProgress.ts:77,79,91,127`
- `challenge_id`: Not found in any app code (legacy)

**Action Required:** Run this query to verify:
```sql
SELECT
  COUNT(*) AS total_badges,
  COUNT(challenge_id) AS has_challenge_id,
  COUNT(gym_challenge_id) AS has_gym_challenge_id,
  COUNT(global_achievement_id) AS has_global_achievement_id
FROM user_badges;
```

### Table: challenge_progress

| Column | Status | Used In | Recommendation |
|--------|--------|---------|----------------|
| current_drops | USED | Mobile app, Backend functions | **KEEP** |
| current_value | USED | Backend functions (update_challenge_progress) | **KEEP** |
| current_streak_days | USED | Mobile app (challenges.tsx line 149,150) | **KEEP** |
| is_completed | USED | Mobile app, Backend functions | **KEEP** |
| completed_at | USED | Backend functions | **KEEP** |
| last_activity_date | USED | Backend functions (reset logic) | **KEEP** |
| tier_achieved | USED | Backend functions | **KEEP** |
| drops_awarded | USED | Backend functions | **KEEP** |

All columns appear to be actively used.

### Table: profiles

| Column | Status | Used In | Recommendation |
|--------|--------|---------|----------------|
| streak_days | USED | Mobile app (profile.tsx, home.tsx) | **KEEP** |
| available_drops | UNCLEAR | Not found in mobile app | **REVIEW** - May be future wallet feature |
| weekly_drops | UNCLEAR | Not found in mobile app | **REVIEW** |
| monthly_drops | UNCLEAR | Not found in mobile app | **REVIEW** |
| admin_gym_id | USED | Backend functions, RLS policies | **KEEP** - Used in RLS and helper functions |
| assigned_gym_id | USED | Admin panel (extensively used) | **KEEP** - Primary field for gym_admin/receptionist |
| owner_id | USED | Admin panel, Mobile app (gym ownership) | **KEEP** - Used for gym ownership |

═══════════════════════════════════════════════

## ── FUNCTIONS ───────────────────────────────────

**Note:** Function list requires running Query B from `AUDIT_QUERIES.sql`

| Function | Status | Called By | Recommendation |
|----------|--------|----------|---------------|
| award_drops | ACTIVE | Mobile app (workout.tsx:2387) | **KEEP** - Core function |
| add_drops | SUPERSEDED | Nothing in app code | **REVIEW** - May be safe to drop |
| update_challenge_progress | ACTIVE | Backend (award_drops calls it) | **KEEP** - Core function |
| evaluate_badges | ACTIVE | Backend (award_drops calls it) | **KEEP** - Core function |
| reset_daily_challenges | ACTIVE | pg_cron (scheduled) | **KEEP** - Scheduled |
| reset_weekly_challenges | ACTIVE | pg_cron (scheduled) | **KEEP** - Scheduled |
| get_leaderboard | ACTIVE | Mobile app, Admin panel | **KEEP** |
| get_available_arenas | ACTIVE | Mobile app | **KEEP** |
| finalize_arena | ACTIVE | pg_cron (scheduled) | **KEEP** - Scheduled |
| distribute_leaderboard_prizes | ACTIVE | pg_cron (scheduled) | **KEEP** - Scheduled |
| create_redemption | ACTIVE | Mobile app (store.tsx:129) | **KEEP** |
| accept_owner_invitation | ACTIVE | Admin panel | **KEEP** |
| accept_staff_invitation | ACTIVE | Admin panel | **KEEP** |
| get_user_badges | ACTIVE | Mobile app | **KEEP** |
| get_my_profile | ACTIVE | Mobile app | **KEEP** |
| update_profile | ACTIVE | Mobile app | **KEEP** |

### add_drops() Function Analysis

**Status:** SUPERSEDED by `award_drops()`

**Evidence:**
- `add_drops()` is defined in multiple migrations (last in 20250128000008)
- **NO app code calls `add_drops()`** - searched entire codebase
- Mobile app calls `award_drops()` instead (workout.tsx:2387)
- `add_drops()` is only called recursively within itself (line 101 of 20250128000008)

**Recommendation:** 
- 🟡 **MEDIUM RISK** - Verify no Edge Functions or external systems call it
- Check if any cron jobs or scheduled tasks reference it
- If unused, safe to drop after verification period

═══════════════════════════════════════════════

## ── VIEWS ───────────────────────────────────────

**Note:** View list requires running Query C from `AUDIT_QUERIES.sql`

| View | Status | Queried By | Recommendation |
|------|--------|------------|----------------|
| incorrect_challenge_rewards | UNUSED | Nothing in app code | **REVIEW** - Created in 20260304100013 for admin debugging |

**Evidence:**
- Created in migration `20260304100013_fix_incorrect_challenge_completions.sql`
- No app code queries this view
- Purpose: Show incorrectly awarded challenge rewards for admin review

**Recommendation:**
- 🟢 **LOW RISK** - Safe to keep for admin debugging, or drop if not needed

═══════════════════════════════════════════════

## ── UNUSED INDEXES ──────────────────────────────

**Note:** Requires running Query D from `AUDIT_QUERIES.sql`

Indexes with `idx_scan = 0` are candidates for removal, but verify:
- They may be used for unique constraints
- They may be used for foreign keys
- They may be needed for future queries

**Action Required:** Run Query D to get actual list.

═══════════════════════════════════════════════

## ── ENUM TYPES ──────────────────────────────────

**Note:** Requires running Query H from `AUDIT_QUERIES.sql`

| Enum | Values | Used In | Note |
|------|--------|---------|------|
| challenge_type | daily/weekly/streak | gym_challenges.challenge_type | **Mismatch** - App also uses 'monthly' and 'milestone' as TEXT |
| leaderboard_period | daily/weekly/monthly | leaderboard_rewards.period | Used |
| leaderboard_scope | gym/city/country | Unknown | **REVIEW** - May be unused |

**Issue Found:**
- `challenge_type` enum only has: daily, weekly, streak
- But app code uses: 'daily', 'weekly', 'monthly', 'streak', 'milestone'
- This suggests enum may not be enforced, or monthly/milestone are stored as TEXT

**Action Required:** Verify if monthly/milestone challenges are stored as TEXT or if enum needs updating.

═══════════════════════════════════════════════

## ── SPECIFIC INVESTIGATIONS ──────────────────────

### 1. challenges vs gym_challenges

**Status:** `challenges` table was renamed to `gym_challenges` in migration `20250128000002`

**Action Required:** Run this query:
```sql
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename = 'challenges';
```

**Expected Result:** Should return 0 rows (table should not exist)

### 2. user_badges FK columns

**Action Required:** Run this query:
```sql
SELECT
  COUNT(*) AS total_badges,
  COUNT(challenge_id) AS has_challenge_id,
  COUNT(gym_challenge_id) AS has_gym_challenge_id,
  COUNT(global_achievement_id) AS has_global_achievement_id
FROM user_badges;
```

**Expected Result:** 
- `has_challenge_id` should be 0 (legacy column)
- `has_gym_challenge_id` or `has_global_achievement_id` should be > 0

### 3. add_drops() function

**Action Required:** Run this query:
```sql
SELECT proname, pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = 'add_drops'
  AND pronamespace = 'public'::regnamespace;
```

**Expected Result:** Function exists but is not called by app code

### 4. incorrect_challenge_rewards view

**Action Required:** Run this query:
```sql
SELECT COUNT(*) FROM incorrect_challenge_rewards;
```

**Expected Result:** May have rows if there were incorrectly awarded rewards

═══════════════════════════════════════════════

## ── CLEANUP PRIORITY LIST ───────────────────────

### 🔴 HIGH RISK — Do not touch without careful review:

1. **`add_drops()` function**
   - May be called by Edge Functions or external systems
   - Verify no cron jobs reference it
   - Check Supabase logs for calls

2. **`challenges` table (if it still exists)**
   - Should have been renamed to `gym_challenges`
   - If it exists, data migration may be needed

3. **`gym_staff` table**
   - May be used by legacy code
   - Verify RLS policies don't reference it

### 🟡 MEDIUM — Safe to drop, but verify first:

1. **`user_badges.challenge_id` column**
   - Always NULL, superseded by `gym_challenge_id`
   - Verify no constraints depend on it
   - Check if RLS policies reference it

2. **`gym_challenges.criteria` column**
   - ✅ **USED** - Admin panel writes it (challenge-actions.ts)
   - **KEEP** - Used for challenge criteria JSONB

3. **`profiles.assigned_gym_id` column**
   - ✅ **USED** - Extensively used in admin panel
   - **KEEP** - Primary field for gym_admin/receptionist assignment
   - Note: `admin_gym_id` is used in RLS policies, `assigned_gym_id` is used in app logic

4. **`profiles.available_drops`, `weekly_drops`, `monthly_drops`**
   - Not found in mobile app code
   - May be future wallet feature
   - Check if backend functions use them

5. **`gym_branding` table**
   - ⚠️ **PARTIALLY USED** - Only in BrandingForm.tsx
   - **REVIEW** - `owner_branding` is primary, `gym_branding` may be legacy
   - Mobile app uses `owner_branding` exclusively

### 🟢 LOW RISK — Clearly safe to drop:

1. **`incorrect_challenge_rewards` view**
   - Created for debugging
   - Not queried by app code
   - Safe to drop if not needed for admin review

2. **Unused indexes (from Query D)**
   - After verifying they're not used for constraints
   - Can free up storage space

═══════════════════════════════════════════════

## ── RAW QUERY RESULTS ───────────────────────────

**IMPORTANT:** The following queries must be run manually in Supabase SQL Editor.

All queries are in: `backend/supabase/AUDIT_QUERIES.sql`

**Queries to run:**
- A: All tables and row counts
- B: All functions in public schema
- C: All views in public schema
- D: Unused indexes
- E: All columns in all tables
- F: Foreign key relationships
- G: RLS policies
- H: Enum types
- I: Table sizes
- J: Extensions installed

**After running queries, update this report with actual results.**

═══════════════════════════════════════════════

## ── MIGRATION HISTORY ANALYSIS ──────────────────

### Functions with multiple CREATE OR REPLACE:

1. **`add_drops()`** - Replaced 6 times:
   - 20240101000001 (initial)
   - 20240101000003 (dual wallet)
   - 20250127140002 (badge awarding)
   - 20250127160001 (challenge logic refactor)
   - 20250127170000 (session date fix)
   - 20250128000008 (gym_challenges update)
   - **Status:** SUPERSEDED by `award_drops()`

2. **`update_challenge_progress()`** - Replaced 8+ times:
   - Multiple iterations for bug fixes
   - **Status:** ACTIVE - Core function

3. **`reset_daily_challenges()`** - Replaced 2 times:
   - 20240101000007 (initial)
   - 20250127160002 (update)
   - **Status:** ACTIVE - Scheduled via pg_cron

### Tables renamed:
- `challenges` → `gym_challenges` (20250128000002)

═══════════════════════════════════════════════

## ── RECOMMENDATIONS ────────────────────────────

### Immediate Actions:

1. **Run all SQL queries** from `AUDIT_QUERIES.sql` to get actual database state
2. **Verify `challenges` table doesn't exist** (should be renamed)
3. **Check `user_badges.challenge_id` usage** (should be always NULL)
4. **Audit `add_drops()` function calls** in Supabase logs

### Short-term Cleanup (after verification):

1. Drop `user_badges.challenge_id` column if always NULL
2. Review and potentially drop `gym_challenges.criteria` if unused
3. Document `add_drops()` as deprecated (don't drop yet - may be called externally)
4. Consider dropping `incorrect_challenge_rewards` view if not needed

### Long-term Cleanup:

1. Consolidate branding tables (`gym_branding` vs `owner_branding`)
2. Clarify `profiles` columns (`assigned_gym_id` vs `admin_gym_id`)
3. Resolve enum mismatch (`challenge_type` enum vs TEXT values)

═══════════════════════════════════════════════

END OF AUDIT
═══════════════════════════════════════════════
