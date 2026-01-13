# Quick Admin Setup Guide

## Option 1: Create Admin via Supabase Dashboard (Recommended)

### Step 1: Create User in Supabase Auth

1. Go to your Supabase Dashboard
2. Navigate to **Authentication** → **Users**
3. Click **"Add user"** → **"Create new user"**
4. Enter:
   - **Email**: `admin@sweatdrop.com` (or your email)
   - **Password**: (choose a strong password)
   - **Auto Confirm User**: ✅ (check this)
5. Click **"Create user"**
6. **Copy the User ID** (you'll need it in the next step)

### Step 2: Update Profile to Superadmin

1. Go to **SQL Editor** in Supabase Dashboard
2. Run this query (replace `YOUR_USER_ID` with the ID from Step 1):

```sql
-- Update existing profile to superadmin
UPDATE public.profiles
SET 
  role = 'superadmin',
  admin_gym_id = NULL
WHERE id = 'YOUR_USER_ID';

-- If profile doesn't exist, create it:
INSERT INTO public.profiles (id, email, username, role, admin_gym_id)
VALUES (
  'YOUR_USER_ID',
  'admin@sweatdrop.com',
  'admin',
  'superadmin',
  NULL
)
ON CONFLICT (id) DO UPDATE
SET 
  role = 'superadmin',
  admin_gym_id = NULL;
```

### Step 3: Verify

Run this query to verify:

```sql
SELECT id, email, username, role, admin_gym_id 
FROM public.profiles 
WHERE role = 'superadmin';
```

## Option 2: Create Admin via SQL (If user already exists)

If you already have a user account:

1. Find your user ID:
```sql
SELECT id, email FROM auth.users WHERE email = 'your-email@example.com';
```

2. Update profile:
```sql
UPDATE public.profiles
SET 
  role = 'superadmin',
  admin_gym_id = NULL
WHERE id = (SELECT id FROM auth.users WHERE email = 'your-email@example.com');
```

## Option 3: Create Test Gym Admin

To create a gym admin (for testing gym-specific features):

```sql
-- 1. Create test gym
INSERT INTO public.gyms (id, name, city, country)
VALUES (
  gen_random_uuid(),
  'Test Gym',
  'Belgrade',
  'Serbia'
)
RETURNING id;

-- 2. Update user to be gym_admin (replace USER_ID and GYM_ID)
UPDATE public.profiles
SET 
  role = 'gym_admin',
  admin_gym_id = 'GYM_ID_FROM_STEP_1'
WHERE id = 'YOUR_USER_ID';
```

## Troubleshooting

### "No profile found"
If you get an error that profile doesn't exist, create it:

```sql
INSERT INTO public.profiles (id, email, username, role, admin_gym_id)
SELECT 
  id,
  email,
  COALESCE(raw_user_meta_data->>'username', split_part(email, '@', 1)),
  'superadmin',
  NULL
FROM auth.users
WHERE email = 'your-email@example.com'
ON CONFLICT (id) DO UPDATE
SET role = 'superadmin';
```

### "Cannot login"
- Make sure the user exists in `auth.users`
- Make sure the profile exists in `public.profiles`
- Make sure `role` is set to `'superadmin'`, `'gym_admin'`, or `'receptionist'`
- Check that RLS policies allow access (they should if you ran the migration)

### Verify Everything

Run this comprehensive check:

```sql
-- Check auth user
SELECT id, email, confirmed_at FROM auth.users WHERE email = 'your-email@example.com';

-- Check profile
SELECT id, email, username, role, admin_gym_id FROM public.profiles WHERE email = 'your-email@example.com';

-- Check RLS (should return true for your user)
SELECT public.is_superadmin('YOUR_USER_ID');
```
