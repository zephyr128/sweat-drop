# App Store Launch UX Plan

**Date:** 2026-03-29  
**Context:** SweatDrop mobile app launching on App Store & Google Play. One partner gym: **Vortex**. For the first ~3 months, app is exclusively available at Vortex.

---

## Core Strategy: "Exclusive Early Access" Framing

The single-gym reality must feel like an **exclusive launch**, not an incomplete product. Vortex is the **founding partner gym**. Users are **early adopters**. Every screen communicates this confidently.

Key principles:
- Never apologize for having one gym — celebrate the exclusivity
- Give enough context that even non-Vortex users understand the value and don't leave bad reviews
- Make Vortex look premium (this is their advertisement)
- Set clear expectations before anyone gets confused

---

## User Personas

| Persona | Behavior | Goal |
|---------|----------|------|
| **Vortex Member** | Downloads app at the gym, likely told by staff | Set up home gym → start earning drops immediately |
| **Curious Browser** | Finds app on store, downloads to check it out | Understand the concept → maybe visit Vortex |
| **Wrong City** | Downloads app but lives far from Vortex | Understand it's not available near them → don't leave 1-star review |

---

## Complete User Flow (New Install → Home Screen)

### Step 1: Welcome Screen (REDESIGN)

**Current:** Simple logo + "Earn drops for every workout" + Get Started button.

**New:** Multi-slide onboarding carousel (3 slides, swipeable + auto-advance dots):

| Slide | Visual | Copy |
|-------|--------|------|
| 1 | SweatDrop logo with glow animation | **"Turn Sweat Into Rewards"** — Every rep counts. Earn drops for every workout and redeem them for real rewards at your gym. |
| 2 | Illustration: phone scanning QR on machine | **"How It Works"** — Scan the QR code on any machine → Train at your pace → Earn drops automatically → Redeem for rewards |
| 3 | Vortex hero image/branding with "Founding Partner" badge | **"Now Available at Vortex"** — SweatDrop is launching exclusively at Vortex Gym. Be among the first to join the drops revolution. |

**CTA:** "Get Started" button on all slides, prominent on slide 3.

**Why:** Sets expectations immediately. By slide 3, everyone knows this is Vortex-focused. No surprises later.

---

### Step 2: Auth Screen (NO CHANGE)

Email/Apple/Google sign-in works as-is. No changes needed.

---

### Step 3: Username Screen (NO CHANGE)

Choose username works as-is.

---

### Step 4: Home Gym Selection (MAJOR REDESIGN → "Discover Gyms")

**Current:** Flat list of gym names with radio buttons. Feels like a form field.

**New:** "Discover Partner Gyms" — a rich, visual gym discovery experience.

#### Layout:

```
┌──────────────────────────────────────┐
│          🏋️ DISCOVER GYMS            │
│   SweatDrop is available at these    │
│         partner locations            │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  [Vortex Hero Background]     │  │
│  │                                │  │
│  │  🏅 FOUNDING PARTNER           │  │
│  │  ══════════════════            │  │
│  │  VORTEX GYM                    │  │
│  │  📍 [Address], [City]          │  │
│  │  🕐 Mon-Fri 06-22 | Sat-Sun 08-20│
│  │                                │  │
│  │  [Set as Home Gym]    [Details]│  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┐  │
│  │  🔜 More gyms coming soon...  │  │
│  │  We're expanding to new       │  │
│  │  locations. Stay tuned!       │  │
│  └─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘  │
│                                      │
│        [ Continue without gym ]      │
└──────────────────────────────────────┘
```

#### Key Elements:

1. **Vortex Card (Rich):**
   - Hero background image from `owner_branding.background_url`
   - "Founding Partner" badge (gold/premium feel)
   - Gym logo
   - Name, full address, city
   - Working hours summary
   - Two actions: "Set as Home Gym" (primary CTA) and "Details →" (opens gym detail)

2. **"Coming Soon" Card (Subtle):**
   - Dashed border, muted styling
   - "More gyms joining soon"
   - Prevents the "is this it?" feeling
   - Optional: "Notify me when a gym near me joins" (future feature)

3. **"Continue without gym":**
   - Clear skip option at the bottom
   - No pressure, but the Vortex card is compelling enough

#### Tapping "Details" → Gym Detail Screen (NEW)

---

### Step 5: Gym Detail Screen (NEW SCREEN: `gym-detail.tsx`)

A dedicated, rich gym profile page. This is Vortex's advertisement within the app.

#### Layout:

```
┌──────────────────────────────────────┐
│  [← Back]                            │
│                                      │
│  ┌────────────────────────────────┐  │
│  │     [Full-width Hero Image]    │  │
│  │     with gradient overlay      │  │
│  │                                │  │
│  │     [Vortex Logo]              │  │
│  │     VORTEX GYM                 │  │
│  │     🏅 Founding Partner        │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  📍 ADDRESS                    │  │
│  │  Bulevar Oslobođenja 123       │  │
│  │  Novi Sad, Serbia              │  │
│  │                      [Maps →]  │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  🕐 WORKING HOURS              │  │
│  │  Mon-Fri   06:00 - 22:00      │  │
│  │  Saturday  08:00 - 20:00      │  │
│  │  Sunday    08:00 - 18:00      │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  ℹ️ ABOUT                      │  │
│  │  [Gym description text from    │  │
│  │   database - max 3-4 lines]    │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  📞 CONTACT                    │  │
│  │  Phone: +381 ...     [Call]    │  │
│  │  Instagram: @vortex  [Open]    │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  🎁 AVAILABLE REWARDS          │  │
│  │  See what you can earn here    │  │
│  │  • Free protein shake (50💧)   │  │
│  │  • 1 month free (5000💧)       │  │
│  │  • ... and more                │  │
│  └────────────────────────────────┘  │
│                                      │
│     [══ Set as Home Gym ══]          │
│                                      │
└──────────────────────────────────────┘
```

#### Data Requirements (NEW DB Fields):

```sql
ALTER TABLE public.gyms ADD COLUMN description TEXT;
ALTER TABLE public.gyms ADD COLUMN working_hours JSONB;
ALTER TABLE public.gyms ADD COLUMN phone TEXT;
ALTER TABLE public.gyms ADD COLUMN email TEXT;
ALTER TABLE public.gyms ADD COLUMN website TEXT;
ALTER TABLE public.gyms ADD COLUMN instagram TEXT;
ALTER TABLE public.gyms ADD COLUMN latitude DOUBLE PRECISION;
ALTER TABLE public.gyms ADD COLUMN longitude DOUBLE PRECISION;
ALTER TABLE public.gyms ADD COLUMN is_founding_partner BOOLEAN DEFAULT false;
```

`working_hours` JSONB format:
```json
{
  "mon": { "open": "06:00", "close": "22:00" },
  "tue": { "open": "06:00", "close": "22:00" },
  "wed": { "open": "06:00", "close": "22:00" },
  "thu": { "open": "06:00", "close": "22:00" },
  "fri": { "open": "06:00", "close": "22:00" },
  "sat": { "open": "08:00", "close": "20:00" },
  "sun": { "open": "08:00", "close": "18:00" }
}
```

---

### Step 6: Home Screen States

The home screen must handle **3 distinct states**:

#### State A: Home Gym Set + Active (Normal — current behavior)
- Full functionality as currently implemented
- HeroDropsRing, QuickStats, Challenges, etc.
- QR FAB active
- This is 90% of Vortex members

#### State B: Home Gym Set but No Activity Yet (First Visit)
- Same as State A, but with a **"Welcome" banner** at the top:
  ```
  ┌────────────────────────────────┐
  │  👋 Welcome to Vortex!         │
  │  Scan a QR code on any machine │
  │  to start your first workout   │
  │  and earn your first drops! 💧 │
  └────────────────────────────────┘
  ```
- Shows after setting home gym, disappears after first workout
- Stored in profile or local storage: `has_completed_first_workout`

#### State C: No Home Gym Set (Browser/Skip User)
- Replace the full dashboard with a focused "Get Started" experience:

```
┌──────────────────────────────────────┐
│  🔥 nenad23                          │
│                                      │
│  ┌────────────────────────────────┐  │
│  │       [SweatDrop Logo]         │  │
│  │                                │  │
│  │    READY TO START EARNING?     │  │
│  │                                │  │
│  │  Set your home gym to unlock   │  │
│  │  workouts, rewards, and more   │  │
│  └────────────────────────────────┘  │
│                                      │
│  AVAILABLE GYMS                      │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  [Vortex logo]                 │  │
│  │  VORTEX GYM                    │  │
│  │  🏅 Founding Partner           │  │
│  │  📍 [Address], [City]          │  │
│  │                                │  │
│  │  [Set as Home Gym]  [Details→] │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┐  │
│  │  More gyms coming soon...     │  │
│  └─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘  │
│                                      │
│  HOW IT WORKS                        │
│  ┌──┐  →  ┌──┐  →  ┌──┐  → ┌──┐   │
│  │📱│     │🏋│     │💧│    │🎁│   │
│  │Scan│    │Train│   │Earn│  │Win│   │
│  └──┘     └──┘     └──┘    └──┘   │
│                                      │
│  No QR FAB (hidden - no gym set)     │
└──────────────────────────────────────┘
```

- QR FAB is **hidden** (no home gym = can't scan)
- The page IS the gym discovery page
- Clean, informative, no dead ends
- Tapping "Details" → Gym Detail screen
- Tapping "Set as Home Gym" → Sets gym + transitions to State A

---

## Implementation Plan (Ordered Steps)

### Step 1: Database Migration — Gym Detail Fields
**Agent:** supabase-dba  
**Files:** `backend/supabase/migrations/YYYYMMDDHHMMSS_add_gym_detail_fields.sql`

Add columns to `gyms` table:
- `description TEXT`
- `working_hours JSONB`
- `phone TEXT`
- `email TEXT`
- `website TEXT`
- `instagram TEXT`
- `latitude DOUBLE PRECISION`
- `longitude DOUBLE PRECISION`
- `is_founding_partner BOOLEAN DEFAULT false`

Seed Vortex data with real info.

Update `backend/types/sweatdrop.ts` Gym interface.

### Step 2: Update Mobile Gym Interface
**Agent:** mobile-coder  
**Files:**
- `apps/mobile-app/lib/stores/useGymStore.ts` — Extend `Gym` interface with new fields

### Step 3: New Screen — Gym Detail
**Agent:** mobile-coder  
**Files:**
- `apps/mobile-app/app/gym-detail.tsx` — New route
- `apps/mobile-app/app/_layout.tsx` — Register route

Full gym detail screen following the design system (glassmorphism, dynamic branding, etc.). Receives `gymId` as route param. Fetches gym + branding + rewards preview.

Includes:
- Hero section with background image
- Address card with "Open in Maps" button (Linking.openURL)
- Working hours card (parsed from JSONB)
- About/description card
- Contact card (phone, instagram links)
- Available rewards preview (top 3 rewards from this gym)
- "Set as Home Gym" sticky CTA at bottom (if not already home gym)
- "Founding Partner" badge if `is_founding_partner`

### Step 4: Redesign Onboarding Home Gym Screen
**Agent:** mobile-coder  
**Files:**
- `apps/mobile-app/app/(onboarding)/home-gym.tsx` — Full redesign

Replace flat list with rich gym discovery:
- Title: "Discover Partner Gyms"
- Subtitle: "SweatDrop is available at these locations"
- Rich Vortex card (hero image, badge, address, hours summary)
- "Details →" button navigates to `gym-detail`
- "Set as Home Gym" primary CTA
- "Coming Soon" placeholder card
- "Continue without gym" skip at bottom

### Step 5: Enhance Welcome Screen
**Agent:** mobile-coder  
**Files:**
- `apps/mobile-app/app/(onboarding)/welcome.tsx` — Add carousel

Transform from single screen to 3-slide carousel:
- Slide 1: Value prop ("Turn Sweat Into Rewards")
- Slide 2: How it works (Scan → Train → Earn → Redeem)
- Slide 3: "Now Available at Vortex" with founding partner branding
- Pagination dots + swipe
- "Get Started" CTA on every slide

### Step 6: Home Screen — No Gym State
**Agent:** mobile-coder  
**Files:**
- `apps/mobile-app/app/home.tsx` — Add no-gym-set state

When `homeGymId` is null AND `previewGymId` is null:
- Replace dashboard with "Get Started" layout
- Show available gyms list (reuse gym card component)
- Show "How It Works" stepper
- Hide QR FAB
- Guide user to set a home gym

### Step 7: Home Screen — Welcome Banner (First Visit)
**Agent:** mobile-coder  
**Files:**
- `apps/mobile-app/app/home.tsx` — Add welcome banner
- `apps/mobile-app/lib/stores/useGymStore.ts` or AsyncStorage — Track first workout

Show a dismissible "Welcome to [Gym]" banner after setting home gym for the first time. Disappears after first completed workout or manual dismiss.

### Step 8: Shared Gym Card Component
**Agent:** mobile-coder  
**Files:**
- `apps/mobile-app/components/GymCard.tsx` — New shared component

Reusable rich gym card used in:
- Onboarding home-gym screen
- Home screen no-gym state
- GymSelectorModal (optionally)

Shows: logo, name, badge, address, hours summary, CTA buttons.

---

## Design System Notes

All new screens/components MUST follow established patterns:
- `useBranding()` for dynamic colors
- `BlurView intensity={50} tint="dark"` + `backgroundColor: 'rgba(20, 20, 30, 0.75)'`
- `hexToRgba(branding.primary, 0.12)` for card borders
- `ImageBackground` with fallback `LinearGradient`
- `FadeInDown` staggered entrance animations
- Glassmorphic cards with subtle borders

**Exception for onboarding:** Before a gym is selected, use the default SweatDrop cyan (`#00E5FF`) since there's no gym branding to pull from. Once Vortex is selected, the app transitions to Vortex's branding.

---

## Copy / Microcopy Guidelines

**DO:**
- "Founding Partner Gym" (not "the only gym")
- "Currently available at" (not "limited to")
- "More locations coming soon" (not "no other gyms yet")
- "Be among the first" (FOMO, exclusivity)
- "Start earning today" (urgency)

**DON'T:**
- "Only available at..."
- "We currently only support..."
- "No gyms in your area"
- Anything that sounds like an excuse

---

## App Store Listing Notes

**Description should mention:**
- "Now available at Vortex Gym, [City]"
- "More partner gyms coming soon"
- Screenshots should show the Vortex-branded experience

**This prevents:**
- Users expecting it to work at their random gym
- "This app doesn't work" 1-star reviews
- Confusion about what the app does

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| User can't find a gym near them | "Coming Soon" card + clear messaging on onboarding |
| User thinks app is broken/empty | No-gym home state is informative, not empty |
| User sets Vortex as home gym but never visits | Welcome banner explains first steps, rewards preview motivates |
| Bad reviews from non-Vortex users | Expectations set in onboarding slide 3 + App Store description |
| Vortex looks cheap/generic | Rich gym detail page with hero image, badge, full info |

---

## Priority Order

1. **DB Migration** (unblocks everything)
2. **Gym Detail Screen** (reused by multiple flows)
3. **Shared Gym Card Component** (reused by multiple flows)
4. **Onboarding Home Gym Redesign** (first impression)
5. **Home Screen No-Gym State** (critical for non-gym users)
6. **Welcome Screen Carousel** (nice improvement but less critical)
7. **Welcome Banner** (polish, can ship after launch)

Steps 1-5 are **launch blockers**. Steps 6-7 are **nice to have for launch**.
