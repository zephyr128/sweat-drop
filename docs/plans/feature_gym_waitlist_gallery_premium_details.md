# Feature: Gym Waitlist, Gallery & Premium Gym Details

**Created:** 2026-03-31
**Status:** Plan Ready
**Priority:** High (App Store launch polish)

---

## Context

Three interconnected improvements to the gym experience:

1. **Gym Waitlist** — The "Coming Soon" card at the bottom of the gym list (onboarding + home screen) currently does nothing. Users should be able to submit their gym name/city so we can track demand. Superadmins should see these requests in the admin panel.

2. **Gym Working Hours (Admin)** — The `working_hours` JSONB column exists on `gyms` (added in migration `20260329000001`) but there is **no admin UI** to edit it. Gym owners/admins need a form to set Mon–Sun open/close times.

3. **Gym Gallery** — Gym owners should be able to upload multiple photos of their gym. These images serve as promotional content displayed in the mobile app's gym detail screen.

4. **Premium Gym Detail Screen** — Redesign `gym-detail.tsx` with a parallax image gallery header, richer layout, and all gym info presented in a premium way.

---

## Dependencies

- Migration `20260329000001` already added: `description`, `working_hours`, `phone`, `email`, `website`, `instagram`, `latitude`, `longitude`, `is_founding_partner` to `gyms`
- Storage bucket `images` exists (manual creation; RLS in `20240101000036`)
- `owner_branding` table exists with `logo_url`, `background_url`, `primary_color`
- Mobile `Gym` interface in `useGymStore.ts` already has `working_hours`, `description`, contact fields

---

## Execution Plan

---

### Step 1: Database Migration — `gym_waitlist` table + `gym_gallery` table (supabase-dba)

**File:** `backend/supabase/migrations/YYYYMMDDHHMMSS_gym_waitlist_and_gallery.sql`

#### 1a. `gym_waitlist` table

```sql
CREATE TABLE public.gym_waitlist (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  gym_name TEXT NOT NULL,
  city TEXT,
  country TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'contacted', 'onboarded', 'dismissed')),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.gym_waitlist ENABLE ROW LEVEL SECURITY;
```

**RLS Policies:**
- `authenticated` users can INSERT (own `user_id = auth.uid()`)
- `authenticated` users can SELECT own rows (`user_id = auth.uid()`)
- Superadmins can SELECT/UPDATE all rows (via `gym_staff` role check or `profiles.role = 'superadmin'`)

**Indexes:**
- `idx_gym_waitlist_status` on `status`
- `idx_gym_waitlist_user_id` on `user_id`

#### 1b. `gym_gallery` table

```sql
CREATE TABLE public.gym_gallery (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  gym_id UUID NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  caption TEXT,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.gym_gallery ENABLE ROW LEVEL SECURITY;
```

**RLS Policies:**
- Anyone authenticated can SELECT (gallery is public promo content)
- Gym owners / gym_admins for the gym can INSERT/UPDATE/DELETE
- Superadmins can manage all

**Indexes:**
- `idx_gym_gallery_gym_id` on `gym_id`
- `idx_gym_gallery_sort_order` on `(gym_id, sort_order)`

#### 1c. Storage bucket for gym gallery

Create `gym-gallery` storage bucket (public, 10MB limit, image MIME types).
- Or reuse the existing `images` bucket with folder `gym-gallery/{gym_id}/`

**RLS on storage.objects:**
- Authenticated users can SELECT (read gallery images)
- Gym owners/admins can INSERT/UPDATE/DELETE for their gym's folder

#### 1d. Working hours admin — no migration needed

The `working_hours` JSONB column already exists on `gyms`. No schema changes needed, only admin UI.

---

### Step 2: Admin Panel — Working Hours Editor (admin-coder)

**Workspace:** `apps/admin-panel/`

#### 2a. Working Hours Form Component

**File:** `apps/admin-panel/components/forms/WorkingHoursForm.tsx`

A form component that edits `gyms.working_hours` JSONB.

**UI Spec:**
- 7-row grid: Mon–Sun
- Each row: day label, "Open" time input, "Close" time input, "Closed" toggle
- When "Closed" is toggled, the row is grayed out and the day is omitted from the JSON
- Time inputs: simple `<input type="time">` or select dropdowns (HH:MM format, 24h)
- Save button at bottom

**Data Shape (existing):**
```typescript
type GymWorkingHours = {
  mon?: { open: string; close: string };
  tue?: { open: string; close: string };
  wed?: { open: string; close: string };
  thu?: { open: string; close: string };
  fri?: { open: string; close: string };
  sat?: { open: string; close: string };
  sun?: { open: string; close: string };
};
```

**Integration:**
- Add as a new section/tab in `GymSetupTabs.tsx` (alongside General, Location & Check-in, Branding)
- Or add directly to the General tab below the address fields
- Server action: `updateGymWorkingHours(gymId, workingHours)` → `supabase.from('gyms').update({ working_hours }).eq('id', gymId)`

#### 2b. Gym Gallery Manager

**File:** `apps/admin-panel/components/modules/GymGalleryManager.tsx`

**UI Spec:**
- Grid of thumbnails (uploaded images) with drag-to-reorder (sort_order)
- "Add Photo" button that opens file picker
- Each thumbnail has: delete (X) button, optional caption edit
- Max 10 images per gym
- Upload to Supabase Storage (`gym-gallery/{gym_id}/` folder in `images` bucket, or dedicated `gym-gallery` bucket)
- Uses existing `uploadFile` from `lib/utils/storage.ts`

**Integration:**
- Add as a new tab "Gallery" in `GymSetupTabs.tsx`
- Or as a section on the gym settings page
- Queries `gym_gallery` table for current images
- On upload: insert into `gym_gallery`, upload file to storage
- On delete: delete from `gym_gallery`, delete file from storage
- On reorder: update `sort_order` values

---

### Step 3: Admin Panel — Gym Waitlist Dashboard (admin-coder)

**Workspace:** `apps/admin-panel/`

#### 3a. Superadmin Waitlist Page

**File:** `apps/admin-panel/app/dashboard/super/waitlist/page.tsx`

**UI Spec:**
- Table/list of all waitlist submissions
- Columns: gym name, city, country, user email, notes, status, submitted date
- Status filter tabs: All | Pending | Contacted | Onboarded | Dismissed
- Click a row → expand or modal showing full details
- Status update dropdown (pending → contacted → onboarded / dismissed)
- Optional: "Export CSV" for the list
- Badge count on navigation showing pending requests

**Data:**
- Query `gym_waitlist` joined with `profiles` (for user email/name)
- Server action: `updateWaitlistStatus(id, status)`

#### 3b. Navigation Entry

- Add "Waitlist" link to the superadmin navigation/sidebar (under `/dashboard/super/`)
- Show pending count badge

---

### Step 4: Mobile App — Waitlist Request Flow (mobile-coder)

**Workspace:** `apps/mobile-app/`

#### 4a. "Suggest Your Gym" Bottom Sheet / Modal

Replace the static "Coming Soon" card with an interactive card that opens a bottom sheet or modal.

**Card Update (both locations):**

1. **Onboarding** (`app/(onboarding)/home-gym.tsx`):
   - Replace static `<View>` with `<TouchableOpacity>` wrapping the "Coming Soon" card
   - Change icon to `add-circle` (filled) or `business-outline`
   - Change copy: "Don't see your gym?" / "Suggest a gym and we'll work to bring SweatDrop there"
   - `onPress` → open bottom sheet

2. **Home screen** (`app/home.tsx`):
   - Same treatment for the trailing placeholder card in the no-gym horizontal list
   - Change `notYourGym` copy and make it tappable → open same bottom sheet

**Bottom Sheet UI:**
- Glassmorphic design (BlurView, dark background, branded accents)
- Fields:
  - Gym name (required, TextInput)
  - City (optional, TextInput)
  - Country (optional, TextInput — or auto-fill from user profile)
  - Notes / "Why should we come here?" (optional, multiline TextInput)
- "Submit" button (branded primary color)
- Success state: checkmark animation + "Thanks! We'll reach out when we expand there."
- Close button / swipe to dismiss

**Data Flow:**
- On submit: `supabase.from('gym_waitlist').insert({ user_id, gym_name, city, country, notes })`
- Check if user already submitted for same gym name → show "Already submitted" message
- No auth required to view the card, but INSERT requires session

#### 4b. Locale Updates

**Files:**
- `locales/en/onboarding.json` — update `homeGym.comingSoon`, `homeGym.comingSoonSub`; add `homeGym.suggestGym`, `homeGym.suggestGymSub`, `homeGym.gymNamePlaceholder`, `homeGym.cityPlaceholder`, `homeGym.notesPlaceholder`, `homeGym.submitSuggestion`, `homeGym.thankYou`, `homeGym.alreadySuggested`
- `locales/sr/onboarding.json` — Serbian translations
- `locales/en/home.json` — update `notYourGym`; add `suggestGym`, `suggestGymSub`
- `locales/sr/home.json` — Serbian translations

---

### Step 5: Mobile App — Premium Gym Detail Screen Redesign (mobile-coder)

**Workspace:** `apps/mobile-app/`

**File:** `apps/mobile-app/app/gym-detail.tsx` (rewrite)

This is the most complex step. The goal is a **premium, magazine-quality** gym profile page.

#### 5a. Parallax Gallery Header

**Behavior:**
- Full-width horizontal image carousel at the top (from `gym_gallery` images)
- Parallax scroll effect: as user scrolls down, the gallery moves up at a slower rate
- Page indicator dots at the bottom of the gallery
- If no gallery images, fall back to single `background_url` hero (existing behavior)
- Gallery height: ~300px on initial render, compresses to ~120px as user scrolls
- Smooth animated header transition using `Animated.ScrollView` `onScroll` event + `interpolate`

**Implementation:**
- Use `react-native-reanimated` `useAnimatedScrollHandler` + `useSharedValue`
- Gallery: horizontal `FlatList` inside the parallax container
- Each image: `expo-image` with `contentFit="cover"`, transition={300}
- Dots: small circles below gallery, active dot uses `brandColor`

#### 5b. Gym Identity Section (below gallery)

- Gym logo (overlapping the bottom of the gallery by ~30px, similar to current but refined)
- Gym name (large, bold, white)
- Badges row: founding partner badge, "Your Home Gym" badge, member count
- City / Address (tappable → Open in Maps)
- Today's hours pill: "Open now · Closes at 22:00" or "Closed · Opens Mon 06:00" (smart text)

#### 5c. Info Sections (scrollable below)

Each section is a glassmorphic card (existing pattern: `BlurView + dark bg + branded border`):

1. **About** — `gym.description` text, if available
2. **Working Hours** — Mon–Sun grid (existing, but refined):
   - Today's row highlighted with brand color
   - "Open now" / "Closed" status indicator at top
3. **Gallery** (inline) — If gallery has >1 image, show a 2×2 or 3-col mini-grid with "+N more" overlay on last tile → taps open fullscreen gallery viewer
4. **Location & Map** — Static map preview (existing), tappable "Open in Maps"
5. **Contact** — Phone, Instagram, Website (existing, keep)
6. **Available Rewards** — Top 4 rewards preview (existing, keep)

#### 5d. Sticky CTA

- "Set as Home Gym" button (existing, keep)
- If already home gym: show "Your Home Gym ✓" muted state

#### 5e. Fullscreen Gallery Viewer

**New file:** `apps/mobile-app/components/GalleryViewer.tsx`

- Modal that shows gallery images in a swipeable fullscreen view
- Page dots or counter "3/8"
- Pinch to zoom (optional, nice-to-have)
- Dark background, close button top-right
- Uses `expo-image` for performance

#### 5f. Data Loading

- Add query to `gym_gallery` table: `supabase.from('gym_gallery').select('*').eq('gym_id', gymId).order('sort_order')`
- Cache results in existing `gymCache` pattern
- Gallery images loaded lazily (only first 3–4 visible, rest load on scroll)

#### 5g. Locale Updates

**Files:**
- `locales/en/gymDetails.json` — add: `openNow`, `closedNow`, `opensAt`, `closesAt`, `gallery`, `viewAll`, `photos`
- `locales/sr/gymDetails.json` — Serbian translations

---

## Summary: Agent Assignment Matrix

| Step | Agent | Files | Priority |
|------|-------|-------|----------|
| **1** | supabase-dba | `backend/supabase/migrations/YYYYMMDD_gym_waitlist_and_gallery.sql` | P0 — Do first |
| **2** | admin-coder | `WorkingHoursForm.tsx`, `GymGalleryManager.tsx`, `GymSetupTabs.tsx` | P1 |
| **3** | admin-coder | `super/waitlist/page.tsx`, navigation update | P1 |
| **4** | mobile-coder | `home-gym.tsx`, `home.tsx`, waitlist bottom sheet, locales | P1 |
| **5** | mobile-coder | `gym-detail.tsx` (rewrite), `GalleryViewer.tsx`, locales | P2 (most complex) |

**Execution order:** 1 → (2, 3, 4 in parallel) → 5

Step 5 depends on Step 1 (needs `gym_gallery` table) and benefits from Step 2 being done (so gallery images exist to display).

---

## API Contracts

### gym_waitlist INSERT
```typescript
const { error } = await supabase.from('gym_waitlist').insert({
  user_id: session.user.id,
  gym_name: 'FitLife Gym',
  city: 'Belgrade',
  country: 'Serbia',
  notes: 'Great gym, lots of members interested in SweatDrop',
});
```

### gym_gallery SELECT
```typescript
const { data } = await supabase
  .from('gym_gallery')
  .select('id, image_url, sort_order, caption')
  .eq('gym_id', gymId)
  .order('sort_order', { ascending: true });
```

### gym_gallery INSERT (admin)
```typescript
const { error } = await supabase.from('gym_gallery').insert({
  gym_id: gymId,
  image_url: uploadedUrl,
  sort_order: nextSortOrder,
  caption: optionalCaption,
  uploaded_by: session.user.id,
});
```

### working_hours UPDATE (admin)
```typescript
const { error } = await supabase.from('gyms').update({
  working_hours: {
    mon: { open: '06:00', close: '22:00' },
    tue: { open: '06:00', close: '22:00' },
    // ...
    sun: null, // closed
  },
}).eq('id', gymId);
```

---

## Testing Requirements

### supabase-dba
- [ ] `gym_waitlist` RLS: authenticated user can insert own row, cannot read others
- [ ] `gym_waitlist` RLS: superadmin can read/update all
- [ ] `gym_gallery` RLS: anyone authenticated can read
- [ ] `gym_gallery` RLS: gym owner/admin can insert/delete for own gym
- [ ] Storage policies allow gallery uploads for gym admins

### admin-coder
- [ ] Working hours form saves correctly to `gyms.working_hours`
- [ ] Working hours form loads existing data on edit
- [ ] Gallery upload works, thumbnails display
- [ ] Gallery delete removes from storage and table
- [ ] Gallery reorder updates `sort_order`
- [ ] Waitlist page shows submissions, status update works
- [ ] Waitlist status filter tabs work

### mobile-coder
- [ ] "Suggest Your Gym" card is tappable in both onboarding and home
- [ ] Bottom sheet opens, fields validate, submit works
- [ ] Duplicate submission shows "already submitted" message
- [ ] Success state shows confirmation
- [ ] Parallax gallery scrolls smoothly (60fps on both iOS and Android)
- [ ] Gallery viewer opens on tap, swipe works
- [ ] "Open now" / "Closed" indicator is correct based on current time
- [ ] Gym detail loads gallery images from `gym_gallery`
- [ ] Fallback to `background_url` when no gallery images
- [ ] All new text has EN + SR translations
- [ ] Design follows glassmorphism + dynamic branding system

---

## Open Questions

1. **Gallery image limit:** 10 per gym? 20? Configurable per subscription plan?
2. **Waitlist notifications:** Should we email the user when their gym status changes to "contacted"?
3. **Waitlist dedup:** By user_id + gym_name? Or allow multiple submissions?
4. **Gallery moderation:** Should superadmin approve gallery images before they're visible?

---

**Plan ready for execution. Start with Step 1 (supabase-dba).**
