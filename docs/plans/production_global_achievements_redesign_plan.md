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
- **Option B (scripted):** Add a one-off Node script in `scripts/upload-achievement-badges.mjs` that reads from `assets/achievement-badges/` and calls `supabase.storage.from('global-achievement-badges').upload()` using the service-role key. Document the script in `SCRIPTS.md`.

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

**End of Plan**
