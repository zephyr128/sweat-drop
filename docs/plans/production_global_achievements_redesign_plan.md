# Feature: Production Global Achievements — Tiered Category System

**Status:** Planning
**Owner:** Architect
**Target Release:** Vortex external pilot / Production
**Created:** 2026-04-23
**Dependencies:**
- Existing `global_achievements` table (migration `20250128000001`)
- Existing `evaluate_badges()` RPC (migration `20260303000001`)
- Existing `tokenomics_config` (max 120 drops/session, 300/day, 1500/week)
- `global-achievement-badges` storage bucket (migration `20250128000006`)

---

## Context

### Problem
The current seed of global achievements (`20260303000001_fix_user_badges_and_seed_achievements.sql`) was intended as a stopgap. For production release (Vortex pilot) we need:

1. A **curated, production-quality catalog** of global badges aligned with the live drops economy (≈100 drops/session, 120 drops/session cap, 300/day, 1500/week).
2. **Clear category separation** (Sessions, Total Drops, Streaks, Multi-Gym Exploration, Distance) so users can see a laddered progression rather than a flat grid.
3. **Difficulty tiers per category** (Bronze → Silver → Gold → Platinum → Diamond) — at minimum 5 per category — that are *achievable* for real users on the live economy.
4. A **premium mobile Trophy Room layout** that:
   - Preserves the existing **Global** vs **This Gym** separation.
   - Adds a new **category-grouped ladder layout** (category section → horizontal tier row with locked/earned states).
   - Keeps search and "earned/locked" quick filters.
5. Admin panel polish so superadmin can manage tiered achievements without breaking the existing `AchievementsManager` UX.

### Economy Baseline (must calibrate against)
From `tokenomics_config` (20260409300001):
- `max_drops_per_session = 120`
- `max_drops_per_day     = 300`
- `max_rewarded_sessions_per_day = 4`
- `max_drops_per_week    = 1500`

Realistic pilot user profile:
- ≈100 drops/workout average
- 3 workouts/week ≈ 300 drops/week ≈ 1,200/month ≈ 14,400/year
- Committed user: 5 workouts/week ≈ 500 drops/week ≈ 26,000/year (hard cap 78k/year via weekly cap)

Achievements must be (a) achievable for the committed 3 workouts/week user within one year, and (b) aspirational (not trivially farmable) for the top tier.

### Current State Audit
Existing seed has **12 achievements** with:
- 4 session-count badges (1, 10, 50, 100)
- 3 total-drops badges (1k, 5k, 10k)
- 4 streak-day badges (3, 7, 14, 30)
- 1 multi-gym badge (3 gyms)
- 0 distance badges

Issues for production:
- No distance category despite `distance_km` being a supported evaluator.
- Streak caps at 30 days — no aspirational 60/90.
- Drops tier tops out at 10k — a committed user clears this in ≈4 months.
- Badge images are placeholder URLs (`https://sweatdrop.app/badges/...`) — not in the storage bucket.
- All drop-reward values are ad hoc; no tier scaling.
- Mobile Trophy Room flattens everything into `Earned` / `In Progress` without category grouping.

---

## Execution Plan

This plan is split into **four sequential phases**. Each phase has a single owning agent.

### Phase 1 — Database schema & seed (supabase-dba)
### Phase 2 — Badge asset upload (supabase-dba, one-time)
### Phase 3 — Mobile Trophy Room redesign (mobile-coder)
### Phase 4 — Admin panel polish (admin-coder)

---

## Phase 1 — Database Changes (supabase-dba)

### Step 1.1 — Add `tier` and `category` columns to `global_achievements`

**Migration file:** `backend/supabase/migrations/20260423100000_add_tier_category_to_global_achievements.sql`

**Changes:**
- Add column `tier TEXT` with check constraint: one of `'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond'`. Nullable so legacy rows don't break.
- Add column `category TEXT` with check constraint: one of `'sessions' | 'total_drops' | 'streak' | 'multi_gym' | 'distance' | 'special'`. Nullable.
- Add index `idx_global_achievements_category_tier ON (category, tier)` for the mobile grouping query.
- `COMMENT ON COLUMN` documenting that `category` is a UI grouping hint (independent from `criteria.type`, but typically mirrors it) and `tier` drives the mobile badge frame color/order within a category.

**Do NOT** alter or drop any existing column. Legacy seed rows keep working; they'll be deactivated in Step 1.3.

### Step 1.2 — Deactivate legacy seed achievements

**Same migration as above, second half.**

**Changes:**
- `UPDATE public.global_achievements SET is_active = false, updated_at = NOW() WHERE code IN (...)` for every code from the legacy seed (`first_workout`, `ten_sessions`, `fifty_sessions`, `hundred_sessions`, `thousand_drops`, `five_k_drops`, `ten_k_drops`, `three_day_streak`, `seven_day_streak`, `fourteen_day_streak`, `thirty_day_streak`, `multi_gym`).
- Reason: We keep the rows so any user who already earned a legacy badge keeps it (existing `user_badges` FK rows preserved). New users will only see the new tiered catalog.
- Do **not** `DELETE` — keeps historical referential integrity for `user_badges.global_achievement_id`.

### Step 1.3 — Seed the production catalog (25 achievements)

**Migration file:** `backend/supabase/migrations/20260423100001_seed_production_global_achievements.sql`

**Catalog:** 5 categories × 5 tiers = 25 achievements. All use `is_active = true`, `scope = 'global'`, `operator = '>='`.

Tier color conventions (for mobile UI reference only, not stored beyond `tier` column):
- `bronze`   → `#CD7F32`
- `silver`   → `#C0C0C0`
- `gold`     → `#FFD700`
- `platinum` → `#E5E4E2`
- `diamond`  → `#B9F2FF`

#### 1.3.1 — Sessions Category (`category = 'sessions'`, `criteria.type = 'session_count'`)

| Tier     | Code                  | Name             | Description                             | Threshold | Reward Drops | Display Order |
|----------|-----------------------|------------------|-----------------------------------------|-----------|--------------|---------------|
| bronze   | `sessions_bronze`     | First Sweat      | Complete your first workout             | 1         | 20           | 101           |
| silver   | `sessions_silver`     | Getting Hooked   | Complete 10 workouts                    | 10        | 100          | 102           |
| gold     | `sessions_gold`       | Iron Regular     | Complete 50 workouts                    | 50        | 400          | 103           |
| platinum | `sessions_platinum`   | Centurion        | Complete 100 workouts                   | 100       | 1,000        | 104           |
| diamond  | `sessions_diamond`    | 250 Club         | Complete 250 workouts                   | 250       | 3,000        | 105           |

**Economy check:** 250 workouts × 3/week = 83 weeks (≈1.6 years) — aspirational but reachable for the first dedicated cohort.

#### 1.3.2 — Total Drops Category (`category = 'total_drops'`, `criteria.type = 'total_drops'`)

| Tier     | Code                  | Name             | Description                             | Threshold | Reward Drops | Display Order |
|----------|-----------------------|------------------|-----------------------------------------|-----------|--------------|---------------|
| bronze   | `drops_bronze`        | Drop Collector   | Earn 500 total drops                    | 500       | 25           | 201           |
| silver   | `drops_silver`        | Drop Saver       | Earn 2,500 total drops                  | 2,500     | 150          | 202           |
| gold     | `drops_gold`          | Drop Hoarder     | Earn 10,000 total drops                 | 10,000    | 500          | 203           |
| platinum | `drops_platinum`      | Drop Tycoon      | Earn 25,000 total drops                 | 25,000    | 1,500        | 204           |
| diamond  | `drops_diamond`       | Drop Legend      | Earn 50,000 total drops                 | 50,000    | 4,000        | 205           |

**Economy check:** 50k lifetime drops ≈ 500 workouts @ 100 drops each, or ≈2 years at 3 sessions/week. Committed users (5/week) hit it in ≈1 year.

#### 1.3.3 — Streak Category (`category = 'streak'`, `criteria.type = 'streak_days'`)

| Tier     | Code                  | Name             | Description                             | Threshold | Reward Drops | Display Order |
|----------|-----------------------|------------------|-----------------------------------------|-----------|--------------|---------------|
| bronze   | `streak_bronze`       | Warm-Up Streak   | 3 consecutive workout days              | 3         | 30           | 301           |
| silver   | `streak_silver`       | Week Warrior     | 7 consecutive workout days              | 7         | 100          | 302           |
| gold     | `streak_gold`         | Unstoppable      | 14 consecutive workout days             | 14        | 300          | 303           |
| platinum | `streak_platinum`     | Iron Will        | 30 consecutive workout days             | 30        | 900          | 304           |
| diamond  | `streak_diamond`      | Forged in Fire   | 60 consecutive workout days             | 60        | 2,500        | 305           |

**Note:** `streak_days` is computed in `profiles.streak_days` via existing streak logic. Reset on missed day. A 60-day streak is genuinely hard (cf. existing 30-day "Iron Will") — appropriate Diamond tier.

#### 1.3.4 — Multi-Gym Category (`category = 'multi_gym'`, `criteria.type = 'gym_count'`)

Counts distinct `gym_id` in `gym_memberships` for the user.

| Tier     | Code                  | Name             | Description                             | Threshold | Reward Drops | Display Order |
|----------|-----------------------|------------------|-----------------------------------------|-----------|--------------|---------------|
| bronze   | `multi_gym_bronze`    | Second Home      | Work out at 2 different gyms            | 2         | 40           | 401           |
| silver   | `multi_gym_silver`    | Gym Explorer     | Work out at 3 different gyms            | 3         | 120          | 402           |
| gold     | `multi_gym_gold`      | Nomad            | Work out at 5 different gyms            | 5         | 350          | 403           |
| platinum | `multi_gym_platinum`  | Cross-Trainer    | Work out at 8 different gyms            | 8         | 900          | 404           |
| diamond  | `multi_gym_diamond`   | Chain Conqueror  | Work out at 12 different gyms           | 12        | 2,500        | 405           |

**Pilot note:** With only Vortex and pilot partner gyms live at launch, Diamond tier may be unreachable for month one — this is intentional; it becomes attainable as the network grows.

#### 1.3.5 — Distance Category (`category = 'distance'`, `criteria.type = 'distance_km'`)

Evaluator reads `SUM(raw_metrics->>'total_distance') / 1000.0` across sessions (meters → km). Applies only to BLE-tracked cardio equipment.

| Tier     | Code                  | Name             | Description                             | Threshold | Reward Drops | Display Order |
|----------|-----------------------|------------------|-----------------------------------------|-----------|--------------|---------------|
| bronze   | `distance_bronze`     | Kilometer Club   | Ride/run 10 km                          | 10        | 25           | 501           |
| silver   | `distance_silver`     | Mover            | Ride/run 50 km                          | 50        | 150          | 502           |
| gold     | `distance_gold`       | Road Warrior     | Ride/run 250 km                         | 250       | 500          | 503           |
| platinum | `distance_platinum`   | Marathoner       | Ride/run 1,000 km                       | 1,000     | 1,500        | 504           |
| diamond  | `distance_diamond`    | Odyssey          | Ride/run 2,500 km                       | 2,500     | 4,000        | 505           |

**Economy check:** 2,500 km ≈ 125 hours @ 20 km/h avg — matches ≈100 hour-long bike sessions; very aspirational.

### Step 1.4 — Badge image paths

All 25 new achievements reference `badge_image_url` pointing to the **existing** `global-achievement-badges` public bucket:

```
https://{supabase_project}.supabase.co/storage/v1/object/public/global-achievement-badges/{code}-badge.png
```

For the migration, use a **canonical placeholder path** per the code (`sessions_bronze-badge.png`, etc.) — actual file upload happens in **Phase 2** but the migration is forward-compatible (bucket is public, URL resolves once file exists; a 404 resolves gracefully in the mobile `Image` component).

### Step 1.5 — Re-verify `evaluate_badges()` supports all categories

No new migration needed. Confirm in testing that `evaluate_badges()` (from `20260303000001`) correctly awards all five tiers in each category. The function already supports `session_count`, `total_drops`, `streak_days`, `gym_count`, `distance_km` — all categories covered.

### Step 1.6 — Regenerate DB types

After the migration:
```bash
supabase gen types typescript --local > backend/types/database.types.ts
```
The new `tier` and `category` columns must appear in the `global_achievements` Row type.

### Step 1.7 — Document in MIGRATION_NOTES.md

Add an entry dated `[2026-04-23]` describing:
- Two migrations added (schema + seed)
- 25 new achievements, 12 legacy deactivated
- Frontend impact: mobile Trophy Room must read `category` + `tier` for grouping; admin panel should display tier chip.
- Breaking changes: **none** — legacy `user_badges` rows untouched; legacy achievement rows soft-deactivated.

### Phase 1 Deliverables
- [ ] `20260423100000_add_tier_category_to_global_achievements.sql`
- [ ] `20260423100001_seed_production_global_achievements.sql`
- [ ] Updated `backend/types/database.types.ts`
- [ ] `MIGRATION_NOTES.md` entry

### Phase 1 Testing
1. `supabase db reset` applies both migrations without error.
2. `SELECT COUNT(*) FROM global_achievements WHERE is_active = true;` → **25**.
3. `SELECT category, tier, COUNT(*) FROM global_achievements WHERE is_active = true GROUP BY 1, 2;` → every (category, tier) pair has exactly 1 row.
4. Manually insert a session with `drops_earned = 50` and `raw_metrics = '{"total_distance": 11000}'::jsonb` for a test user, call `evaluate_badges()`, assert the `distance_bronze` badge is awarded and `user_badges` row is created.
5. `SELECT * FROM profiles WHERE id = '<test>';` → `total_drops` incremented by `distance_bronze.reward_drops` (25).
6. Idempotency: re-run the seed migration; `ON CONFLICT (code) DO NOTHING` prevents duplicates.

---

## Phase 2 — Badge Asset Upload (supabase-dba, one-time)

### Context
25 badge PNGs need to live in `global-achievement-badges`. This is a **one-time operational task**, not a migration. Design should follow the established premium aesthetic:
- 512×512 px, transparent background, PNG-24
- Tier-colored metal frame (bronze/silver/gold/platinum/diamond)
- Category-themed central icon (dumbbell, drop, flame, map-pin, track)
- SweatDrop logomark subtle watermark bottom-right

### Step 2.1 — Design brief
Produce the asset design in a design tool (Figma). **This is not a coder task.** Producing actual PNGs is out of scope for this plan; see `docs/plans/feature_gym_waitlist_gallery_premium_details.md` for the design-ops reference.

Until final art is ready, **ship with a generic tier-frame placeholder** (one per tier, recoloured) — users will see a premium-looking badge even during the first pilot week.

### Step 2.2 — Upload via Supabase Storage

Either:
- **Option A (manual):** Supabase Dashboard → Storage → `global-achievement-badges` → upload 25 PNGs with exact filename `{code}-badge.png`.
- **Option B (scripted):** Add a one-off Node script in `scripts/upload-achievement-badges.mjs` that reads from `apps/mobile-app/assets/achievement-badges/` and calls `supabase.storage.from('global-achievement-badges').upload()` using the service-role key. Document the script in `SCRIPTS.md`.

### Phase 2 Deliverables
- [ ] 25 PNG files uploaded to `global-achievement-badges` (exact filenames per catalog)
- [ ] Public URL verified: opening any `badge_image_url` in browser shows the image

---

## Phase 3 — Mobile Trophy Room Redesign (mobile-coder)

**Workspace:** `apps/mobile-app/`

### Design goals
1. **Two top-level scopes preserved:** Global (new catalog) vs This Gym (gym challenges) — via the existing `SliderTabs` pattern.
2. **Category-grouped layout** inside the Global scope: one section per category showing a **tier ladder row**.
3. **Keep premium feel:** glassmorphic category headers, branded accents, `FadeInDown` staggered entrance animations, tier-colored badge frames.
4. **Keep existing `BadgeDetailModal`, `BadgeCard`, search, hero stats banner** — don't regress what already works.

### Step 3.1 — Extend badge types

**File:** `apps/mobile-app/hooks/useAllBadges.ts`

**Changes:**
- Extend `GlobalAchievement` interface to include:
  ```ts
  category: 'sessions' | 'total_drops' | 'streak' | 'multi_gym' | 'distance' | 'special' | null;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | null;
  ```
- Extend the SELECT to include the new columns (Supabase returns them automatically via `*`).
- Extend `BadgeWithProgress` with optional `category` and `tier`.

### Step 3.2 — Compute per-category aggregates in `TrophyRoom`

**File:** `apps/mobile-app/components/TrophyRoom.tsx`

**Changes:**
- Add a derived `globalBadgesByCategory` memo: `Record<Category, BadgeWithProgress[]>` sorted by tier rank within each bucket.
- Sort categories in a fixed UI order: `['sessions', 'total_drops', 'streak', 'multi_gym', 'distance', 'special']`.
- Per category, compute: `earnedCount / totalCount`, `completionPercent`, and the **highest unlocked tier** (`maxTier`) for the category summary chip.

### Step 3.3 — New top-level scope tabs

**File:** `apps/mobile-app/components/TrophyRoom.tsx`

**Changes:**
- Replace the current 4-way filter (`all | this_gym | earned | locked`) with a **two-level** navigation:
  - **Primary tabs (SliderTabs):** `Global | {activeGym.name ?? 'My Gym'}` — drives the dataset.
  - **Secondary chip row (new):** `All | Earned | Locked` — drives visibility within the chosen scope.
- Search bar remains above both levels.

### Step 3.4 — New `CategorySection` component

**File:** `apps/mobile-app/components/trophy/CategorySection.tsx` (new)

**Props:**
```ts
interface CategorySectionProps {
  category: Category;            // 'sessions' | ...
  title: string;                 // localized
  icon: keyof typeof Ionicons.glyphMap;
  badges: BadgeWithProgress[];   // always 5, already tier-sorted
  earnedCount: number;
  onBadgePress: (badge: BadgeWithProgress) => void;
}
```

**Design:**
- Glassmorphic card wrapper (`BlurView intensity={50} tint="dark"` + `backgroundColor: 'rgba(20,20,30,0.75)'` + border `hexToRgba(branding.primary, 0.12)`).
- Header row:
  - `<Ionicons name={icon} size={22} color={branding.primary} />`
  - Title (fontStyles.heading, 16, letterSpacing 1)
  - Right-aligned count pill `{earnedCount}/{badges.length}` styled with branding color.
- Tier ladder: horizontal `ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}` with 5 `<BadgeCard size="small" />` items, each stamped with a subtle tier frame color via a new optional `frameColor` prop.
- Between-tier connector: a 2px line with `backgroundColor: hexToRgba(branding.primary, 0.25)` rendered between badges to suggest progression.
- Entrance: `Animated.View entering={FadeInDown.delay(index * 80).duration(400)}`.

### Step 3.5 — Tier-colored badge frame in `BadgeCard`

**File:** `apps/mobile-app/components/BadgeCard.tsx`

**Changes:**
- Add optional prop `tier?: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond'`.
- When `tier` is set, render a **2-px inner ring** with the tier color (constant map in the component):
  ```
  bronze: '#CD7F32', silver: '#C0C0C0', gold: '#FFD700',
  platinum: '#E5E4E2', diamond: '#B9F2FF'
  ```
- For locked tier badges, desaturate (apply `opacity: 0.35`) and use `Ionicons name="lock-closed"` overlay at bottom-right.

### Step 3.6 — Rewire `TrophyRoom` to use the new structure

**File:** `apps/mobile-app/components/TrophyRoom.tsx`

**Behavior matrix:**

| Primary scope | Search empty                                                  | Search active                          |
|---------------|---------------------------------------------------------------|----------------------------------------|
| Global        | Render one `<CategorySection>` per category                   | Flatten results into single list (existing `badgeGrid` style) |
| This Gym      | Unchanged (existing "Earned" + "In Progress" grid)            | Same as today                          |

- Secondary "All/Earned/Locked" chip filters the badges **inside** each category section (so a section can become empty and collapse).
- Preserve the existing `heroBanner` at top (totals computed from the **active scope** only).
- When a category section is empty after filters, render a compact muted placeholder inside the section instead of removing the section.

### Step 3.7 — i18n strings

**Files:**
- `apps/mobile-app/locales/en/trophyRoom.json`
- `apps/mobile-app/locales/sr/trophyRoom.json`

**New keys:**
```json
{
  "scopeGlobal": "Global",
  "scopeMyGym": "My Gym",
  "categorySessions": "Workouts",
  "categoryTotalDrops": "Total Drops",
  "categoryStreak": "Streak",
  "categoryMultiGym": "Explorer",
  "categoryDistance": "Distance",
  "categorySpecial": "Special",
  "tierBronze": "Bronze",
  "tierSilver": "Silver",
  "tierGold": "Gold",
  "tierPlatinum": "Platinum",
  "tierDiamond": "Diamond",
  "categoryProgressLabel": "{{earned}} / {{total}} earned",
  "lockedBadge": "Locked"
}
```

Provide matching Serbian translations.

### Step 3.8 — `useBranding()` color rules (Design System)

Adhere to established rules:
- Use `branding.primary` for section header icons, active scope tab, count pills.
- Use `hexToRgba(branding.primary, 0.12)` for card borders.
- **Never hardcode** `#00E5FF`. Tier colors (`#CD7F32`, `#FFD700`, etc.) ARE hardcoded — this is intentional because tier color is semantic, not branding.
- Background: `LinearGradient(['#000000', '#0A0E1A', '#000000'])` with optional `ImageBackground` from `activeGym.background_image_url` per the design system.

### Phase 3 Deliverables
- [ ] Updated `apps/mobile-app/hooks/useAllBadges.ts` (new fields)
- [ ] New `apps/mobile-app/components/trophy/CategorySection.tsx`
- [ ] Updated `apps/mobile-app/components/BadgeCard.tsx` (tier frame)
- [ ] Refactored `apps/mobile-app/components/TrophyRoom.tsx` (two-level nav, category layout)
- [ ] Updated i18n files (en + sr)

### Phase 3 Testing
1. **Unit:** `BadgeCard` renders correct tier frame color for each tier; locked tier shows lock overlay.
2. **Visual:** Trophy Room on Global scope shows 5 category sections, each with 5-tier ladder; scroll-horizontal inside each.
3. **Visual:** Trophy Room on This Gym scope shows existing earned/in-progress grid (regression check).
4. **Behavioral:** Tapping any tier badge opens `BadgeDetailModal` with correct progress.
5. **Behavioral:** Secondary chip "Earned" hides locked tiers from all category sections; sections with 0 earned tiers show muted placeholder.
6. **Behavioral:** Search in Global scope flattens to single grid; clearing search restores category layout.
7. **QA:** Run across 3 gym brandings (dark primary, light primary, no gym background) per the existing design-system QA list.
8. **QA:** Verify hero banner totals match `SUM(per-category earned)` within the active scope.

---

## Phase 4 — Admin Panel Polish (admin-coder)

**Workspace:** `apps/admin-panel/`

### Scope
The existing `AchievementsManager` (`apps/admin-panel/components/modules/AchievementsManager.tsx`) already supports creating achievements with the 5 supported criteria types. Only minor additions are required:

### Step 4.1 — Extend the form schema

**File:** `apps/admin-panel/components/modules/AchievementsManager.tsx`

**Changes:**
- Extend `achievementFormSchema` (zod) with:
  ```ts
  tier: z.enum(['bronze', 'silver', 'gold', 'platinum', 'diamond']).nullable().optional(),
  category: z.enum(['sessions', 'total_drops', 'streak', 'multi_gym', 'distance', 'special']).nullable().optional(),
  ```
- Add two `<select>` fields to the create/edit drawer: **Category** and **Tier**. Both optional but recommended (show a "Recommended — powers the mobile Trophy Room grouping" helper caption).

### Step 4.2 — Extend the server action schemas

**File:** `apps/admin-panel/lib/actions/achievement-actions.ts`

**Changes:**
- Extend `createAchievementSchema` and `updateAchievementSchema` with `tier` and `category` (both `.nullable().optional()`).
- Pass them through to the Supabase insert/update payloads.

### Step 4.3 — List view — group and color

**File:** `apps/admin-panel/components/modules/AchievementsManager.tsx`

**Changes:**
- Replace the flat list with a **collapsible group per category** (use the `category` column; rows with null category bucket into "Uncategorized").
- Within each category, sort by `display_order` (which already reflects tier order under our seed convention 101…105, 201…205, …).
- Render a small tier chip beside each row using the same hardcoded tier color map (bronze/silver/gold/platinum/diamond).
- Keep existing drag-handle (`GripVertical`) — reorder within category only (update `display_order` via existing server action).

### Step 4.4 — Filter bar

**Changes:**
- Add two dropdown filters above the list: **Category** (all / sessions / total_drops / …) and **Tier** (all / bronze / …).
- Add a toggle **"Show inactive"** so the 12 legacy deactivated rows don't pollute the default view but remain discoverable.

### Step 4.5 — Validation guardrails

**Changes:**
- When creating/editing, if `category` is chosen, auto-suggest `criteria.type` to match (`category='sessions'` → `criteria.type='session_count'`). The user can still override for "special" category.
- Warn (non-blocking) if a non-`>=` operator is chosen for tiered achievements (our model assumes `>=`).

### Phase 4 Deliverables
- [ ] Extended zod schemas (form + server actions)
- [ ] Category + Tier selects in create/edit drawer
- [ ] Grouped list view with tier chips
- [ ] Filter dropdowns and "Show inactive" toggle

### Phase 4 Testing
1. Superadmin can create a new achievement with category=`sessions`, tier=`diamond`, criteria=`session_count >= 500` and see it appear in the Sessions group with a blue (diamond) chip.
2. Editing an existing legacy row (post-Phase 1) shows empty category/tier — save with new values works.
3. Toggling "Show inactive" reveals the 12 deactivated legacy rows.
4. Filter dropdowns correctly narrow the list.
5. Reordering within a category persists via the existing `display_order` update action.
6. No regression: existing create/edit/delete/upload flows still work.

---

## Cross-Phase Testing — End-to-End Verification

**Owner:** test-automation-agent (recommended) or whichever coder is free.

1. **Reset local DB:** `supabase db reset`. Confirm 25 active + 12 inactive global achievements.
2. **Simulate a pilot user:**
   - Register a user, check in once → confirm `sessions_bronze` awarded & 20 bonus drops credited to `profiles.total_drops` and `drops_transactions` row present.
   - Complete 10 sessions → `sessions_silver` awarded.
   - Accumulate 500 drops → `drops_bronze` awarded (may coincide).
3. **Mobile smoke:** Log in on mobile, open Trophy Room → verify Global scope shows all 5 category sections; unlocked tiers have tier-colored frames; locked tiers are dimmed with lock icon.
4. **Admin smoke:** As superadmin, open `/dashboard/super/achievements` → confirm grouped list with category headers and tier chips; create a test "special" badge and verify it appears in mobile within one session.
5. **Regression:** Run the existing `challenges_badges_integration_plan.md` smoke path — earning a gym challenge still awards a badge and appears under the This Gym scope.

---

## Rollout & Feature Flagging

**Feature flag:** None required. The plan is purely additive:
- New rows are `is_active = true` and replace (not destroy) legacy.
- Mobile app using the new Trophy Room must be shipped alongside or after Phase 1 — but even the **old** Trophy Room keeps working with the new seed (it just won't show the category grouping).
- Admin panel changes are strictly additive (optional fields).

**Rollout order:**
1. Deploy Phase 1 migrations to production Supabase (off-peak).
2. Upload Phase 2 badge images.
3. Ship mobile app update (Phase 3) via OTA (if JS-only) or EAS build.
4. Ship admin panel update (Phase 4) via Vercel.

**Rollback path:** If a catastrophic issue arises, run:
```sql
UPDATE public.global_achievements SET is_active = false WHERE code LIKE '%_bronze' OR code LIKE '%_silver' OR code LIKE '%_gold' OR code LIKE '%_platinum' OR code LIKE '%_diamond';
UPDATE public.global_achievements SET is_active = true WHERE code IN (
  'first_workout','ten_sessions','fifty_sessions','hundred_sessions',
  'thousand_drops','five_k_drops','ten_k_drops',
  'three_day_streak','seven_day_streak','fourteen_day_streak','thirty_day_streak',
  'multi_gym'
);
```
This restores the pre-launch state without losing earned badges.

---

## Agent Dispatch Prompts

Below are **ready-to-send prompts** for each agent. Copy/paste verbatim into a new chat scoped to that agent.

### Prompt → supabase-dba (Phase 1 + optionally Phase 2 script)

```
Read docs/plans/production_global_achievements_redesign_plan.md (Phase 1 only).

Create two migrations:

1. backend/supabase/migrations/20260423100000_add_tier_category_to_global_achievements.sql
   - Add nullable `tier TEXT` with CHECK constraint (bronze|silver|gold|platinum|diamond).
   - Add nullable `category TEXT` with CHECK constraint (sessions|total_drops|streak|multi_gym|distance|special).
   - Add composite index idx_global_achievements_category_tier ON (category, tier).
   - Deactivate (is_active=false) the 12 legacy seed codes listed in Phase 1 Step 1.2 — do NOT delete them.
   - Include COMMENT ON COLUMN documentation.

2. backend/supabase/migrations/20260423100001_seed_production_global_achievements.sql
   - INSERT 25 rows as specified in the catalog tables (Phase 1 Step 1.3) with `ON CONFLICT (code) DO NOTHING`.
   - badge_image_url format: https://{supabase_project}.supabase.co/storage/v1/object/public/global-achievement-badges/{code}-badge.png
     (Use the SUPABASE_URL env at migration time if possible, otherwise hardcode the production URL.)
   - Set category, tier, criteria (type, operator='>=', value, scope='global'), reward_drops, display_order per the tables.

After applying:
- Regenerate backend/types/database.types.ts
- Add MIGRATION_NOTES.md entry dated [2026-04-23]
- Run Phase 1 Testing checklist (queries + evaluate_badges() smoke)

Do NOT touch mobile app or admin panel code. Phase 2 (image upload) is operational — flag it for the user if assets aren't ready yet.
```

### Prompt → admin-coder (Phase 4)

```
Read docs/plans/production_global_achievements_redesign_plan.md (Phase 4 only).

Prerequisites: Phase 1 migrations have been applied and backend/types/database.types.ts reflects the new `tier` and `category` columns on `global_achievements`.

Tasks:
1. Extend apps/admin-panel/lib/actions/achievement-actions.ts
   - Add `tier` and `category` to createAchievementSchema and updateAchievementSchema (both nullable optional)
   - Pass them through to the insert/update payloads

2. Extend apps/admin-panel/components/modules/AchievementsManager.tsx
   - Extend the zod form schema to match
   - Add Category and Tier select fields in the create/edit drawer (with helper text)
   - Replace flat list with collapsible groups per category (sort within by display_order)
   - Render a tier chip per row using the tier color map from the plan
   - Add Category + Tier dropdown filters above the list and a "Show inactive" toggle
   - Implement the auto-suggest validation guardrail (category → criteria.type mapping)

Do NOT touch migrations, mobile app, or any file outside apps/admin-panel/. Preserve existing drag-and-drop reorder, image upload, and CRUD flows.

Run Phase 4 Testing checklist. Report any schema mismatches back.
```

### Prompt → mobile-coder (Phase 3)

```
Read docs/plans/production_global_achievements_redesign_plan.md (Phase 3 only).

Prerequisites:
- Phase 1 migrations applied.
- backend/types/database.types.ts updated (new tier and category columns on global_achievements).

Tasks:
1. Update apps/mobile-app/hooks/useAllBadges.ts
   - Add `category` and `tier` to GlobalAchievement interface
   - Propagate onto BadgeWithProgress

2. Update apps/mobile-app/components/BadgeCard.tsx
   - Add optional `tier` prop; render tier-colored inner ring for unlocked badges
   - Locked badges: opacity 0.35 + lock-closed overlay icon

3. Create apps/mobile-app/components/trophy/CategorySection.tsx
   - Glassmorphic container per the design system
   - Header: Ionicons + title + {earned}/{total} pill
   - Horizontal tier ladder (5 BadgeCards with thin branded connector lines)
   - FadeInDown entrance animation

4. Refactor apps/mobile-app/components/TrophyRoom.tsx
   - Primary tabs: Global | <Gym name or "My Gym">
   - Secondary chips: All | Earned | Locked (filters inside sections)
   - Global scope: render CategorySection per category (fixed order: sessions, total_drops, streak, multi_gym, distance, special)
   - This Gym scope: keep the existing earned/in-progress grid
   - Search: when active, flatten Global scope to single grid
   - Preserve hero banner + BadgeDetailModal + existing animations

5. Update i18n
   - apps/mobile-app/locales/en/trophyRoom.json (keys per plan Step 3.7)
   - apps/mobile-app/locales/sr/trophyRoom.json (matching Serbian translations)

Adhere to the mobile design system rules (useBranding, BlurView, hexToRgba borders, FadeInDown). Never hardcode #00E5FF — tier colors ARE allowed as constants because they are semantic.

Do NOT touch migrations or admin panel code. Do NOT change BadgeDetailModal behavior.

Run Phase 3 Testing checklist across at least 2 gym brandings on iOS simulator.
```

---

## Open Questions / Assumptions

1. **Distance unit:** Assumed `raw_metrics.total_distance` is in **meters**. Verify against `award_drops` / mobile `workout.tsx` implementation. If already km, drop the `/ 1000.0` transform in any display code.
2. **Tier images vs generic PNGs:** Plan assumes one unique PNG per achievement. If design can only deliver 5 tier-framed templates (one per tier), the seed can reuse paths like `bronze-frame.png` / `silver-frame.png` / etc., and the mobile app can composite the category icon on top. Flag back to Architect if this becomes the preferred design route.
3. **Special category:** Reserved for future event/holiday/partner badges — no seed rows in this release, but the enum/column is ready.
4. **Localization of names:** Achievement `name`/`description` are seeded in English only. Post-pilot we may move names to i18n keys; for MVP the catalog ships EN-only for consistency with gym challenges.

---

## Appendix A — Programmatic Badge Generation (Recommended Approach for Phase 2)

Rather than designing 25 badge PNGs manually in Figma, we generate all 25 from a **single parametric SVG template** using a Node script with `@resvg/resvg-js`. This guarantees pixel-perfect consistency, runs in <5 seconds, and is fully re-runnable whenever we want to tweak the design.

### A.1 — Design Specification

**Canvas:** 512×512 px, transparent PNG-24.

**Layer stack (back to front):**

1. **Radial aura** — soft outer glow, `radial-gradient(transparent → tier.auraColor@15%)` fading to transparent at the edges. Makes locked badges feel "dormant" when desaturated.
2. **Outer metal ring** — 64 px thick circular band filled with a `linearGradient` that simulates brushed metal for each tier:
   - Bronze: `#4A2511 → #CD7F32 → #FFB47A → #8B4513`
   - Silver: `#4A4A55 → #C0C0C0 → #FFFFFF → #8A8A92`
   - Gold: `#6B4E00 → #FFD700 → #FFF8B0 → #8C7030`
   - Platinum: `#2B2E3A → #E5E4E2 → #FFFFFF → #7B7E8A` (cool grey)
   - Diamond: `#003E66 → #6BDFFF → #EAFBFF → #0099CC` (icy blue)
3. **Inner glass disk** — 352 px diameter, `fill="rgba(18,20,30,0.92)"` with a subtle top-down `linearGradient` highlight (white 8% → transparent) to simulate glass curvature.
4. **Category icon** — 160×160 px, centered, stroke-based (no fills), stroke color = tier.iconColor (near-white for all tiers, slight tier tint). Paths taken verbatim from Lucide icons so they match the rest of the app:
   - `sessions` → `Dumbbell`
   - `total_drops` → `Droplets`
   - `streak` → `Flame`
   - `multi_gym` → `MapPinned`
   - `distance` → `Route`
   - `special` → `Sparkles`
~~5. **Tier name plate** — small pill at bottom center, text = tier name ("BRONZE", "SILVER", …). Font: `Inter 700`, letter-spacing 3, 20 px, fill = tier highlight color.~~ *(removed — tier is communicated via ring color only)*
~~6. **SweatDrop mark** — tiny drop glyph top-center (12 px), 40% opacity, brand cyan `#00E5FF`.~~ *(removed — cleaner look)*

**Asset naming:** `{code}-badge.png` where `{code}` matches the DB `code` column (e.g. `sessions_bronze-badge.png`, `drops_diamond-badge.png`).

**Output directory:** `apps/mobile-app/assets/achievement-badges/` (commit to repo so designers can visually review in PRs; uploaded to Supabase Storage by the same script).

### A.2 — Dependencies

Add to root `package.json` (not to any app workspace — this is a dev tool):

```bash
pnpm add -D -w @resvg/resvg-js @supabase/supabase-js
```

`@resvg/resvg-js` is a pure-Rust SVG rasterizer: no system libraries, no libvips, no headless browser. Installs ~3 MB.

### A.3 — The Script

**File:** `scripts/generate-achievement-badges.mjs`

```javascript
import { Resvg } from '@resvg/resvg-js';
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../apps/mobile-app/assets/achievement-badges');
const SIZE = 512;
const BUCKET = 'global-achievement-badges';

// ---------- Tiers ----------
const TIERS = {
  bronze:   { label: 'BRONZE',   grad: ['#4A2511', '#CD7F32', '#FFB47A', '#8B4513'], aura: '#CD7F32', plate: '#FFB47A' },
  silver:   { label: 'SILVER',   grad: ['#4A4A55', '#C0C0C0', '#FFFFFF', '#8A8A92'], aura: '#C0C0C0', plate: '#FFFFFF' },
  gold:     { label: 'GOLD',     grad: ['#6B4E00', '#FFD700', '#FFF8B0', '#8C7030'], aura: '#FFD700', plate: '#FFF8B0' },
  platinum: { label: 'PLATINUM', grad: ['#2B2E3A', '#E5E4E2', '#FFFFFF', '#7B7E8A'], aura: '#E5E4E2', plate: '#FFFFFF' },
  diamond:  { label: 'DIAMOND',  grad: ['#003E66', '#6BDFFF', '#EAFBFF', '#0099CC'], aura: '#6BDFFF', plate: '#EAFBFF' },
};

// ---------- Categories (SVG paths from Lucide, viewBox 0 0 24 24, stroke-based) ----------
// code prefix used in DB code column -> category key
const CATEGORIES = {
  sessions: {
    codePrefix: 'sessions',
    // Dumbbell
    path: `<path d="M14.4 14.4 9.6 9.6"/><path d="M18.657 21.485a2 2 0 1 1-2.829-2.828l-1.767 1.768a2 2 0 1 1-2.829-2.829l6.364-6.364a2 2 0 1 1 2.829 2.829l-1.768 1.767a2 2 0 1 1 2.828 2.829z"/><path d="m21.5 21.5-1.4-1.4"/><path d="M3.9 3.9 2.5 2.5"/><path d="M6.404 12.768a2 2 0 1 1-2.829-2.829l1.768-1.767a2 2 0 1 1-2.828-2.829l2.828-2.828a2 2 0 1 1 2.829 2.828l1.767-1.768a2 2 0 1 1 2.829 2.829z"/>`,
  },
  total_drops: {
    codePrefix: 'drops',
    // Droplets
    path: `<path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z"/><path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97"/>`,
  },
  streak: {
    codePrefix: 'streak',
    // Flame
    path: `<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>`,
  },
  multi_gym: {
    codePrefix: 'multi_gym',
    // MapPinned
    path: `<path d="M18 8c0 3.613-3.869 7.429-5.393 8.795a1 1 0 0 1-1.214 0C9.87 15.429 6 11.613 6 8a6 6 0 0 1 12 0"/><circle cx="12" cy="8" r="2"/><path d="M8.714 14h-3.71a1 1 0 0 0-.948.683l-2.004 6A1 1 0 0 0 3 22h18a1 1 0 0 0 .948-1.316l-2-6a1 1 0 0 0-.949-.684h-3.712"/>`,
  },
  distance: {
    codePrefix: 'distance',
    // Route
    path: `<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>`,
  },
  special: {
    codePrefix: 'special',
    // Sparkles
    path: `<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>`,
  },
};

// ---------- Full catalog (matches Phase 1 seed) ----------
const CATALOG = [];
for (const [catKey, cat] of Object.entries(CATEGORIES)) {
  if (catKey === 'special') continue; // no seed rows for special in MVP
  for (const tierKey of Object.keys(TIERS)) {
    CATALOG.push({ category: catKey, tier: tierKey, code: `${cat.codePrefix}_${tierKey}` });
  }
}

// ---------- SVG template ----------
function renderSVG({ category, tier }) {
  const t = TIERS[tier];
  const c = CATEGORIES[category];
  const gradId = `ring-${tier}`;
  const glassId = `glass-${tier}`;
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <radialGradient id="aura" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${t.aura}" stop-opacity="0.25"/>
      <stop offset="70%" stop-color="${t.aura}" stop-opacity="0.05"/>
      <stop offset="100%" stop-color="${t.aura}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"   stop-color="${t.grad[0]}"/>
      <stop offset="35%"  stop-color="${t.grad[1]}"/>
      <stop offset="65%"  stop-color="${t.grad[2]}"/>
      <stop offset="100%" stop-color="${t.grad[3]}"/>
    </linearGradient>
    <linearGradient id="${glassId}" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%"   stop-color="#FFFFFF" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="6"/>
    </filter>
  </defs>

  <!-- Aura -->
  <circle cx="256" cy="256" r="256" fill="url(#aura)"/>

  <!-- Drop shadow under ring -->
  <circle cx="256" cy="268" r="224" fill="#000" opacity="0.45" filter="url(#softShadow)"/>

  <!-- Outer metal ring -->
  <circle cx="256" cy="256" r="224" fill="url(#${gradId})"/>
  <circle cx="256" cy="256" r="224" fill="none" stroke="#000" stroke-opacity="0.25" stroke-width="2"/>

  <!-- Inner glass disk -->
  <circle cx="256" cy="256" r="176" fill="rgba(18,20,30,0.94)"/>
  <circle cx="256" cy="256" r="176" fill="url(#${glassId})"/>
  <circle cx="256" cy="256" r="176" fill="none" stroke="${t.aura}" stroke-opacity="0.35" stroke-width="2"/>

  <!-- Category icon (centered, scaled from 24x24 viewBox to 160x160) -->
  <g transform="translate(176,160) scale(6.667)" fill="none" stroke="${t.plate}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    ${c.path}
  </g>

  <!-- Tier name plate -->
  <g transform="translate(256,400)">
    <rect x="-80" y="-18" width="160" height="36" rx="18" fill="rgba(0,0,0,0.55)" stroke="${t.plate}" stroke-opacity="0.6" stroke-width="1.5"/>
    <text x="0" y="6" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-weight="700" font-size="18" letter-spacing="3" fill="${t.plate}">${t.label}</text>
  </g>

  <!-- SweatDrop mark (small drop glyph top-center) -->
  <g transform="translate(256,72) scale(0.9)" fill="#00E5FF" fill-opacity="0.55">
    <path d="M0,-12 C6,-4 10,2 10,7 a10,10 0 0 1 -20,0 C-10,2 -6,-4 0,-12 Z"/>
  </g>
</svg>`.trim();
}

// ---------- Main ----------
async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const shouldUpload = process.argv.includes('--upload');
  let supabase = null;
  if (shouldUpload) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      console.error('❌ --upload requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.');
      process.exit(1);
    }
    supabase = createClient(url, key, { auth: { persistSession: false } });
  }

  for (const entry of CATALOG) {
    const svg = renderSVG(entry);
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: SIZE } }).render().asPng();
    const filename = `${entry.code}-badge.png`;
    const filepath = path.join(OUT_DIR, filename);
    fs.writeFileSync(filepath, png);
    console.log(`✓ generated ${filename}`);

    if (shouldUpload && supabase) {
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(filename, png, { contentType: 'image/png', upsert: true });
      if (error) console.error(`  ↳ upload failed: ${error.message}`);
      else console.log(`  ↳ uploaded to ${BUCKET}/${filename}`);
    }
  }
  console.log(`\nDone. ${CATALOG.length} badges in ${OUT_DIR}`);
}

main().catch(err => { console.error(err); process.exit(1); });
```

### A.4 — Usage

```bash
# Generate only (local preview)
node scripts/generate-achievement-badges.mjs

# Generate + upload to Supabase bucket
SUPABASE_URL=https://<project>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service_role_key> \
  node scripts/generate-achievement-badges.mjs --upload
```

Add a convenience entry to root `package.json`:

```json
"scripts": {
  "badges:generate": "node scripts/generate-achievement-badges.mjs",
  "badges:upload":   "node scripts/generate-achievement-badges.mjs --upload"
}
```

### A.5 — Why this is the right tool

- **Zero manual work** — tweak the SVG template once, re-run, all 25 regenerate.
- **Pixel-perfect consistency** — identical metal gradients, identical typography, identical sizing across the entire catalog.
- **Premium aesthetic** — matches SweatDrop's glassmorphism (dark inner disk, cyan accent mark) while keeping tier colors recognizable at a glance.
- **Version-controlled** — the generator script + SVG template live in git; the generated PNGs can also be committed so designers/PMs can review in PRs.
- **Easily extensible** — adding the `special` category (e.g. "Launch Day", "Pilot Hero") later is one new entry in `CATEGORIES` plus one `for` loop iteration.
- **No external dependencies** — no Figma, no Canva, no design handoff. Runs on any CI.

### A.6 — Alternative Options Considered

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| Figma + manual export | Full visual control, shareable | 25 files × manual export, drift risk | ❌ Too slow |
| Figma + Tokens Studio plugin | Variable-driven | Setup overhead, still needs batch export | ❌ Overkill |
| Satori (Vercel) + resvg | JSX → SVG → PNG, nicer authoring | Extra dep, overkill for static badges | ⚠️ Valid but heavier |
| Headless Chrome + Puppeteer | CSS fidelity | Huge install, slow, flaky on CI | ❌ Avoid |
| React Native Skia in-app generation | No server asset needed | Admin panel still needs URLs; Skia can't publish to bucket | ❌ Wrong layer |
| **`@resvg/resvg-js` + SVG template (chosen)** | Tiny dep, <5 s for 25 badges, deterministic | None material | ✅ Ship this |

### A.7 — Acceptance Criteria

- [ ] `pnpm badges:generate` produces 25 files in `apps/mobile-app/assets/achievement-badges/`.
- [ ] All 25 files open cleanly in macOS Preview; visual check: tier ring is recognizable, category icon centered, tier label readable.
- [ ] `pnpm badges:upload` pushes all 25 to the `global-achievement-badges` bucket; each public URL returns HTTP 200 with `Content-Type: image/png`.
- [ ] Mobile app renders badges correctly in Trophy Room at both small (80 px) and detail-modal (200 px) sizes (SVG-sourced PNGs downscale cleanly because source is 512 px).
- [ ] Re-running the script is idempotent (upload uses `upsert: true`).

### A.8 — Dispatch Prompt — Script Generation Task

To hand this off to a coder agent (this is dev-tooling, not app code, so any coder can do it — recommend `shell` subagent or a general coder):

```
Read docs/plans/production_global_achievements_redesign_plan.md Appendix A.

Tasks:
1. Install dev deps at repo root: pnpm add -D -w @resvg/resvg-js @supabase/supabase-js
2. Create scripts/generate-achievement-badges.mjs using the exact script from Appendix A.3
3. Add "badges:generate" and "badges:upload" to root package.json scripts
4. Create apps/mobile-app/assets/achievement-badges/.gitkeep and ensure the folder is tracked (or commit the generated PNGs — user preference)
5. Run: pnpm badges:generate
6. Visually sanity-check 3 random PNGs (e.g. sessions_bronze, drops_gold, distance_diamond)
7. Do NOT run --upload without explicit user approval; it writes to production storage.

Report back: (a) path of generated files, (b) any rendering issues, (c) proposed tweaks to gradients/icon paths if output doesn't look premium on first pass.
```

---

**End of Plan**
