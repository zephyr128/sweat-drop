# MVP Execution Plan: Loyalty, Challenges, and Leaderboards

**Created:** 2025-01-27  
**Status:** Draft  
**Target:** MVP for gym testing next week

---

## Overview

This plan outlines the step-by-step implementation of three core MVP features:
1. **Loyalty (Sweat Drops Economy)** - Automatic drops awarding on workout completion
2. **Challenges** - Active challenges display and progress tracking
3. **Leaderboards** - Rankings by period and scope

**Current State Analysis:**
- ✅ Database schema exists: `sessions`, `drops_transactions`, `challenges`, `challenge_progress`, `profiles.total_drops`, `gym_memberships.local_drops_balance`
- ✅ `end_session()` RPC function exists and calls `add_drops()` which handles drops, challenge progress, and rewards
- ✅ Mobile app workout screen calls `end_session()` when workout completes
- ✅ Mobile app home screen displays drops balance and challenges preview
- ✅ Admin panel has challenges management UI
- ⚠️ Leaderboards query tables directly (no optimized views/RPCs)
- ⚠️ Admin dashboard shows basic stats but no dedicated drops/challenges widgets

---

## Phase 1: Backend / Database (Supabase DBA)

**Workspace:** `backend/supabase/`  
**Agent Role:** Supabase DBA  
**Estimated Time:** 2-3 hours

### Step 1.1: Verify and Enhance Drops Balance Tracking

**Current State:**
- `profiles.total_drops` exists (global balance)
- `gym_memberships.local_drops_balance` exists (per-gym balance)
- `add_drops()` function updates both balances

**Tasks:**
1. **Verify `add_drops()` function signature:**
   - Check if it accepts `p_gym_id` parameter (from `20240101000003_dual_wallet_system.sql`)
   - Ensure it creates `gym_memberships` entry if missing via `get_or_create_gym_membership()`
   - Verify it updates both `profiles.total_drops` and `gym_memberships.local_drops_balance`

2. **Verify `end_session()` function:**
   - Check that it extracts `gym_id` from session record
   - Ensure it passes `gym_id` to `add_drops()` correctly
   - Test that drops are awarded to both global and local balances

3. **Create migration if needed:**
   - If `end_session()` doesn't pass `gym_id` to `add_drops()`, create migration to fix it
   - File: `migrations/YYYYMMDDHHMMSS_fix_end_session_gym_id.sql`

**Files to Check:**
- `backend/supabase/migrations/20240101000003_dual_wallet_system.sql` (add_drops function)
- `backend/supabase/migrations/20240101000001_sweatdrop_schema.sql` (end_session function)
- `apps/mobile-app/app/workout.tsx` (line 2267: calls `end_session` RPC)

**Success Criteria:**
- `end_session()` correctly awards drops to both global and local balances
- Drops transaction record created in `drops_transactions` table
- Challenge progress automatically updated (handled by `add_drops()`)

---

### Step 1.2: Verify Challenge Progress Auto-Update

**Current State:**
- `challenges` table exists with `challenge_type`, `target_drops`, `reward_drops`
- `challenge_progress` table tracks user progress per challenge
- `add_drops()` function updates `challenge_progress.current_drops` and marks completed challenges

**Tasks:**
1. **Verify `add_drops()` challenge logic:**
   - Check that it updates `challenge_progress.current_drops` for active challenges
   - Verify it marks challenges as completed when `current_drops >= target_drops`
   - Ensure it awards `reward_drops` when challenge is completed
   - Check that it only processes active challenges within date range

2. **Test challenge completion flow:**
   - Create test challenge with low `target_drops` (e.g., 10)
   - Complete workout that earns enough drops
   - Verify challenge marked as completed
   - Verify reward drops added to user balance

**Files to Check:**
- `backend/supabase/migrations/20240101000001_sweatdrop_schema.sql` (lines 397-428: add_drops challenge logic)

**Success Criteria:**
- Challenge progress updates automatically when drops are earned
- Completed challenges award reward drops
- Challenge completion triggers transaction record

---

### Step 1.3: Create Leaderboard Views/RPCs

**Current State:**
- Mobile app queries `gym_memberships.local_drops_balance` for local leaderboard
- Mobile app queries `profiles.total_drops` for global leaderboard
- No optimized views or RPCs exist for leaderboards

**Tasks:**
1. **Create RPC function for local leaderboard:**
   - Function: `get_local_leaderboard(p_gym_id UUID, p_period leaderboard_period, p_limit INTEGER DEFAULT 100)`
   - Returns: `user_id`, `username`, `drops`, `rank`
   - Logic:
     - Filter `gym_memberships` by `gym_id`
     - Order by `local_drops_balance DESC`
     - Calculate rank (ROW_NUMBER())
     - Join with `profiles` to get username
     - Apply period filter if needed (future: filter by date range)

2. **Create RPC function for global leaderboard:**
   - Function: `get_global_leaderboard(p_period leaderboard_period, p_limit INTEGER DEFAULT 100)`
   - Returns: `user_id`, `username`, `drops`, `rank`
   - Logic:
     - Query `profiles` ordered by `total_drops DESC`
     - Calculate rank (ROW_NUMBER())
     - Apply period filter if needed (future: filter by date range)

3. **Create migration file:**
   - File: `migrations/YYYYMMDDHHMMSS_leaderboard_rpc_functions.sql`
   - Include both RPC functions with proper security (SECURITY DEFINER)
   - Add comments explaining period filtering (currently returns all-time, period param reserved for future)

**Files to Create:**
- `backend/supabase/migrations/YYYYMMDDHHMMSS_leaderboard_rpc_functions.sql`

**Success Criteria:**
- RPC functions return ranked leaderboard data
- Functions are callable from mobile app and admin panel
- Performance is acceptable (indexes exist on `gym_memberships.local_drops_balance` and `profiles.total_drops`)

---

## Phase 2: Mobile App (React Native Coder)

**Workspace:** `apps/mobile-app/`  
**Agent Role:** React Native Coder  
**Estimated Time:** 3-4 hours

### Step 2.1: Enhance Drops Balance Display

**Current State:**
- Home screen (`app/home.tsx`) shows `total_drops` from profile in header wallet widget
- Wallet screen (`app/wallet.tsx`) exists but may need updates

**Tasks:**
1. **Update home screen drops display:**
   - Verify wallet widget shows `profile.total_drops` (line 372-373 in `home.tsx`)
   - Ensure it refreshes after workout completion (check `useFocusEffect` or `useEffect` dependencies)
   - Add loading state if needed

2. **Update wallet screen (if exists):**
   - Display both global (`total_drops`) and local (`local_drops_balance`) balances
   - Show breakdown: "Global: X drops" and "Gym: Y drops"
   - Fetch `gym_memberships.local_drops_balance` for active gym

**Files to Modify:**
- `apps/mobile-app/app/home.tsx` (lines 299-376: wallet widget)
- `apps/mobile-app/app/wallet.tsx` (if exists, check for updates)

**Integration Points:**
- Hook into existing `loadData()` function in `home.tsx` (line 131)
- Use `useLocalDrops()` hook if it exists (line 53 in `home.tsx`)

**Success Criteria:**
- Drops balance displays correctly on home screen
- Balance updates after workout completion
- Wallet screen shows both global and local balances

---

### Step 2.2: Enhance Active Challenges UI

**Current State:**
- Home screen shows challenges in horizontal scroll (lines 389-518 in `home.tsx`)
- Uses `useChallengeProgress()` hook (line 89)
- Challenges screen (`app/challenges.tsx`) exists

**Tasks:**
1. **Verify challenge progress bars:**
   - Check that progress bars show correct `current_minutes / required_minutes` ratio
   - Ensure progress updates after workout completion
   - Verify challenge cards show completion status

2. **Enhance challenge detail screen:**
   - If `challenge-detail.tsx` exists, verify it shows:
     - Progress bar with current/target
     - Reward drops amount
     - Completion status
   - If missing, create basic detail screen

3. **Add challenge completion notification:**
   - When workout completes and challenge is finished, show toast/alert
   - Display: "Challenge Complete! +X drops awarded"

**Files to Check/Modify:**
- `apps/mobile-app/app/home.tsx` (challenges section: lines 389-518)
- `apps/mobile-app/app/challenges.tsx` (full challenges list)
- `apps/mobile-app/app/challenge-detail.tsx` (if exists)
- `apps/mobile-app/hooks/useChallengeProgress.ts` (challenge progress hook)

**Integration Points:**
- `useChallengeProgress()` hook already used in `home.tsx` (line 89)
- Challenge progress updates automatically via `add_drops()` function (backend)
- Mobile app needs to refresh challenge data after workout

**Success Criteria:**
- Challenge progress bars display correctly
- Progress updates after workout completion
- Challenge completion is visible to user

---

### Step 2.3: Enhance Leaderboard UI

**Current State:**
- Leaderboard screen (`app/leaderboard.tsx`) exists
- Queries `gym_memberships` and `profiles` directly (lines 56-100)
- Shows local and global leaderboards

**Tasks:**
1. **Update leaderboard screen to use RPC functions:**
   - Replace direct queries with `get_local_leaderboard()` RPC call
   - Replace direct queries with `get_global_leaderboard()` RPC call
   - Add period selector (daily/weekly/monthly) - UI exists but may need backend support
   - Display user's current rank prominently

2. **Add leaderboard preview to home screen:**
   - Show top 3 users from local leaderboard
   - Add "View All" button linking to leaderboard screen
   - Display user's rank (e.g., "You're #12")

3. **Enhance leaderboard screen UI:**
   - Show rank badges (🥇 🥈 🥉) for top 3
   - Highlight current user's row
   - Add pull-to-refresh functionality

**Files to Modify:**
- `apps/mobile-app/app/leaderboard.tsx` (replace queries with RPC calls)
- `apps/mobile-app/app/home.tsx` (add leaderboard preview widget)

**Integration Points:**
- Use new RPC functions from Phase 1.3
- Hook into existing period/type state (lines 31-32 in `leaderboard.tsx`)

**Success Criteria:**
- Leaderboard displays ranked users correctly
- User's rank is shown
- Period selector works (even if backend returns all-time for now)
- Home screen shows leaderboard preview

---

## Phase 3: Admin Panel (Next.js Coder)

**Workspace:** `apps/admin-panel/`  
**Agent Role:** Next.js Coder  
**Estimated Time:** 2-3 hours

### Step 3.1: Add Drops and Challenges Dashboard Widgets

**Current State:**
- Dashboard (`app/dashboard/page.tsx`) shows basic stats:
  - Active users today
  - Total drops today
  - Redeems today

**Tasks:**
1. **Enhance drops widget:**
   - Show breakdown: "Total Drops Awarded Today: X"
   - Add chart showing drops over time (last 7 days) - use existing `chart.js` setup
   - Show top earners (users who earned most drops today)

2. **Add active challenges widget:**
   - Display count of active challenges for the gym
   - Show challenge completion rate (completed / total active)
   - List active challenges with progress summary

3. **Add leaderboard widget:**
   - Show top 3 users from local leaderboard
   - Display their drops balances
   - Link to full leaderboard management (if exists)

**Files to Modify:**
- `apps/admin-panel/app/dashboard/page.tsx` (enhance existing dashboard)
- Create component: `components/dashboards/DropsWidget.tsx` (if needed)
- Create component: `components/dashboards/ChallengesWidget.tsx` (if needed)
- Create component: `components/dashboards/LeaderboardWidget.tsx` (if needed)

**Integration Points:**
- Use existing `loadStats()` function (line 63 in `dashboard/page.tsx`)
- Use existing Supabase client setup
- Follow existing component patterns (check `components/dashboards/` directory)

**Success Criteria:**
- Dashboard shows drops, challenges, and leaderboard data
- Widgets are visually consistent with existing design
- Data refreshes correctly

---

### Step 3.2: Enhance Challenges Management Interface

**Current State:**
- Challenges management exists at `app/dashboard/gym/[id]/challenges/page.tsx`
- Uses `ChallengesManager` component

**Tasks:**
1. **Verify challenge creation flow:**
   - Check that gym admins can create daily/weekly/streak challenges
   - Verify challenge form includes: name, description, target_drops, reward_drops, dates
   - Ensure challenges are created with correct `gym_id`

2. **Add challenge analytics:**
   - Show participation count (users with `challenge_progress` entries)
   - Display completion rate (completed / total participants)
   - Show total reward drops awarded

3. **Add challenge activation/deactivation:**
   - Toggle `is_active` flag
   - Bulk activate/deactivate challenges

**Files to Check/Modify:**
- `apps/admin-panel/app/dashboard/gym/[id]/challenges/page.tsx`
- `apps/admin-panel/components/modules/ChallengesManager.tsx` (if exists)

**Integration Points:**
- Use existing Server Actions pattern (check `lib/actions/` directory)
- Follow existing form patterns (react-hook-form + zod)

**Success Criteria:**
- Gym admins can create and manage challenges
- Challenge analytics are visible
- Challenges can be activated/deactivated

---

## Execution Order Summary

**Critical Path:**
1. **Phase 1.1** → Verify drops awarding works (blocks everything)
2. **Phase 1.2** → Verify challenge progress updates (blocks Phase 2.2)
3. **Phase 1.3** → Create leaderboard RPCs (blocks Phase 2.3 and 3.1)
4. **Phase 2.1** → Enhance drops display (independent)
5. **Phase 2.2** → Enhance challenges UI (depends on 1.2)
6. **Phase 2.3** → Enhance leaderboard UI (depends on 1.3)
7. **Phase 3.1** → Add admin widgets (depends on 1.3)
8. **Phase 3.2** → Enhance challenges management (independent)

**Recommended Sequence:**
1. Complete Phase 1 (all steps) - Backend foundation
2. Complete Phase 2 (all steps) - Mobile app features
3. Complete Phase 3 (all steps) - Admin panel enhancements

---

## Testing Checklist

### Backend Testing
- [ ] Complete workout → verify drops added to `profiles.total_drops`
- [ ] Complete workout → verify drops added to `gym_memberships.local_drops_balance`
- [ ] Complete workout → verify `drops_transactions` record created
- [ ] Complete workout → verify challenge progress updated
- [ ] Complete challenge → verify reward drops awarded
- [ ] Test `get_local_leaderboard()` RPC returns correct rankings
- [ ] Test `get_global_leaderboard()` RPC returns correct rankings

### Mobile App Testing
- [ ] Home screen shows correct drops balance
- [ ] Drops balance updates after workout
- [ ] Challenge progress bars display correctly
- [ ] Challenge progress updates after workout
- [ ] Challenge completion shows notification
- [ ] Leaderboard displays ranked users
- [ ] User's rank is shown correctly
- [ ] Home screen shows leaderboard preview

### Admin Panel Testing
- [ ] Dashboard shows drops awarded today
- [ ] Dashboard shows active challenges count
- [ ] Dashboard shows top 3 leaderboard users
- [ ] Challenge creation works
- [ ] Challenge analytics display correctly
- [ ] Challenges can be activated/deactivated

---

## Notes for Implementation

### Existing Code Hooks

**Drops Awarding:**
- Mobile app calls `end_session()` RPC in `apps/mobile-app/app/workout.tsx` (line 2267)
- `end_session()` function in `backend/supabase/migrations/20240101000003_dual_wallet_system.sql` (line 237)
- `add_drops()` function handles drops, challenge progress, and rewards

**Challenge Progress:**
- `useChallengeProgress()` hook in `apps/mobile-app/hooks/useChallengeProgress.ts`
- RPC function `get_active_challenges_for_user()` returns challenges with progress
- Challenge progress updates automatically via `add_drops()` function

**Leaderboards:**
- Current implementation queries tables directly
- Need to migrate to RPC functions for better performance and consistency

### Key Files Reference

**Backend:**
- `backend/supabase/migrations/20240101000001_sweatdrop_schema.sql` - Core schema and functions
- `backend/supabase/migrations/20240101000003_dual_wallet_system.sql` - Dual wallet system
- `backend/supabase/migrations/20240101000007_cardio_challenge_system.sql` - Challenge system

**Mobile App:**
- `apps/mobile-app/app/home.tsx` - Home screen with drops, challenges, leaderboard preview
- `apps/mobile-app/app/workout.tsx` - Workout screen that calls `end_session()`
- `apps/mobile-app/app/challenges.tsx` - Challenges list screen
- `apps/mobile-app/app/leaderboard.tsx` - Leaderboard screen
- `apps/mobile-app/hooks/useChallengeProgress.ts` - Challenge progress hook

**Admin Panel:**
- `apps/admin-panel/app/dashboard/page.tsx` - Main dashboard
- `apps/admin-panel/app/dashboard/gym/[id]/challenges/page.tsx` - Challenges management

---

## Constraints & MVP Scope

**Keep It Lean:**
- Focus on core functionality only
- Skip advanced analytics (basic counts are enough)
- Skip period filtering for leaderboards (all-time is fine for MVP)
- Skip challenge templates (manual creation is fine)
- Skip bulk operations (one-by-one is acceptable)

**MVP Success Criteria:**
- ✅ Users earn drops automatically when workout completes
- ✅ Users can see their drops balance
- ✅ Users can see active challenges and progress
- ✅ Users can see leaderboard rankings
- ✅ Gym admins can create challenges
- ✅ Gym admins can view drops and challenges stats

---

**Last Updated:** 2025-01-27  
**Next Review:** After Phase 1 completion
