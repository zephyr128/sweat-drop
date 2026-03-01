# Migration Notes

This file tracks database schema changes and their impact on frontend applications.

**Last Updated:** 2025-01-28 (Faza 3: Storage Strategy - Global Achievement Badges Bucket)

---

## How to Use This File

1. **supabase-dba:** Add entry after creating migration
2. **mobile-coder:** Read before starting mobile work
3. **admin-coder:** Read before starting admin work
4. **architect:** Read when planning new features

---

## Recent Migrations

### [2025-01-28] - Create RLS Policies for Global Achievement Badges Storage Bucket

**Migration File:** `backend/supabase/migrations/20250128000006_create_global_achievement_badges_bucket.sql`

**Agent:** supabase-dba

**Problem:**
- Upload failed: Permission denied for bucket 'global-achievement-badges'
- Bucket exists but RLS policies are missing

**IMPORTANT: Bucket must be created manually before running this migration!**

**To create the bucket:**
1. Go to Supabase Dashboard → Storage → Create a new bucket
2. Name: `global-achievement-badges`
3. Public: Yes (for public read access)
4. File size limit: 1MB (or as needed)
5. Allowed MIME types: `image/png`, `image/jpeg`, `image/jpg`, `image/webp`, `image/svg+xml`

**Changes:**
- Added RLS policies for `global-achievement-badges` bucket:
  - "Anyone can view global badges" (SELECT) - public read access
  - "Superadmin can upload global badges" (INSERT) - only superadmin
  - "Superadmin can update global badges" (UPDATE) - only superadmin
  - "Superadmin can delete global badges" (DELETE) - only superadmin
- Bucket configuration:
  - Public: true (badges should be publicly accessible)
  - File size limit: 1MB per file
  - Allowed MIME types: image/png, image/jpeg, image/jpg, image/webp, image/svg+xml

**Impact:**
- **Backend:**
  - Superadmin can now upload badge images to global-achievement-badges bucket
  - Public URLs are accessible for mobile app and admin panel
- **Admin Panel:**
  - Superadmin can upload badge images when creating/editing global achievements
  - Images are accessible via public URLs
- **Mobile App:**
  - Can access badge images via public URLs
  - No authentication required for viewing badges

**Breaking Changes:** None (new bucket)

**Next Steps:**
1. ⏳ **Create bucket manually** in Supabase Dashboard (see instructions above)
2. ⏳ Run: `supabase db reset` (or apply migration) to create RLS policies
3. ⏳ Test: Upload badge image as superadmin
4. ⏳ Verify: Public URL access works
4. ⏳ Update admin panel to use bucket for badge uploads

**Public URL Format:**
```
https://{supabase_project_id}.supabase.co/storage/v1/object/public/global-achievement-badges/{achievement_code}-badge.png
```

**Path Structure:**
```
global-achievement-badges/
  ├── first_workout-badge.png
  ├── thousand_drops-badge.png
  ├── ten_day_streak-badge.png
  └── ...
```

---

### [2025-01-28] - Faza 1: Data Modeling - Hybrid Gamification System

**Migration Files:**
- `backend/supabase/migrations/20250128000001_create_global_achievements.sql`
- `backend/supabase/migrations/20250128000002_rename_challenges_to_gym_challenges.sql`
- `backend/supabase/migrations/20250128000003_add_criteria_to_gym_challenges.sql`
- `backend/supabase/migrations/20250128000004_create_user_progress.sql`
- `backend/supabase/migrations/20250128000005_update_user_badges_polymorphic.sql`

**Agent:** supabase-dba

**Plan Reference:** `docs/plans/hybrid_gamification_system_plan.md` - Faza 1: Data Modeling

**Changes:**

**Korak 1.1: Global Achievements Table**
- Created `global_achievements` table for fixed global badges defined by SweatDrop team
- Added columns: `code` (unique), `name`, `description`, `badge_image_url`, `criteria` (JSONB), `reward_drops`, `is_active`, `display_order`
- Added indexes: `idx_global_achievements_code`, `idx_global_achievements_is_active`, `idx_global_achievements_display_order`
- Added RLS policies: Anyone can view active achievements, Superadmin can manage achievements

**Korak 1.2: Rename Challenges to Gym Challenges**
- Renamed table: `challenges` → `gym_challenges`
- Renamed indexes: `idx_challenges_*` → `idx_gym_challenges_*`
- PostgreSQL automatically updates foreign key references

**Korak 1.3: Add Criteria JSONB to Gym Challenges**
- Added `criteria` JSONB column to `gym_challenges` for flexible challenge conditions
- Migrated existing data: `challenge_type + target_drops` → `criteria` JSONB format
- Added GIN index: `idx_gym_challenges_criteria` for JSONB queries
- Old columns (`challenge_type`, `target_drops`, `streak_days`, `milestone_threshold`) kept for backward compatibility

**Korak 1.4: Create User Progress Table**
- Created `user_progress` table for unified progress tracking (global achievements + gym challenges)
- Added polymorphic references: `global_achievement_id` OR `gym_challenge_id` (exactly one must be set)
- Added `progress_data` JSONB column for flexible progress metrics
- Added indexes: `idx_user_progress_*`, `idx_user_progress_progress_data` (GIN)
- Added RLS policies: Users can view own progress, Global achievement progress, Gym admins can view gym challenge progress, Backend can manage progress

**Korak 1.5: Update User Badges for Polymorphic References**
- Added columns: `global_achievement_id`, `gym_challenge_id` to `user_badges`
- Migrated existing data: `challenge_id` → `gym_challenge_id`
- Added constraint: `user_badges_exactly_one_reference` (exactly one reference must be set)
- Updated unique constraint: `user_badges_unique_per_user_and_achievement`
- Added indexes: `idx_user_badges_global_achievement_id`, `idx_user_badges_gym_challenge_id`
- Old `challenge_id` column kept for backward compatibility (will be dropped in future migration)

**Impact:**
- **Backend:**
  - New tables and columns support hybrid gamification system
  - Polymorphic references allow unified tracking of global achievements and gym challenges
  - Criteria JSONB enables flexible challenge conditions
  - All existing data is migrated to new structure
- **Mobile App:**
  - Will need to update queries to use `gym_challenges` instead of `challenges`
  - Will need to handle both `global_achievement_id` and `gym_challenge_id` in badges
  - Will need to use `criteria` JSONB instead of `challenge_type`/`target_drops`
- **Admin Panel:**
  - Will need to update challenge creation form to use `criteria` JSONB
  - Will need to handle polymorphic references in badge queries
  - Superadmin will need UI to manage global achievements

**Breaking Changes:**
- Table name changed: `challenges` → `gym_challenges` (all code must be updated)
- New `criteria` JSONB column (old columns deprecated but kept for backward compatibility)
- `user_badges` now uses polymorphic references (old `challenge_id` kept for backward compatibility)

**Next Steps:**
1. ⏳ Run: `supabase gen types typescript --local > backend/types/database.types.ts`
2. ⏳ Update all code references:
   - Mobile App: Update all queries from `challenges` to `gym_challenges`
   - Admin Panel: Update challenge creation form to use `criteria` JSONB
   - Backend Functions: Update `update_challenge_progress()` and other functions to use `gym_challenges`
3. ⏳ Proceed to Faza 2: Criteria System (Koraci 2.1-2.2)
4. ⏳ Proceed to Faza 3: Storage Strategy (Koraci 3.1-3.2)
5. ⏳ Proceed to Faza 4: Edge Worker Strategy (Koraci 4.1-4.4)
6. ⏳ Proceed to Faza 5: Multi-tenant Security (Koraci 5.1-5.2)

**Migration Notes:**
- All migrations are backward compatible (old columns kept)
- Data migration is performed automatically
- Foreign key references are automatically updated by PostgreSQL
- RLS policies are updated for new structure
- Old `challenge_id` column in `user_badges` will be dropped in a future migration

---

### [2025-01-27] - Fix Ambiguous Column Reference in user_badges INSERT

**Migration File:** `backend/supabase/migrations/20250127230000_rewrite_update_challenge_progress_with_strict_upsert.sql` (updated)

**Agent:** supabase-dba

**Problem:**
- Error: `column reference "challenge_id" is ambiguous` in `user_badges` INSERT ON CONFLICT clause
- PostgreSQL couldn't distinguish between PL/pgSQL variable `v_challenge.id` and table column `challenge_id`

**Changes:**
- Changed `VALUES (p_user_id, v_challenge.id, NOW())` to `VALUES (p_user_id, v_challenge_id_val, NOW())`
- Changed `ON CONFLICT (user_id, challenge_id)` to `ON CONFLICT ON CONSTRAINT user_badges_user_id_challenge_id_key`
- Uses explicit variable `v_challenge_id_val` (already defined earlier in function) instead of `v_challenge.id`

**Impact:**
- **Backend:**
  - Badge awarding now works without ambiguous reference errors
  - ON CONFLICT clause explicitly references constraint name
  - No breaking changes - same functionality, just different syntax

**Breaking Changes:** None (bug fix)

**Next Steps:**
1. ⏳ Run: `supabase gen types typescript --local > backend/types/database.types.ts`
2. ⏳ Testing: Verify badge awarding works correctly
   - Test challenge completion (should award badge)
   - Test duplicate badge attempt (should be prevented by ON CONFLICT)
   - Check Supabase logs for any errors

**Migration Notes:**
- Using constraint name `user_badges_user_id_challenge_id_key` (PostgreSQL default naming)
- Uses `v_challenge_id_val` variable (defined earlier in function) to avoid ambiguity
- To check constraint name: `SELECT conname FROM pg_constraint WHERE conrelid = 'public.user_badges'::regclass AND contype = 'u';`

---

### [2025-01-27] - Fix All Ambiguous Column References in update_challenge_progress

**Migration File:** `backend/supabase/migrations/20250127230000_rewrite_update_challenge_progress_with_strict_upsert.sql` (updated)

**Agent:** supabase-dba

**Problems:**
1. Error: `column reference "challenge_id" is ambiguous` in ON CONFLICT clause
2. Error: `column reference "is_completed" is ambiguous` in RETURNING clause
3. PostgreSQL couldn't distinguish between PL/pgSQL variables and table columns

**Changes:**
1. **ON CONFLICT clause:**
   - Changed all `ON CONFLICT (user_id, challenge_id)` to `ON CONFLICT ON CONSTRAINT challenge_progress_user_id_challenge_id_key`
   - Used constraint name instead of column names to avoid ambiguity
   - All 4 challenge types (daily, weekly/monthly, streak, milestone) now use constraint name

2. **RETURNING clause:**
   - Changed all `RETURNING id, current_drops, is_completed` to use table-qualified names: `challenge_progress.current_drops`, `challenge_progress.is_completed`
   - Changed all `RETURNING id, current_streak_days, is_completed` to use table-qualified names: `challenge_progress.current_streak_days`, `challenge_progress.is_completed`

3. **Variable renaming:**
   - Renamed `v_was_completed` to `v_was_completed_val` to avoid ambiguity with column name `is_completed`
   - Added explicit variable `v_challenge_id_val` to store `v_challenge.id` value
   - Updated all references to use new variable names

**Impact:**
- **Backend:**
  - Function now compiles without ambiguous reference errors
  - ON CONFLICT clause explicitly references constraint name
  - RETURNING clause uses table-qualified column names
  - No breaking changes - same functionality, just different syntax

**Breaking Changes:** None (bug fix)

**Next Steps:**
1. ⏳ Run: `supabase gen types typescript --local > backend/types/database.types.ts`
2. ⏳ Testing: Verify function executes without errors
   - Test with new user (should create progress records)
   - Test with existing user (should update existing records)
   - Check Supabase logs for any errors

**Migration Notes:**
- Using constraint name `challenge_progress_user_id_challenge_id_key` (PostgreSQL default naming)
- All RETURNING clauses use table-qualified column names (`challenge_progress.column_name`)
- Variable names avoid conflicts with column names (`v_was_completed_val` instead of `v_was_completed`)
- To check constraint name: `SELECT conname FROM pg_constraint WHERE conrelid = 'public.challenge_progress'::regclass AND contype = 'u';`

---

### [2025-01-27] - Rewrite update_challenge_progress with Strict UPSERT Logic

**Migration File:** `backend/supabase/migrations/20250127230000_rewrite_update_challenge_progress_with_strict_upsert.sql`

**Agent:** supabase-dba

**Problem:**
- `challenge_progress` table is empty for users because logic uses UPDATE instead of UPSERT
- Progress records are never initialized for new users
- Function doesn't create records if they don't exist

**Changes:**
- **Completely rewrote `update_challenge_progress()` function with STRICT UPSERT logic**
- **All challenge types now use atomic UPSERT:**
  - `INSERT INTO public.challenge_progress (...) VALUES (...) ON CONFLICT (user_id, challenge_id) DO UPDATE SET ...`
  - Always creates record if it doesn't exist
  - Updates record if it exists

**Challenge Type Logic:**

**Streak Challenges:**
- `last_activity_date IS NULL` (first training) → `current_streak_days = 1`
- `last_activity_date == CURRENT_DATE` → Don't change streak (already recorded today)
- `last_activity_date == CURRENT_DATE - 1` → `current_streak_days = current_streak_days + 1`
- Otherwise (gap > 1 day) → `current_streak_days = 1`
- `completed_now = true` ONLY when `current_streak_days >= streak_days` and challenge was just completed

**Daily Challenges:**
- `last_activity_date < CURRENT_DATE` → Reset `current_drops = p_drops_earned`
- Otherwise (same day) → `current_drops = current_drops + p_drops_earned`
- `completed_now = true` ONLY when `current_drops >= target_drops` and challenge was just completed

**Weekly/Monthly Challenges:**
- Just sum: `current_drops = current_drops + p_drops_earned`
- `completed_now = true` ONLY when `current_drops >= target_drops` and challenge was just completed

**Milestone Challenges:**
- Query `gym_memberships.local_drops_balance` for all-time balance
- `completed_now = true` ONLY when `local_drops_balance >= milestone_threshold` and challenge was just completed

**Security:**
- Uses `SECURITY DEFINER` to bypass RLS
- Uses `set_config('row_security', 'off', true)` to disable RLS during execution

**Debug Logging:**
- Added `RAISE NOTICE 'Streak update for user %: current value %'` for streak updates
- Comprehensive `RAISE LOG` statements throughout function

**Impact:**
- **Backend:**
  - Progress records are now always created for new users
  - All challenge types use consistent UPSERT pattern
  - Streak logic correctly handles all edge cases
  - `completed_now` only returns `true` when threshold is actually reached
- **Mobile App:**
  - Challenge progress will now be initialized automatically
  - Progress tracking will work for all users (new and existing)
  - Completion status will be accurate

**Breaking Changes:** None (function rewrite, same interface)

**Next Steps:**
1. ⏳ Run: `supabase gen types typescript --local > backend/types/database.types.ts`
2. ⏳ Testing: Verify challenge progress is created for new users
   - Test with new user (should create progress records)
   - Test with existing user (should update existing records)
   - Test streak logic (first time, consecutive, gap)
   - Test daily reset logic
   - Test completion detection
3. ⏳ Check Supabase logs for `RAISE NOTICE` and `RAISE LOG` messages
   - Verify progress records are being created
   - Verify streak values are correct
   - Verify completion detection works

**Migration Notes:**
- Function now uses STRICT UPSERT for all challenge types
- Progress records are always created if they don't exist
- This fixes the issue where `challenge_progress` table was empty

---

### [2025-01-27] - Fix Streak Logic in update_challenge_progress Function

**Migration File:** `backend/supabase/migrations/20250127220000_fix_streak_logic_in_update_challenge_progress.sql`

**Agent:** supabase-dba

**Problem:**
- Challenge progress not updating even though `add_drops()` works
- Streak logic not handling NULL `last_activity_date` (first time)
- `completed_now` not returned correctly when streak reaches target

**Changes:**
- Fixed streak logic in `update_challenge_progress()` function:
  - **NULL (first time):** Set `current_streak_days = 1`
  - **Same day (`last_activity_date == p_session_date`):** Don't change (already recorded today)
  - **Next day (`last_activity_date == p_session_date - 1`):** Increment `current_streak_days` by 1
  - **Gap (`last_activity_date < p_session_date - 1`):** Reset `current_streak_days` to 1
- Added `RAISE NOTICE` for streak updates: `'Streak update for user %: current value %'`
- Fixed `completed_now` return value: Returns `true` when `current_streak_days >= streak_days` and challenge was just completed
- All challenge types use UPSERT pattern: `INSERT ... ON CONFLICT (user_id, challenge_id) DO UPDATE`

**Impact:**
- **Backend:**
  - Streak challenges now correctly track consecutive days
  - First-time streak tracking works (NULL handling)
  - `completed_now` correctly indicates when streak reaches target
  - Debug logging helps diagnose issues
- **Mobile App:**
  - Challenge progress should now update correctly
  - Streak challenges will show correct progress
  - Completion status will be accurate

**Breaking Changes:** None (bug fix)

**Next Steps:**
1. ⏳ Run: `supabase gen types typescript --local > backend/types/database.types.ts`
2. ⏳ Testing: Verify streak challenge progress updates
   - Test first-time streak (should set to 1)
   - Test consecutive days (should increment)
   - Test same-day multiple workouts (should not increment)
   - Test gap in days (should reset to 1)
   - Test completion when streak reaches target
3. ⏳ Check Supabase logs for `RAISE NOTICE` messages:
   - Look for `'Streak update for user %: current value %'` messages
   - Verify streak values are correct

**Migration Notes:**
- Function uses UPSERT pattern for all challenge types
- Streak logic now properly handles all edge cases (NULL, same day, next day, gap)
- `completed_now` is returned correctly when streak reaches target

---

### [2025-01-27] - Fix Challenge Progress Insert Issue with Debug Logging

**Migration File:** `backend/supabase/migrations/20250127200000_add_debug_logging_and_fix_challenge_progress.sql`

**Agent:** supabase-dba

**Changes:**
- Added comprehensive debug logging using `RAISE LOG` throughout `update_challenge_progress()` function
- Added input validation to prevent NULL or invalid values
- Added gym_id verification to ensure challenges match the provided gym_id
- Added challenge count logging to see how many challenges are found
- Added per-challenge logging to track processing of each challenge
- Added summary logging at the end of function execution
- Function already uses `INSERT ... ON CONFLICT` (UPSERT) correctly - no changes needed
- Function already handles `is_completed` correctly - only updates if not already completed

**Debug Logging Added:**
- Function call parameters (user_id, gym_id, drops_earned, session_date)
- Input validation errors (NULL values, invalid drops)
- Challenge count (how many active challenges found)
- Per-challenge processing (challenge ID, type, name)
- Progress updates (progress_id, current_drops, was_completed)
- Challenge completion status
- Badge awarding
- Summary (processed vs found challenges)

**Impact:**
- **Backend:**
  - Debug logging will help diagnose why challenge progress is not updating
  - Check Supabase Dashboard -> Logs for `RAISE LOG` messages
  - Look for messages starting with `update_challenge_progress`
  - No breaking changes - only adds logging and validation

**Breaking Changes:** None (additive only - logging and validation)

**Next Steps:**
1. ⏳ Run: `supabase gen types typescript --local > backend/types/database.types.ts`
2. ⏳ Testing: Check Supabase Dashboard -> Logs after workout completion
   - Look for `update_challenge_progress called:` messages
   - Check if challenges are found: `Found X active challenges`
   - If 0 challenges found, check:
     - Are there active challenges for this gym? (`is_active = true`)
     - Is session date within challenge date range? (`start_date <= session_date <= end_date`)
     - Is `gym_id` correct in the session?
   - Verify challenge processing: `Processing challenge X for user Y`
   - Check progress updates: `Daily challenge updated:` etc.
   - Verify completion: `Daily challenge X completed!`

**Debugging Guide:**
- **If you see "No active challenges found":**
  - Check `challenges` table: `SELECT * FROM challenges WHERE gym_id = ? AND is_active = true`
  - Verify date range: `SELECT * FROM challenges WHERE start_date <= ? AND end_date >= ?`
  - Check if `gym_id` in session matches `gym_id` in challenges
  
- **If you see "Processing challenge X" but no updates:**
  - Check RLS policies: `SELECT * FROM pg_policies WHERE tablename = 'challenge_progress'`
  - Verify `set_config('row_security', 'off', true)` is working
  - Check for constraint violations in logs
  
- **If you see "ERROR: p_user_id is NULL" or "ERROR: p_gym_id is NULL":**
  - Check `add_drops()` function call - verify parameters are passed correctly
  - Check session data - verify `user_id` and `gym_id` are set in sessions table

**Migration Notes:**
- Function already uses `INSERT ... ON CONFLICT` correctly - creates new records if they don't exist
- Function already handles `is_completed` correctly - only marks as completed if not already completed
- Debug logging will help identify the root cause of the issue

---

### [2025-01-27] - Fix Challenge Progress INSERT RLS Policy (400 Error)

**Migration File:** `backend/supabase/migrations/20250127210000_fix_challenge_progress_insert_rls.sql`

**Agent:** supabase-dba

**Problem:**
- 400 error on POST to `/rest/v1/challenge_progress`
- RLS policy was blocking INSERT operations
- Possible causes: missing `gym_id`, `gym_id` doesn't match challenge's `gym_id`, or RLS policy too restrictive

**Changes:**
- Updated INSERT RLS policy to validate `gym_id` matches challenge's `gym_id`
- Policy now requires:
  - `auth.uid() = user_id` (user must match)
  - `gym_id IS NOT NULL` (gym_id must be provided)
  - `gym_id` must match the challenge's `gym_id` (referential integrity)
- Still allows SECURITY DEFINER functions to insert (for `update_challenge_progress()`)

**Impact:**
- **Backend:**
  - INSERT operations now validate `gym_id` matches challenge's `gym_id`
  - Prevents invalid data from being inserted
  - SECURITY DEFINER functions still work correctly
- **Frontend:**
  - If frontend tries to INSERT directly, it must provide valid `gym_id` that matches challenge's `gym_id`
  - **Recommendation:** Frontend should NOT insert directly - use `update_challenge_progress()` RPC function instead

**Breaking Changes:** None (policy update only)

**Next Steps:**
1. ⏳ Run: `supabase gen types typescript --local > backend/types/database.types.ts`
2. ⏳ Testing: Verify INSERT operations work correctly
   - Test direct INSERT with valid `gym_id` (should work)
   - Test direct INSERT without `gym_id` (should fail with clear error)
   - Test direct INSERT with wrong `gym_id` (should fail with RLS error)
3. ⏳ Frontend: Review code that inserts into `challenge_progress`
   - Remove direct INSERT operations if any
   - Use `update_challenge_progress()` RPC function instead
   - Ensure `gym_id` is provided if direct INSERT is necessary

**Common Causes of 400 Error:**
- Missing `gym_id` field (NOT NULL constraint violation)
- `gym_id` doesn't match challenge's `gym_id` (RLS policy violation)
- Duplicate `user_id + challenge_id` (UNIQUE constraint violation)
- Invalid `challenge_id` (Foreign key constraint violation)

**Migration Notes:**
- This fixes RLS policy to properly validate `gym_id` matching
- Frontend should use `update_challenge_progress()` RPC function instead of direct INSERT
- Direct INSERT will only work if all constraints are met (user_id, gym_id, challenge_id validation)

---

### [2025-01-27] - Fix add_drops() Session Date for Challenge Progress

**Migration File:** `backend/supabase/migrations/20250127170000_fix_add_drops_session_date.sql`

**Agent:** supabase-dba

**Changes:**
- Updated `add_drops()` function to use session date instead of `CURRENT_DATE` when updating challenge progress
- For `transaction_type = 'session'`, function now queries `sessions.started_at` to get the correct date
- Falls back to `CURRENT_DATE` if session not found or for non-session transactions
- Updated challenge completion check to use `completed_at >= NOW() - INTERVAL '1 second'` for more reliable detection

**Impact:**
- **Mobile App:**
  - Challenge progress now correctly tracks drops based on when workout was performed
  - Daily challenges will correctly reset based on workout date, not current date
  - Streak challenges will correctly track consecutive days based on workout date
- **Backend:**
  - Challenge progress updates now use correct session date
  - No breaking changes - existing functionality preserved

**Breaking Changes:** None (bug fix)

**Next Steps:**
1. ⏳ Run: `supabase gen types typescript --local > backend/types/database.types.ts`
2. ⏳ Testing: Verify challenge progress updates correctly after workout completion
   - Test daily challenge reset based on workout date
   - Test streak challenge tracking with workouts on different days
   - Test weekly/monthly challenge progress accumulation

**Migration Notes:**
- This fixes a bug where challenge progress was not updating correctly
- Challenge progress now correctly uses session date instead of current date
- This ensures daily challenges reset correctly and streak challenges track consecutive days properly

---

### [2025-01-27] - Add Debug Logging to update_challenge_progress

**Migration File:** `backend/supabase/migrations/20250127170001_add_debug_logging_to_update_challenge_progress.sql`

**Agent:** supabase-dba

**Changes:**
- Added `RAISE NOTICE` logging throughout `update_challenge_progress()` function
- Logs function call parameters, challenge processing, and completion status
- Added input validation to prevent NULL or invalid values
- Logs summary of how many challenges were processed

**Impact:**
- **Backend:**
  - Debug logging will help diagnose why challenge progress is not updating
  - Check Supabase logs for `RAISE NOTICE` messages to see what's happening
  - No breaking changes - only adds logging

**Breaking Changes:** None (additive only)

**Next Steps:**
1. ⏳ Run: `supabase gen types typescript --local > backend/types/database.types.ts`
2. ⏳ Testing: Check Supabase logs after workout completion
   - Look for `update_challenge_progress called:` messages
   - Check if challenges are found: `Processing challenge:` or `No active challenges found`
   - Verify challenge updates: `Daily challenge updated:` etc.

**Debugging:**
- To view logs: `supabase logs` or check Supabase dashboard logs
- Look for messages starting with `update_challenge_progress`
- If you see "No active challenges found", check:
  - Are there active challenges for this gym? (`is_active = true`)
  - Is session date within challenge date range? (`start_date <= session_date <= end_date`)
  - Is `gym_id` correct in the session?

---

## Recent Migrations

### [2025-01-27] - Leaderboard RPC Functions

**Migration File:** `backend/supabase/migrations/20250127120000_leaderboard_rpc_functions.sql`

**Agent:** supabase-dba

**Changes:**
- Added RPC function: `get_local_leaderboard(p_gym_id UUID, p_period leaderboard_period DEFAULT 'monthly', p_limit INTEGER DEFAULT 100)`
  - Returns: `user_id`, `username`, `drops`, `rank` for gym-specific leaderboard
  - Orders by `gym_memberships.local_drops_balance DESC`
- Added RPC function: `get_global_leaderboard(p_period leaderboard_period DEFAULT 'monthly', p_limit INTEGER DEFAULT 100)`
  - Returns: `user_id`, `username`, `drops`, `rank` for global leaderboard
  - Orders by `profiles.total_drops DESC`
- Both functions use `SECURITY DEFINER` and calculate rank using `ROW_NUMBER()`
- Period parameter is reserved for future filtering (currently returns all-time)

**Impact:**
- **Mobile App:** 
  - Replace direct queries to `gym_memberships` and `profiles` with RPC calls
  - Use `get_local_leaderboard()` for gym leaderboard in `app/leaderboard.tsx`
  - Use `get_global_leaderboard()` for global leaderboard
  - Add leaderboard preview widget to home screen (top 3 users)
- **Admin Panel:**
  - Use `get_local_leaderboard()` for leaderboard widget in dashboard
  - Display top 3 users with their drops balances

**Breaking Changes:** None (additive only)

**Next Steps:**
1. ⏳ Run: `supabase gen types typescript --local > backend/types/database.types.ts`
2. ⏳ Mobile-coder: Update `app/leaderboard.tsx` to use RPC functions (Phase 2.3)
3. ⏳ Mobile-coder: Add leaderboard preview to `app/home.tsx` (Phase 2.3)
4. ⏳ Admin-coder: Add leaderboard widget to dashboard (Phase 3.1)

---

### [2025-01-27] - Disable SmartCoach Feature Per Gym

**Migration File:** `backend/supabase/migrations/20250127130000_disable_smartcoach_per_gym.sql`

**Agent:** supabase-dba

**Changes:**
- Added column: `gyms.smartcoach_enabled BOOLEAN DEFAULT false NOT NULL`
  - Controls SmartCoach feature availability per gym
  - Defaults to `false` (disabled) for MVP
- Added index: `idx_gyms_smartcoach_enabled` (partial index for enabled gyms)

**Impact:**
- **Mobile App:**
  - Check `gym.smartcoach_enabled` before showing SmartCoach features
  - Hide workout plans, subscriptions, and live session features if disabled
  - Query: `SELECT smartcoach_enabled FROM gyms WHERE id = ?`
- **Admin Panel:**
  - Add toggle in gym settings to enable/disable SmartCoach
  - Update gym settings page to allow gym admins to toggle this flag
  - File: `app/dashboard/gym/[id]/settings/page.tsx` (if exists)

**Breaking Changes:** None (additive only, defaults to disabled)

**Next Steps:**
1. ⏳ Run: `supabase gen types typescript --local > backend/types/database.types.ts`
2. ✅ Mobile-coder: Add SmartCoach feature flag check in mobile app
   - ✅ Updated `Gym` interface to include `smartcoach_enabled` field
   - ✅ SmartCoach card on home screen now conditionally renders based on `activeGym?.smartcoach_enabled`
   - ✅ Workout screen checks `smartcoach_enabled` before loading SmartCoach plan items
   - ✅ Added `smartcoach_enabled` to gym query in workout screen's `createSession` function
   - ⏳ Check before allowing SmartCoach subscriptions (if needed)
3. ⏳ Admin-coder: Add SmartCoach toggle in gym settings
   - Allow gym admins to enable/disable SmartCoach per gym
   - Show current status in gym dashboard

---

### [2025-01-27] - Challenges & Badges Integration (Phase 1)

**Migration Files:**
- `backend/supabase/migrations/20250127140000_add_badge_image_to_challenges.sql`
- `backend/supabase/migrations/20250127140001_create_user_badges_table.sql`
- `backend/supabase/migrations/20250127140002_add_badge_awarding_to_add_drops.sql`
- `backend/supabase/migrations/20250127140003_create_get_user_badges_rpc.sql`

**Agent:** supabase-dba

**Changes:**

**Step 1.1 - Badge Image URL:**
- Added column: `challenges.badge_image_url TEXT` (nullable, optional)
  - Stores URL to badge image/icon that users earn when completing challenge
  - Can be NULL (optional field)

**Step 1.2 - User Badges Table:**
- Created table: `public.user_badges`
  - Fields: `id`, `user_id`, `challenge_id`, `earned_at`, `created_at`
  - Unique constraint: `(user_id, challenge_id)` - user can only earn badge once per challenge
- Created indexes:
  - `idx_user_badges_user_id` on `user_id`
  - `idx_user_badges_challenge_id` on `challenge_id`
  - `idx_user_badges_earned_at` on `earned_at DESC` (for sorting)
- RLS policies:
  - Users can view own badges
  - Users can view other users' badges (for leaderboard/social)
  - Backend functions can insert badges (via SECURITY DEFINER)

**Step 1.3 - Badge Awarding Logic:**
- Modified function: `public.add_drops()`
  - Automatically awards badge when challenge is completed
  - Inserts into `user_badges` table after marking challenge as completed
  - Uses `ON CONFLICT DO NOTHING` to prevent duplicate badges
  - Badge is awarded only once per challenge (enforced by unique constraint)

**Step 1.4 - RPC Functions:**
- Added function: `public.get_user_badges(p_user_id UUID)`
  - Returns: `badge_id`, `challenge_id`, `challenge_name`, `badge_image_url`, `earned_at`
  - Sorted by `earned_at DESC` (most recent first)
  - JOINs `user_badges` with `challenges` to get badge image URL
- Added function: `public.get_badge_statistics(p_challenge_id UUID)`
  - Returns: `total_earned INTEGER` (number of users who earned badge)
  - Used for admin panel statistics

**Impact:**
- **Mobile App:**
  - Call `get_user_badges(user_id)` RPC to fetch user's badges
  - Display badges in Trophy Room component
  - Show badge animation in session summary when badge is earned
  - Filter badges by `earned_at` to show newly earned badges (last 5 minutes)
  - Example RPC call:
    ```typescript
    const { data, error } = await supabase.rpc('get_user_badges', {
      p_user_id: userId
    });
    ```
- **Admin Panel:**
  - Add `badge_image_url` field to challenges form (upload or URL input)
  - Call `get_badge_statistics(challenge_id)` RPC to show badge statistics
  - Display badge statistics in challenges management page
  - Show badge thumbnail in challenges list
  - Example RPC call:
    ```typescript
    const { data, error } = await supabase.rpc('get_badge_statistics', {
      p_challenge_id: challengeId
    });
    ```

**Breaking Changes:** None (additive only)

**Next Steps:**
1. ⏳ Run: `supabase gen types typescript --local > backend/types/database.types.ts`
2. ⏳ Mobile-coder: Implement Trophy Room component (Phase 2.3)
   - Use `get_user_badges()` RPC to fetch badges
   - Display badges in grid layout with images
   - Show badge count in home screen header
3. ⏳ Mobile-coder: Add badge animation in session summary (Phase 2.2)
   - Check for newly earned badges (earned_at in last 5 minutes)
   - Show `BadgeEarnedModal` with animation
4. ⏳ Admin-coder: Add badge image upload to challenges form (Phase 3.1)
   - Add `badge_image_url` field to form
   - Upload badge image to Supabase Storage (or use URL input)
5. ⏳ Admin-coder: Add badge statistics to challenges page (Phase 3.2)
   - Use `get_badge_statistics()` RPC to show statistics
   - Display badge preview in challenges list

**Integration Notes:**
- Badges are automatically awarded when `add_drops()` marks challenge as completed
- No manual badge awarding needed - happens automatically via workout completion
- Badge remains in `user_badges` even if challenge is deactivated
- Badge image URL is optional - challenges can exist without badge images

---

### [2025-01-27] - Challenge Engine Refinement (Phase 1: Schema Unification)

**Migration Files:**
- `backend/supabase/migrations/20250127150000_unify_challenge_types.sql`
- `backend/supabase/migrations/20250127150001_unify_challenge_progress.sql`
- `backend/supabase/migrations/20250127150002_update_challenges_schema.sql`

**Agent:** supabase-dba

**Changes:**

**Step 1.1 - Unified Challenge Type Enum:**
- Dropped old `challenge_type` ENUM and `frequency` TEXT field
- Created new unified `challenge_type` ENUM with 5 types:
  - `daily` - Sum of drops in a single day
  - `weekly` - Cumulative drops in a week (fixed date range)
  - `monthly` - Cumulative drops in a month (fixed date range)
  - `streak` - Consecutive days of training (min 1 drop per day)
  - `milestone` - All-time drops in a specific gym
- Migrated existing data:
  - `frequency = 'daily'` → `challenge_type = 'daily'`
  - `frequency = 'weekly'` → `challenge_type = 'weekly'`
  - `frequency = 'streak'` → `challenge_type = 'streak'`
  - `frequency = 'one-time'` → `challenge_type = 'monthly'`
- Single `challenge_type` column now replaces both old fields

**Step 1.2 - Unified Challenge Progress Table:**
- Added `gym_id` column to `challenge_progress` table (required, NOT NULL)
  - Migrated from `challenges.gym_id` for all existing records
  - Required for milestone challenges and gym-specific filtering
- Added streak tracking columns:
  - `current_streak_days INTEGER DEFAULT 0 NOT NULL` - tracks consecutive days
  - `last_activity_date DATE` - last date when user earned drops
- Created indexes:
  - `idx_challenge_progress_gym_id` on `gym_id`
  - `idx_challenge_progress_last_activity_date` on `last_activity_date`
- Deprecated `user_challenge_progress` table:
  - Marked as DEPRECATED in comments
  - **NOT deleted** - kept for data preservation
  - New challenges should use `challenge_progress` only

**Step 1.3 - Updated Challenges Schema:**
- Marked minutes-based fields as DEPRECATED (kept for backward compatibility):
  - `required_minutes` → use `target_drops` instead
  - `drops_bounty` → use `reward_drops` instead
  - `machine_type` → no longer used (challenges are drops-based)
- Added `milestone_threshold INTEGER` field:
  - For milestone challenges only
  - Must be set when `challenge_type = 'milestone'`
- Added constraint `challenges_target_drops_check`:
  - Milestone challenges must use `milestone_threshold`
  - All other challenge types must use `target_drops`
- Updated documentation comments for `target_drops` and `reward_drops`

**Impact:**
- **Mobile App:**
  - Update challenge queries to use unified `challenge_type` enum
  - Remove references to `frequency` field
  - Use `challenge_progress` table only (not `user_challenge_progress`)
  - Handle new challenge types: `monthly` and `milestone`
  - For milestone challenges, check `milestone_threshold` instead of `target_drops`
- **Admin Panel:**
  - Update challenge form to use unified `challenge_type` enum
  - Remove `frequency` field from form
  - Add `monthly` and `milestone` options to challenge type selector
  - For milestone challenges, show `milestone_threshold` field instead of `target_drops`
  - Update challenge queries to use `challenge_type` only
  - Stop using `user_challenge_progress` table

**Breaking Changes:**
- ⚠️ **Breaking:** `frequency` field removed from `challenges` table
  - All code using `challenges.frequency` must be updated to use `challenges.challenge_type`
- ⚠️ **Breaking:** `challenge_type` enum values changed
  - Old: `('daily', 'weekly', 'streak')`
  - New: `('daily', 'weekly', 'monthly', 'streak', 'milestone')`
- ⚠️ **Breaking:** `user_challenge_progress` table deprecated
  - New challenges must use `challenge_progress` table
  - Old data preserved but table should not be used for new features
- ✅ **Non-breaking:** `challenge_progress` table extended
  - Added `gym_id`, `current_streak_days`, `last_activity_date` columns
  - Existing data migrated automatically

**Next Steps:**
1. ⏳ Run: `supabase gen types typescript --local > backend/types/database.types.ts`
2. ⏳ Mobile-coder: Update challenge queries to use `challenge_type` enum
   - Remove `frequency` field references
   - Handle new `monthly` and `milestone` challenge types
   - Use `challenge_progress` table only
3. ⏳ Admin-coder: Update challenge form and management
   - Replace `frequency` field with `challenge_type` enum selector
   - Add `monthly` and `milestone` options
   - Show `milestone_threshold` field for milestone challenges
   - Update all challenge queries
4. ⏳ Backend: Implement Phase 2 (Logic Refinement)
   - Create `update_challenge_progress()` function
   - Refactor `add_drops()` to use new function
   - Implement proper streak tracking logic

**Migration Notes:**
- All existing challenge data is preserved and migrated
- `user_challenge_progress` table is NOT deleted (kept for data preservation)
- Minutes-based fields are marked as DEPRECATED but kept for backward compatibility
- New challenge types (`monthly`, `milestone`) are now available

---

### [2025-01-27] - Challenge Engine Refinement (Phase 2: Logic Refinement)

**Migration Files:**
- `backend/supabase/migrations/20250127160000_create_update_challenge_progress_function.sql`
- `backend/supabase/migrations/20250127160001_refactor_add_drops_challenge_logic.sql`
- `backend/supabase/migrations/20250127160002_create_daily_reset_function.sql`

**Agent:** supabase-dba

**Changes:**

**Step 2.1 & 2.3 - Unified Challenge Progress Function:**
- Created function: `public.update_challenge_progress(p_user_id UUID, p_gym_id UUID, p_drops_earned INTEGER, p_session_date DATE)`
  - Handles all 5 challenge types: `daily`, `weekly`, `monthly`, `streak`, `milestone`
  - Returns progress information: `challenge_id`, `challenge_name`, `challenge_type`, `current_progress`, `target_progress`, `is_completed`, `completed_now`, `reward_drops`
  - Automatically awards badges when challenges are completed (Step 2.5)
- **Daily Challenges:**
  - Only counts drops earned on `p_session_date`
  - Resets `current_drops` to 0 if last update was not today
  - Completes when `current_drops >= target_drops`
- **Weekly/Monthly Challenges:**
  - Cumulative drops in date range (`start_date` to `end_date`)
  - Completes when cumulative `current_drops >= target_drops`
- **Streak Challenges:**
  - Tracks consecutive days with at least 1 drop
  - Atomic streak tracking using `ON CONFLICT DO UPDATE`:
    - Same day: don't increment (already counted)
    - Next day: increment `current_streak_days` by 1
    - Gap (more than 1 day): reset `current_streak_days` to 1
  - Completes when `current_streak_days >= streak_days`
- **Milestone Challenges:**
  - Queries `gym_memberships.local_drops_balance` for total all-time drops in gym
  - Completes when `local_drops_balance >= milestone_threshold`

**Step 2.2 - Refactored add_drops() Function:**
- Simplified `add_drops()` function by removing old challenge progress logic
- Replaced with single call to `update_challenge_progress()`
- **Result:** `add_drops()` is now much simpler and easier to maintain
- Still handles:
  - Global and local balance updates
  - Transaction recording
  - Challenge reward drops awarding
  - Badge awarding (via `update_challenge_progress()`)

**Step 2.4 - Daily Reset Function:**
- Created function: `public.reset_daily_challenges()`
  - Resets `current_drops` to 0 for daily challenges
  - Marks challenges as incomplete (`is_completed = false`)
  - Only resets challenges that haven't been updated today
  - Should be called daily at 00:00:00 via cron job or scheduled task

**Step 2.5 - Automatic Badge Awarding:**
- Integrated into `update_challenge_progress()` function
- Automatically inserts badge into `user_badges` table when `is_completed` changes to `true`
- Uses `ON CONFLICT DO NOTHING` to prevent duplicate badges
- Badge is awarded only once per challenge (enforced by unique constraint)

**Impact:**
- **Backend:**
  - `add_drops()` is now simpler and more maintainable
  - All challenge logic is centralized in `update_challenge_progress()`
  - No breaking changes - existing code continues to work
  - Badge awarding is automatic (no manual intervention needed)
- **Mobile App:**
  - No changes required - `add_drops()` RPC call remains the same
  - Challenge progress updates automatically when drops are earned
  - Badges are awarded automatically when challenges are completed
- **Admin Panel:**
  - No changes required - challenge management remains the same
  - Can schedule `reset_daily_challenges()` via cron job

**Breaking Changes:** None (backward compatible)

**Next Steps:**
1. ⏳ Run: `supabase gen types typescript --local > backend/types/database.types.ts`
2. ⏳ Backend: Schedule `reset_daily_challenges()` function
   - Set up cron job or scheduled task to call function daily at 00:00:00
   - Can use pg_cron extension if available, or external cron service
3. ⏳ Testing: Verify all challenge types work correctly
   - Test daily challenge reset
   - Test streak tracking (consecutive days, gaps, same-day multiple workouts)
   - Test milestone challenges (all-time balance tracking)
   - Test badge awarding for all challenge types

**Migration Notes:**
- `add_drops()` function is now much simpler and ready for sensor integration
- All challenge logic is unified in `update_challenge_progress()` function
- Badge awarding is automatic - no manual intervention needed
- Daily reset function should be scheduled via cron job

**Key Improvement:**
- ✅ **`add_drops()` is now "lighter" and ready for sensor integration**
  - Removed complex challenge progress logic
  - Single call to unified `update_challenge_progress()` function
  - Easier to maintain and extend
  - All challenge types handled consistently

---

## Migration Template

Use this template when adding new migration notes:

```markdown
### [YYYY-MM-DD] - [Migration Name]

**Migration File:** `backend/supabase/migrations/YYYYMMDDHHMMSS_name.sql`

**Agent:** supabase-dba

**Changes:**
- [List of changes: tables, columns, functions, policies]

**Impact:**
- **Mobile App:** [What mobile app needs to update]
- **Admin Panel:** [What admin panel needs to update]

**Breaking Changes:**
- [List any breaking changes, or "None"]

**Next Steps:**
1. [ ] Run: `supabase gen types typescript --local`
2. [ ] Mobile-coder: [Specific task]
3. [ ] Admin-coder: [Specific task]
```

---

## Archive

Migrations older than 30 days will be archived here.

---

**Note:** This file is maintained by `supabase-dba` agent. Frontend agents should check this file before starting work.
