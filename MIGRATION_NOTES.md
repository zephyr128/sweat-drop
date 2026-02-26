# Migration Notes

This file tracks database schema changes and their impact on frontend applications.

**Last Updated:** 2025-01-27 (Leaderboard RPC + SmartCoach Feature Flag)

---

## How to Use This File

1. **supabase-dba:** Add entry after creating migration
2. **mobile-coder:** Read before starting mobile work
3. **admin-coder:** Read before starting admin work
4. **architect:** Read when planning new features

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
