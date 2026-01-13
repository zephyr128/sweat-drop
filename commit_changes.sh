#!/bin/bash
# Script to commit changes in logical groups

set -e

echo "=== Committing changes in logical groups ==="

# 1. Database migrations
echo "1. Committing database migrations..."
git add backend/supabase/migrations/ backend/supabase/functions/ backend/supabase/README.md backend/supabase/config.toml
git commit -m "feat(backend): Add database migrations and edge functions

- Add 12 sequential migrations (initial schema through secure redemption system)
- Add challenge reset edge function
- Add backend documentation" || echo "No changes to commit for migrations"

# 2. Admin core infrastructure
echo "2. Committing admin core infrastructure..."
git add apps/admin-panel/middleware.ts apps/admin-panel/lib/auth.ts apps/admin-panel/lib/supabase-server.ts apps/admin-panel/lib/supabase-client.ts apps/admin-panel/lib/utils/ apps/admin-panel/app/layout.tsx apps/admin-panel/app/login/page.tsx apps/admin-panel/app/dashboard/layout.tsx apps/admin-panel/components/Sidebar.tsx
git commit -m "feat(admin): Add core admin panel infrastructure

- Add authentication and role-based routing middleware
- Add server and client Supabase clients
- Add environment variable validation
- Add logging and date formatting utilities
- Update sidebar navigation for gym-specific routes" || echo "No changes to commit for core infrastructure"

# 3. Admin modules - challenges & machines
echo "3. Committing challenges and machines modules..."
git add apps/admin-panel/app/dashboard/gym/\[id\]/challenges/ apps/admin-panel/app/dashboard/gym/\[id\]/machines/ apps/admin-panel/components/modules/ChallengesManager.tsx apps/admin-panel/components/modules/MachinesManager.tsx apps/admin-panel/lib/actions/challenge-actions.ts apps/admin-panel/lib/actions/machine-actions.ts
git commit -m "feat(admin): Add challenges and machines management

- Add challenge management with daily/weekly/streak support
- Add machine management with QR code generation
- Add server actions for CRUD operations" || echo "No changes to commit for challenges/machines"

# 4. Admin modules - store & redemptions
echo "4. Committing store and redemptions modules..."
git add apps/admin-panel/app/dashboard/gym/\[id\]/store/ apps/admin-panel/app/dashboard/gym/\[id\]/redemptions/ apps/admin-panel/components/modules/StoreManager.tsx apps/admin-panel/components/modules/RedemptionsManager.tsx apps/admin-panel/components/QRValidator.tsx apps/admin-panel/lib/actions/store-actions.ts apps/admin-panel/lib/actions/redemption-actions.ts
git commit -m "feat(admin): Add secure redemption system and store management

- Add redemption management with QR code validation
- Add store/rewards management
- Add secure redemption flow with validation and refunds
- Add QR code scanner for redemption validation" || echo "No changes to commit for store/redemptions"

# 5. Admin other modules
echo "5. Committing other admin modules..."
git add apps/admin-panel/app/dashboard/gym/\[id\]/branding/ apps/admin-panel/app/dashboard/gym/\[id\]/settings/ apps/admin-panel/app/dashboard/gym/\[id\]/dashboard/ apps/admin-panel/app/dashboard/gyms/ apps/admin-panel/components/modules/BrandingModule.tsx apps/admin-panel/components/modules/LeaderboardRewardsModule.tsx apps/admin-panel/components/dashboards/ apps/admin-panel/components/GymSwitcher.tsx apps/admin-panel/lib/actions/branding-actions.ts apps/admin-panel/lib/actions/leaderboard-actions.ts apps/admin-panel/lib/actions/gym-actions.ts
git commit -m "feat(admin): Add gym management, branding, and dashboard modules

- Add gym CRUD operations
- Add branding customization
- Add leaderboard rewards configuration
- Add role-based dashboards (superadmin, gym admin, receptionist)" || echo "No changes to commit for other modules"

# 6. Mobile core features
echo "6. Committing mobile core features..."
git add apps/mobile-app/app/workout.tsx apps/mobile-app/app/challenges.tsx apps/mobile-app/app/challenge-detail.tsx apps/mobile-app/app/home.tsx apps/mobile-app/app/scan.tsx apps/mobile-app/hooks/useChallengeProgress.ts apps/mobile-app/components/LiquidGauge.tsx apps/mobile-app/components/CircularProgressRing.tsx
git commit -m "feat(mobile): Add workout tracking and challenge system

- Add real-time workout tracking with drops counter
- Add challenge progress tracking (daily/weekly/streak)
- Add QR code scanning for equipment
- Add liquid gauge and progress ring components" || echo "No changes to commit for mobile core"

# 7. Mobile store and redemptions
echo "7. Committing mobile store and redemptions..."
git add apps/mobile-app/app/store.tsx apps/mobile-app/app/redemptions.tsx apps/mobile-app/app/_layout.tsx
git commit -m "feat(mobile): Add rewards store and redemption system

- Add rewards store with local drops balance
- Add redemption flow with secure code generation
- Add redemption history screen
- Integrate with secure redemption backend" || echo "No changes to commit for mobile store"

# 8. Cleanup
echo "8. Committing cleanup..."
git add apps/admin-panel/app/dashboard/redemptions/ apps/admin-panel/app/dashboard/redeems/ apps/admin-panel/app/dashboard/store/ apps/admin-panel/app/dashboard/branding/ apps/admin-panel/app/dashboard/challenges/ apps/admin-panel/app/dashboard/leaderboard-rewards/ apps/admin-panel/app/dashboard/rewards/ apps/admin-panel/lib/supabase.ts apps/admin-panel/components/dashboards/GymAdminDashboard.tsx
git commit -m "refactor(admin): Remove duplicate routes and organize structure

- Remove old root-level routes (replaced by gym-specific routes)
- Remove unused supabase.ts file
- Update dashboard links to use gym-specific routes
- Clean up empty directories" || echo "No changes to commit for cleanup"

# 9. Documentation
echo "9. Committing documentation..."
git add PRODUCTION_README.md backend/supabase/README.md apps/admin-panel/ADMIN_DASHBOARD_SETUP.md apps/admin-panel/MULTI_TENANT_SETUP.md README.md
git commit -m "docs: Add production deployment guide and documentation

- Add comprehensive production README
- Add backend setup documentation
- Add admin panel setup guides
- Update main README with current features" || echo "No changes to commit for docs"

# 10. Code quality
echo "10. Committing code quality improvements..."
git add -u
git commit -m "refactor: Clean up console.logs and improve error handling

- Remove debug console.log statements
- Add environment variable validation
- Improve error handling in server actions
- Add consistent date formatting to prevent hydration errors" || echo "No changes to commit for code quality"

echo "=== All commits completed ==="
git log --oneline -10
