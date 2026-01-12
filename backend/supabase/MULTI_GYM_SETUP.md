# Multi-Gym Setup Guide for Supabase

This guide will help you set up multi-gym support in your Supabase database.

## Step 1: Run the Migration

The migration adds branding fields to the `gyms` table:

```sql
-- File: migrations/20240101000002_add_gym_branding.sql
```

**To run in Supabase Dashboard:**

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Click **New Query**
4. Copy and paste the contents of `20240101000002_add_gym_branding.sql`
5. Click **Run** (or press Cmd/Ctrl + Enter)

**Or via Supabase CLI:**

```bash
cd backend/supabase
supabase db push
```

## Step 2: Add Seed Data

Insert test gyms with different branding:

**Option A: Via Supabase Dashboard**

1. Go to **SQL Editor**
2. Copy and paste the contents of `seed_gyms.sql`
3. Click **Run**

**Option B: Via Supabase CLI**

```bash
cd backend/supabase
psql -h <your-db-host> -U postgres -d postgres -f seed_gyms.sql
```

## Step 3: Verify the Setup

Run this query to verify gyms were created:

```sql
SELECT 
  id,
  name,
  city,
  country,
  primary_color,
  background_url,
  logo_url
FROM public.gyms
ORDER BY name;
```

You should see 3 test gyms:
- **Elite Fitness Center** (Cyan: #00E5FF)
- **Power Gym** (Red: #FF6B6B)
- **Zenith Athletics** (Teal: #4ECDC4)

## Step 4: Set User's Home Gym (Optional)

To test with a specific user, set their home gym:

```sql
-- Replace 'user-id-here' with actual user ID
UPDATE public.profiles
SET home_gym_id = '550e8400-e29b-41d4-a716-446655440001' -- Elite Fitness Center
WHERE id = 'user-id-here';
```

## Step 5: Test in App

1. Open the app
2. Tap the gym selector chip in the header
3. You should see all 3 gyms in the list
4. Select different gyms to see color changes
5. Notice the locked state when previewing a gym that's not your home gym

## Adding Custom Branding

To add custom branding to a gym:

```sql
UPDATE public.gyms
SET 
  primary_color = '#FF9100', -- Orange
  background_url = 'https://example.com/gym-background.jpg',
  logo_url = 'https://example.com/gym-logo.png',
  updated_at = NOW()
WHERE id = 'gym-id-here';
```

## Color Format

- Use hex format: `#RRGGBB` (e.g., `#00E5FF`)
- The app will automatically generate darker/lighter variations
- If `primary_color` is NULL, the app uses the default cyan theme

## Background and Logo URLs

- Use full URLs (https://...)
- Images should be publicly accessible
- Recommended formats:
  - Background: JPG/PNG, 1080x1920 or similar
  - Logo: PNG with transparency, square format (512x512 or larger)

## Troubleshooting

**Gyms not showing in app:**
- Check RLS policies allow reading gyms
- Verify gyms exist: `SELECT * FROM public.gyms;`

**Colors not changing:**
- Ensure `primary_color` is in hex format
- Check that `activeGym` is being set correctly in the app

**Locked state not working:**
- Verify user has `home_gym_id` set in profiles table
- Check that `previewGymId` logic is working
