# Production Environment Split Runbook (Dev vs Prod)

**Goal:** Ensure `develop` deploys only to dev infrastructure and `main` deploys only to production.

**Companion policy:** `docs/plans/git_branch_and_deploy_policy.md`

## Scope

- `apps/mobile-app`
- `apps/admin-panel`
- `backend/supabase` (DB, edge functions, cron, storage policies)

## Rules (Locked)

1. Dev and prod must use different Supabase project refs.
2. No shared service-role keys between environments.
3. Mobile dev build must never point to prod Supabase URL.
4. Admin dev deployment must never point to prod Supabase URL.
5. Edge functions must be deployed separately per environment.

## Execution Steps

### 1) Supabase Projects
- Create/verify two projects:
  - `sweatdrop-dev`
  - `sweatdrop-prod`
- Export each project ref and API URLs into separate secret stores.

### 2) Mobile Environment Split
- Define env keys per build profile:
  - `EXPO_PUBLIC_SUPABASE_URL`
  - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
  - `EXPO_PUBLIC_EAS_PROJECT_ID`
  - `EXPO_PUBLIC_PUSH_ENABLED`
- Ensure `development`/`preview` use dev values.
- Ensure `production` uses prod values.
- Local workflow (safe switch):
  - keep `apps/mobile-app/.env.dev.local` and `apps/mobile-app/.env.prod.local` out of git,
  - run `pnpm env:mobile:dev` or `pnpm env:mobile:prod` to generate active `apps/mobile-app/.env`.

### 3) Admin Environment Split
- Dev deployment variables:
  - `NEXT_PUBLIC_SUPABASE_URL` (dev)
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (dev)
- Prod deployment variables:
  - `NEXT_PUBLIC_SUPABASE_URL` (prod)
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (prod)
- Optional (same pattern on **both** environments; values differ if legal/support hosts differ):
  - `NEXT_PUBLIC_PRIVACY_POLICY_URL` — stable HTTPS privacy policy (store + in-app parity)
  - `NEXT_PUBLIC_TERMS_OF_SERVICE_URL` — stable HTTPS terms of service
  - `NEXT_PUBLIC_SUPPORT_URL` — support or contact page for listings
- Template and comments: `apps/admin-panel/.env.example` (never commit real keys or secrets).
- Superadmin **Control Tower** (`/dashboard/super`) surfaces configured legal/support links read-only for verification.
- Add branch protection:
  - `develop` -> dev deployment
  - `main` -> prod deployment

### 4) Supabase CLI + Migrations Discipline
- Keep separate CLI linkage contexts (or separate CI jobs) for dev/prod.
- Migrations flow:
  1. apply to dev,
  2. verify,
  3. promote to prod.
- No direct manual SQL in prod without migration artifact.

### 5) Edge Function Split
- Deploy functions to dev project first.
- Verify behavior with dev tokens and dev DB only.
- Deploy same commit hash to prod after QA gate.

### 6) Secret Hygiene
- Do not store live secrets in repo.
- Rotate keys if leaked.
- Keep APNs/Firebase keys environment-specific.

## Verification Checklist

- [ ] Mobile dev build points to dev Supabase URL.
- [ ] Mobile prod build points to prod Supabase URL.
- [ ] Admin dev deployment points to dev Supabase URL.
- [ ] Admin prod deployment points to prod Supabase URL.
- [ ] Dev writes are invisible in prod DB and vice versa.
- [ ] Edge function invocation in dev cannot mutate prod data.
- [ ] Push credentials tested in both environments.

## Rollback Plan

If wrong-environment wiring is detected:
1. Stop deployments.
2. Revoke leaked/incorrect keys.
3. Correct deployment variables.
4. Rebuild/redeploy affected app(s).
5. Run smoke test: auth, checkin, workout, redeem, push.
