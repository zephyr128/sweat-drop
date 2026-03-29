# Changelog

All notable changes to the SWEATDROP project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- Agent communication protocol (`docs/AGENT_COMMUNICATION.md`)
- Changelog file for tracking all changes
- Migration notes system for database changes
- Landing page coder agent (`.cursor/rules/landing-page-coder.mdc`)
  - Professional marketing website builder
  - SEO-optimized, conversion-focused landing pages
  - Next.js 15 with App Router

---

## [2026-03-29] - App Store Launch UX — Gym Discovery & Onboarding

### Overview

Complete UX overhaul for App Store / Play Store launch with Vortex as the sole partner gym. Frames the single-gym reality as an "exclusive founding partner" launch. Prevents negative reviews by setting expectations clearly.

### Added (New Files)

- **`backend/supabase/migrations/20260329000001_add_gym_detail_fields.sql`** — Adds `description`, `working_hours` (JSONB), `phone`, `email`, `website`, `instagram`, `latitude`, `longitude`, `is_founding_partner` to `gyms` table
- **`apps/mobile-app/app/gym-detail.tsx`** — Full gym profile screen with hero image, address (Open in Maps), working hours, about, contact, rewards preview, sticky "Set as Home Gym" CTA
- **`apps/mobile-app/components/GymCard.tsx`** — Reusable rich gym card with logo, name, founding partner badge, address, hours, action buttons. Used in onboarding and home screen
- **`docs/plans/app_store_launch_ux.md`** — Comprehensive UX plan document

### Changed

- **`apps/mobile-app/app/(onboarding)/welcome.tsx`** — Transformed from single-screen to 3-slide carousel (Turn Sweat Into Rewards → How It Works → Now Available at Partner Gyms). Pagination dots, swipe, persistent CTA
- **`apps/mobile-app/app/(onboarding)/home-gym.tsx`** — Full redesign from flat radio list to rich "Discover Partner Gyms" page with GymCard components, founding partner badge, "Coming Soon" dashed card, "Details" → gym-detail navigation
- **`apps/mobile-app/app/home.tsx`** — Three distinct states:
  - **No Gym State:** Shows "Ready to Start Earning?" hero + available gyms list + "How It Works" stepper (QR FAB hidden)
  - **Welcome Banner:** Dismissible "Welcome to [Gym]!" banner for first-time users (stored in AsyncStorage)
  - **Normal Dashboard:** Existing behavior preserved
- **`apps/mobile-app/app/_layout.tsx`** — Registered `gym-detail` route
- **`apps/mobile-app/lib/stores/useGymStore.ts`** — Extended `Gym` interface with new fields: `description`, `working_hours`, `phone`, `email`, `website`, `instagram`, `latitude`, `longitude`, `is_founding_partner`
- **`backend/types/sweatdrop.ts`** — Added `GymDayHours`, `GymWorkingHours` types. Extended `Gym` interface with all new detail fields

### Impact on Other Agents

- **supabase-dba:** Migration `20260329000001` must be applied. Seed Vortex data with real description, working hours, address, phone, Instagram, `is_founding_partner = true`
- **admin-coder:** May want to add gym detail fields (description, hours, contact) to admin panel gym edit form
- **reviewer:** Verify: no-gym home state renders correctly, gym-detail screen loads rewards, welcome carousel swipes, founding partner badge shows for Vortex

### Changed
- SmartCoach card on home screen now conditionally renders based on `gym.smartcoach_enabled` flag
  - Card is hidden when SmartCoach is disabled for the active gym
  - Updated `Gym` interface in `useGymStore.ts` to include `smartcoach_enabled` field
- Workout screen now checks `smartcoach_enabled` before loading SmartCoach plan items
  - SmartCoach mode is disabled if the gym doesn't have SmartCoach enabled
  - Added `smartcoach_enabled` to gym query in `createSession` function
  - Added check in `loadPlanItem` to prevent SmartCoach mode when feature is disabled

---

## [2025-03-02] - mobile-coder: Complete Mobile App UI/UX Redesign

### Overview

Full redesign of every screen in the mobile app to establish a **premium fitness app** aesthetic with:
- **Dynamic gym branding** — primary/secondary colors from `currentGym` propagate across the entire UI
- **Glassmorphism** — `BlurView` (intensity 50) + semi-transparent dark background on all cards
- **Staggered entrance animations** — `react-native-reanimated` `FadeInDown` on all screens
- **Consistent design language** — unified border radius, color system, spacing, and typography

### Design System Established

**Core Visual Principles:**
- Background: `ImageBackground` from `activeGym.background_image_url` when available, else `LinearGradient` dark fallback (`#000000` → `#0A0E1A`)
- Card treatment: `BlurView intensity={50} tint="dark"` + `backgroundColor: 'rgba(20, 20, 30, 0.75)'` + `borderColor: hexToRgba(branding.primary, 0.12–0.15)` + `borderWidth: 1`
- Branding colors: `branding.primary` for interactive accents, progress bars, icons, active states, CTAs
- Original SweatDrop colors preserved for: difficulty levels (green/yellow/red), status indicators, base text hierarchy
- Animations: `FadeInDown` from `react-native-reanimated` with staggered delays per card/row

**Key Hooks & Contexts:**
- `useBranding()` — derives `primary`, `primaryLight`, `primaryDark`, `onPrimary` from `activeGym.primary_color`
- `useTheme()` — provides animated theme values via `ThemeContext`
- `useHomeStats()` — fetches streak, today's drops, last workout, closest reward, weekly activity

### Added (New Components)

- **`apps/mobile-app/components/HeroDropsRing.tsx`** — Dual-progress SVG circle (outer: global drops, inner: local drops), dynamic branding, press-to-navigate to wallet, pulsating glow
- **`apps/mobile-app/components/QuickStatsRow.tsx`** — Row of 3 glassmorphic pills (streak, today's drops, last workout)
- **`apps/mobile-app/components/ClosestRewardBanner.tsx`** — Banner showing nearest redeemable reward with progress
- **`apps/mobile-app/components/WeeklyActivityChart.tsx`** — 7-day sparkline bar chart (SVG + animated bars)
- **`apps/mobile-app/hooks/useHomeStats.ts`** — Hook fetching home screen stats from Supabase

### Changed (Redesigned Screens — 12 files)

| # | File | Key Changes |
|---|------|-------------|
| 1 | `apps/mobile-app/app/home.tsx` | Dynamic `ImageBackground`, dual-progress `HeroDropsRing`, `QuickStatsRow`, `WeeklyActivityChart`, `ClosestRewardBanner`, Trophy Room card replacing Leaderboards, skeleton loader for challenges, BlurView on all cards |
| 2 | `apps/mobile-app/components/UserSettingsSheet.tsx` | Complete redesign: profile hero, quick stats pills, inline editable username, home gym display, notifications toggle, app version, delete account, all glassmorphic cards, dynamic branding |
| 3 | `apps/mobile-app/app/wallet.tsx` | `ImageBackground`, BlurView on balance & transaction cards, branding colors replacing hardcoded `#00E5FF`, staggered `FadeInDown` |
| 4 | `apps/mobile-app/app/store.tsx` | `ImageBackground`, BlurView on reward cards, branded progress bars & accents |
| 5 | `apps/mobile-app/app/leaderboard.tsx` | `ImageBackground`, BlurView on items & sticky footer, branded tab/button states |
| 6 | `apps/mobile-app/app/challenges.tsx` | `ImageBackground`, BlurView on challenge cards, branded progress fill & type badges |
| 7 | `apps/mobile-app/app/challenge-detail.tsx` | BlurView replacing inner gradient, branded icons & progress |
| 8 | `apps/mobile-app/app/redemptions.tsx` | `ImageBackground`, BlurView on redemption cards, branded drops icons |
| 9 | `apps/mobile-app/app/session-summary.tsx` | BlurView on stat/equipment/badge cards, branded "Collect & Close" button |
| 10 | `apps/mobile-app/app/smartcoach.tsx` | BlurView on gym cards, branded icons replacing hardcoded cyan |
| 11 | `apps/mobile-app/app/gym-plans.tsx` | BlurView on plan cards, branded plan count & icons, difficulty colors preserved |
| 12 | `apps/mobile-app/app/plan-detail.tsx` | BlurView on info card & exercise items, branded number badges, rest badges, start button gradient, staggered animations |

### Changed (Redesigned Components — 4 files)

| # | File | Key Changes |
|---|------|-------------|
| 1 | `apps/mobile-app/components/TrophyRoom.tsx` | BlurView on search & filter buttons, branded section titles & icons |
| 2 | `apps/mobile-app/components/LeaderboardPreview.tsx` | BlurView intensity increased to 50, dark backgroundColor added |
| 3 | `apps/mobile-app/components/ProgressWidget.tsx` | BlurView intensity increased to 50, dark backgroundColor added |
| 4 | `apps/mobile-app/components/BackButton.tsx` | Dynamic branding border color via `hexToRgba(branding.primary, 0.15)` |

### Fixed
- **Card visibility on dark backgrounds** — Increased `BlurView` intensity from 15–20 to 50 and added `backgroundColor: 'rgba(20, 20, 30, 0.75)'` across all glassmorphic cards (resolves issue when gym has black background + white primary color)
- **Border visibility** — Increased border opacity from `0.08` to `0.12–0.25` across all branded borders
- **Home screen flickering** — Added skeleton loader for challenges section to prevent layout jump during data loading
- **ProgressWidget hooks order** — Moved early return after all hooks to prevent React hook order errors
- **ProgressWidget easing** — Replaced custom easing with `Easing.out(Easing.ease)` from reanimated to fix worklet error

### Breaking Changes
- None (all changes are UI-only within `apps/mobile-app/`)

### Impact on Other Agents

- **architect:** Mobile app now has a complete design system. Future screens should follow the glassmorphism + dynamic branding pattern documented in this entry. Consider adding a `docs/plans/mobile_design_system.md` reference.
- **admin-coder:** No impact. Admin panel uses separate Tailwind-based design.
- **supabase-dba:** No impact. No database changes required.
- **reviewer:** All screens now use `useBranding()` hook for colors. When reviewing, verify:
  - No hardcoded `#00E5FF` remains (should use `branding.primary`)
  - All `BlurView` uses `intensity={50}` and has `backgroundColor: 'rgba(20, 20, 30, 0.75)'`
  - All cards have `borderColor: hexToRgba(branding.primary, 0.12)` minimum
  - `ImageBackground` conditional on `activeGym.background_image_url`

### Data Dependencies (Supabase Queries Used)

- `profiles.total_drops` — Global drops count for HeroDropsRing outer ring
- `gym_memberships.local_drops_balance` — Local drops for HeroDropsRing inner ring
- `drops_transactions` — Today's drops, weekly activity chart
- `sessions` — Last workout info, streak calculation
- `rewards` — Closest reward banner
- `gym_challenges` — Active challenges display
- `gyms.primary_color`, `gyms.secondary_color`, `gyms.logo_url`, `gyms.background_image_url` — Dynamic branding

---

## [2025-01-27] - Initial Setup

### Added
- Multi-agent workflow system with 5 agent personas
- Architecture documentation (`ARCHITECTURE.md`)
- State of the app tracking (`STATE_OF_THE_APP.md`)
- Cursor rules for context-aware development (`.cursorrules`)
- Agent persona rules (`.cursor/rules/*.mdc`)

### Documentation
- System architecture documentation
- State tracking documentation
- Agent communication protocol

---

**Note:** This changelog is maintained by all agents. Each agent should add entries when making significant changes.
