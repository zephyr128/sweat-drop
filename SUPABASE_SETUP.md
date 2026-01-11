# Supabase Setup Guide

This guide will help you set up your Supabase database for SweatDrop.

## Prerequisites

1. ✅ You've created a Supabase project in the web browser
2. ✅ You've added `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` to `apps/mobile-app/.env`

## Step 1: Run Database Migrations

You need to run the SQL migrations to create all the necessary tables, functions, and policies.

### Option A: Using Supabase Dashboard (Recommended for beginners)

1. Go to your Supabase project dashboard: https://app.supabase.com
2. Navigate to **SQL Editor** (in the left sidebar)
3. Click **New Query**
4. Copy the contents of `backend/supabase/migrations/20240101000001_sweatdrop_schema.sql`
5. Paste it into the SQL Editor
6. Click **Run** (or press Cmd+Enter / Ctrl+Enter)

**Note:** The migration will:
- Create all tables (gyms, equipment, profiles, sessions, etc.)
- Set up Row Level Security (RLS) policies
- Create functions and triggers
- Set up automatic profile creation on user signup

### Option B: Using Supabase CLI (Advanced)

If you have Supabase CLI installed:

```bash
cd backend
supabase db push
```

## Step 2: Enable Email Auth (if not already enabled)

1. Go to **Authentication** > **Providers** in your Supabase dashboard
2. Make sure **Email** provider is enabled
3. (Optional) Configure email templates

## Step 3: Verify Setup

1. Go to **Table Editor** in your Supabase dashboard
2. You should see the following tables:
   - `gyms`
   - `equipment`
   - `profiles`
   - `sessions`
   - `drops_transactions`
   - `rewards`
   - `redemptions`
   - `challenges`
   - `challenge_progress`
   - `gym_staff`

## Step 4: Test Registration

1. Run your mobile app: `cd apps/mobile-app && npm start`
2. Navigate to the auth screen
3. Try signing up with a test email
4. Check the `profiles` table in Supabase - you should see a new profile created automatically

## Step 5: Seed Data (Optional)

You can add some test data to get started:

### Add a Test Gym

In SQL Editor, run:

```sql
INSERT INTO public.gyms (name, city, country, address)
VALUES ('Test Gym', 'Test City', 'Test Country', '123 Test St');
```

### Add Test Equipment

```sql
-- First, get the gym ID from the gyms table
-- Then replace 'YOUR_GYM_ID' with the actual UUID
INSERT INTO public.equipment (gym_id, name, qr_code, equipment_type)
VALUES 
  ('YOUR_GYM_ID', 'Treadmill 1', 'TREADMILL-001', 'cardio'),
  ('YOUR_GYM_ID', 'Bench Press', 'BENCH-001', 'strength');
```

## How It Works

### User Registration Flow

1. User signs up via `supabase.auth.signUp()`
2. Supabase creates a user in `auth.users` table
3. The `handle_new_user()` trigger automatically:
   - Creates a profile in `profiles` table
   - Sets a temporary username (e.g., `user_abc12345`)
   - Copies email from auth user
4. User is redirected to username screen to set their real username
5. User can optionally select a home gym

### Authentication

- Users can sign up and sign in with email/password
- Sessions are automatically managed by Supabase
- RLS policies ensure users can only access their own data
- Profiles are automatically created on signup

## Troubleshooting

### Error: "function handle_new_user() does not exist"

- Make sure you ran the migration SQL in order
- Check that the function was created in the SQL Editor

### Error: "relation profiles does not exist"

- Make sure you ran the migration SQL
- Check that all tables were created in Table Editor

### Users can't sign up

- Check that Email auth is enabled in Authentication > Providers
- Verify your Supabase URL and Anon Key are correct in `.env`
- Check the Supabase logs for errors

### Profile not created on signup

- Check that the trigger `on_auth_user_created` exists
- Verify the function `handle_new_user()` exists and has correct permissions

## Next Steps

- ✅ User registration and login should now work
- ✅ Profiles are automatically created
- ✅ Users can set username and home gym
- 🔄 Add test gym and equipment data
- 🔄 Configure email templates (optional)
- 🔄 Set up OAuth providers (Google, Apple) if needed
