# Feature: Production Sport Avatar Catalog — Replace Emoji Avatars

**Status:** Planning
**Owner:** Architect
**Target Release:** Before Vortex pilot launch
**Created:** 2026-04-23
**Dependencies:**
- Existing `profiles.avatar_url TEXT` column (already supports both HTTP URLs and emoji strings)
- Existing render logic in `apps/mobile-app/app/leaderboard.tsx`, `apps/mobile-app/app/user/[id].tsx`, etc. (already triple-branched: URL → `<Image>`, emoji → `<Text>`, initial → `<Text>`)
- `@resvg/resvg-js` (already added during badge generator plan — Appendix A of `production_global_achievements_redesign_plan.md`)
- Node >=18 (fetch is native)

---

## Context

### Problem
Current `profiles.avatar_url` stores either an HTTP URL or a raw emoji character. The onboarding flow (`apps/mobile-app/app/(onboarding)/avatar.tsx`) presents 12 emoji: `🔥 💧 ⚡ 🦁 🐺 🦅 🐯 🦈 💎 👑 🏔️ 🌊`. On a premium dark-glass leaderboard these emoji look amateur, collide with the SweatDrop brand language, and are the #1 visual element that breaks premium positioning pre-Vortex.

### Why "Sport Avatar Catalog" (Option A)
Chosen over Dicebear generative humans because:
1. Fitness app — users should see **sport identity**, not generic portraits.
2. Icon-based avatars read far better at leaderboard avatar sizes (40–60 px) than detailed faces.
3. Reuses the exact same SVG + resvg pipeline as tier badges — one visual language across the app.
4. Pure on-brand: SweatDrop color palette + sport icon = the leaderboard instantly "feels like" a fitness product.
5. Forward-compatible: adding a new sport later is one entry in the script.

### Design language (matches tier-badge aesthetic)
- **Canvas:** 512×512 PNG, transparent.
- **Outer ring:** solid circular band (64 px thick) filled with a 2-stop linear gradient per color scheme (brand-hue dark → brand-hue light).
- **Inner disk:** dark glass `rgba(18,20,30,0.94)` + subtle white→transparent linear gradient highlight.
- **Activity icon:** 220×220 px centered, stroke-based, near-white.
- **SweatDrop drop mark:** 20 px cyan drop watermark top-center (opacity 0.55), consistent with badges.
- **No tier label** (key difference vs badges) — avatars are about sport preference, not rank.

### Catalog scope
**12 activities × 4 color schemes = 48 unique avatars.**

**Activities** (final list; Iconify icon references chosen for clarity + consistency):

| # | Activity code    | Iconify ref                               | Human-friendly label |
|---|------------------|-------------------------------------------|----------------------|
| 1 | `weightlifting`  | `healthicons:exercise-weights`            | Weights              |
| 2 | `running`        | `mdi:run-fast`                            | Running              |
| 3 | `yoga`           | `mdi:yoga`                                | Yoga                 |
| 4 | `cycling`        | `fa6-solid:person-biking`                 | Cycling              |
| 5 | `rowing`         | `mdi:rowing`                              | Rowing               |
| 6 | `boxing`         | `mdi:boxing-glove`                        | Boxing               |
| 7 | `swimming`       | `fa6-solid:person-swimming`               | Swimming             |
| 8 | `hiit`           | `tabler:jump-rope`                        | HIIT                 |
| 9 | `climbing`       | `fa6-solid:person-walking-with-cane`¹     | Climbing             |
| 10| `stretching`     | `tabler:stretching`                       | Stretching           |
| 11| `pilates`        | `healthicons:stretching`                  | Pilates              |
| 12| `crossfit`       | `mdi:kettlebell`                          | CrossFit             |

¹ Climbing icon: if the chosen Iconify ref doesn't render well, fall back to `lucide:mountain` or `mdi:terrain`. Decision made at script review time (Phase 2, Step 2.3).

**Color schemes** (name → gradient stops → selector label):

| Code      | Dark stop | Light stop | Selector label |
|-----------|-----------|------------|----------------|
| `cyan`    | `#003E66` | `#00E5FF`  | Electric       |
| `amber`   | `#6B3A00` | `#FFB547`  | Warm           |
| `emerald` | `#064E3B` | `#4ADE80`  | Growth         |
| `crimson` | `#6B0F1A` | `#F87171`  | Power          |

### Catalog file naming
`{activity}_{color}.png` → 48 files, e.g. `weightlifting_cyan.png`, `yoga_emerald.png`.

Public URL format (same pattern as badges):
```
https://{supabase_project}.supabase.co/storage/v1/object/public/user-avatars/{activity}_{color}.png
```

---

## Execution Plan

### Phase 1 — Storage Bucket & RLS (supabase-dba)
### Phase 2 — Asset Generation Script (shell / generalPurpose coder)
### Phase 3 — Mobile Onboarding Refactor (mobile-coder)
### Phase 4 — Backfill Existing Emoji Avatars (supabase-dba)

### (No admin-panel phase required — see next section)

---

## Admin Panel — No Changes Required

**Verified:** `apps/admin-panel/components/MemberAvatar.tsx` + `apps/admin-panel/lib/utils/avatar-display.ts` already implement the identical triple-branch render logic as mobile:
1. Empty `avatar_url` → username initial placeholder
2. `avatar_url` matching `http://` / `https://` / `data:image/` → `<img>` tag
3. Otherwise → `<span>` emoji fallback

All 20+ admin surfaces that display avatars (`MemberList`, `MemberDetailView`, `TeamList`, `LeaderboardHistory`, `RetentionDashboard`, `CheckinStatsModule`, `TopPerformersWidget`, `ActiveWorkoutsList`, `MachineFloorGrid`, `MachineGrid`, `Sidebar`, `RedemptionsManager`, `UnverifiedCheckinsModal`, `ActivityLog`, `MemberIdentityVerifyDrawer`, `AnalyticsSection`, `ArenaDetail`, `DeskShell`, `EngagementCampaignManager`, `ChallengesList`, etc.) route through the single `<MemberAvatar />` component.

**Net effect:** once Phase 4 backfill replaces emoji strings with HTTP URLs in `profiles.avatar_url`, every admin panel surface instantly renders Sport Avatars with zero code change.

**Grep-verified absence:** no admin-panel file contains a hardcoded emoji-picker array (`AVATARS = [...]` / `EMOJI_AVATARS`). Admins don't pick avatars for members — that action is mobile-only.

### Optional post-launch cleanups (not blocking Vortex)
1. **Remove the emoji branch** from `MemberAvatar.tsx` once Phase 4 is stable. The branch becomes unreachable after backfill; removing it tightens the type surface. 5 minutes of work, pure cosmetic.
2. **Add a superadmin "Reset avatar" button** in `MemberDetailView.tsx` that sets `avatar_url = defaultAvatarFor(user_id)` — mirrors the mobile helper. Only needed if moderation concerns arise (inappropriate avatar) or for onboarding UX improvements.

---

## Phase 1 — Storage Bucket & RLS (supabase-dba)

### Step 1.1 — Create `user-avatars` bucket
Mirror the `global-achievement-badges` pattern exactly (migration `20250128000006_create_global_achievement_badges_bucket.sql`).

**Migration file:** `backend/supabase/migrations/20260424000000_create_user_avatars_storage_bucket.sql`

**Changes:**
- Insert row into `storage.buckets` with:
  - `id = 'user-avatars'`
  - `name = 'user-avatars'`
  - `public = true` (avatar URLs must be publicly readable — they appear on leaderboards and friend lists)
  - `file_size_limit = 524288` (512 KB per file; each avatar is ~30–60 KB)
  - `allowed_mime_types = ARRAY['image/png', 'image/webp', 'image/svg+xml']`
- RLS policies:
  - **SELECT — public read:** `USING (bucket_id = 'user-avatars')` allows anon/authenticated read.
  - **INSERT / UPDATE / DELETE — superadmin only:** matching `EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin')` predicate.
- Use `ON CONFLICT DO NOTHING` on the bucket insert so the migration is idempotent.

> **Note to supabase-dba:** the bucket may need to be created manually via the Supabase Dashboard if local CLI bucket creation via SQL fails (Supabase sometimes requires Dashboard creation + migration-only policies). The existing badge bucket migration documents this caveat — follow the same approach and log the final steps in `MIGRATION_NOTES.md`.

### Phase 1 Deliverables
- [ ] `20260424000000_create_user_avatars_storage_bucket.sql`
- [ ] Confirm bucket visible at Supabase Dashboard → Storage → `user-avatars`
- [ ] `MIGRATION_NOTES.md` entry [2026-04-24]

### Phase 1 Testing
1. `supabase db reset` applies migration without error.
2. Manually upload any PNG as superadmin → returns 200.
3. Fetch public URL from an unauthenticated browser → returns 200 + `Content-Type: image/png`.
4. Attempt upload as `role='user'` → returns 403/401.

---

## Phase 2 — Asset Generation Script (shell / generalPurpose)

**Owner:** shell subagent or any coder — this is dev tooling, not app code.

### Step 2.1 — Install dev dependencies

Script reuses `@resvg/resvg-js` and `@supabase/supabase-js` already added in the badge plan. Only additional dep:
```bash
# Root, dev only. No runtime cost.
# (Optional — can also fetch SVGs over plain fetch() without any lib)
# If preferred, use @iconify/utils; but pure fetch keeps deps minimal.
```

No new deps required if we use the native Node `fetch` to pull Iconify SVGs at generation time. This is the chosen approach.

### Step 2.2 — Create the generator script

**File:** `scripts/generate-user-avatars.mjs`

See **Appendix A** for the complete, ready-to-run script.

### Step 2.3 — Icon review checkpoint

**After** first generation run, human review the 48 PNGs for readability:
- Each activity icon must be clearly distinguishable at 40 px (leaderboard list size).
- Icons with too much internal detail (e.g. `climbing` if it comes back busy) get swapped at this step — reviewer changes the Iconify ref in `ACTIVITIES` and re-runs.
- No design pass needed — the SVG template is fixed; only icon refs change.

### Step 2.4 — Add npm scripts

Add to root `package.json`:
```json
"scripts": {
  "avatars:generate": "node scripts/generate-user-avatars.mjs",
  "avatars:upload":   "node scripts/generate-user-avatars.mjs --upload"
}
```

### Step 2.5 — Upload to production

```bash
SUPABASE_URL=https://<project>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service_role_key> \
  pnpm avatars:upload
```

**Do NOT run `--upload` before explicit user approval** — this writes to production storage.

### Phase 2 Deliverables
- [ ] `scripts/generate-user-avatars.mjs`
- [ ] `apps/mobile-app/assets/user-avatars/` with 48 reviewed PNGs (committed to repo for PR visibility)
- [ ] 48 files live at `https://{project}.supabase.co/storage/v1/object/public/user-avatars/*.png`
- [ ] `pnpm avatars:generate | avatars:upload` entries in root `package.json`

### Phase 2 Testing
1. `pnpm avatars:generate` completes in <10 s with zero network errors.
2. Visual check 4 random PNGs (one per color scheme) in macOS Preview — icon is centered, clear, color scheme matches spec.
3. After upload, each of the 48 public URLs returns HTTP 200 with `Content-Type: image/png`.
4. File sizes are all under 100 KB each (quick sanity check for SVG rasterization quality).

---

## Phase 3 — Mobile Onboarding Refactor (mobile-coder)

**Workspace:** `apps/mobile-app/`

### Scope
- Replace the emoji grid in `apps/mobile-app/app/(onboarding)/avatar.tsx` with a URL-based image catalog grid.
- Keep the same page in **edit mode** (accessed via Settings → Change Avatar — `?edit=true`). No new screen.
- Leverage the existing render branches in leaderboard/podium/profile — **no changes needed** to those files; once `avatar_url` is an HTTP URL, existing `startsWith('http')` branch renders it.

### Step 3.1 — Define the avatar catalog as a constant

**File:** `apps/mobile-app/lib/avatars.ts` (new)

**Content shape:**
```ts
export const AVATAR_BUCKET_BASE_URL =
  `${process.env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/public/user-avatars`;

export const AVATAR_ACTIVITIES = [
  'weightlifting', 'running', 'yoga', 'cycling', 'rowing', 'boxing',
  'swimming', 'hiit', 'climbing', 'stretching', 'pilates', 'crossfit',
] as const;

export const AVATAR_COLORS = ['cyan', 'amber', 'emerald', 'crimson'] as const;

export type AvatarActivity = typeof AVATAR_ACTIVITIES[number];
export type AvatarColor    = typeof AVATAR_COLORS[number];

export function avatarUrl(activity: AvatarActivity, color: AvatarColor): string {
  return `${AVATAR_BUCKET_BASE_URL}/${activity}_${color}.png`;
}

/**
 * Deterministic default avatar for users who skip the picker.
 * Uses a simple FNV-1a hash over user_id so the same user always gets
 * the same avatar across devices.
 */
export function defaultAvatarFor(userId: string): string {
  let h = 2166136261;
  for (let i = 0; i < userId.length; i++) {
    h ^= userId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const activity = AVATAR_ACTIVITIES[Math.abs(h) % AVATAR_ACTIVITIES.length];
  const color    = AVATAR_COLORS[Math.abs(h >> 8) % AVATAR_COLORS.length];
  return avatarUrl(activity, color);
}
```

Adhere to the mobile design system: **do not hardcode** the bucket URL — read `EXPO_PUBLIC_SUPABASE_URL` from env. Test both dev and prod.

### Step 3.2 — Redesign the onboarding avatar picker

**File:** `apps/mobile-app/app/(onboarding)/avatar.tsx`

**New UX:**

1. **Preview ring (unchanged):** 80 px ring at the top shows the selected avatar as `<Image>` (switch from `<Text>` emoji to `<Image source={{ uri }}>`).
2. **Sport filter chips (NEW):** horizontal scrollable `SliderTabs` row of 12 activity chips + "All" chip. Selected chip filters the grid below.
3. **Catalog grid (NEW):** 4-column grid (≈72 px tiles) of tappable image tiles. When "All" chip is active, shows all 48 avatars sorted activity-then-color. When a specific activity is active, shows just its 4 color variants (one row).
4. **Color hint (NEW, subtle):** selected tile gets a 2 px branded border + glow (matches existing `emojiButtonSelected` style, reused).
5. **Skip button** preserved.
6. **Continue button** preserved — writes the selected URL to `profiles.avatar_url` via existing `updateProfile` action.

**Design system rules:**
- Preview ring border: `branding.primary` when selected, `rgba(255,255,255,0.10)` otherwise.
- Glassmorphic chip row: `BlurView intensity={40} tint="dark"` + `hexToRgba(branding.primary, 0.12)` border.
- Stagger animation: `FadeInDown.delay(100 + index * 20)` on grid tiles.
- Use `expo-image` `<Image>` with `transition={200}` and `cachePolicy="memory-disk"` (catalog is static — cache hard).

### Step 3.3 — Update i18n strings

**Files:**
- `apps/mobile-app/locales/en/onboarding.json`
- `apps/mobile-app/locales/sr/onboarding.json`

**New keys under `avatar.*`:**
```json
{
  "avatar": {
    "title": "Choose your sport",
    "subtitle": "Pick an avatar that represents how you sweat.",
    "filterAll": "All",
    "activityWeightlifting": "Weights",
    "activityRunning": "Running",
    "activityYoga": "Yoga",
    "activityCycling": "Cycling",
    "activityRowing": "Rowing",
    "activityBoxing": "Boxing",
    "activitySwimming": "Swimming",
    "activityHiit": "HIIT",
    "activityClimbing": "Climbing",
    "activityStretching": "Stretching",
    "activityPilates": "Pilates",
    "activityCrossfit": "CrossFit"
  }
}
```

Provide matching Serbian translations. Keep any existing `avatar.title` / `avatar.subtitle` keys; these may be overwritten or adjusted.

### Step 3.4 — Preload catalog images

In `apps/mobile-app/lib/avatars.ts` export:
```ts
export function allAvatarUrls(): string[] {
  return AVATAR_ACTIVITIES.flatMap(a => AVATAR_COLORS.map(c => avatarUrl(a, c)));
}
```

Call `Image.prefetch` on mount of the avatar picker screen to preheat the disk cache — first impression is instant rendering of all 48 tiles.

### Step 3.5 — Fallback render branch (defensive)

The existing triple-branch in leaderboard/podium/profile (`URL → Image`, `emoji → Text`, `initial → Text`) **stays untouched**. Confirm by grepping the codebase — do NOT remove the emoji branch until Phase 4 backfill is complete and verified. It's the safety net for any profile whose `avatar_url` didn't get migrated.

### Phase 3 Deliverables
- [ ] `apps/mobile-app/lib/avatars.ts` (new helper module)
- [ ] Refactored `apps/mobile-app/app/(onboarding)/avatar.tsx` (emoji grid → image catalog grid with sport chips)
- [ ] Updated `apps/mobile-app/locales/en/onboarding.json` + `sr/onboarding.json`
- [ ] No changes to any other file (leaderboard/podium/profile already handle URL case)

### Phase 3 Testing
1. Onboarding flow: sign up → reach avatar screen → see 12 sport chips + 4-column grid of image tiles. Tap tile → preview ring updates. Continue → profile saved with HTTP URL.
2. Edit mode: Settings → Change Avatar → same screen with `?edit=true`. Save button works, "Skip" hidden (existing behavior).
3. Leaderboard regression: confirm existing logged-in user with emoji avatar still renders (emoji branch). New test user with Sport Avatar renders `<Image>`.
4. Friend's profile (`apps/mobile-app/app/user/[id].tsx`) renders `<Image>` for URL-based avatars.
5. Visual QA: run on iOS simulator with "Electric" gym branding and "Warm" gym branding — preview ring color tracks branding correctly.
6. Offline test: with catalog preloaded once, go airplane mode → picker still shows tiles (disk cache).

---

## Phase 4 — Backfill Existing Emoji Avatars (supabase-dba)

**Trigger:** Only run after Phase 2 upload is confirmed (48 public URLs reachable).

### Step 4.1 — Deterministic backfill migration

**Migration file:** `backend/supabase/migrations/20260424000001_backfill_emoji_avatars_to_sport_catalog.sql`

**Logic:**
```sql
-- Map each profile whose avatar_url is NOT an HTTP URL (i.e. emoji, or NULL)
-- to a deterministic Sport Avatar URL derived from user_id hash.
-- This mirrors the JS defaultAvatarFor() function in apps/mobile-app/lib/avatars.ts
-- so the backend and client compute identical defaults for the same user_id.

WITH
  activities AS (
    SELECT UNNEST(ARRAY[
      'weightlifting','running','yoga','cycling','rowing','boxing',
      'swimming','hiit','climbing','stretching','pilates','crossfit'
    ]) AS name, generate_series(0, 11) AS idx
  ),
  colors AS (
    SELECT UNNEST(ARRAY['cyan','amber','emerald','crimson']) AS name,
           generate_series(0, 3) AS idx
  ),
  bucket AS (
    SELECT
      -- Read from Supabase env — hardcode production URL here,
      -- or read from a settings table if one exists.
      current_setting('app.supabase_public_bucket_base', true) AS base
  )
UPDATE public.profiles p
SET
  avatar_url = (SELECT base FROM bucket) || '/user-avatars/' ||
               (SELECT name FROM activities WHERE idx = (abs(hashtext(p.id::text)) % 12)) ||
               '_' ||
               (SELECT name FROM colors WHERE idx = ((abs(hashtext(p.id::text)) / 12) % 4)) ||
               '-badge.png',
  updated_at = NOW()
WHERE
  p.avatar_url IS NULL
  OR p.avatar_url !~ '^https?://';
```

> **supabase-dba note:** The `app.supabase_public_bucket_base` GUC may not exist; the cleanest path is to **hardcode the production Supabase URL** directly in the migration (e.g. `'https://abcxyz.supabase.co/storage/v1/object/public'`). Confirm the exact project ref with the team before writing the migration.

> **Hash alignment:** PostgreSQL `hashtext` and the JS FNV-1a hash are NOT identical. That's OK — the migration only needs to produce *some* deterministic URL, and the client's JS `defaultAvatarFor()` only applies to brand-new users who haven't saved anything. Both are deterministic within their domain.

### Step 4.2 — Optional: superadmin nudge

Non-blocking for launch. After pilot stabilizes, add an in-app prompt: "Your avatar has been upgraded — tap to customize". Defer to post-launch.

### Phase 4 Deliverables
- [ ] `20260424000001_backfill_emoji_avatars_to_sport_catalog.sql`
- [ ] `MIGRATION_NOTES.md` entry with before/after row count
- [ ] Verification: `SELECT COUNT(*) FROM profiles WHERE avatar_url !~ '^https?://';` returns 0 after apply

### Phase 4 Testing
1. On a staging snapshot of production, dry-run the SELECT form of the UPDATE (i.e. `SELECT p.id, p.avatar_url, <new_url>`) for 10 sample rows. Open each new URL in browser — returns 200.
2. Apply migration. Run the COUNT verification query.
3. Log in on mobile as a pre-backfill user → leaderboard and profile show the new Sport Avatar instead of emoji.

---

## Cross-Phase Testing

1. **Full E2E on fresh DB:** `supabase db reset` → migration creates bucket → run `pnpm avatars:upload` → sign up new user → choose Yoga + Emerald → complete onboarding → appear on leaderboard with correct `<Image>`.
2. **Upgrade path:** Restore a staging DB snapshot with emoji avatars → apply Phase 4 backfill → 100% of users render Sport Avatars.
3. **Performance:** Leaderboard initial render time comparison (before vs after). Expect <100 ms regression (disk-cached PNGs).
4. **Accessibility:** VoiceOver on iOS reads "{activity} avatar" via `accessibilityLabel` on each tile.

---

## Rollout Order

1. Phase 1 (storage bucket migration) — deploy to production Supabase (off-peak).
2. Phase 2 (generator script) — run locally, visually review 48 PNGs, upload to production bucket.
3. Phase 3 (mobile refactor) — ship via OTA or EAS build.
4. Phase 4 (backfill) — apply after Phase 3 is live so backfilled users immediately see their new avatar on first app launch.

**Rollback paths:**
- Phase 3 bug: revert the `avatar.tsx` commit; emoji grid returns (Sport Avatars still in bucket, harmless).
- Phase 4 concern: `UPDATE profiles SET avatar_url = NULL WHERE avatar_url LIKE '%user-avatars%';` reverts to "no avatar → username initial" (safe default). Not reversible to original emoji unless a `profiles_avatar_url_backup` column is kept — see Step 4.1 optional snapshot.

**Optional safety (recommended):** In Phase 4, `ALTER TABLE profiles ADD COLUMN avatar_url_previous TEXT;` and `UPDATE ... SET avatar_url_previous = avatar_url` *before* the main UPDATE. Dropped in a later cleanup migration once the pilot is stable. Adds 10 minutes to the migration, gives a full rollback window.

---

## Agent Dispatch Prompts

### Prompt → supabase-dba (Phase 1)

```
Read docs/plans/production_sport_avatar_catalog_plan.md (Phase 1 only).

Create ONE migration:
  backend/supabase/migrations/20260424000000_create_user_avatars_storage_bucket.sql

Mirror the pattern from backend/supabase/migrations/20250128000006_create_global_achievement_badges_bucket.sql:
  - INSERT into storage.buckets (id='user-avatars', public=true, file_size_limit=524288, allowed_mime_types=png/webp/svg)
    with ON CONFLICT DO NOTHING.
  - Four RLS policies on storage.objects scoped to bucket_id='user-avatars':
    • SELECT: anyone
    • INSERT/UPDATE/DELETE: superadmin only
  - COMMENT documenting purpose.

If the local CLI rejects the bucket insert, document in MIGRATION_NOTES.md that the
bucket must be created manually via Supabase Dashboard, and the migration applies
only the RLS policies (same caveat as the global-achievement-badges bucket).

Do NOT touch any other file. After applying:
  - Verify bucket visible in Supabase Dashboard → Storage
  - Add MIGRATION_NOTES.md entry dated [2026-04-24]
```

### Prompt → shell subagent (Phase 2)

```
Read docs/plans/production_sport_avatar_catalog_plan.md (Phase 2 + Appendix A).

Prerequisites:
  - @resvg/resvg-js and @supabase/supabase-js already installed as root dev deps
    (from the badge generator plan). If not, install at root with -D -w.
  - Phase 1 bucket is created.

Tasks:
1. Create scripts/generate-user-avatars.mjs using the exact content from Appendix A.
2. Create apps/mobile-app/assets/user-avatars/.gitkeep and ensure the folder is tracked.
3. Add the following scripts to the root package.json:
     "avatars:generate": "node scripts/generate-user-avatars.mjs"
     "avatars:upload":   "node scripts/generate-user-avatars.mjs --upload"
4. Run: pnpm avatars:generate
5. Open 4 random PNGs (one per color scheme) in Preview — check that icon is clear, centered, and color matches spec.
6. Report back: generated file paths, any icons that render poorly, proposed Iconify ref swaps.

Do NOT run --upload. Do NOT commit PNGs yet — await user approval after visual review.
```

### Prompt → mobile-coder (Phase 3)

```
Read docs/plans/production_sport_avatar_catalog_plan.md (Phase 3 only).

Prerequisites:
  - Phase 1 bucket exists.
  - Phase 2 completed: 48 PNGs uploaded to user-avatars bucket and reachable at
    {SUPABASE_URL}/storage/v1/object/public/user-avatars/*.png.

Tasks:
1. Create apps/mobile-app/lib/avatars.ts with:
   - AVATAR_BUCKET_BASE_URL (reads EXPO_PUBLIC_SUPABASE_URL)
   - AVATAR_ACTIVITIES + AVATAR_COLORS constants
   - avatarUrl(activity, color) helper
   - defaultAvatarFor(userId) deterministic helper (FNV-1a hash per Plan Step 3.1)
   - allAvatarUrls() for prefetching

2. Refactor apps/mobile-app/app/(onboarding)/avatar.tsx:
   - Remove the emoji AVATARS constant.
   - Replace the 3×4 emoji grid with a two-row layout:
     a) Horizontal SliderTabs (or chip row) with "All" + 12 activity chips.
     b) 4-column grid of image tiles below, filtered by the active chip.
   - Preview ring now renders <Image source={{ uri: selected }}> when selected is an HTTP URL.
   - Keep Skip + Continue buttons and edit-mode (?edit=true) behavior unchanged.
   - Use expo-image <Image> with transition={200} and cachePolicy="memory-disk".
   - Call Image.prefetch on mount with allAvatarUrls() to preheat cache.
   - Apply existing design-system rules: useBranding colors, BlurView card surfaces,
     hexToRgba borders, FadeInDown staggered entrance.

3. Update i18n (apps/mobile-app/locales/en/onboarding.json + sr/onboarding.json):
   - Add all keys from Plan Step 3.3 under `avatar.*`.

4. Do NOT change leaderboard, podium, profile, or any render site — the existing
   URL-branch already handles HTTP avatars. Do NOT delete the emoji render branch
   (it's the safety net until Phase 4 backfill runs).

Run the Phase 3 Testing checklist on iOS simulator with at least two gym brandings.
Report any rendering issues.
```

### Prompt → supabase-dba (Phase 4 — run AFTER Phase 2 upload is live)

```
Read docs/plans/production_sport_avatar_catalog_plan.md (Phase 4 only).

Prerequisite: 48 PNGs uploaded and publicly reachable in production user-avatars bucket.

Tasks:
1. Verify the exact production Supabase URL for the public bucket base.
2. (Recommended) Add a temporary backup column before the UPDATE:
     ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url_previous TEXT;
     UPDATE public.profiles SET avatar_url_previous = avatar_url
       WHERE (avatar_url IS NULL OR avatar_url !~ '^https?://')
         AND avatar_url_previous IS NULL;
3. Create migration backend/supabase/migrations/20260424000001_backfill_emoji_avatars_to_sport_catalog.sql.
   Use the deterministic hash-based UPDATE from Plan Step 4.1. Hardcode the production
   Supabase URL directly. Restrict WHERE to rows where avatar_url is NULL or not http(s).

4. Test first on staging snapshot: run the SELECT form for 10 sample rows, open the
   computed URLs in a browser, confirm 200 + image.

5. Apply in production. Run:
     SELECT COUNT(*) FROM profiles WHERE avatar_url !~ '^https?://';
   Expect 0.

6. Update MIGRATION_NOTES.md with before/after counts.

Do NOT drop avatar_url_previous; it's our rollback window. A later cleanup
migration will drop it post-pilot.
```

---

## Appendix A — Generator Script

**File:** `scripts/generate-user-avatars.mjs`

```javascript
import { Resvg } from '@resvg/resvg-js';
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../apps/mobile-app/assets/user-avatars');
const SIZE = 512;
const BUCKET = 'user-avatars';

// ---------- Color schemes ----------
const COLORS = {
  cyan:    { dark: '#003E66', light: '#00E5FF', aura: '#00E5FF' },
  amber:   { dark: '#6B3A00', light: '#FFB547', aura: '#FFB547' },
  emerald: { dark: '#064E3B', light: '#4ADE80', aura: '#4ADE80' },
  crimson: { dark: '#6B0F1A', light: '#F87171', aura: '#F87171' },
};

// ---------- Activities (Iconify refs) ----------
const ACTIVITIES = {
  weightlifting: 'healthicons:exercise-weights',
  running:       'mdi:run-fast',
  yoga:          'mdi:yoga',
  cycling:       'fa6-solid:person-biking',
  rowing:        'mdi:rowing',
  boxing:        'mdi:boxing-glove',
  swimming:      'fa6-solid:person-swimming',
  hiit:          'tabler:jump-rope',
  climbing:      'fa6-solid:person-walking-with-cane',
  stretching:    'tabler:stretching',
  pilates:       'healthicons:stretching',
  crossfit:      'mdi:kettlebell',
};

// ---------- Fetch icon SVG body from Iconify ----------
// Returns the <path>/<g>/... inner markup of a 24x24 viewBox SVG.
async function fetchIconInner(ref) {
  const [pack, name] = ref.split(':');
  const url = `https://api.iconify.design/${pack}/${name}.svg?height=24`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Iconify fetch failed: ${ref} (${res.status})`);
  const svg = await res.text();
  // Strip outer <svg ...> wrapper, keep inner markup. Iconify returns a single <svg>.
  const inner = svg
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .trim();
  return inner;
}

// ---------- SVG template ----------
function renderSVG({ iconInner, color }) {
  const c = COLORS[color];
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <radialGradient id="aura" cx="50%" cy="50%" r="50%">
      <stop offset="0%"  stop-color="${c.aura}" stop-opacity="0.25"/>
      <stop offset="70%" stop-color="${c.aura}" stop-opacity="0.05"/>
      <stop offset="100%" stop-color="${c.aura}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="ring" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"   stop-color="${c.dark}"/>
      <stop offset="50%"  stop-color="${c.light}"/>
      <stop offset="100%" stop-color="${c.dark}"/>
    </linearGradient>
    <linearGradient id="glass" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%"   stop-color="#FFFFFF" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="6"/>
    </filter>
  </defs>

  <!-- Aura -->
  <circle cx="256" cy="256" r="256" fill="url(#aura)"/>

  <!-- Drop shadow -->
  <circle cx="256" cy="268" r="224" fill="#000" opacity="0.45" filter="url(#softShadow)"/>

  <!-- Outer color ring -->
  <circle cx="256" cy="256" r="224" fill="url(#ring)"/>
  <circle cx="256" cy="256" r="224" fill="none" stroke="#000" stroke-opacity="0.25" stroke-width="2"/>

  <!-- Inner glass disk -->
  <circle cx="256" cy="256" r="176" fill="rgba(18,20,30,0.94)"/>
  <circle cx="256" cy="256" r="176" fill="url(#glass)"/>
  <circle cx="256" cy="256" r="176" fill="none" stroke="${c.aura}" stroke-opacity="0.35" stroke-width="2"/>

  <!-- Activity icon (centered, 24x24 viewBox scaled to 220x220) -->
  <g transform="translate(146,146) scale(9.1667)" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="0.05" stroke-linecap="round" stroke-linejoin="round">
    ${iconInner}
  </g>

  <!-- SweatDrop mark -->
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

  // Fetch all 12 icon inners once (cached in memory for the 4 color variants)
  console.log('Fetching 12 icon SVGs from Iconify…');
  const iconCache = {};
  for (const [activity, ref] of Object.entries(ACTIVITIES)) {
    iconCache[activity] = await fetchIconInner(ref);
    console.log(`  ✓ ${activity} (${ref})`);
  }

  let generated = 0;
  for (const [activity, iconInner] of Object.entries(iconCache)) {
    for (const color of Object.keys(COLORS)) {
      const svg = renderSVG({ iconInner, color });
      const png = new Resvg(svg, { fitTo: { mode: 'width', value: SIZE } }).render().asPng();
      const filename = `${activity}_${color}.png`;
      const filepath = path.join(OUT_DIR, filename);
      fs.writeFileSync(filepath, png);
      generated++;
      console.log(`✓ ${filename}`);

      if (shouldUpload && supabase) {
        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(filename, png, { contentType: 'image/png', upsert: true });
        if (error) console.error(`  ↳ upload failed: ${error.message}`);
        else console.log(`  ↳ uploaded to ${BUCKET}/${filename}`);
      }
    }
  }
  console.log(`\nDone. ${generated} avatars in ${OUT_DIR}`);
}

main().catch(err => { console.error(err); process.exit(1); });
```

### Usage
```bash
# Local generate only
pnpm avatars:generate

# Generate + upload to production bucket
SUPABASE_URL=https://<project>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service_role_key> \
  pnpm avatars:upload
```

### Script design notes
- **Iconify fetch is one-time.** 12 icons × ~1 KB = 12 KB over the wire. Cached in-memory and reused across 4 color variants per activity. Total script runtime: ~5–8 seconds.
- **Icon fill = white.** Most Iconify icons use `currentColor` for fill; the SVG template wraps them in a `<g fill="#FFFFFF">`, which resolves `currentColor` inheritance for any stroke-based or fill-based icon. Mixed-mode icons (some stroked, some filled) render cleanly.
- **Icon fallback:** if `fetchIconInner` fails for any activity, the script throws and exits early — no silent half-catalog. Safer than producing a broken set.
- **Script is idempotent:** `upsert: true` on upload; `writeFileSync` overwrites. Safe to re-run at will.

---

## Open Questions / Assumptions

1. **Icon selection for `climbing` and `pilates`:** the chosen Iconify refs are best-effort. Reviewer confirms during Phase 2 Step 2.3 whether they look right; if not, swap to alternatives (`lucide:mountain`, `game-icons:climbing-rope`, `mdi:yoga`, etc.) and re-run.
2. **Color scheme names for users:** the plan proposes "Electric / Warm / Growth / Power" as UI-facing chip labels. Translation team may prefer different labels. Translations in Phase 3 Step 3.3 use the chip labels — adjust at review time.
3. **Backfill strategy vs opt-in prompt:** Phase 4 forces a backfill. An alternative is to keep emoji avatars for existing users and only apply Sport Avatars to new signups. The plan recommends backfill for premium consistency across all users at pilot launch; reversible via `avatar_url_previous`.
4. **Avatar upload from user's camera:** out of scope. Can be added later as a superadmin-gated feature — `user-avatars` bucket policy would need a per-user INSERT policy, plus NSFW moderation pipeline. Not needed for Vortex launch.

---

**End of Plan**
