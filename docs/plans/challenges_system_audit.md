# SWEATDROP — Challenges System: Full Audit

> **Created:** 2026-03-04 by System Architect  
> **Scope:** Full-stack challenges implementation (Backend + Mobile App + Admin Panel)  
> **Status:** AUDIT ONLY — No changes proposed

---

## 1. HIGH-LEVEL OVERVIEW

The Challenges system is a **gym-scoped gamification engine** that lets gym owners create time-bound or milestone-based challenges for their members. Members earn progress toward challenges automatically when they complete workout sessions and earn drops. Upon challenge completion, members receive reward drops and badges.

### Flow Summary

```
Gym Owner (Admin Panel)
  └─ Creates challenge (name, type, target, reward, dates)
      └─ Stored in: gym_challenges table

Member (Mobile App)
  └─ Completes workout session
      └─ award_drops() is called
          └─ update_challenge_progress() is called internally
              └─ Checks all active challenges for the gym
              └─ Upserts challenge_progress row
              └─ If target met → marks completed, awards badge + reward drops
              └─ If tiered → checks tier thresholds, awards per-tier drops

Member views progress
  └─ home.tsx: Horizontal scroll of active challenges with progress bars
  └─ challenges.tsx: Full list of active challenges for home gym
  └─ challenge-detail.tsx: Individual challenge detail + "How to participate"
  └─ trophy-room.tsx: All badges earned (via ProgressWidget)
```

---

## 2. DATABASE LAYER (Backend)

### 2.1 Tables

#### `gym_challenges` (was `challenges`, renamed in migration `20250128000002`)

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | Auto-generated |
| `gym_id` | UUID FK → gyms | Which gym owns this challenge |
| `challenge_type` | challenge_type ENUM | `'daily'`, `'weekly'`, `'streak'` (original enum), extended via TEXT-based `challenge_type` column in practice to include `'monthly'`, `'milestone'` |
| `name` | TEXT | Display name |
| `description` | TEXT | Optional description |
| `target_drops` | INTEGER | Target for daily/weekly/monthly challenges |
| `reward_drops` | INTEGER | Drops awarded on completion |
| `start_date` | DATE | Challenge start |
| `end_date` | DATE | Challenge end |
| `is_active` | BOOLEAN | Active flag |
| `milestone_threshold` | INTEGER | Target for milestone challenges (added later) |
| `streak_days` | INTEGER | Target for streak challenges (added later) |
| `badge_image_url` | TEXT | Optional badge image |
| `criteria` | JSONB NOT NULL | Flexible criteria (migration `20250128000003`). Duplicates type/target info for future flexibility |
| `scoring_model` | TEXT | `'total_drops'`, `'distance_km'`, `'days_visited'`, `'streak_days'` (migration `20260302000007`) |
| `tiers` | JSONB | Optional Bronze/Silver/Gold tiers: `[{label, target, drops}]` |
| `sponsor_name` | TEXT | Optional sponsor |
| `sponsor_logo` | TEXT | Optional sponsor logo URL |
| `prize_description` | TEXT | Free-text prize description |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**Key Observation:** The table has significant **schema duplication** — `challenge_type` + `target_drops` + `milestone_threshold` + `streak_days` overlap with the `criteria` JSONB column. Both are maintained for backward compatibility. The `scoring_model` further adds another axis of tracking beyond `challenge_type`.

#### `challenge_progress`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `user_id` | UUID FK → profiles | |
| `challenge_id` | UUID FK → gym_challenges | |
| `gym_id` | UUID | Added in later migration |
| `current_drops` | INTEGER | Progress for `total_drops` scoring |
| `current_value` | NUMERIC | Generic progress (for distance/days/streak scoring) |
| `is_completed` | BOOLEAN | |
| `completed_at` | TIMESTAMPTZ | |
| `current_streak_days` | INTEGER | Streak-specific progress |
| `last_activity_date` | DATE | Used by daily reset logic |
| `tier_achieved` | TEXT | `'bronze'`, `'silver'`, `'gold'` or NULL |
| `drops_awarded` | BOOLEAN | Prevents double-awarding |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**Unique constraint:** `(user_id, challenge_id)` — one progress row per user per challenge.

#### `user_badges`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `user_id` | UUID FK → profiles | |
| `challenge_id` | UUID FK → challenges (original name) | Now → gym_challenges (FK updated by PostgreSQL rename) |
| `gym_challenge_id` | UUID | Added in polymorphic migration `20250128000005` |
| `global_achievement_id` | UUID | For global achievements (not challenges) |
| `earned_at` | TIMESTAMPTZ | |
| `created_at` | TIMESTAMPTZ | |

**Note:** The badges table was originally linked to `challenge_id` (old `challenges` table). After the rename to `gym_challenges`, a polymorphic `gym_challenge_id` column was added. The `update_challenge_progress()` function uses `gym_challenge_id` for inserts.

---

### 2.2 Key Database Functions

#### `award_drops(p_session_id UUID)` — The Core Engine
**File:** `20260302000008_phase1_core_award_drops.sql`

This is the **single entry point** for drops calculation after a workout session. It:
1. Locks the session row (prevents concurrent awards)
2. Is **idempotent** — if drops already awarded, returns existing values
3. Calculates drops: `calories × 2.5` (or fallback: `(duration/60) × 7 × 2.5`)
4. Applies streak multiplier (3-day=1.2×, 7-day=1.5×, 14-day=1.8×, 30-day=2.0×)
5. Updates `profiles` (total_drops, available_drops, weekly_drops, monthly_drops, streak)
6. Updates `gym_memberships` (local_drops_balance)
7. Creates `drops_transactions` entry
8. **Calls `update_challenge_progress()`** for all active challenges in that gym
9. Calls `evaluate_badges()` for global achievements

#### `update_challenge_progress(p_user_id, p_gym_id, p_drops, p_session_id)` — Challenge Tracker
**File:** `20260304100012_fix_challenge_completion_logic.sql` (latest version)

For **every active challenge** in the user's gym:
1. **Upserts** a `challenge_progress` row (creates if not exists)
2. Calculates new value based on `scoring_model`:
   - `total_drops`: Adds `p_drops` to both `current_value` and `current_drops`
   - `distance_km`: Reads `sessions.raw_metrics.total_distance` and converts to km
   - `days_visited`: Counts distinct days with sessions in challenge date range
   - `streak_days`: Reads `profiles.streak_days`
3. **Completion check** (non-tiered challenges):
   - Uses `current_drops` for `total_drops` model, `current_value` for others
   - If met: marks `is_completed = true`, creates `user_badges` entry, awards `reward_drops`
4. **Tier check** (tiered challenges):
   - Iterates tiers (Bronze → Silver → Gold)
   - Awards per-tier drops when thresholds are crossed
   - Marks `drops_awarded = true` when Gold is reached

**Bug fix history:** Migration `20260304100012` fixed a bug where the completion check used `current_value` for `total_drops` challenges — this caused false completions because `current_value` could be ≠ `current_drops`. Migration `20260304100013` cleaned up incorrectly completed challenges.

#### `reset_daily_challenges()` — Daily Reset
**File:** `20250127160002_create_daily_reset_function.sql`

Resets `current_drops`, `is_completed`, and `completed_at` for daily challenges where `last_activity_date < CURRENT_DATE`. Meant to run at midnight via cron or Edge Function.

#### `add_drops()` — Legacy Function
**File:** `20240101000001_sweatdrop_schema.sql`

The **original** drops function. Still exists for backward compatibility. It:
- Updates `profiles.total_drops`
- Updates `challenge_progress.current_drops` for active challenges
- Marks completed challenges
- Awards challenge rewards via `drops_transactions`

**Status:** Superseded by `award_drops()` but not removed.

---

### 2.3 RLS Policies

**`gym_challenges` table:**
- `"Anyone can view active challenges"` — SELECT WHERE `is_active = true` (from initial schema)
- `"Gym staff can manage challenges"` — ALL for staff of the gym (from initial schema)
- `"superadmin_all_challenges"` — ALL for superadmins (from RBAC migration)
- `"gym_admin_own_challenges"` — ALL for gym admins of matching gym (from RBAC migration)

**`challenge_progress` table:**
- `"Users can view own challenge progress"` — SELECT WHERE `auth.uid() = user_id`
- `"Users can insert own challenge progress"` — INSERT WHERE `auth.uid() = user_id`
- `"Users can update own challenge progress"` — UPDATE WHERE `auth.uid() = user_id`

**Note:** The `update_challenge_progress()` function runs as `SECURITY DEFINER`, so it bypasses RLS when inserting/updating `challenge_progress` rows. The client-side RLS only matters for read queries.

---

### 2.4 Cron Jobs & Edge Functions

#### Edge Function: `reset-challenges`
**File:** `backend/supabase/functions/reset-challenges/index.ts`

A Deno Edge Function that calls `reset_daily_challenges()` or `reset_weekly_challenges()` RPCs via the Supabase service role client. Accepts `?type=daily|weekly` query parameter.

**Status:** This is a **fallback mechanism** for environments where `pg_cron` is not available.

#### pg_cron (if available)
**File:** `20260302000011_phase2_cron_jobs.sql`

Schedules:
- Weekly drops reset (Sunday 23:00 UTC)
- Monthly drops reset (last day of month 23:00 UTC)
- Newcomer status update (daily 03:00 UTC)
- Drop expiry (daily 04:00 UTC)
- Abandoned session cleanup (every 5 minutes)

**Note:** There's no pg_cron job for `reset_daily_challenges()` — it only exists as an Edge Function or could be manually scheduled. This is a **gap**: daily challenge resets may not happen automatically unless the Edge Function is triggered externally.

---

### 2.5 Migration Timeline

| # | Migration File | What it does |
|---|---|---|
| 1 | `20240101000001_sweatdrop_schema.sql` | Creates `challenges` and `challenge_progress` tables with initial enum (`daily`, `weekly`, `streak`) |
| 2 | `20240101000001` | Creates `add_drops()` function with challenge progress logic |
| 3 | `20240101000004_admin_rbac_system.sql` | Adds RBAC policies for challenges (`superadmin_all_challenges`, `gym_admin_own_challenges`) |
| 4 | `20250127140001` | Creates `user_badges` table (linked to `challenges`) |
| 5 | `20250127140002` | Adds badge awarding to `add_drops()` |
| 6 | `20250127160000` | Creates `update_challenge_progress()` function |
| 7 | `20250127160002` | Creates `reset_daily_challenges()` function |
| 8 | `20250128000002` | **Renames** `challenges` → `gym_challenges` |
| 9 | `20250128000003` | Adds `criteria` JSONB column to `gym_challenges` |
| 10 | `20250128000004` | Creates `user_progress` table (for global achievements) |
| 11 | `20250128000005` | Makes `user_badges` polymorphic (`gym_challenge_id`, `global_achievement_id`) |
| 12 | `20260302000007` | Extends `gym_challenges` with `scoring_model`, `tiers`, sponsor fields; extends `challenge_progress` with `current_value`, `tier_achieved`, `drops_awarded` |
| 13 | `20260302000008` | Creates `award_drops()` — the new canonical drops engine. Includes `update_challenge_progress()` and `evaluate_badges()` |
| 14 | `20260304100012` | **Bug fix:** `update_challenge_progress()` now uses `current_drops` (not `current_value`) for `total_drops` completion check |
| 15 | `20260304100013` | **Data fix:** Resets incorrectly completed challenges, removes false badges, creates `incorrect_challenge_rewards` view for admin review |

---

## 3. MOBILE APP LAYER

### 3.1 Screens

#### `app/home.tsx` — Home Screen Challenges Section
- Uses `useChallengeProgress(activeGymId, null)` to load all challenges for the active gym
- Displays up to 5 challenges in a **horizontal ScrollView** with snap behavior
- Each card shows: type label, name, progress bar, current/target drops, reward info, completed badge
- Links to `challenge-detail` screen on tap
- Has a "View All" link to `challenges.tsx`
- Shows skeleton loading state while challenges load
- **Locked overlay** when gym is not unlocked (branding not loaded)

#### `app/challenges.tsx` — Full Challenges List
- Fetches user's `home_gym_id` from profiles, then loads all active challenges for that gym
- Displays challenges as full-width cards with progress bars
- Uses `useFocusEffect` to refresh on screen focus
- Shows empty state with "No active challenges" message
- Each card links to `challenge-detail`
- **i18n:** Uses `challenges` translation namespace (SR/EN)
- **Bug:** `getChallengeTypeLabel` returns hardcoded English strings instead of using translations

#### `app/challenge-detail.tsx` — Challenge Detail Screen
- Receives `challengeId` and `gymId` via route params
- Fetches challenge data from `gym_challenges` table directly
- Fetches progress from `challenge_progress` table
- Also uses `useChallengeProgress` hook for cross-validation
- Shows: challenge type badge with icon, name, description, info pills (target, reward, time remaining), progress bar, progress numbers, completed badge with reward, "How to participate" instructions
- Uses `BlurView` glassmorphism and `react-native-reanimated` staggered FadeInDown animations
- Supports gym branding colors via `useBranding()`

### 3.2 Hooks

#### `hooks/useChallengeProgress.ts`
**The primary hook for loading challenge data on mobile.**

- Accepts `gymId` and `machineType` (machineType is unused in current queries)
- Queries `gym_challenges` for active challenges in date range
- Queries `challenge_progress` for the current user
- Merges data into `ChallengeProgress[]` array
- Handles all challenge types: calculates correct target/current based on type
- For milestone challenges: fetches `gym_memberships.local_drops_balance` as the true progress value
- `updateProgress()` is **deprecated** — progress now happens server-side via `award_drops()`. The function just reloads data.
- Returns: `challenges`, `loading`, `error`, `refresh`, `updateProgress`

#### `hooks/useAllBadges.ts`
- Loads both `global_achievements` and `gym_challenges` (all, not just active/in-date)
- Used by `ProgressWidget` to find the "next closest badge"
- Fetches gym challenges with joined gym name

#### `hooks/useUserBadges.ts`
- Calls `get_user_badges` RPC to get user's earned badges
- Sets up **real-time subscription** on `user_badges` table for live badge notifications
- Returns `UserBadge[]` with badge_type (`global` | `gym`)

#### `hooks/useBadgeNotifications.ts`
- Uses `useUserBadges` real-time subscription
- Triggers confetti animation on home screen when new badge is earned

### 3.3 Components

#### `components/ActiveChallengesOverlay.tsx`
- Full-screen overlay showing active (non-completed) challenges during a workout session
- Shows progress bars, remaining drops/days to badge, reward info
- Uses gym branding colors
- **Note:** Uses `branding.primaryDark` for progress bar gradient (may not exist in all themes)

#### `components/ProgressWidget.tsx`
- Home screen widget showing the "next closest badge" (unearned badge with highest progress)
- Combines global achievements and gym challenges into a unified list
- Animated progress bar using `react-native-reanimated`
- Links to trophy room on tap
- Returns `null` if all badges are earned

### 3.4 Localization

**Namespaces:** `challenges` (EN + SR)

Covers: titles, challenge type labels, machine types, progress text, time remaining, completion messages, how-to-participate steps.

**Gap:** `challenges.tsx` screen has hardcoded English in `getChallengeTypeLabel()` and `getTimeRemaining()` — not using the i18n translations that exist.

---

## 4. ADMIN PANEL LAYER

### 4.1 Challenges Manager Page
**File:** `apps/admin-panel/app/dashboard/gym/[id]/challenges/page.tsx`

Server Component page that:
- Fetches all challenges for the gym (active and inactive)
- Passes data to the `ChallengesManager` client component

### 4.2 ChallengesManager Component
**File:** `apps/admin-panel/components/modules/ChallengesManager.tsx`

A comprehensive CRUD interface (~1170 lines) with:

**Create/Edit Form:**
- Challenge type selector (daily, weekly, monthly, streak, milestone)
- Name, description fields
- Conditional target fields (targetDrops / milestoneThreshold / streakDays) based on type
- Reward drops amount
- Badge image upload (via drag-and-drop using `react-dropzone`)
- Start/end date pickers
- **Enhanced fields:** scoring model selector, tier editor (Bronze/Silver/Gold), sponsor fields, prize description

**List View:**
- Shows all challenges grouped by active/inactive
- Challenge cards with status indicators, type badge, dates, target/reward info
- Actions: Toggle active/inactive, Edit, Delete, Close (end early), View progress

**Progress View:**
- `getChallengeDetailedProgress()` shows participant list with progress values
- Completion statistics (total participants, completed count, completion %, avg progress)
- Sorted leaderboard view

### 4.3 Server Actions
**File:** `apps/admin-panel/lib/actions/challenge-actions.ts`

| Action | Description |
|--------|-------------|
| `createChallenge(input)` | Validates with Zod, computes dates, builds `criteria` JSONB, inserts into `gym_challenges` |
| `updateChallenge(id, input)` | Same validation/computation, updates existing challenge |
| `deleteChallenge(id, gymId)` | Hard deletes the challenge |
| `toggleChallengeStatus(id, gymId, isActive)` | Toggles `is_active` flag |
| `closeChallenge(id, gymId)` | Sets `is_active = false` and `end_date = today` |
| `getChallengeDetailedProgress(id, gymId)` | Returns participants with progress, completion stats |
| `getChallengeCompletionStats(id, gymId)` | Calls `get_challenge_completion_stats` RPC |

All actions use `getAdminClient()` (service role client), revalidate the challenges page path after mutations.

---

## 5. DATA FLOW DIAGRAM

```
                          ADMIN PANEL                              MOBILE APP
                              │                                        │
                    ┌──────────┴──────────┐                           │
                    │ ChallengesManager   │                           │
                    │  Create/Edit/Delete │                           │
                    └──────────┬──────────┘                           │
                               │                                      │
                    ┌──────────▼──────────┐                           │
                    │  challenge-actions   │                           │
                    │  (Server Actions)    │                           │
                    └──────────┬──────────┘                           │
                               │ service_role                         │
              ═════════════════╪══════════════════════════════════════╪═══════
                               │           SUPABASE                   │
                    ┌──────────▼──────────┐                           │
                    │   gym_challenges    │◄───── SELECT (RLS) ───────┤
                    │   (table)           │                           │
                    └──────────┬──────────┘             ┌─────────────┤
                               │                        │  useChallengeProgress
                               │                        │  useAllBadges
                    ┌──────────▼──────────┐             │
                    │ challenge_progress  │◄── SELECT ──┤
                    │   (table)           │             │
                    └──────────┬──────────┘             │
                               │                        │
                    ┌──────────┴──────────┐             │
                    │   award_drops()     │◄── RPC ─────┤ (after workout)
                    │                     │             │
                    │  → update_challenge │             │
                    │    _progress()      │             │
                    │                     │             │
                    │  → IF completed:    │             │
                    │    insert badge     │────────────►│ real-time subscription
                    │    award drops      │             │ (useUserBadges)
                    └─────────────────────┘             │
                                                        │
                               ┌────────────────────────┤
                               │                        │
                    ┌──────────▼──────────┐  ┌──────────▼──────────┐
                    │   home.tsx          │  │  challenges.tsx     │
                    │   (challenge cards) │  │  (full list)        │
                    └─────────────────────┘  └─────────────────────┘
```

---

## 6. KNOWN ISSUES & GAPS

### 🔴 Critical

| # | Issue | Details |
|---|-------|---------|
| C1 | **Daily reset may not run** | `reset_daily_challenges()` has no pg_cron schedule. The Edge Function exists but needs an external scheduler (e.g., Supabase cron webhook) to trigger it. If not triggered, daily challenges accumulate progress across days. |
| C2 | **`reset_weekly_challenges()` function doesn't exist** | The Edge Function calls `supabase.rpc('reset_weekly_challenges')`, but no such function was found in any migration. This will fail at runtime. |
| C3 | **Stale `add_drops()` function** | The legacy `add_drops()` still updates `challenge_progress` using the OLD `challenges` table name reference. If any code path still calls `add_drops()`, it may fail or be a no-op against the renamed `gym_challenges` table. |

### 🟡 Moderate

| # | Issue | Details |
|---|-------|---------|
| M1 | **Schema duplication** | `challenge_type` + `target_drops` + `milestone_threshold` + `streak_days` + `criteria` JSONB + `scoring_model` — the same concept is stored in 4+ different ways. This makes it confusing which field is the "source of truth." |
| M2 | **`challenges.tsx` hardcoded English** | `getChallengeTypeLabel()` and `getTimeRemaining()` return English strings despite translation keys existing in the `challenges` namespace. |
| M3 | **Challenge type enum mismatch** | The original `challenge_type` ENUM only has `('daily', 'weekly', 'streak')`. But the app creates `'monthly'` and `'milestone'` types. This works because later migrations cast to TEXT, but it's technically inconsistent. |
| M4 | **Double data fetch in challenge-detail** | `challenge-detail.tsx` fetches from `gym_challenges` directly AND via `useChallengeProgress` hook, then merges results. This causes 3 separate queries for one screen. |
| M5 | **`ActiveChallengesOverlay` uses `branding.primaryDark`** | This property may not exist in all branding configs, causing potential style issues. |
| M6 | **No pagination for challenges** | Both mobile screens and admin panel load ALL challenges. Not an issue now but could be with many challenges. |
| M7 | **`incorrect_challenge_rewards` view** | Created by migration `20260304100013` for admin review of falsely-awarded drops, but there's **no admin UI** to view it. |

### 🟢 Minor / Technical Debt

| # | Issue | Details |
|---|-------|---------|
| L1 | **`machineType` param unused** | `useChallengeProgress` accepts `machineType` but never uses it in the query. |
| L2 | **Multiple old migration files for the same function** | `update_challenge_progress` has been rewritten in at least 5 migrations. Only the latest (`20260304100012`) matters. |
| L3 | **`criteria` JSONB is required but frontend ignores it** | Admin actions compute `criteria`, but the mobile app reads `challenge_type`, `target_drops`, etc. — never `criteria`. |
| L4 | **Badge image not displayed** | `gym_challenges.badge_image_url` exists and can be uploaded via admin, but mobile challenge screens show icon-based type indicators, not the uploaded badge image. |

---

## 7. FEATURE COMPLETENESS MATRIX

| Feature | Backend | Admin Panel | Mobile App | Status |
|---------|---------|-------------|------------|--------|
| Create challenge | ✅ `gym_challenges` insert | ✅ ChallengesManager form | N/A | **Working** |
| Edit challenge | ✅ update | ✅ ChallengesManager edit mode | N/A | **Working** |
| Delete challenge | ✅ delete | ✅ Delete button | N/A | **Working** |
| Toggle active/inactive | ✅ update `is_active` | ✅ Toggle button | N/A | **Working** |
| Close challenge early | ✅ set `is_active=false` + `end_date=today` | ✅ Close button | N/A | **Working** |
| View challenge list | ✅ SELECT with RLS | ✅ Challenge cards | ✅ `challenges.tsx` | **Working** |
| View challenge detail | ✅ SELECT | ❌ No detail page | ✅ `challenge-detail.tsx` | **Partial** |
| Track progress automatically | ✅ `award_drops()` → `update_challenge_progress()` | N/A | ✅ Reads `challenge_progress` | **Working** |
| Award completion drops | ✅ Handled in `update_challenge_progress()` | N/A | ✅ Shows "Completed!" badge | **Working** |
| Award badges on completion | ✅ Inserts into `user_badges` | N/A | ✅ Real-time notification via `useUserBadges` | **Working** |
| Tiered challenges (Bronze/Silver/Gold) | ✅ Tier logic in `update_challenge_progress()` | ✅ Tier editor in form | ❌ No tier display on mobile | **Backend + Admin only** |
| Scoring models (distance, days_visited) | ✅ Supported in function | ✅ Dropdown in form | ❌ Mobile always shows `current_drops` | **Backend + Admin only** |
| Sponsor fields | ✅ Columns exist | ✅ Form fields | ❌ Not displayed in mobile | **Backend + Admin only** |
| Badge image upload | ✅ `badge_image_url` column | ✅ Dropzone upload | ❌ Not shown (icon used instead) | **Backend + Admin only** |
| Daily challenge reset | ✅ `reset_daily_challenges()` function | N/A | N/A | **🔴 Not scheduled** |
| Weekly challenge reset | ❌ Function missing | N/A | N/A | **🔴 Broken** |
| Challenge completion stats | ✅ `get_challenge_completion_stats` RPC | ✅ Progress view | N/A | **Working** |
| Challenge progress for admin | ✅ via query | ✅ `getChallengeDetailedProgress` | N/A | **Working** |
| Confetti on badge earned | N/A | N/A | ✅ `useBadgeNotifications` + `ConfettiEffect` | **Working** |
| Home screen challenge widget | N/A | N/A | ✅ Horizontal scroll in `home.tsx` | **Working** |
| ProgressWidget (next badge) | N/A | N/A | ✅ `ProgressWidget.tsx` | **Working** |

---

## 8. FILE INVENTORY

### Backend (`backend/supabase/`)

| File | Purpose |
|------|---------|
| `migrations/20240101000001_sweatdrop_schema.sql` | Original `challenges` + `challenge_progress` tables, `add_drops()` function |
| `migrations/20240101000004_admin_rbac_system.sql` | RBAC policies for challenges |
| `migrations/20250127140001_create_user_badges_table.sql` | `user_badges` table |
| `migrations/20250127160000_create_update_challenge_progress_function.sql` | Original `update_challenge_progress()` |
| `migrations/20250127160002_create_daily_reset_function.sql` | `reset_daily_challenges()` |
| `migrations/20250128000002_rename_challenges_to_gym_challenges.sql` | Renames `challenges` → `gym_challenges` |
| `migrations/20250128000003_add_criteria_to_gym_challenges.sql` | Adds `criteria` JSONB |
| `migrations/20250128000005_update_user_badges_polymorphic.sql` | Adds `gym_challenge_id` to `user_badges` |
| `migrations/20260302000007_extend_challenges_schema.sql` | Adds scoring_model, tiers, sponsor fields |
| `migrations/20260302000008_phase1_core_award_drops.sql` | `award_drops()`, new `update_challenge_progress()`, `evaluate_badges()` |
| `migrations/20260304100012_fix_challenge_completion_logic.sql` | Bug fix for completion check |
| `migrations/20260304100013_fix_incorrect_challenge_completions.sql` | Data cleanup for false completions |
| `functions/reset-challenges/index.ts` | Edge Function for daily/weekly reset |

### Mobile App (`apps/mobile-app/`)

| File | Purpose |
|------|---------|
| `app/home.tsx` | Challenge cards in horizontal scroll |
| `app/challenges.tsx` | Full challenges list screen |
| `app/challenge-detail.tsx` | Single challenge detail screen |
| `hooks/useChallengeProgress.ts` | Primary hook for loading challenge data + progress |
| `hooks/useAllBadges.ts` | Loads all achievements and challenges for badge tracking |
| `hooks/useUserBadges.ts` | Loads earned badges with real-time subscription |
| `hooks/useBadgeNotifications.ts` | Confetti trigger on new badge |
| `hooks/useUserProgress.ts` | User progress for badge tracking |
| `components/ActiveChallengesOverlay.tsx` | In-workout challenge overlay |
| `components/ProgressWidget.tsx` | Home widget — "next closest badge" |
| `locales/en/challenges.json` | English translations |
| `locales/sr/challenges.json` | Serbian translations |

### Admin Panel (`apps/admin-panel/`)

| File | Purpose |
|------|---------|
| `app/dashboard/gym/[id]/challenges/page.tsx` | Challenges management page (Server Component) |
| `components/modules/ChallengesManager.tsx` | Full CRUD UI (~1170 lines) |
| `lib/actions/challenge-actions.ts` | Server Actions (create, update, delete, toggle, close, stats) |

---

## 9. SUMMARY

The Challenges system is **functionally working for the core use case**: gym owners create challenges, members earn progress automatically through `award_drops()`, and completion triggers badges + reward drops.

**Strongest areas:**
- The `award_drops()` → `update_challenge_progress()` pipeline is robust with proper row locking, idempotency, and multi-model scoring
- Admin CRUD is comprehensive with good validation
- Real-time badge notifications work well
- Mobile UI is polished (glassmorphism, animations, branding support)

**Weakest areas:**
- Reset scheduling (daily/weekly) — the critical lifecycle functions are either unscheduled or missing
- Schema complexity from gradual migrations — 4+ ways to express the same challenge target
- Feature parity gap — tiers, scoring models, sponsors, badge images are backend-ready but invisible on mobile
- Hardcoded English strings in an otherwise i18n-ready mobile app
