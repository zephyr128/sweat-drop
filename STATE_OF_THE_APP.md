# SWEATDROP - State of the App

**Last Updated:** 2025-03-02

---

## 🎯 Current Focus

**Mobile App UI/UX Redesign Complete — Preparing for Production Polish**

The mobile app has undergone a **complete UI/UX redesign** establishing a premium fitness app aesthetic with dynamic gym branding, glassmorphism, and consistent design language across all 12+ screens. The BLE sensor integration remains in progress as a parallel track.

**Completed:**
- ✅ Full mobile app redesign (all screens)
- ✅ Dynamic branding system (gym colors propagate to entire UI)
- ✅ Glassmorphism design system (BlurView + dark backgrounds)
- ✅ Home screen with dual-progress ring, stats, activity chart
- ✅ Settings screen redesign with premium UX
- ✅ Gamification system (badges, trophy room, challenges)

**In Progress:**
- 🔄 BLE sensor integration (Magene/SHUA)
- 🔄 Production testing and QA across different gym brandings

**Related Files:**
- `apps/mobile-app/lib/ble-service.ts` (BLE service implementation)
- `apps/mobile-app/app/workout.tsx` (Workout screen with BLE integration)
- `apps/mobile-app/lib/contexts/ThemeContext.tsx` (Dynamic branding context)
- `apps/mobile-app/lib/hooks/useBranding.ts` (Branding color derivation)
- `apps/mobile-app/hooks/useHomeStats.ts` (Home screen stats hook)

---

## ✅ Completed

### Infrastructure & Setup
- ✅ **pnpm monorepo setup** - Workspace configuration with dependency catalogs
- ✅ **Next.js 15 initialization** - Admin panel with App Router, React 19
- ✅ **Expo ~54 initialization** - Mobile app with React Native 0.81.5, React 19
- ✅ **Supabase local setup** - PostgreSQL database, migrations, Edge Functions
- ✅ **.cursorrules file created** - Context-aware AI agent rules for monorepo

### Database & Backend
- ✅ **Multi-tenant RBAC system** - Superadmin, gym_admin, receptionist roles
- ✅ **Core schema migrations** - Gyms, machines, profiles, sessions, drops, rewards, challenges
- ✅ **SmartCoach feature flagged** - Database schema exists but feature is disabled
- ✅ **Machine pairing system** - BLE sensor ID storage in `machines.sensor_id`
- ✅ **QR code system** - Machine QR codes for mobile app scanning

### Admin Panel Features
- ✅ **Authentication & RBAC** - Login, middleware protection, role-based routing
- ✅ **Gym management** - Create, edit, view gyms (multi-tenant)
- ✅ **Machine management** - Create machines, pair BLE sensors, generate QR codes
- ✅ **Rewards management** - Create, edit, delete rewards
- ✅ **Challenges management** - Daily/weekly/streak challenges
- ✅ **Redeem validation** - Approve/reject reward redemptions
- ✅ **Leaderboard rewards** - Configure rewards for top 3 users
- ✅ **Gym branding** - Custom colors, logos, backgrounds
- ✅ **Reception reward flow (2026-04-20)** — Two-duty model for physical prizes:
  - **Job A — prize arrival**: Desk queue shows "Awaiting shipment" for arena/leaderboard prizes with `fulfilled_at IS NULL`. Receptionist clicks "Mark as received" → calls `mark_redemption_fulfilled` → fires `prize_ready` push to member.
  - **Job B — hand over to member**: Once `fulfilled_at` is set (or for store rewards), card becomes "Ready to collect". Receptionist clicks "Confirm & Hand Over" → calls `confirm_redemption`.
  - Desk KPIs show separate **Awaiting shipment** and **Ready to collect** counters.
  - Sidebar for receptionist now includes **Arena prizes** link (`/dashboard/arenas`) for direct access to fulfillment manifest.
  - Middleware updated to allow receptionist access to `/dashboard/arenas/*`.

### Mobile App Features
- ✅ **Onboarding flow** - Email/Apple/Google auth, username setup
- ✅ **Home screen** - Redesigned with dual-progress ring (global/local drops), quick stats row, weekly activity chart, closest reward banner, dynamic gym branding
- ✅ **QR code scanning** - Scan machine QR codes to start workouts
- ✅ **Workout screen** - Real-time drops counter, session tracking (BLE integration in progress)
- ✅ **Session summary** - Workout results, percentile rankings, glassmorphic stat cards
- ✅ **Wallet screen** - Drops balance with glassmorphic cards, dynamic branding
- ✅ **Store screen** - Browse and redeem rewards, branded progress bars
- ✅ **Challenges screen** - View and participate in challenges, branded progress fills
- ✅ **Challenge detail** - Full challenge view with glassmorphic cards
- ✅ **Leaderboard screen** - Rankings by period and scope, branded active states
- ✅ **Gym selection** - Home gym setup, gym preview (locked/unlocked)
- ✅ **State management** - Zustand stores for gym selection, user preferences
- ✅ **Settings screen** - Redesigned with profile hero, quick stats, inline username edit, home gym, notifications toggle, app version
- ✅ **Trophy Room** - Badge grid with search/filter, glassmorphic cards, dynamic branding
- ✅ **Redemptions history** - Glassmorphic redemption cards with branded status indicators
- ✅ **SmartCoach screens** - Gym cards, plan detail with exercise list (feature flagged)

### Mobile App Design System (NEW)
- ✅ **Dynamic gym branding** - `useBranding()` hook derives colors from `activeGym.primary_color`
- ✅ **Theme context** - `useTheme()` provides animated theme values
- ✅ **Glassmorphism** - `BlurView intensity={50}` + `backgroundColor: rgba(20,20,30,0.75)` on all cards
- ✅ **ImageBackground** - Dynamic gym backgrounds with dark gradient fallback
- ✅ **Staggered animations** - `FadeInDown` from `react-native-reanimated` on all screens
- ✅ **HeroDropsRing** - Dual concentric SVG progress rings with pulsating glow
- ✅ **QuickStatsRow** - 3 stat pills (streak, today's drops, last workout)
- ✅ **WeeklyActivityChart** - 7-day SVG sparkline bar chart
- ✅ **ClosestRewardBanner** - Progress toward nearest redeemable reward
- ✅ **BackButton** - Dynamic branding border color

### SmartCoach System (Feature Flagged)
- ✅ **Database schema** - `workout_plans`, `workout_plan_items`, `coach_profiles` tables
- ✅ **UI components** - SmartCoach screens exist but are hidden/disabled
- ✅ **Feature flag** - Controlled via database (to be implemented)
- ⚠️ **Status:** Not active in MVP - Focus is on Sweat Drops economy

---

## 🐛 Known Bugs

**None critical.**

- ⚠️ **Card visibility edge case** - When a gym has very bright primary color AND very dark background, borders may need higher opacity. Current minimum is `hexToRgba(branding.primary, 0.12)`. If new edge cases are found, increase to `0.20+`.
- ⚠️ **Typography on small screens** - `HeroDropsRing` has dynamic font sizing for drop counts but may need testing on very small devices (iPhone SE).

---

## 🚫 Blockers

**None.**

Development is proceeding smoothly. No external dependencies or technical blockers.

---

## 📋 Next Steps

### Immediate (Current Sprint)
1. **Complete BLE Scanner Implementation**
   - Finish `apps/mobile-app/lib/ble-service.ts`
   - Test sensor connection on iOS and Android
   - Integrate RPM data into workout screen
   - Implement auto-pause on inactivity

2. **QA: Test Design System Across Gym Brandings**
   - Test with light primary colors on dark backgrounds
   - Test with dark primary colors on light backgrounds
   - Test with no gym background image (gradient fallback)
   - Verify `HeroDropsRing` glow/pulse on different color combos
   - Test on both iOS and Android

3. **Machine Pairing UI Polish**
   - Improve BLE device scanning in admin panel
   - Add connection status indicators
   - Error handling for pairing failures

### Short Term
1. **Workout Flow Enhancements**
   - Improve drops calculation algorithm
   - Add workout history screen
   - Session replay/analytics

2. **Admin Panel Improvements**
   - Dashboard analytics (charts)
   - Export functionality (CSV/PDF)
   - Bulk operations for rewards/challenges

3. **Admin Panel: Global Achievements Management**
   - Superadmin UI to create/edit global achievements
   - Badge image upload to `global-achievement-badges` storage bucket
   - Achievement criteria editor (JSONB)

### Long Term
1. **SmartCoach Re-enablement**
   - Implement feature flag in database
   - Test plan creation and execution
   - Enable UI components

2. **Performance Optimization**
   - Optimize Supabase queries (especially `useHomeStats` hook)
   - Implement caching strategies for branding data
   - Reduce bundle sizes

3. **Testing & QA**
   - Unit tests for critical functions
   - Integration tests for BLE flow
   - E2E tests for workout flow
   - Visual regression tests for design system

---

## 📊 Technical Debt

### Low Priority
- [ ] Add unit tests for Zustand stores
- [ ] Add integration tests for Supabase queries
- [ ] Optimize image loading in mobile app
- [ ] Add error boundaries in React components
- [ ] Implement retry logic for failed API calls

### Documentation
- [ ] API documentation for Edge Functions
- [ ] BLE protocol documentation
- [ ] Deployment guides for production
- [ ] Troubleshooting guides for common issues

---

## 🔧 Development Environment

### Required Tools
- Node.js >=18.0.0
- pnpm >=10.0.0
- Supabase CLI (for local development)
- Xcode (for iOS development)
- Android Studio (for Android development)

### Local Setup Status
- ✅ Supabase local running
- ✅ Admin panel dev server working
- ✅ Mobile app dev server working
- ✅ Database migrations applied
- ✅ Environment variables configured

---

## 📝 Notes for AI Agents

### When Working on BLE Integration
- Check `apps/mobile-app/MAGENE_BLE_SETUP.md` for setup instructions
- Use `react-native-ble-manager` for Android, `react-native-ble-plx` for iOS
- Sensor IDs are stored in `machines.sensor_id` (paired via admin panel)
- BLE service should handle connection, disconnection, and data reading
- Workout screen expects RPM data from BLE service

### When Working on Admin Panel
- Always check user role before rendering admin features
- Use Server Actions for mutations (not client-side Supabase calls)
- RLS policies enforce data access - test with different user roles
- Middleware handles authentication - don't duplicate checks in components

### When Working on Mobile App
- Use Zustand stores for global state (gym selection, etc.)
- Use React hooks for component state
- Always check `session` before making Supabase queries
- Use `useGymStore` for gym-related state
- **DESIGN SYSTEM:** All new screens MUST follow the established design system:
  - Use `useBranding()` for dynamic colors (never hardcode `#00E5FF`)
  - Use `BlurView intensity={50} tint="dark"` + `backgroundColor: 'rgba(20, 20, 30, 0.75)'` for cards
  - Use `hexToRgba(branding.primary, 0.12)` for card borders
  - Use `ImageBackground` from `activeGym.background_image_url` (with `LinearGradient` fallback)
  - Use `FadeInDown` from `react-native-reanimated` for entrance animations
  - See `CHANGELOG.md [2025-03-02]` for full design system reference

### When Working on Database
- All migrations must be timestamped: `YYYYMMDDHHMMSS_description.sql`
- Test RLS policies with different user roles
- Use `SECURITY DEFINER` functions carefully
- Document all new tables and functions

---

## 🎯 MVP Success Criteria

### Core Features (Must Have)
- ✅ QR code scanning for machine activation
- 🔄 BLE sensor integration (in progress)
- ✅ Real-time drops earning
- ✅ Wallet and rewards redemption
- ✅ Challenges and leaderboards
- ✅ Admin panel for gym management

### Nice to Have (Post-MVP)
- SmartCoach workout plans
- Social features (friends, sharing)
- Advanced analytics
- Push notifications
- Offline mode support

---

**Document Maintained By:** SWEATDROP Engineering Team  
**Update Frequency:** After each major milestone or blocker resolution
