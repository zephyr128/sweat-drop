# SweatDrop Multi-Tenant Admin Dashboard

## Overview

This is a comprehensive multi-tenant admin dashboard for SweatDrop with three levels of access control (RBAC):
- **Superadmin**: Global view, can create gyms and impersonate any gym
- **Gym Admin**: Single gym management (branding, challenges, store, leaderboard rewards)
- **Receptionist**: Check-in and redemption validation

## Database Setup

### 1. Run the RBAC Migration

Execute the SQL migration file to set up the RBAC system:

```bash
# In Supabase SQL Editor, run:
backend/supabase/migrations/20240101000004_admin_rbac_system.sql
```

This migration:
- Creates `user_role` enum (superadmin, gym_admin, receptionist, user)
- Adds `role` and `admin_gym_id` columns to `profiles` table
- Creates `gym_branding` table for theme customization
- Creates `leaderboard_rewards` table for top 3 rewards
- Sets up comprehensive RLS policies for all roles
- Creates helper functions for role checking

### 2. Set Up Your Superadmin Account

After running the migration, update your profile to be a superadmin:

```sql
-- Replace 'YOUR_USER_ID' with your actual user ID
UPDATE public.profiles
SET role = 'superadmin'
WHERE id = 'YOUR_USER_ID';
```

### 3. Create a Gym Admin

To create a gym admin for a specific gym:

```sql
-- 1. Create or select a gym
INSERT INTO public.gyms (name, city, country)
VALUES ('Test Gym', 'Belgrade', 'Serbia')
RETURNING id;

-- 2. Assign a user as gym admin (replace USER_ID and GYM_ID)
UPDATE public.profiles
SET role = 'gym_admin', admin_gym_id = 'GYM_ID'
WHERE id = 'USER_ID';
```

### 4. Create a Receptionist

```sql
-- Replace USER_ID and GYM_ID
UPDATE public.profiles
SET role = 'receptionist', admin_gym_id = 'GYM_ID'
WHERE id = 'USER_ID';
```

## Project Structure

```
apps/admin-panel/
├── app/
│   ├── dashboard/
│   │   ├── layout.tsx          # Dashboard layout with sidebar
│   │   ├── page.tsx            # Main dashboard (role-based)
│   │   ├── gyms/               # Superadmin: Gym management
│   │   ├── branding/           # Gym Admin: Branding settings
│   │   ├── challenges/         # Gym Admin: Challenges CRUD
│   │   ├── store/              # Gym Admin: Store items
│   │   ├── leaderboard-rewards/ # Gym Admin: Top 3 rewards
│   │   └── redemptions/        # Receptionist: Redemption validation
│   ├── login/
│   └── layout.tsx
├── components/
│   ├── Sidebar.tsx             # Navigation sidebar
│   ├── StatsCard.tsx           # Statistics card component
│   ├── dashboards/
│   │   ├── SuperadminDashboard.tsx
│   │   ├── GymAdminDashboard.tsx
│   │   └── ReceptionistDashboard.tsx
│   └── forms/
│       ├── BrandingForm.tsx
│       └── LeaderboardRewardsForm.tsx
└── lib/
    ├── auth.ts                 # Authentication & role helpers
    └── supabase.ts             # Supabase client
```

## Features Implemented

### ✅ Superadmin Features
- Global dashboard with stats (total users, gyms, drops)
- Gym management page (list all gyms)
- Gym switcher in sidebar (placeholder - needs implementation)

### ✅ Gym Admin Features
- Dashboard with gym-specific stats
- Branding page (primary color, logo, background image)
- Challenges manager (list view)
- Store manager (list view)
- Leaderboard rewards (configure top 3 rewards)

### ✅ Receptionist Features
- Check-in dashboard
- Pending redemptions list
- QR code validator (placeholder)
- Confirm redemption functionality

## Features Still Needed

### 🔨 Gym Switcher & Impersonation
The gym switcher in the sidebar needs to:
1. Fetch all gyms from database
2. Allow selecting a gym to "impersonate"
3. Store selected gym in session/cookie
4. Update all queries to use selected gym instead of `admin_gym_id`

### 🔨 Challenge CRUD Forms
The challenges page currently only shows a list. Need to create:
- `/dashboard/challenges/new` - Create challenge form
- `/dashboard/challenges/[id]` - Edit challenge form

### 🔨 Store Item CRUD Forms
The store page needs:
- `/dashboard/store/new` - Create store item form
- `/dashboard/store/[id]` - Edit store item form

### 🔨 Gym Creation Form
The gyms page needs:
- Modal/form to create new gym
- Assign first gym admin during creation

### 🔨 QR Code Scanner
The receptionist dashboard needs:
- Actual QR code scanning functionality
- Validation against redemption IDs

## Styling

The dashboard uses a **Cyber-Dark** theme matching the mobile app:
- Background: `#000000` (pure black)
- Surface: `#0A0A0A`, `#1A1A1A` (elevated surfaces)
- Primary: `#00E5FF` (cyan)
- Secondary: `#FF9100` (orange)
- Text: `#FFFFFF`, `#B0B0B0`, `#808080` (various grays)

Glassmorphism effects are applied to cards using:
- `background: rgba(255, 255, 255, 0.05)`
- `backdrop-filter: blur(10px)`
- `border: 1px solid rgba(255, 255, 255, 0.1)`

## Environment Variables

Make sure you have these set in `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Running the Dashboard

```bash
cd apps/admin-panel
npm install
npm run dev
```

Visit `http://localhost:3000` and log in with your superadmin account.

## RLS Policy Summary

### Superadmin
- Can access ALL rows in all tables
- Uses `is_superadmin()` function check

### Gym Admin
- Can only access rows where `gym_id = admin_gym_id`
- Full CRUD on: challenges, rewards, gym_branding, leaderboard_rewards
- Read-only on: profiles, sessions, redemptions

### Receptionist
- Can only access rows where `gym_id = admin_gym_id`
- Read-only on: rewards, profiles, sessions
- Full access on: redemptions (to confirm)

## Next Steps

1. Implement gym switcher with session storage
2. Create challenge CRUD forms
3. Create store item CRUD forms
4. Add gym creation form
5. Integrate QR code scanner
6. Add image upload for branding (currently URL-based)
7. Add real-time updates using Supabase Realtime
8. Add analytics charts and graphs
