# SweatDrop Mobile App

React Native mobile application built with Expo and TypeScript.

## Setup (pnpm + env split)

1. Install dependencies:
```bash
pnpm install
```

2. Prepare local env templates:
```bash
cp apps/mobile-app/.env.dev.example apps/mobile-app/.env.dev.local
cp apps/mobile-app/.env.prod.example apps/mobile-app/.env.prod.local
```

3. Fill real values in `.env.dev.local` and `.env.prod.local` (never commit).

4. Select active local environment:
```bash
pnpm env:mobile:dev
# or
pnpm env:mobile:prod
```

This copies the selected local file to `apps/mobile-app/.env`, which is used by local Expo runs.

5. Start development server:
```bash
pnpm --filter sweatdrop-mobile-app start
```

## EAS build profile mapping

- `development` profile -> dev Supabase
- `preview` profile -> dev Supabase
- `production` profile -> prod Supabase

Set those values in EAS environment variables per profile.

## Common commands

- `pnpm --filter sweatdrop-mobile-app start`
- `pnpm --filter sweatdrop-mobile-app ios`
- `pnpm --filter sweatdrop-mobile-app android`
- `pnpm --filter sweatdrop-mobile-app web`
- `pnpm --filter sweatdrop-mobile-app lint`
- `pnpm --filter sweatdrop-mobile-app type-check`

Quick Expo keys:
- `i` open iOS simulator
- `a` open Android emulator
- `w` open web
- `r` reload app
