# Git Branch and Deploy Policy (Dev -> Prod)

**Goal:** Keep production stable while enabling fast development.  
**Scope:** `apps/mobile-app`, `apps/admin-panel`, `backend/supabase`, release operations.

---

## 1) Branch model (locked)

- `main` = production branch
- `dev` (or `develop`) = integration/dev branch
- `feature/*` = short-lived task branches
- `hotfix/*` = production emergency fixes

Rules:
- No direct pushes to `main`.
- All changes go through PR.
- `feature/*` merges into `dev`.
- Production releases happen by `dev -> main` PR (or controlled cherry-pick for hotfix).

---

## 2) Environment mapping (locked)

- `dev` branch deploys only to **dev** infrastructure:
  - dev Supabase project
  - dev admin deployment
  - dev/preview mobile profiles
- `main` branch deploys only to **production** infrastructure:
  - prod Supabase project
  - prod admin deployment
  - production mobile profile

Never share service-role keys between environments.

---

## 3) CI gates per branch

## On PR to `dev`

Required checks:
- `pnpm test:release-preflight`
- `pnpm type-check`
- `pnpm test:smoke`

If DB migrations changed:
- migration files present in `backend/supabase/migrations/`
- migration IDs documented in `MIGRATION_NOTES.md`

## On PR to `main`

Required checks:
- all `dev` checks above
- `pnpm test:ci`
- no open P0/P1 blockers
- release manifest prepared (`docs/release/manifests/...`)

---

## 4) Mobile release policy

- Development/internal builds from `dev`:
  - `eas build --profile development`
  - `eas build --profile preview`
- Production store builds from `main` only:
  - `eas build --profile production`

Required env split:
- dev/preview profiles use dev Supabase URL + anon key
- production profile uses prod Supabase URL + anon key

Local switching:
- `pnpm env:mobile:dev`
- `pnpm env:mobile:prod`

---

## 5) Supabase migration policy

Flow:
1. create migration in feature branch
2. merge to `dev`
3. apply and verify on dev project
4. merge `dev -> main`
5. apply same migration artifact to prod project

Rules:
- no manual ad-hoc SQL in prod without migration artifact
- no editing historical applied migrations
- use forward-only fix migrations for corrections

---

## 6) Hotfix policy

For production incident:
1. create `hotfix/*` from `main`
2. implement minimal fix
3. run mandatory checks (`type-check`, `test:smoke`, relevant focused tests)
4. merge into `main` and deploy prod
5. back-merge hotfix into `dev` immediately

---

## 7) Protection settings (Git hosting)

Configure branch protection:
- `main`:
  - require PR
  - require status checks to pass
  - require at least 1 reviewer
  - restrict force-push and deletion
- `dev`:
  - require PR
  - require status checks
  - optional 1 reviewer (recommended)

---

## 8) Release checklist pointer

For production cut, use:
- `docs/release/GO_LIVE_DAY_OF_CHECKLIST.md`
- `docs/release/PRODUCTION_CUTOVER_COMMANDS.md`
- `docs/release/manifests/` (release manifest for that cut)

This policy defines branch/deploy rules; release docs define day-of execution.
