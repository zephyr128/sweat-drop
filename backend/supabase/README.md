# Supabase Backend

This directory contains all Supabase-related files for the SweatDrop backend.

## Structure

```
supabase/
├── migrations/          # Database migrations (run in order)
├── functions/           # Edge Functions
├── config.toml          # Supabase local config
└── *.sql               # Seed and setup scripts
```

## Migrations

All migrations should be run in order. They are numbered sequentially:

1. `20240101000000_initial_schema.sql` - Initial database schema
2. `20240101000001_sweatdrop_schema.sql` - Core SweatDrop tables
3. `20240101000002_add_gym_branding.sql` - Gym branding support
4. `20240101000003_dual_wallet_system.sql` - Local + global drops
5. `20240101000004_admin_rbac_system.sql` - Admin roles and permissions
6. `20240101000005_enhanced_rbac_routing.sql` - Enhanced RBAC
7. `20240101000006_fix_gym_staff_recursion.sql` - Fix gym staff recursion
8. `20240101000007_cardio_challenge_system.sql` - Cardio challenges
9. `20240101000008_add_streak_challenges.sql` - Streak challenges
10. `20240101000009_machine_management.sql` - Machine management
11. `20240101000010_fix_challenge_progress_ambiguous.sql` - Fix ambiguous columns
12. `20240101000011_secure_redemption_system.sql` - Secure redemption system

## Running Migrations

### Local Development
```bash
supabase db reset  # Resets and applies all migrations
```

### Production
Apply migrations manually via Supabase Dashboard SQL Editor or using Supabase CLI:
```bash
supabase db push
```

## Seed Scripts

- `SEED_ADMIN_QUICK.sql` - Quick admin setup (recommended for first setup)
- `SEED_ADMIN_COMPLETE.sql` - Complete setup with gym
- `seed_admin.sql` - Alternative admin seed
- `seed_gyms.sql` - Sample gyms
- `seed_equipment.sql` - Sample equipment

## Edge Functions

- `reset-challenges/` - Cron job to reset daily/weekly challenges

## Setup Scripts

- `QUICK_SETUP.sql` - Quick database setup
- `RUN_MIGRATION.sql` - Migration runner template
- `TEST_DUAL_WALLET.sql` - Test dual wallet system

## Documentation

- `ADMIN_LOGIN_INSTRUCTIONS.md` - How to create admin accounts
- `CHALLENGE_RESET_SETUP.md` - Challenge reset automation
- `MULTI_GYM_SETUP.md` - Multi-gym configuration
- `QUICK_ADMIN_SETUP.md` - Quick admin setup guide
