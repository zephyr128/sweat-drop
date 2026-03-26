# Migration Notes

This file tracks database schema changes and their impact on frontend applications.

**Last Updated:** 2026-03-03 (Phase 3: Full System Audit + Sweat Arenas Design)

---

## How to Use This File

1. **supabase-dba:** Add entry after creating migration
2. **mobile-coder:** Read before starting mobile work
3. **admin-coder:** Read before starting admin work
4. **architect:** Read when planning new features

---

## Recent Migrations

### [2026-03-25] - Reward Band Enforcement Policy (Soft Default, Optional Hard)

**Migration File:** `backend/supabase/migrations/20260325000019_reward_band_enforcement_policy.sql`

**Agent:** supabase-dba

**Changes:**
- Added `reward_band_enforcement_mode TEXT NOT NULL DEFAULT 'warn'` to `tokenomics_config`
  - Values: `warn` (allow redemption, log event) or `enforce` (block redemption)
  - CHECK constraint: `chk_reward_band_enforcement_mode`
- Added `reward_band_ignore_until TIMESTAMPTZ NULL` to `tokenomics_config`
  - Temporary override: if set and in the future, skips band check entirely
- Updated `claim_reward(p_user_id, p_reward_id, p_gym_id)`:
  - **Hard safety rails** (always active): block zero/negative/null `price_drops`
  - **Band compliance** now respects `reward_band_enforcement_mode`:
    - `warn`: out-of-band reward is redeemable; logs `reward_out_of_band_redeemed` fraud event with full metadata
    - `enforce`: out-of-band reward is blocked with business-safe message `"This reward is temporarily unavailable."`
  - Function signature unchanged (backward compatible)

**Validation Results:**
1. **Warn mode, out-of-band (coffee price=50, band 180–220):** success=true, fraud event logged → PASS
2. **Enforce mode, out-of-band:** success=false, message="This reward is temporarily unavailable." → PASS
3. **Hard safety, zero price, warn mode:** success=false, message="Invalid reward pricing" → PASS
4. **Hard safety, zero price, enforce mode:** success=false, message="Invalid reward pricing" → PASS

**Fraud Event Metadata (warn mode):**
```json
{
  "reward_id": "...",
  "reward_name": "...",
  "reward_type": "coffee",
  "price_drops": 50,
  "band_min": 180,
  "band_max": 220,
  "enforcement_mode": "warn",
  "price_calc_mode": "manual_drops",
  "discount_percent": 0
}
```

**Impact:**
- **Mobile App:** Default behavior changes from hard block to soft allow. Users can now redeem out-of-band rewards unless gym owner enables `enforce` mode. No signature changes needed.
- **Admin Panel:** New toggle in economy settings: `reward_band_enforcement_mode` (warn/enforce). Optional `reward_band_ignore_until` for temporary overrides.

**Breaking Changes:** None. Default mode `warn` is more permissive than previous hard block. Existing `claim_reward` signature unchanged.

**Rollback Notes:**
1. Revert `claim_reward()` to previous definition (restore hard block behavior).
2. Drop columns: `reward_band_enforcement_mode`, `reward_band_ignore_until` from `tokenomics_config`.

---

### [2026-03-25] - Leaderboard Earned Score Fix + 90-Day Expiry Hardening + User Transparency

**Migration File:** `backend/supabase/migrations/20260325000018_fix_leaderboard_earned_score_and_expiry_transparency.sql`

**Agent:** supabase-dba

**Changes:**

**1. Leaderboard Score Semantics Fix:**
- Fixed `get_leaderboard()` gym `all_time` score source:
  - **Before:** used `gym_memberships.local_drops_balance` (wallet balance — decreases on spend/expiry)
  - **After:** uses earned-only score = `SUM(drops_transactions.amount)` where `amount > 0` and `transaction_type IN ('session','checkin','workout','challenge')`
- Gym `weekly`/`monthly` unchanged (already uses sessions + checkins earned data)
- Global scope unchanged (uses `profiles.total_drops` / `weekly_drops` / `monthly_drops`)
- Added helper: `get_user_earned_drops_gym(p_user_id UUID, p_gym_id UUID, p_period TEXT DEFAULT 'all_time')` — returns earned-only score

**2. 90-Day Expiry Contract Hardening:**
- Backfilled `expires_at = created_at + 90 days` for all positive `checkin` and `workout` transactions that were missing it
- Refactored `expire_stale_drops()`:
  - Now covers `session`, `checkin`, `workout` types (was only `session`)
  - Deducts from both `profiles.available_drops` AND `gym_memberships.local_drops_balance`
  - Creates `expiry_deduction` audit trail transactions with `reference_id` pointing to original mint tx
  - Each expiry deduction includes descriptive text with source type and original description

**3. User Transparency RPCs:**
- `get_user_expiring_drops(p_gym_id UUID DEFAULT NULL)`:
  - Returns: `expiring_in_7d`, `expiring_in_30d`, `next_expiry_date`
  - Auth: `auth.uid()` enforced, user-scoped only
  - Optional gym filter (NULL = all gyms)
- `get_user_drops_ledger_summary(p_gym_id UUID DEFAULT NULL)`:
  - Returns: `wallet_balance`, `earned_score_weekly`, `earned_score_monthly`, `earned_score_all_time`
  - Auth: `auth.uid()` enforced, user-scoped only
  - Optional gym filter (NULL = global)

**Validation Results:**
1. **Leaderboard fix:** User earned 2279, spent 1900, wallet=800, leaderboard score=2279 → PASS
2. **Expiry backfill:** All session/checkin/workout positive tx now have `expires_at`, 0 missing → PASS
3. **RPCs:** All 3 new functions created with correct signatures → PASS

**Impact:**
- **Mobile App:**
  - Leaderboard gym `all_time` now reflects earned score, not spendable wallet. No RPC signature change needed.
  - New RPCs available: `get_user_expiring_drops()` for expiry card, `get_user_drops_ledger_summary()` for wallet/earned split.
  - Add UX: "Leaderboard ranks by earned drops, not current wallet balance."
  - Add expiry card: "X drops expire in 7/30 days, next expiry: DATE"
- **Admin Panel:**
  - Same leaderboard semantics change (no action required unless displaying all_time gym scores separately).
  - New KPI opportunity: upcoming expiry pressure via `get_user_expiring_drops()`.

**Breaking Changes:** None (function signatures unchanged, new RPCs added).

**Rollback Notes:**
1. Revert `get_leaderboard()` to use `gm.local_drops_balance` for gym all_time.
2. Revert `expire_stale_drops()` to Phase 3.0 version (session-only, no audit trail).
3. Drop new functions: `get_user_earned_drops_gym`, `get_user_expiring_drops`, `get_user_drops_ledger_summary`.

---

### [2026-03-25] - Fair Session Soft Threshold + Anti-Split Stitching

**Migration File:** `backend/supabase/migrations/20260325000016_fair_session_soft_threshold_policy.sql`

**Agent:** supabase-dba

**Changes:**
- Extended `tokenomics_config` with session-tier policy:
  - `session_soft_tier_1_factor NUMERIC(6,4) DEFAULT 0.40` — earning rate after threshold
  - `session_soft_tier_2_factor NUMERIC(6,4) DEFAULT 0.15` — earning rate after tier1 span
  - `session_soft_tier_1_span_ratio NUMERIC(6,4) DEFAULT 0.50` — tier1 width as fraction of threshold
  - `split_merge_window_sec INTEGER DEFAULT 900` — anti-split merge window
  - Constraints: factors in [0,1], span ratio in (0,2], merge window 0..3600
  - Widened `session_restart_grace_sec` constraint to 0..3600
- Refactored `award_drops()`:
  - `max_drops_per_session` is now a **soft threshold** with piecewise tiers (not hard cutoff)
  - Segment A (0→threshold): 100% rate
  - Segment B (threshold→threshold+threshold×span_ratio): tier1_factor (40%)
  - Segment C (above): tier2_factor (15%)
  - Anti-split merge: aggregates drops from recent adjacent sessions in merge window, applies piecewise to combined total so split sessions cannot earn more than continuous
  - Day/week caps remain hard limits
  - Rewarded sessions cap mode (off/soft/hard) preserved with full reason code telemetry
- Extended `get_user_drop_limits()` with 4 new OUT columns: tier factors, span ratio, merge window

**Piecewise formula example (threshold=120, span_ratio=0.50):**
- 50 raw drops → 50 adjusted
- 120 raw drops → 120 adjusted (exactly at threshold)
- 150 raw drops → 132 adjusted
- 200 raw drops → 147 adjusted
- 250 raw drops → 155 adjusted

**Validation results:**
1. Continuous fairness: 1×150 drops = 132, 3×50 split = 50+50+32 = 132 → PASS (equal)
2. Soft mode: signal logged, reward not blocked → PASS
3. Hard mode: block still works → PASS
4. Day/week hard stop overrides everything → PASS
5. Restart stitching within grace window → PASS

**Impact:**
- **Mobile App:** `get_user_drop_limits` returns tier factors + merge window. Show "reduced earning" instead of hard block after session threshold.
- **Admin Panel:** new economy settings for tier factors and merge window.

**Breaking Changes:** None. Function signature unchanged. Defaults produce softer behavior than old hard cap.

**Rollback Notes:**
Revert to migration 000014 definition of `award_drops` to restore old hard session cap behavior.

---

### [2026-03-25] - Economy RSD Calibration + Discount Pricing Model

**Migration File:** `backend/supabase/migrations/20260325000015_add_economy_currency_calibration.sql`

**Agent:** supabase-dba

**Changes:**
- Extended `tokenomics_config` with gym-level currency calibration:
  - `drops_per_rsd NUMERIC(10,4) DEFAULT 2.0000` — persisted conversion rate
  - `currency_code TEXT DEFAULT 'RSD'` — local currency reference
  - `calibration_version INTEGER DEFAULT 1` — version counter for auditing
  - `calibration_meta JSONB DEFAULT '{}'` — anchors and assumptions
  - Constraint: `drops_per_rsd > 0.05 AND drops_per_rsd < 1000`
- Extended `rewards` with discount pricing model:
  - `base_price_rsd NUMERIC(10,2) NULL` — full regular price in local currency
  - `discount_percent NUMERIC(5,2) DEFAULT 0` — discount (0–95%)
  - `price_calc_mode TEXT DEFAULT 'manual_drops'` — `'manual_drops'` or `'discount_from_rsd'`
  - `final_price_rsd_snapshot NUMERIC(10,2) NULL` — computed effective RSD at save time
  - `drops_per_rsd_snapshot NUMERIC(10,4) NULL` — conversion rate used at save time
- Created function: `compute_reward_price_drops(p_gym_id UUID, p_base_price_rsd NUMERIC, p_discount_percent NUMERIC)`
  - Returns: `effective_rsd`, `effective_drops`, `drops_per_rsd`
  - Formula: `effective_rsd = base * (1 - discount/100)`, `effective_drops = round(effective_rsd * drops_per_rsd)`
  - SECURITY DEFINER, granted to `authenticated`
- Created trigger: `trg_rewards_discount_price_sync`
  - On INSERT/UPDATE of rewards in `discount_from_rsd` mode: auto-recomputes `price_drops`, `final_price_rsd_snapshot`, `drops_per_rsd_snapshot`
  - Manual mode rewards are untouched

**Validation results:**
- Coffee 200 RSD, 20% off → effective_rsd=160, effective_drops=320, rate=2.0 ✓
- Coffee 200 RSD, 50% off → effective_rsd=100, effective_drops=200, rate=2.0 ✓
- Membership 4000 RSD, 50% off → effective_rsd=2000, effective_drops=4000, rate=2.0 ✓
- Existing rewards unchanged (manual_drops mode, base_price_rsd=null) ✓
- Constraint rejects drops_per_rsd < 0.05 ✓
- Constraint rejects discount_percent > 95 ✓

**Impact:**
- **Admin Panel:**
  - Economy settings should read/persist `drops_per_rsd` and `currency_code` from tokenomics_config.
  - Reward create/edit can use `discount_from_rsd` mode: set `base_price_rsd` + `discount_percent`, trigger auto-fills `price_drops`.
  - Calibration wizard inputs map to `calibration_meta` + `drops_per_rsd`.
- **Mobile App:**
  - No immediate changes. `price_drops` remains the redemption field.
  - Optionally: read `drops_per_rsd` for informational RSD display.

**Breaking Changes:** None. Existing rewards stay `price_calc_mode='manual_drops'`.

**Rollback Notes:**
1. Drop trigger: `DROP TRIGGER trg_rewards_discount_price_sync ON rewards;`
2. Drop function: `DROP FUNCTION compute_reward_price_drops;`
3. Remove columns (safe, all nullable or have defaults).

---

### [2026-03-25] - Admin Economy Controls Contract + Drop Preview RPC

**Migration Files:**
- `backend/supabase/migrations/20260325000007_admin_drop_model_config_contract.sql`
- `backend/supabase/migrations/20260325000008_preview_drop_calculation_rpc.sql`
- `backend/supabase/migrations/20260325000009_fix_preview_drop_calculation_explanation_array.sql`

**Agent:** supabase-dba

**Changes:**
- Added persistent admin-facing drop model table: `public.drop_model_config`
  - Columns: `gym_id`, diminishing thresholds (`full_rate_until_min`, `reduced_rate_until_min`, `low_rate_until_min`), `post_limit_factor`, `machine_base_json`, timestamps.
  - Constraints: threshold ordering and factor bounds.
  - Single global row support (`gym_id IS NULL`) + one row per gym (`gym_id IS NOT NULL` unique).
- Added RLS policies on `drop_model_config` aligned with tokenomics access model:
  - superadmin full
  - gym_owner/gym_admin scoped to their gym
  - scoped read of global row
- Added RPC: `public.preview_drop_calculation(...) RETURNS jsonb`
  - Returns contract payload keys:
    - `expectedRawDrops`
    - `adjustedDrops`
    - `reducedByDiminishing`
    - `appliedCap`
    - `finalDrops`
    - `explanation`
  - Implements machine-specific logic (bike/treadmill/elliptical/stepper/generic), anti-spike simulation mode, diminishing returns, and session cap preview.
  - Auth scope enforcement:
    - superadmin global
    - gym_owner only own gyms
    - gym_admin only `admin_gym_id`
- Added verification scripts:
  - `backend/supabase/VERIFY_DROP_PREVIEW_BIKE_SPIKE.sql`
  - `backend/supabase/VERIFY_DROP_PREVIEW_TREADMILL.sql`
  - `backend/supabase/VERIFY_DROP_PREVIEW_LONG_SESSION.sql`
  - `backend/supabase/VERIFY_DROP_PREVIEW_SESSION_CAP.sql`

**Impact:**
- **Admin Panel:**
  - Fallback adapter can be removed once frontend points to `preview_drop_calculation`.
  - Economy settings can persist drop model controls via `drop_model_config`.
- **Mobile App:**
  - No immediate contract change required.
  - Existing `award_drops()` signature unchanged.

**Backward Compatibility Contract:**
- `tokenomics_config` remains source of truth for economic caps and feature flags (`use_drop_model_v2`).
- `drop_model_config` is new persistent source of truth for calculator-specific machine and diminishing configuration.
- This is a dual-read model until admin UI migrates fully to `drop_model_config`.

**Breaking Changes:**
- None for existing mobile/admin RPC call signatures.

**Rollback Notes:**
1. Disable preview usage in admin (fallback adapter).
2. Keep `tokenomics_config` as operational source for runtime award path.
3. If needed, revert `preview_drop_calculation` and `drop_model_config` migrations; legacy runtime paths remain intact.

---

### [2026-03-25] - Runtime Wiring to New Drop Model Contract

**Migration File:** `backend/supabase/migrations/20260325000010_wire_award_drops_to_new_drop_model_config.sql`

**Agent:** supabase-dba

**Changes:**
- Updated `calculate_session_drops_v2(...)` to read calculator policy from new `public.drop_model_config` contract:
  - uses `machine_base_json` machine entry (`bike`, `treadmill`, `elliptical`, `stepper`, `generic`)
  - uses diminishing thresholds (`full_rate_until_min`, `reduced_rate_until_min`, `low_rate_until_min`, `post_limit_factor`)
- Updated `award_drops(uuid)` to consume new `calculate_session_drops_v2(...)` behavior while keeping same RPC signature.
- Preserved existing tokenomics cap flow (`tokenomics_config`) and idempotency semantics.

**Impact:**
- **Mobile App:** no RPC signature changes.
- **Admin Panel:** values edited in `drop_model_config` now affect runtime v2 drop calculation path (when `tokenomics_config.use_drop_model_v2 = true`).

**Breaking Changes:** None (function signatures unchanged).

**Validation:**
- Smoke test `award_drops_v2_smoke_idempotent` passed:
  - first award: `27`
  - repeat award: `27`
  - transaction rows for same session: `1`

---

### [2026-03-03] - Phase 3.0: Bug Fixes + Schema Prep for Sweat Arenas

**Migration File:** `backend/supabase/migrations/20260303100000_phase3_bugfixes_and_redemptions_prep.sql`

**Agent:** supabase-dba

**Changes:**
- **Bug Fix #1:** Drop `idx_redemptions_unique_pending`, create `idx_redemptions_unique_claimed` with `WHERE status = 'claimed'`
- **Bug Fix #2:** Verified `claim_reward()` already has `GREATEST(0, ...)` guard (no change needed)
- **Bug Fix #3:** Update `expire_stale_drops()` to also deduct from `gym_memberships.local_drops_balance`
- **Schema Prep:** Make `redemptions.reward_id` NULLABLE (for arena/leaderboard prizes)
- **Schema Prep:** Add `redemptions.description` column (TEXT)
- **Schema Prep:** Add `redemptions.source_type` column (CHECK: 'reward_store' | 'arena_prize' | 'leaderboard_prize')
- **Update:** `find_redemption_by_code()` with LEFT JOIN for nullable `reward_id`, returns `source_type` and `description`

**Impact:**
- Mobile App: Will need to handle `source_type` in redemptions
- Admin Panel: Will need to filter/display `source_type` for redemptions
- Reception Desk: `find_redemption_by_code()` now works for all redemption types (reward store, arena prizes, leaderboard prizes)

**Breaking Changes:**
- `redemptions.reward_id` is now NULLABLE (backward compatible)
- New columns added (backward compatible)

**Next Steps:**
1. Run: `supabase gen types typescript --local > backend/types/database.types.ts`
2. Proceed to Phase 3.1: Unified Leaderboard System

---

### [2026-03-03] - Phase 3.1: Unified Leaderboard System

**Migration Files:**
- `backend/supabase/migrations/20260303100001_unified_leaderboard_system.sql`
- `backend/supabase/migrations/20260303100002_schedule_leaderboard_prize_distribution.sql`
- `backend/supabase/functions/distribute-leaderboard-prizes/index.ts`

**Agent:** supabase-dba

**Changes:**
- **Create `get_leaderboard()` generic RPC:** Supports 'gym', 'global', 'challenge', 'arena' types
- **Rewrite `get_local_leaderboard()` and `get_global_leaderboard()`:** Thin wrappers around `get_leaderboard()` for backward compatibility
- **Create `leaderboard_snapshots` table:** Stores snapshots at period end for prize distribution history
- **Create `distribute_leaderboard_prizes()` function:** Awards prizes to top 3, inserts into `public.redemptions` with `source_type = 'leaderboard_prize'`
- **Create `distribute-leaderboard-prizes` edge function:** Processes all active gyms, sends push notifications
- **Schedule cron jobs:** Weekly (Sunday 22:55 UTC) and monthly (last day 22:55 UTC) prize distribution

**Impact:**
- Mobile App: Switch to `get_leaderboard()` RPC with `p_type` parameter
- Admin Panel: Use `get_leaderboard()` for all leaderboard views
- Leaderboard prizes: Top 3 winners get redemption entries automatically

**Breaking Changes:**
- `get_local_leaderboard()` and `get_global_leaderboard()` now return different columns (added `avatar_url`, `score_label`, `gym_name`). Old code may break.

**Next Steps:**
- Mobile agent: Refactor leaderboard screen to use `get_leaderboard()`
- Admin agent: Update leaderboard views
- Proceed to Phase 3.2: Sweat Arenas Schema

---

### [2026-03-03] - Phase 3.2: Sweat Arenas System

**Migration Files:**
- `backend/supabase/migrations/20260303100003_sweat_arenas_system.sql`
- `backend/supabase/migrations/20260303100004_update_award_drops_for_arenas.sql`
- `backend/supabase/migrations/20260303100005_schedule_arena_finalization.sql`
- `backend/supabase/functions/finalize-arena/index.ts`

**Agent:** supabase-dba

**Changes:**
- **Create `sweat_arenas` table:** Brand-sponsored competitions with scope (local/regional/network), scoring model, sponsor info, prizes JSONB
- **Create `arena_gyms` table:** Participating gyms for each arena
- **Create `arena_participants` table:** Member opt-in with live scores
- **Create `arena_results` table:** Finalized rankings with `redemption_id` FK to `public.redemptions`
- **Create `opt_into_arena()` RPC:** Validates and opts user into arena
- **Create `get_available_arenas()` RPC:** Returns arenas available to user with opt-in status, rank, score
- **Create `update_arena_scores()` helper:** Real-time updates for `total_drops` and `streak_days` arenas
- **Create `update_arena_scores_periodic()` function:** Recalculates `days_visited` and `variety_score` (called by cron every 15 min)
- **Create `finalize_arena()` RPC:** Calculates final rankings, inserts winners into `public.redemptions` with `source_type = 'arena_prize'`
- **Update `award_drops()`:** Add step 13b calling `update_arena_scores()` for real-time arena score updates
- **Create `finalize-arena` edge function:** Processes ended arenas, sends push notifications to winners
- **Schedule cron jobs:**
  - `update-arena-scores-periodic`: Every 15 minutes
  - `finalize-arena-check`: Daily at 00:30 UTC

**Impact:**
- Mobile App: Arena cards on home screen, opt-in flow, arena leaderboards
- Admin Panel: Arena CRUD, participant management, finalization
- `award_drops()` now also updates arena scores (backward compatible)

**Breaking Changes:**
- `award_drops()` now also updates arena scores (backward compatible, no breaking changes)

**Next Steps:**
- Mobile agent: Implement arena UI (cards, opt-in, leaderboards)
- Admin agent: Implement arena management (CRUD, participants, finalization)
- Update TypeScript types: `backend/types/sweatdrop.ts`

---

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
