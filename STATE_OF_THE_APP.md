# SWEATDROP - State of the App

**Last Updated:** 2025-01-27

---

## 🎯 Current Focus

**Implementing Bluetooth BLE Scanner for Magene Sensors in Mobile App**

The mobile app is currently being enhanced to support real-time Bluetooth Low Energy (BLE) communication with Magene fitness sensors. This is a critical component of the MVP Sweat Drops economy, as sensors track workout intensity and calculate drops earned.

**Key Tasks:**
- BLE service implementation (`apps/mobile-app/lib/ble-service.ts`)
- Sensor pairing flow in admin panel
- Real-time RPM (revolutions per minute) data collection
- Workout screen integration for live sensor data
- Auto-pause functionality when sensor detects inactivity (RPM = 0 for 30+ seconds)

**Related Files:**
- `apps/mobile-app/lib/ble-service.ts` (BLE service implementation)
- `apps/mobile-app/app/workout.tsx` (Workout screen with BLE integration)
- `apps/mobile-app/MAGENE_BLE_SETUP.md` (Setup documentation)
- `apps/admin-panel/app/dashboard/gym/[id]/machines/page.tsx` (Machine pairing UI)

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

### Mobile App Features
- ✅ **Onboarding flow** - Email/Apple/Google auth, username setup
- ✅ **Home screen** - Dashboard with drops balance, challenges, leaderboard preview
- ✅ **QR code scanning** - Scan machine QR codes to start workouts
- ✅ **Workout screen** - Real-time drops counter, session tracking (BLE integration in progress)
- ✅ **Session summary** - Workout results, percentile rankings
- ✅ **Wallet screen** - Drops balance (today, this week, this month)
- ✅ **Store screen** - Browse and redeem rewards with drops
- ✅ **Challenges screen** - View and participate in challenges
- ✅ **Leaderboard screen** - Rankings by period and scope
- ✅ **Gym selection** - Home gym setup, gym preview (locked/unlocked)
- ✅ **State management** - Zustand stores for gym selection, user preferences

### SmartCoach System (Feature Flagged)
- ✅ **Database schema** - `workout_plans`, `workout_plan_items`, `coach_profiles` tables
- ✅ **UI components** - SmartCoach screens exist but are hidden/disabled
- ✅ **Feature flag** - Controlled via database (to be implemented)
- ⚠️ **Status:** Not active in MVP - Focus is on Sweat Drops economy

---

## 🐛 Known Bugs

**None currently.**

All critical bugs have been resolved. The app is in active development with focus on BLE integration.

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

2. **Machine Pairing UI Polish**
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

### Long Term
1. **SmartCoach Re-enablement**
   - Implement feature flag in database
   - Test plan creation and execution
   - Enable UI components

2. **Performance Optimization**
   - Optimize Supabase queries
   - Implement caching strategies
   - Reduce bundle sizes

3. **Testing & QA**
   - Unit tests for critical functions
   - Integration tests for BLE flow
   - E2E tests for workout flow

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
