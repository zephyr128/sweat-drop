# SweatDrop Admin Panel

Multi-tenant admin dashboard for managing gyms, challenges, store items, and redemptions.

## Setup

### 1. Environment Variables

Create a `.env.local` file in the `apps/admin-panel` directory:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

You can find these values in your Supabase project settings under API.

### 2. Install Dependencies

```bash
cd apps/admin-panel
npm install
```

### 3. Run Database Migration

Before using the admin panel, you need to run the RBAC migration in Supabase:

1. Open Supabase SQL Editor
2. Run: `backend/supabase/migrations/20240101000004_admin_rbac_system.sql`
3. Set your user as superadmin:
   ```sql
   UPDATE public.profiles
   SET role = 'superadmin'
   WHERE id = 'YOUR_USER_ID';
   ```

### 4. Start Development Server

```bash
npm run dev
```

Visit `http://localhost:3000` and log in.

## Troubleshooting

### Error: "supabaseUrl is required"

This means your environment variables are not set. Make sure:
1. You have created `.env.local` file
2. The file contains `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. You've restarted the dev server after adding env vars

### Error: "Cannot find module 'react-dom/server.browser'"

This is usually a dependency issue. Try:

```bash
# Clear Next.js cache
rm -rf .next

# Reinstall dependencies
npm install

# If that doesn't work, try:
npm install react-dom@^18.2.0 --save-exact
```

### Build Errors

If you encounter build errors, make sure:
- All dependencies are installed: `npm install`
- Environment variables are set
- Database migration has been run
- Your user has the correct role in the database

## Features

- **Superadmin**: Global dashboard, gym management, impersonation
- **Gym Admin**: Branding, challenges, store, leaderboard rewards
- **Receptionist**: Check-in, redemption validation

See `ADMIN_DASHBOARD_SETUP.md` for detailed documentation.
