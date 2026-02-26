# SWEATDROP Architecture Documentation

## Project Overview

**SWEATDROP** is a fitness tech startup building a gamified loyalty platform for gym members. The platform uses Bluetooth Low Energy (BLE) sensors (Magene/SHUA) to track workouts and award "Sweat Drops" (loyalty points) in real-time.

**Current Focus:** MVP strictly focused on the Sweat Drops economy. SmartCoach feature is temporarily disabled via database feature flag.

---

## Monorepo Structure

### Package Manager: pnpm

**Version:** >=10.0.0  
**Node Version:** >=18.0.0

**Workspace Configuration:**
- Root: `pnpm-workspace.yaml` defines `apps/*` as workspaces
- Dependency catalogs: React 19 (react@19.1.0, react-dom@19.1.0)
- All dependencies managed via pnpm with workspace filtering

**Key Commands:**
```bash
# Development
pnpm dev:admin          # Start Next.js admin panel
pnpm dev:mobile         # Start Expo mobile app

# Building
pnpm build:admin        # Build Next.js admin panel
pnpm build:mobile       # Build mobile app

# Dependency Management
pnpm add <package> --filter sweatdrop-admin-panel
pnpm add <package> --filter sweatdrop-mobile-app

# Type Checking
pnpm type-check         # Type check all workspaces
```

---

## Workspace Breakdown

### 1. `apps/admin-panel` - Next.js 15 Admin Dashboard

**Purpose:** Web-based admin interface for gym owners and staff

**Tech Stack:**
- **Framework:** Next.js 15 (App Router)
- **React:** 19.1.0
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS
- **State Management:** 
  - React Server Components (default)
  - React Query (`@tanstack/react-query`) for client-side data fetching
  - Server Actions for mutations
- **Supabase Client:** `@supabase/ssr` (server/client separation)
- **Form Handling:** `react-hook-form` + `zod` validation
- **UI Libraries:**
  - `lucide-react` (icons)
  - `sonner` (toast notifications)
  - `chart.js` + `react-chartjs-2` (charts)
  - `react-to-print` (printing)

**Key Features:**
- Multi-tenant RBAC (superadmin, gym_admin, receptionist)
- Gym management and branding
- Rewards management
- Challenges management (daily/weekly/streak)
- Machine pairing (BLE sensor assignment)
- QR code generation and printing
- Redeem validation
- Leaderboard rewards configuration

**Environment Variables:**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

**Directory Structure:**
```
apps/admin-panel/
├── app/                    # Next.js App Router pages
│   ├── dashboard/         # Protected admin routes
│   └── login/             # Auth pages
├── components/             # React components
├── lib/                   # Utilities, Supabase clients, actions
└── middleware.ts          # Auth & RBAC middleware
```

---

### 2. `apps/mobile-app` - React Native (Expo) Mobile App

**Purpose:** Native mobile app for gym members

**Tech Stack:**
- **Framework:** Expo ~54
- **React:** 19.1.0
- **React Native:** 0.81.5
- **Language:** TypeScript (strict mode)
- **Navigation:** `expo-router` (file-based routing)
- **State Management:** 
  - Zustand (`zustand`) with AsyncStorage persistence
  - React hooks for component-level state
- **Supabase Client:** `@supabase/supabase-js` with AsyncStorage auth
- **Styling:** StyleSheet API (React Native)
- **BLE Libraries:**
  - `react-native-ble-manager` (Android)
  - `react-native-ble-plx` (iOS)
- **UI Libraries:**
  - Expo components (`expo-image`, `expo-blur`, `expo-linear-gradient`)
  - `react-native-svg` (SVG graphics)
  - `@shopify/react-native-skia` (advanced graphics)
  - `expo-av` (audio/video)
  - `expo-haptics` (haptic feedback)

**Key Features:**
- Onboarding & authentication (Email/Apple/Google)
- QR code scanning (machine activation)
- Real-time workout tracking with BLE sensors
- Sweat Drops earning and tracking
- Wallet (drops balance)
- Rewards store (redeem drops)
- Challenges (daily/weekly/streak)
- Leaderboards (gym/city/country, daily/weekly/monthly)
- Gym selection and preview
- Session summaries with percentile rankings

**Environment Variables:**
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

**Directory Structure:**
```
apps/mobile-app/
├── app/                   # Expo Router pages
├── components/            # React Native components
├── lib/                   # Utilities, Supabase client, stores
│   └── stores/            # Zustand stores (useGymStore, etc.)
├── hooks/                 # Custom React hooks
└── assets/                # Images, fonts, etc.
```

---

### 3. `backend/supabase` - Supabase Local Setup

**Purpose:** PostgreSQL database, authentication, and Edge Functions

**Tech Stack:**
- **Database:** PostgreSQL (via Supabase)
- **Auth:** Supabase Auth
- **Edge Functions:** Deno/TypeScript
- **Migrations:** SQL files in `migrations/` directory
- **Type Generation:** `backend/types/database.types.ts`

**Key Components:**
- **Migrations:** SQL files with timestamped naming (`YYYYMMDDHHMMSS_description.sql`)
- **Edge Functions:** Deno TypeScript functions in `functions/` directory
- **RLS Policies:** Row Level Security for multi-tenant data isolation
- **Database Functions:** PostgreSQL functions for business logic

**Core Tables:**
- `gyms` - Gym locations
- `machines` - Equipment with QR codes and BLE sensor IDs
- `profiles` - User profiles (extends `auth.users`)
- `sessions` - Workout sessions
- `drops_transactions` - Sweat Drops currency transactions
- `rewards` - Rewards available for redemption
- `redemptions` - Reward redemption requests
- `challenges` - Gym challenges (daily/weekly/streak)
- `challenge_progress` - User challenge progress
- `gym_staff` - Gym staff/admin users
- `workout_plans` - SmartCoach workout plans (feature flagged)
- `workout_plan_items` - SmartCoach plan exercises (feature flagged)

**Directory Structure:**
```
backend/supabase/
├── migrations/            # SQL migration files
├── functions/             # Deno Edge Functions
│   └── reset-challenges/  # Example function
├── config.toml            # Supabase local config
└── README.md              # Setup instructions
```

---

## Data Flow Principles

### Single Source of Truth: Supabase

**All application data is stored in Supabase PostgreSQL database. Both frontend applications read from and write to the same database, ensuring consistency.**

### Admin Panel Data Flow

1. **Server Components (Default):**
   - Direct Supabase queries using `@supabase/ssr` server utilities
   - Data fetched at request time, no client-side state
   - Automatic caching via Next.js App Router

2. **Client Components:**
   - Use `@supabase/ssr` `createBrowserClient` for client-side operations
   - React Query for data fetching, caching, and mutations
   - Server Actions for mutations (form submissions, updates)

3. **Authentication:**
   - Server-side session management via cookies
   - Middleware enforces authentication and RBAC
   - RLS policies enforce data access at database level

### Mobile App Data Flow

1. **Supabase Client:**
   - Single `@supabase/supabase-js` client instance
   - AsyncStorage for auth session persistence
   - Direct queries using Supabase client methods

2. **State Management:**
   - Zustand stores for global state (gym selection, user preferences)
   - React hooks for component-level state
   - AsyncStorage persistence for Zustand stores

3. **Real-time Updates:**
   - Supabase Realtime subscriptions for live data (if needed)
   - Polling for workout progress updates

### BLE Sensor Data Flow (Mobile App)

1. **Connection:**
   - Mobile app scans for Magene/SHUA sensors via BLE
   - Sensor ID stored in `machines.sensor_id` (paired via admin panel)
   - Connection established when workout starts

2. **Data Collection:**
   - BLE service reads RPM (revolutions per minute) from sensor
   - Real-time updates sent to workout screen
   - Drops calculated based on RPM and duration

3. **Workout Tracking:**
   - Session created in `sessions` table
   - Drops earned calculated and stored in `drops_transactions`
   - Machine locked during workout (prevents concurrent use)
   - Heartbeat updates every 10 seconds to keep machine locked

---

## State Management Rules

### Admin Panel State Management

**Primary Pattern: React Server Components + React Query**

1. **Server Components (Default):**
   - Fetch data directly from Supabase
   - No client-side state for initial data
   - Pass data as props to client components

2. **Client Components:**
   - Use React Query for data fetching:
     ```typescript
     const { data, isLoading } = useQuery({
       queryKey: ['rewards', gymId],
       queryFn: () => fetchRewards(gymId),
     });
     ```
   - Use Server Actions for mutations:
     ```typescript
     'use server';
     export async function createReward(formData: FormData) {
       // Mutate database
     }
     ```

3. **Form State:**
   - `react-hook-form` for form state management
   - `zod` for validation schemas

### Mobile App State Management

**Primary Pattern: Zustand + React Hooks**

1. **Global State (Zustand):**
   - `useGymStore`: Gym selection, home gym, preview gym
   - Persisted to AsyncStorage
   - Accessible across all screens

2. **Component State:**
   - React `useState` for local component state
   - React `useEffect` for side effects
   - Custom hooks for reusable logic (`useSession`, `useGymData`, `useLocalDrops`)

3. **Data Fetching:**
   - Direct Supabase queries in components
   - No external data fetching library (keeping bundle size small)

---

## Feature Flags & MVP Scope

### Active MVP Features

**Sweat Drops Economy:**
- ✅ QR code scanning for machine activation
- ✅ BLE sensor integration (Magene/SHUA)
- ✅ Real-time workout tracking
- ✅ Drops earning calculation
- ✅ Wallet (drops balance tracking)
- ✅ Rewards store (redeem drops)
- ✅ Challenges (daily/weekly/streak)
- ✅ Leaderboards (gym/city/country)

**Admin Features:**
- ✅ Multi-tenant RBAC
- ✅ Gym management
- ✅ Machine pairing (BLE sensor assignment)
- ✅ QR code generation
- ✅ Rewards management
- ✅ Challenges management
- ✅ Redeem validation

### Disabled Features (Feature Flagged)

**SmartCoach System:**
- ❌ Workout plan creation (coaches/gyms)
- ❌ Plan subscription (users)
- ❌ Guided workout execution
- ❌ AI progression tracking

**Implementation Status:**
- Database schema exists (`workout_plans`, `workout_plan_items` tables)
- UI components exist but are hidden/disabled
- Feature flag: Controlled via database setting (to be implemented)
- **Current State:** SmartCoach routes and components exist but are not actively used in MVP

**Note:** SmartCoach feature can be re-enabled by:
1. Adding feature flag check in database (`gyms.smartcoach_enabled` or similar)
2. Updating UI to show/hide SmartCoach sections based on flag
3. Testing plan creation and execution flows

---

## Type Safety & Validation

### TypeScript Configuration

**All workspaces enforce strict TypeScript:**
- `strict: true` in all `tsconfig.json` files
- No `any` types without explicit justification
- Type-only imports: `import type { ... }`

### Type Definitions

1. **Database Types:**
   - Generated from Supabase: `backend/types/database.types.ts`
   - Imported in both frontend apps
   - Used for Supabase query responses

2. **Runtime Validation:**
   - Zod schemas for API responses
   - Form validation with `zod` + `react-hook-form`
   - Type-safe Supabase queries

### Path Aliases

**Both apps use `@/*` path alias:**
- `apps/admin-panel/tsconfig.json`: `"@/*": ["./*"]`
- `apps/mobile-app/tsconfig.json`: `"@/*": ["./*"]`

---

## Styling Conventions

### Admin Panel

**Framework:** Tailwind CSS

- Utility-first CSS classes
- `clsx` for conditional classes
- Custom colors via `tailwind.config.js`
- Responsive design with Tailwind breakpoints

### Mobile App

**Framework:** React Native StyleSheet API

- `StyleSheet.create()` for component styles
- Inline styles for simple cases
- Theme context for dynamic branding (gym colors)
- No CSS files, no Tailwind (unless NativeWind explicitly configured)

---

## Environment Variables

### Admin Panel (`apps/admin-panel/.env.local`)

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

**Note:** Admin panel trims whitespace from env vars (Vercel UI can add newlines).

### Mobile App (`apps/mobile-app/.env`)

```bash
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

**Note:** Mobile app reads from `expo-constants` or `process.env`.

---

## Development Workflow

### Local Development Setup

1. **Install Dependencies:**
   ```bash
   pnpm install
   ```

2. **Start Supabase Local:**
   ```bash
   cd backend/supabase
   supabase start
   supabase db reset
   ```

3. **Configure Environment:**
   - Copy `.env.example` files (if they exist)
   - Set Supabase URL and keys

4. **Start Development Servers:**
   ```bash
   # Terminal 1: Admin Panel
   pnpm dev:admin

   # Terminal 2: Mobile App
   pnpm dev:mobile
   ```

### Code Quality

**Linting:**
- Admin: `eslint-config-next`
- Mobile: `eslint-config-expo`
- Run: `pnpm lint`

**Type Checking:**
- Run: `pnpm type-check`
- All workspaces must pass TypeScript checks

**Formatting:**
- Prettier configured at root
- Auto-format on save (IDE)

---

## Security & Access Control

### Authentication

- **Admin Panel:** Server-side session management via cookies
- **Mobile App:** Client-side session with AsyncStorage persistence
- Both use Supabase Auth (Email/Apple/Google)

### Authorization

**Row Level Security (RLS):**
- All tables have RLS policies
- Multi-tenant isolation via `gym_id` checks
- Role-based access (superadmin, gym_admin, receptionist, user)

**Middleware (Admin Panel):**
- Enforces authentication
- Redirects based on role
- Protects routes before rendering

---

## Deployment

### Admin Panel

- **Platform:** Vercel (recommended for Next.js)
- **Build Command:** `pnpm build:admin`
- **Environment Variables:** Set in Vercel dashboard

### Mobile App

- **Platform:** Expo Application Services (EAS)
- **Build:** `eas build --platform ios/android`
- **Environment Variables:** Set in `app.config.js` or EAS secrets

### Supabase

- **Production:** Supabase Cloud
- **Local Development:** Supabase CLI (`supabase start`)
- **Migrations:** Applied via `supabase db push`

---

## Key Files Reference

- **Monorepo Config:** `pnpm-workspace.yaml`, `package.json`
- **Admin Panel:** `apps/admin-panel/package.json`, `apps/admin-panel/tsconfig.json`
- **Mobile App:** `apps/mobile-app/package.json`, `apps/mobile-app/tsconfig.json`
- **Supabase:** `backend/supabase/config.toml`
- **Database Types:** `backend/types/database.types.ts`
- **Cursor Rules:** `.cursorrules`

---

**Last Updated:** 2025-01-27  
**Maintained By:** SWEATDROP Engineering Team
