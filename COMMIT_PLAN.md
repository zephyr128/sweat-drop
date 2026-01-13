# Commit Plan for Production Readiness

This document outlines the logical commit groups for pushing changes to git.

## Commit Groups

### 1. Database Migrations and Backend Setup
**Files:**
- `backend/supabase/migrations/*.sql` (all 12 migrations)
- `backend/supabase/functions/reset-challenges/index.ts`
- `backend/supabase/README.md`
- `backend/supabase/config.toml`

**Commit message:**
```
feat(backend): Add database migrations and edge functions

- Add 12 sequential migrations (initial schema through secure redemption system)
- Add challenge reset edge function
- Add backend documentation
```

### 2. Admin Panel Core Infrastructure
**Files:**
- `apps/admin-panel/middleware.ts`
- `apps/admin-panel/lib/auth.ts`
- `apps/admin-panel/lib/supabase-server.ts`
- `apps/admin-panel/lib/supabase-client.ts`
- `apps/admin-panel/lib/utils/env.ts`
- `apps/admin-panel/lib/utils/logger.ts`
- `apps/admin-panel/lib/utils/date.ts`
- `apps/admin-panel/app/layout.tsx`
- `apps/admin-panel/app/login/page.tsx`
- `apps/admin-panel/app/dashboard/layout.tsx`
- `apps/admin-panel/components/Sidebar.tsx`

**Commit message:**
```
feat(admin): Add core admin panel infrastructure

- Add authentication and role-based routing middleware
- Add server and client Supabase clients
- Add environment variable validation
- Add logging utility
- Add date formatting utility
- Update sidebar navigation for gym-specific routes
```

### 3. Admin Panel Modules - Challenges & Machines
**Files:**
- `apps/admin-panel/app/dashboard/gym/[id]/challenges/page.tsx`
- `apps/admin-panel/app/dashboard/gym/[id]/machines/page.tsx`
- `apps/admin-panel/components/modules/ChallengesManager.tsx`
- `apps/admin-panel/components/modules/MachinesManager.tsx`
- `apps/admin-panel/lib/actions/challenge-actions.ts`
- `apps/admin-panel/lib/actions/machine-actions.ts`

**Commit message:**
```
feat(admin): Add challenges and machines management

- Add challenge management with daily/weekly/streak support
- Add machine management with QR code generation
- Add server actions for CRUD operations
```

### 4. Admin Panel Modules - Store & Redemptions
**Files:**
- `apps/admin-panel/app/dashboard/gym/[id]/store/page.tsx`
- `apps/admin-panel/app/dashboard/gym/[id]/redemptions/page.tsx`
- `apps/admin-panel/components/modules/StoreManager.tsx`
- `apps/admin-panel/components/modules/RedemptionsManager.tsx`
- `apps/admin-panel/components/QRValidator.tsx`
- `apps/admin-panel/lib/actions/store-actions.ts`
- `apps/admin-panel/lib/actions/redemption-actions.ts`

**Commit message:**
```
feat(admin): Add secure redemption system and store management

- Add redemption management with QR code validation
- Add store/rewards management
- Add secure redemption flow with validation and refunds
- Add QR code scanner for redemption validation
```

### 5. Admin Panel - Other Modules
**Files:**
- `apps/admin-panel/app/dashboard/gym/[id]/branding/page.tsx`
- `apps/admin-panel/app/dashboard/gym/[id]/settings/page.tsx`
- `apps/admin-panel/app/dashboard/gym/[id]/dashboard/page.tsx`
- `apps/admin-panel/app/dashboard/gyms/page.tsx`
- `apps/admin-panel/app/dashboard/gyms/new/page.tsx`
- `apps/admin-panel/app/dashboard/gyms/[id]/page.tsx`
- `apps/admin-panel/components/modules/BrandingModule.tsx`
- `apps/admin-panel/components/modules/LeaderboardRewardsModule.tsx`
- `apps/admin-panel/components/dashboards/*.tsx`
- `apps/admin-panel/components/GymSwitcher.tsx`
- `apps/admin-panel/lib/actions/branding-actions.ts`
- `apps/admin-panel/lib/actions/leaderboard-actions.ts`
- `apps/admin-panel/lib/actions/gym-actions.ts`

**Commit message:**
```
feat(admin): Add gym management, branding, and dashboard modules

- Add gym CRUD operations
- Add branding customization
- Add leaderboard rewards configuration
- Add role-based dashboards (superadmin, gym admin, receptionist)
```

### 6. Mobile App - Core Features
**Files:**
- `apps/mobile-app/app/workout.tsx`
- `apps/mobile-app/app/challenges.tsx`
- `apps/mobile-app/app/challenge-detail.tsx`
- `apps/mobile-app/app/home.tsx`
- `apps/mobile-app/app/scan.tsx`
- `apps/mobile-app/hooks/useChallengeProgress.ts`
- `apps/mobile-app/components/LiquidGauge.tsx`
- `apps/mobile-app/components/CircularProgressRing.tsx`

**Commit message:**
```
feat(mobile): Add workout tracking and challenge system

- Add real-time workout tracking with drops counter
- Add challenge progress tracking (daily/weekly/streak)
- Add QR code scanning for equipment
- Add liquid gauge and progress ring components
```

### 7. Mobile App - Store and Redemptions
**Files:**
- `apps/mobile-app/app/store.tsx`
- `apps/mobile-app/app/redemptions.tsx`
- `apps/mobile-app/app/_layout.tsx` (add redemptions route)

**Commit message:**
```
feat(mobile): Add rewards store and redemption system

- Add rewards store with local drops balance
- Add redemption flow with secure code generation
- Add redemption history screen
- Integrate with secure redemption backend
```

### 8. Cleanup and Organization
**Files:**
- Deleted: `apps/admin-panel/app/dashboard/redemptions/page.tsx`
- Deleted: `apps/admin-panel/app/dashboard/redeems/page.tsx`
- Deleted: `apps/admin-panel/app/dashboard/store/page.tsx`
- Deleted: `apps/admin-panel/app/dashboard/store/new/page.tsx`
- Deleted: `apps/admin-panel/app/dashboard/store/[id]/page.tsx`
- Deleted: `apps/admin-panel/app/dashboard/branding/page.tsx`
- Deleted: `apps/admin-panel/app/dashboard/challenges/page.tsx`
- Deleted: `apps/admin-panel/app/dashboard/leaderboard-rewards/page.tsx`
- Deleted: `apps/admin-panel/app/dashboard/rewards/page.tsx`
- Deleted: `apps/admin-panel/lib/supabase.ts`
- `apps/admin-panel/components/dashboards/GymAdminDashboard.tsx` (fix routes)

**Commit message:**
```
refactor(admin): Remove duplicate routes and organize structure

- Remove old root-level routes (replaced by gym-specific routes)
- Remove unused supabase.ts file
- Update dashboard links to use gym-specific routes
- Clean up empty directories
```

### 9. Documentation and Production Setup
**Files:**
- `PRODUCTION_README.md`
- `backend/supabase/README.md`
- `apps/admin-panel/ADMIN_DASHBOARD_SETUP.md`
- `apps/admin-panel/MULTI_TENANT_SETUP.md`
- `README.md` (updates)

**Commit message:**
```
docs: Add production deployment guide and documentation

- Add comprehensive production README
- Add backend setup documentation
- Add admin panel setup guides
- Update main README with current features
```

### 10. Code Quality Improvements
**Files:**
- All files with console.log cleanup
- Environment variable validation
- Error handling improvements

**Commit message:**
```
refactor: Clean up console.logs and improve error handling

- Remove debug console.log statements
- Add environment variable validation
- Improve error handling in server actions
- Add consistent date formatting to prevent hydration errors
```

## Execution Order

Run commits in the order listed above. Each commit is self-contained and can be reviewed independently.
