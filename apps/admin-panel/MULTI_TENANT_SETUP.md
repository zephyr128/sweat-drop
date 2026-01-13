# Multi-Tenant Admin Dashboard Setup

This document explains the multi-tenant architecture implementation for the SweatDrop admin panel.

## Architecture Overview

The system supports two main roles:
- **Superadmin**: Global access, can view and manage all gyms
- **Gym Admin**: Restricted to their assigned gym only

## Database Schema

### Profiles Table
- `role`: Enum (`superadmin`, `gym_admin`, `receptionist`, `user`)
- `admin_gym_id`: UUID reference to `gyms.id` (nullable for superadmin, required for gym_admin)

### Constraints
- `gym_admin` must have `admin_gym_id` set
- `superadmin` must have `admin_gym_id` as NULL

## RLS Policies

### Gyms Table
- **Superadmin**: Full CRUD access to all gyms
- **Gym Admin**: SELECT and UPDATE only their own gym (where `admin_gym_id = gym.id`)

### Challenges & Rewards Tables
- **Superadmin**: Full CRUD access to all records
- **Gym Admin**: Full CRUD access only to records where `gym_id = admin_gym_id`

## Routing Structure

### Superadmin Routes
- `/dashboard` - Global dashboard
- `/dashboard/gyms` - Gym management list
- `/dashboard/gym/[id]/dashboard` - View specific gym dashboard
- `/dashboard/gym/[id]/challenges` - Manage gym challenges
- `/dashboard/gym/[id]/store` - Manage gym store
- `/dashboard/gym/[id]/branding` - Update gym branding

### Gym Admin Routes
- `/dashboard/gym/[their_gym_id]/dashboard` - Their gym dashboard (auto-redirected)
- `/dashboard/gym/[their_gym_id]/challenges` - Manage their challenges
- `/dashboard/gym/[their_gym_id]/store` - Manage their store
- `/dashboard/gym/[their_gym_id]/branding` - Update their branding

**Note**: Gym admins are automatically redirected to their gym's dashboard. They cannot access the global dashboard or other gyms.

## Middleware Protection

The `middleware.ts` file enforces:
1. Authentication check (redirects to `/login` if not authenticated)
2. Role-based routing:
   - `gym_admin` → Redirected to `/dashboard/gym/[their_gym_id]/dashboard`
   - `superadmin` → Can access all routes
3. Gym access validation for gym-specific routes

## Server Actions

### `createGym(input)`
Creates a new gym in the database. Superadmin only.

### `createGymAdmin(input)`
Creates both:
1. Auth user in Supabase Auth
2. Profile entry with `role = 'gym_admin'` and `admin_gym_id` set

**Input:**
```typescript
{
  email: string;
  password: string;
  username: string;
  gymId: string;
}
```

### `assignGymAdmin(userId, gymId)`
Assigns an existing user as gym admin for a specific gym.

## Environment Variables

Required in `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key  # For server actions
```

## Setup Steps

1. **Run SQL Migration**
   ```sql
   -- Run in Supabase SQL Editor
   -- File: backend/supabase/migrations/20240101000005_enhanced_rbac_routing.sql
   ```

2. **Set Environment Variables**
   - Add `SUPABASE_SERVICE_ROLE_KEY` to `.env.local`
   - This key is required for server actions that create auth users

3. **Create Superadmin**
   ```sql
   -- In Supabase SQL Editor
   UPDATE public.profiles
   SET role = 'superadmin', admin_gym_id = NULL
   WHERE id = 'your-user-id';
   ```

4. **Test Gym Creation**
   - Login as superadmin
   - Navigate to `/dashboard/gyms`
   - Click "+ Create New Gym"
   - Fill form and optionally create gym admin

## Gym Switcher

The sidebar gym switcher (superadmin only):
- Fetches all gyms from database
- On selection, navigates to `/dashboard/gym/[selected_id]/dashboard`
- Uses `sessionStorage` for persistence

## Context-Aware Data Fetching

All gym-specific pages use the `[id]` param from the URL:
```typescript
// Example: /dashboard/gym/[id]/challenges/page.tsx
const { data } = await supabase
  .from('challenges')
  .select('*')
  .eq('gym_id', params.id)  // Uses URL param
```

This ensures:
- Superadmin can view any gym by changing the URL
- Gym admin is restricted to their own gym (enforced by middleware)

## Security Notes

1. **RLS Policies**: All tables have Row Level Security enabled
2. **Middleware**: Validates access before rendering pages
3. **Server Actions**: Use service role key for admin operations
4. **Constraints**: Database constraints prevent invalid role/gym_id combinations

## Troubleshooting

### "Cannot access gym" error
- Check RLS policies are applied
- Verify user's `admin_gym_id` matches the gym ID in URL
- Check middleware logs in browser console

### Gym admin redirected incorrectly
- Verify `admin_gym_id` is set in profiles table
- Check middleware logic for role-based routing

### Server action fails
- Verify `SUPABASE_SERVICE_ROLE_KEY` is set
- Check Supabase logs for detailed errors
- Ensure service role key has proper permissions
