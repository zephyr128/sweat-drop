# SweatDrop — Dev / Prod Environment Guide

## Quick Reference

| Environment | Git Branch     | Supabase Project               | Mobile `.env` source  | Admin `.env.local` source |
|-------------|----------------|--------------------------------|-----------------------|---------------------------|
| Development | `features/dev` | `jzyoyxabcdzvqcfnfzrz`        | `.env.dev.local`      | `.env.dev.local`          |
| Production  | `main`         | `gyqgdfqnatuegwyidrii`         | `.env.prod.local`     | `.env.prod.local`         |

---

## 1. Git Branch Strategy

```
main              ← production (stable releases only)
features/dev      ← daily development
```

- **`features/dev`** — all development happens here. Local dev, testing, PRs.
- **`main`** — production only. Merge from `features/dev` when ready to release.

---

## 2. Switching Environments

### Switch everything at once

```bash
# Switch ALL workspaces to dev
pnpm env:dev

# Switch ALL workspaces to production
pnpm env:prod
```

### Switch individual workspaces

```bash
# Admin panel only
pnpm env:admin:dev
pnpm env:admin:prod

# Mobile app only
pnpm env:mobile:dev
pnpm env:mobile:prod
```

### What the scripts do

| Script              | Copies from                                | Into                              |
|---------------------|--------------------------------------------|-----------------------------------|
| `env:admin:dev`     | `apps/admin-panel/.env.dev.local`          | `apps/admin-panel/.env.local`     |
| `env:admin:prod`    | `apps/admin-panel/.env.prod.local`         | `apps/admin-panel/.env.local`     |
| `env:mobile:dev`    | `apps/mobile-app/.env.dev.local`           | `apps/mobile-app/.env`            |
| `env:mobile:prod`   | `apps/mobile-app/.env.prod.local`          | `apps/mobile-app/.env`            |

All `.env*.local` files are gitignored — secrets never enter version control.

---

## 3. Daily Development (features/dev branch)

```bash
# 1. Make sure you're on the dev branch
git checkout features/dev

# 2. Switch to dev environment (if not already)
pnpm env:dev

# 3. Start the admin panel
pnpm dev:admin
# Opens at http://localhost:3000

# 4. Start the mobile app (separate terminal)
pnpm dev:mobile
# Then press 'a' for Android or 'i' for iOS in Expo CLI

# 5. Android shortcut (builds + runs)
pnpm android:dev

# 6. iOS shortcut (builds + opens Xcode)
pnpm ios:build
```

---

## 4. Running Against Production

### Admin Panel (production)

```bash
# 1. Switch admin to production Supabase
pnpm env:admin:prod

# 2. Run locally (still localhost, but reads/writes prod DB)
pnpm dev:admin

# 3. When done, switch back to dev!
pnpm env:admin:dev
```

### Mobile App (production)

```bash
# 1. Switch mobile to production Supabase
pnpm env:mobile:prod

# 2. Run the app
pnpm dev:mobile

# 3. When done, switch back to dev!
pnpm env:mobile:dev
```

> **Warning:** When running against production, you are reading/writing real user data. Be careful.

---

## 5. Building for Production Release

### Admin Panel → Vercel

Set these environment variables in the **Vercel dashboard** (Settings > Environment Variables):

| Variable                             | Value                                           |
|--------------------------------------|------------------------------------------------|
| `NEXT_PUBLIC_SUPABASE_URL`           | `https://gyqgdfqnatuegwyidrii.supabase.co`     |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`      | `sb_publishable_dQ1RrnPkw6LfSN6vBBKfPg_KypuAfxG` |
| `SUPABASE_SERVICE_ROLE_KEY`          | *(from Supabase dashboard > Settings > API)*    |
| `NEXT_PUBLIC_APP_URL`                | `https://admin.sweat-drop.com` *(your domain)*  |

Then deploy:

```bash
git checkout main
git merge features/dev
git push origin main
# Vercel auto-deploys from main
```

### Mobile App → EAS Build

Set secrets in EAS:

```bash
cd apps/mobile-app

# Set production secrets in EAS
eas secret:create --name EXPO_PUBLIC_SUPABASE_URL \
  --value "https://gyqgdfqnatuegwyidrii.supabase.co" \
  --scope project

eas secret:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY \
  --value "sb_publishable_dQ1RrnPkw6LfSN6vBBKfPg_KypuAfxG" \
  --scope project
```

Build for stores:

```bash
# Android (AAB for Google Play)
eas build --platform android --profile production

# iOS (IPA for App Store)
eas build --platform ios --profile production

# Submit to stores
eas submit --platform android
eas submit --platform ios
```

---

## 6. Environment Files Reference

### Admin Panel (`apps/admin-panel/`)

| File              | Purpose                    | Committed? |
|-------------------|----------------------------|------------|
| `.env.example`    | Template for new devs      | Yes        |
| `.env.dev.local`  | Dev Supabase credentials   | No         |
| `.env.prod.local` | Prod Supabase credentials  | No         |
| `.env.local`      | Active env (auto-generated)| No         |

**Variables used:**

| Variable                        | Required | Description                    |
|---------------------------------|----------|--------------------------------|
| `NEXT_PUBLIC_SUPABASE_URL`      | Yes      | Supabase project URL           |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes      | Supabase publishable/anon key  |
| `SUPABASE_SERVICE_ROLE_KEY`     | Yes*     | Service role key (admin ops)   |
| `NEXT_PUBLIC_APP_URL`           | No       | App URL for redirects          |
| `RESEND_API_KEY`                | No       | Email sending (invites)        |
| `RESEND_FROM_EMAIL`             | No       | From address for emails        |

*Service role key is needed for admin operations like inviting staff.

### Mobile App (`apps/mobile-app/`)

| File              | Purpose                    | Committed? |
|-------------------|----------------------------|------------|
| `.env.example`    | Template for new devs      | Yes        |
| `.env.dev.example`| Template (dev-specific)    | Yes        |
| `.env.prod.example`| Template (prod-specific)  | Yes        |
| `.env.dev.local`  | Dev Supabase credentials   | No         |
| `.env.prod.local` | Prod Supabase credentials  | No         |
| `.env`            | Active env (auto-generated)| No         |

**Variables used:**

| Variable                          | Required | Description                    |
|-----------------------------------|----------|--------------------------------|
| `EXPO_PUBLIC_SUPABASE_URL`        | Yes      | Supabase project URL           |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY`   | Yes      | Supabase publishable/anon key  |
| `EXPO_PUBLIC_APP_ENV`             | No       | `development` or `production`  |
| `EXPO_PUBLIC_PUSH_ENABLED`        | No       | Enable push notifications      |
| `EXPO_PUBLIC_EAS_PROJECT_ID`      | Yes      | EAS project UUID               |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`| Yes      | Google Sign-In (web)           |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`| Yes      | Google Sign-In (iOS)           |
| `EXPO_PUBLIC_SITE_URL`            | Yes      | Landing page URL — used as `emailRedirectTo` base for email confirm (`/auth/confirm`) and password reset (`/auth/reset`) emails. Must match the deployed landing page domain (`https://www.sweat-drop.com` in prod). |
| `EXPO_PUBLIC_TERMS_URL`           | No       | Terms of service URL           |
| `EXPO_PUBLIC_PRIVACY_URL`         | No       | Privacy policy URL             |
| `EXPO_PUBLIC_SENTRY_DSN`          | No       | Sentry error tracking          |
| `EXPO_PUBLIC_DEV_QR_UUID`         | No       | Dev-only QR code bypass        |

---

## 7. Supabase Projects

| Environment | Project ID            | Dashboard                                                 |
|-------------|-----------------------|-----------------------------------------------------------|
| Development | `jzyoyxabcdzvqcfnfzrz` | https://supabase.com/dashboard/project/jzyoyxabcdzvqcfnfzrz |
| Production  | `gyqgdfqnatuegwyidrii` | https://supabase.com/dashboard/project/gyqgdfqnatuegwyidrii |

### Applying migrations to production

```bash
cd backend

# Link to production project (one-time setup)
supabase link --project-ref gyqgdfqnatuegwyidrii

# Push all migrations to production
supabase db push
```

### Applying migrations to dev

```bash
cd backend

# Link to dev project
supabase link --project-ref jzyoyxabcdzvqcfnfzrz

# Push migrations
supabase db push
```

---

## 8. First-Time Setup (New Developer)

```bash
# 1. Clone and install
git clone <repo-url>
cd sweatdrop
git checkout features/dev
pnpm install

# 2. Get credentials from team lead, then create local env files:
#    apps/admin-panel/.env.dev.local   (copy from .env.example, fill in real values)
#    apps/admin-panel/.env.prod.local  (copy from .env.example, fill in prod values)
#    apps/mobile-app/.env.dev.local    (copy from .env.dev.example, fill in real values)
#    apps/mobile-app/.env.prod.local   (copy from .env.prod.example, fill in prod values)

# 3. Activate dev environment
pnpm env:dev

# 4. Start developing
pnpm dev:admin    # Admin panel on http://localhost:3000
pnpm dev:mobile   # Mobile app via Expo
```

---

## 9. Safety Checklist

- [ ] Never commit `.env.local`, `.env.dev.local`, `.env.prod.local`, or `.env` files
- [ ] Always switch back to dev after testing against production (`pnpm env:dev`)
- [ ] Set production env vars in Vercel/EAS dashboards for CI/CD, not in code
- [ ] Rotate keys if they are accidentally committed (Supabase dashboard > Settings > API > Regenerate)
- [ ] Production deploys only from `main` branch
- [ ] Development work only on `features/dev` branch
