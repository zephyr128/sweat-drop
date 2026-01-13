# SweatDrop - Production Deployment Guide

## Overview

SweatDrop is a fitness tracking platform with:
- **Mobile App**: React Native + Expo for iOS and Android
- **Admin Panel**: Next.js 14 admin dashboard
- **Backend**: Supabase (PostgreSQL + Auth + Storage)

## Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- Supabase account and project
- Expo account (for mobile app builds)

## Environment Setup

### 1. Supabase Setup

1. Create a new Supabase project at https://supabase.com
2. Get your project URL and anon key from Settings → API
3. Run all migrations in order:
   ```bash
   cd backend/supabase
   # Apply migrations in order (00000 through 00011)
   ```

### 2. Admin Panel Environment Variables

Create `apps/admin-panel/.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key  # For server actions
```

### 3. Mobile App Environment Variables

Create `apps/mobile-app/.env`:
```env
EXPO_PUBLIC_SUPABASE_URL=your_supabase_project_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Database Setup

### Run Migrations

All migrations are in `backend/supabase/migrations/`. Run them in order:

```sql
-- Run each migration file in sequence:
-- 20240101000000_initial_schema.sql
-- 20240101000001_sweatdrop_schema.sql
-- ... (through 20240101000011_secure_redemption_system.sql)
```

### Create First Admin

Use one of the seed scripts:
- `SEED_ADMIN_QUICK.sql` - Quick setup with one superadmin
- `SEED_ADMIN_COMPLETE.sql` - Complete setup with gym and admin

## Features

### Mobile App
- ✅ User authentication (Email/Apple/Google)
- ✅ QR code scanning for equipment
- ✅ Real-time workout tracking
- ✅ Drops currency system (global + local per gym)
- ✅ Challenge system (daily/weekly/streak)
- ✅ Rewards store with redemption
- ✅ Leaderboards (gym/city/country)
- ✅ Wallet tracking

### Admin Panel
- ✅ Multi-tenant architecture (Superadmin/Gym Admin/Receptionist)
- ✅ Gym management
- ✅ Challenge management
- ✅ Store/rewards management
- ✅ Machine management
- ✅ Redemption validation with QR codes
- ✅ Branding customization
- ✅ Leaderboard rewards configuration

## Production Deployment

### Admin Panel (Next.js)

1. Build the app:
   ```bash
   cd apps/admin-panel
   npm run build
   ```

2. Deploy to Vercel/Netlify:
   - Connect your Git repository
   - Set environment variables
   - Deploy

### Mobile App (Expo)

1. Build for production:
   ```bash
   cd apps/mobile-app
   # iOS
   eas build --platform ios
   # Android
   eas build --platform android
   ```

2. Submit to app stores:
   ```bash
   eas submit --platform ios
   eas submit --platform android
   ```

## Security Checklist

- [x] RLS policies enabled on all tables
- [x] Server actions validate user permissions
- [x] Middleware enforces role-based routing
- [x] Environment variables properly secured
- [x] Service role key only used server-side
- [x] Input validation with Zod schemas
- [x] SQL injection protection (parameterized queries)

## Monitoring

- Set up Supabase monitoring for database performance
- Monitor Next.js build errors
- Track mobile app crashes via Expo/Sentry
- Monitor RLS policy violations

## Support

For issues or questions, check:
- `SUPABASE_SETUP.md` - Database setup
- `ADMIN_DASHBOARD_SETUP.md` - Admin panel setup
- `MULTI_TENANT_SETUP.md` - Multi-tenant architecture
