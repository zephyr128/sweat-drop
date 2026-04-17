# Bugfix: Admin Password Reset Opens Mobile App (Critical Security)

**Date:** 2026-04-17
**Severity:** 🔴 **CRITICAL — Privilege escalation via cross-surface session leak**
**Author:** Architect

---

## Context

### The Bug (Reproduced)

1. A **superadmin** clicks "Forgot password" in the **admin panel** (`apps/admin-panel/app/forgot-password`).
2. The admin opens the reset email **on a mobile device that has the SweatDrop mobile app installed**.
3. The reset link (`https://www.sweat-drop.com/auth/confirm?...&type=recovery`) is intercepted by the mobile app as an **Android App Link / iOS Universal Link**.
4. The mobile app calls `supabase.auth.setSession()` with the recovery tokens and persists them to AsyncStorage.
5. After killing and reopening the mobile app, the user is **silently logged in as the superadmin** — with full superadmin privileges inside the consumer mobile app.

### Root Cause

The bug has **four compounding causes** that must all be addressed:

1. **Email template ignores `redirectTo`.** `backend/supabase/templates/reset_password.html` (line 89) hardcodes the URL to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`. `.SiteURL` is `https://www.sweat-drop.com` (see `backend/supabase/config.toml` line 6). Whether the admin panel or the mobile app calls `resetPasswordForEmail(email, { redirectTo: ... })`, the email **always points at the landing/app domain**.

2. **Landing domain is bound to the mobile app via Universal/App Links.** `apps/mobile-app/app.config.js` registers `applinks:sweat-drop.com` + `applinks:www.sweat-drop.com`, and the generated `AndroidManifest.xml` has `autoVerify="true"` intent filters for `/auth/confirm` and `/auth/reset` on those hosts. So the reset link opens directly in the app.

3. **Mobile app blindly calls `setSession()` with tokens from any `auth/confirm` deep link.** `apps/mobile-app/app/_layout.tsx` (`parseAuthTokensFromUrl` → `supabase.auth.setSession`) has **no verification that the authenticating account is a regular user**. It will happily accept a `superadmin`/`gym_admin`/`receptionist` session and persist it.

4. **Admin panel reset-success page deep-links to `sweatdrop://`.** `apps/admin-panel/app/auth/reset/ResetPasswordForm.tsx` (lines 50–61, 153–167) builds and triggers a `sweatdrop://auth/confirm?...&type=recovery&password_updated=1` deep link after an admin successfully resets a password. This hands admin session tokens to the mobile app on purpose. That was written for consumer UX and is actively harmful for admin accounts.

### What We Want

| Surface the admin used | Where the reset link must open | Can it open mobile app? |
| --- | --- | --- |
| **Admin panel** (`admin.sweat-drop.com/forgot-password`) | Browser only — on `admin.sweat-drop.com/auth/confirm` → `admin.sweat-drop.com/auth/reset` | ❌ Never |
| **Mobile app** (existing "Forgot password" inside the app) | Unchanged — `www.sweat-drop.com/auth/confirm` → deep link into the mobile app | ✅ Yes (current behavior is correct) |

Additionally:
- The landing page `/auth/confirm` + `/auth/reset` pages must **never** show an "Open SweatDrop" CTA or auto-deep-link when the flow originated from the admin panel (belt-and-suspenders — in practice the admin flow never reaches the landing page after this fix, but legacy links may still exist in inboxes).
- The mobile app must **reject and sign out** any session whose `profile.role` is not `user` (defense-in-depth; prevents any future regression from re-introducing the same class of bug).

---

## Dependencies

- [ ] Supabase project has DNS / Vercel routing for `https://admin.sweat-drop.com` already configured (verified — see `backend/supabase/config.toml` `additional_redirect_urls` lines 13–14).
- [ ] `admin.sweat-drop.com` is **not** in `applinks:` (verified — `app.config.js` line 32 and `AndroidManifest.xml`).
- [ ] `NEXT_PUBLIC_APP_URL=https://admin.sweat-drop.com` is set in the admin-panel production environment (Vercel).
- [ ] No work has been started on related files (git status confirms only mobile-app + locale changes pending; none of the files this plan touches are dirty).

---

## Execution Plan

> **Rule of thumb for coders:** every step below is atomic and can be reviewed on its own. Do not bundle steps across workspaces.

### Step 1: Email template — route admin vs mobile resets by `redirectTo` (supabase-dba)

**File:** `backend/supabase/templates/reset_password.html`

1. Replace the hardcoded CTA URL
   ```
   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery
   ```
   with a conditional block driven by `{{ .RedirectTo }}` so admin resets never hit the landing/app domain:

   **Pseudocode (Go template syntax — do not copy as-is, DBA to finalize):**
   ```
   {{ $isAdmin := or (hasPrefix .RedirectTo "https://admin.sweat-drop.com") (hasPrefix .RedirectTo "http://localhost:3000") }}
   {{ if $isAdmin }}
     {{ $confirm := printf "%s/auth/confirm?token_hash=%s&type=recovery" .RedirectTo .TokenHash }}
     …CTA href = {{ $confirm }}…
     …body copy: "This link lets you set a new password for your SweatDrop admin account. It will not open the consumer app."…
   {{ else }}
     {{ $confirm := printf "%s/auth/confirm?token_hash=%s&type=recovery" .SiteURL .TokenHash }}
     …CTA href = {{ $confirm }}…
     …existing body copy (mobile / consumer)…
   {{ end }}
   ```

2. Verify available template functions (`hasPrefix`, `printf`, `contains`) against the Supabase Auth email template docs; adjust to whatever Supabase's Go-template sandbox supports. If `hasPrefix`/`contains` is unavailable, fall back to splitting on `://` and comparing the host, or pass the surface explicitly via `{{ .Data.surface }}` (see Step 2 alternative).

3. Keep the subject line the same (`Reset your SweatDrop password`). The "Security" notice stays, but update the "If you didn't request this" text to reflect admin vs user vocabulary when `$isAdmin` is true.

4. **No SQL migration** is required for this step — only the template file changes. Apply via the same Supabase deploy pipeline the team uses for templates today.

**Testing:**
- Manually trigger a reset from `admin.sweat-drop.com/forgot-password` → email CTA must point at `https://admin.sweat-drop.com/auth/confirm?token_hash=...&type=recovery`.
- Manually trigger a reset from the mobile app → email CTA must still point at `https://www.sweat-drop.com/auth/confirm?token_hash=...&type=recovery`.

---

### Step 2 (Alternative / Fallback to Step 1): Explicit surface via `data` (supabase-dba + admin-coder + mobile-coder)

Only use this step **if** the template-function approach in Step 1 cannot be implemented cleanly (e.g. Supabase Auth template engine does not support `hasPrefix`/`contains`).

- `resetPasswordForEmail()` accepts `options.data` which is surfaced as `{{ .Data.* }}` in templates.
- Admin panel: pass `data: { surface: 'admin' }`.
- Mobile app: pass `data: { surface: 'mobile' }` (or omit).
- Template branches on `{{ if eq .Data.surface "admin" }} … {{ else }} … {{ end }}`.

Prefer Step 1 because it cannot be bypassed by a client forgetting to pass `data`.

---

### Step 3: Admin panel — send the correct `redirectTo` and stop deep-linking to `sweatdrop://` (admin-coder)

#### 3a. `apps/admin-panel/app/forgot-password/ForgotPasswordForm.tsx`

- Keep `redirectTo: ${appUrl}/auth/confirm`, but make it **explicit** that `appUrl` must be the admin panel's origin:
  - Read `process.env.NEXT_PUBLIC_APP_URL` (already present).
  - If unset in production, throw a visible configuration error instead of silently falling back to `window.location.origin` — because a misconfigured fallback is exactly how this bug was masked.
  - Add a developer assertion: the host must not match `sweat-drop.com` / `www.sweat-drop.com`. If it does, fail fast with a descriptive error.

#### 3b. `apps/admin-panel/app/auth/reset/ResetPasswordForm.tsx`

- **Remove every `sweatdrop://` deep-link construction and navigation** from this file. Specifically:
  - Delete lines ~50–61 (the `setTimeout(() => { window.location.href = deepLink; }, 800);` block inside `handleSubmit`).
  - Delete the entire `SuccessState` implementation's `handleOpenApp` and the "Open SweatDrop" button (lines ~153–167 and the JSX button).
  - Replace with an admin-appropriate success state:
    - Heading: "Password updated"
    - Body: "You can now sign in to the admin panel with your new password."
    - Primary CTA: link to `/login` (admin panel login).
  - Do **not** redirect to the mobile app under any circumstance.

#### 3c. `apps/admin-panel/app/auth/confirm/route.ts`

- Already correct: it calls `verifyOtp` then redirects to `/auth/reset` (admin panel). No changes required.
- Add a comment at the top documenting: "This route MUST stay on the admin panel domain. Never redirect to sweat-drop.com / sweatdrop:// from here."

**Testing:**
- Start an admin reset → email opens `admin.sweat-drop.com/auth/confirm?...` → redirects to `admin.sweat-drop.com/auth/reset` → set new password → success page stays on `admin.sweat-drop.com`, offers "Back to admin panel login", never attempts `sweatdrop://`.
- Network inspector confirms zero requests to `sweat-drop.com` during admin reset.

---

### Step 4: Mobile app — defense-in-depth against admin sessions (mobile-coder)

Even if Steps 1–3 are implemented perfectly, the app must refuse to accept elevated-role sessions. This is the safety net.

#### 4a. New helper: `apps/mobile-app/lib/auth/isConsumerAccount.ts`

- Export a small pure function `isConsumerRole(role: string | null | undefined): boolean` that returns `true` only if `role === 'user'` (or whatever the app's canonical consumer role is — confirm against `backend/types/database.types.ts` and existing `profile.role` values in `authStore.ts`).
- Export a second helper `rejectElevatedSession(reason: string): Promise<void>` that:
  1. Calls `supabase.auth.signOut()`.
  2. Clears the persisted auth store (`useAuthStore.setState({ session: null, user: null, profile: null, pendingPasswordRecovery: false, passwordAlreadyReset: false })`).
  3. Clears AsyncStorage Supabase keys if necessary.
  4. Surfaces a user-facing modal via `useAppModal` with copy along the lines of: "This account is managed through the SweatDrop admin panel. Please sign in at admin.sweat-drop.com — the mobile app is for gym members only."
  5. Logs a `log.warn('[Auth] Rejected elevated-role session', { reason, role })`.

#### 4b. `apps/mobile-app/lib/stores/authStore.ts`

- In the auth listener (`onAuthStateChange`) branch that handles `SIGNED_IN`, after `fetchProfile()` resolves:
  - If `profile?.role` is set and **not** a consumer role, call `rejectElevatedSession('signed_in_with_elevated_role')`.
- Also run this check inside `initialize()` on app boot, right after the persisted session is rehydrated — so killing + reopening the app on an already-leaked admin session signs the user out immediately (this is the exact scenario from the bug report).
- Add a unit-level runtime assertion: if `profile.role` is present and not recognized, log a warning but treat it as non-consumer (fail safe).

#### 4c. `apps/mobile-app/app/_layout.tsx`

- Inside `processUrl` → auth-tokens branch (lines ~275–307), **after** the successful `supabase.auth.setSession(...)` call:
  - Immediately fetch the user: `const { data: userData } = await supabase.auth.getUser();`
  - Read `app_metadata.role` / `user_metadata.role` or call `get_my_profile()` (whichever is authoritative — the app already uses `get_my_profile`).
  - If the role is not a consumer role, call `rejectElevatedSession('deep_link_elevated_role')` and abort any downstream recovery navigation.
- Do this **before** setting `pendingPasswordRecovery` so admin tokens cannot even enter the password-recovery flow inside the mobile app.

#### 4d. `apps/mobile-app/app/auth/confirm.tsx`

- Mirror the same check after `verifyOtp` / `setSession`. If the resulting session belongs to a non-consumer role, route to a dedicated "Wrong surface" screen (or reuse the modal from 4a) instead of `/home` or `/(onboarding)/verify-email`.

**Testing:**
- On a device that has been incorrectly logged in as a superadmin (simulate by manually running `supabase.auth.setSession` with admin tokens in dev), the next cold start must:
  1. Rehydrate the session briefly,
  2. Detect role mismatch,
  3. Sign out,
  4. Show the "this account is admin-only" modal,
  5. Land the user on `/(onboarding)/auth`.
- Regular consumer password reset flow must continue to work end-to-end (no regression).

---

### Step 5: Landing page — harden admin-surface leakage (admin-coder-of-landing, i.e. landing-page-coder)

This is belt-and-suspenders: after Steps 1 + 3, admin flows should never reach the landing page. But **existing emails already in inboxes** still point to `www.sweat-drop.com/auth/confirm`, so the landing page must handle the case gracefully.

#### 5a. `apps/landing-page/app/auth/confirm/page.tsx` and `apps/landing-page/app/auth/reset/page.tsx`

- After `verifyOtp` / `setSession` succeeds, call `supabase.auth.getUser()` and read the role (either from a safe public RPC or from `user_metadata`).
- If the role is elevated (superadmin / gym_admin / receptionist):
  - Do **not** build a `sweatdrop://` deep link.
  - Do **not** auto-redirect.
  - Render a static message: "This reset link was issued for an admin account. Please complete the reset at https://admin.sweat-drop.com." with a button linking to `https://admin.sweat-drop.com/login`.
  - Call `supabase.auth.signOut()` on the landing page's Supabase client so the tokens aren't persisted in browser storage either.
- If the role is a consumer, existing behavior is unchanged.

**Testing:**
- Simulate an admin with a stale email from pre-fix by manually crafting a `www.sweat-drop.com/auth/confirm?token_hash=...&type=recovery` URL → landing page renders the "admin-only" fallback, no deep link fires.

---

### Step 6: Observability (mobile-coder + admin-coder)

- Add a Sentry breadcrumb or counter every time `rejectElevatedSession` fires on mobile, and every time the landing-page fallback (Step 5) triggers. Tag with `reason`.
- This lets us verify the fix in production and catch future regressions (e.g. someone re-adds a `sweatdrop://` deep link in the admin panel).

No new environment variables required.

---

## Workspace Assignment

| Step | Workspace(s) | Agent |
| --- | --- | --- |
| 1 | `backend/supabase/templates/` | supabase-dba |
| 2 (fallback) | `backend/supabase/templates/`, `apps/admin-panel/`, `apps/mobile-app/` | supabase-dba + admin-coder + mobile-coder |
| 3 | `apps/admin-panel/` | admin-coder |
| 4 | `apps/mobile-app/` | mobile-coder |
| 5 | `apps/landing-page/` | landing-page-coder |
| 6 | `apps/mobile-app/`, `apps/admin-panel/`, `apps/landing-page/` | each coder in their own workspace |

**No files are shared across workspaces.** Each coder must stay in their assigned folders.

---

## Data Model Changes

**None.** No migrations, no schema edits, no new RLS policies. All fixes are at the client / email-template layer.

The existing `profiles.role` column is sufficient for the defense-in-depth check in Step 4.

---

## API Contracts

### Admin panel → Supabase Auth

```ts
await supabase.auth.resetPasswordForEmail(email, {
  redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/confirm`,
  // NEXT_PUBLIC_APP_URL MUST be https://admin.sweat-drop.com in production
});
```

### Mobile app → Supabase Auth (unchanged)

```ts
await supabase.auth.resetPasswordForEmail(email, {
  redirectTo: 'https://www.sweat-drop.com/auth/confirm',
});
```

### Email template CTA

- Admin reset: `https://admin.sweat-drop.com/auth/confirm?token_hash={TokenHash}&type=recovery`
- Mobile reset: `https://www.sweat-drop.com/auth/confirm?token_hash={TokenHash}&type=recovery`

### Mobile-app role check (new internal contract)

```ts
// apps/mobile-app/lib/auth/isConsumerAccount.ts
export function isConsumerRole(role: string | null | undefined): boolean;
export async function rejectElevatedSession(reason: string): Promise<void>;
```

All entry points that complete a Supabase auth transition (`authStore.initialize`, `authStore.onAuthStateChange` SIGNED_IN branch, `_layout.tsx` deep-link handler, `app/auth/confirm.tsx`) must call `isConsumerRole` after `fetchProfile` and invoke `rejectElevatedSession` on failure.

---

## Testing Requirements

### Manual QA (must all pass before merge)

1. **Admin reset on desktop browser:** `admin.sweat-drop.com/forgot-password` → email → link opens `admin.sweat-drop.com` → reset succeeds → redirected to admin login. Mobile app (installed on the same account's phone) is never launched.
2. **Admin reset on mobile browser (app installed):** open the reset email on the phone → link opens in the **browser** (not the app) because `admin.sweat-drop.com` is not an App Link. Reset completes in the browser. App is never launched.
3. **Mobile user reset (regression guard):** existing consumer flow (forgot password from the app) still works end-to-end: email opens `www.sweat-drop.com` → app deep-links → password recovery screen → home.
4. **Stale admin link (pre-fix email in inbox):** manually construct `www.sweat-drop.com/auth/confirm?token_hash=...&type=recovery` for a superadmin account → landing page displays the admin-only fallback, no deep link fires, token is invalidated.
5. **Tampering defense:** manually persist admin access/refresh tokens into the mobile app's AsyncStorage → kill + reopen app → app signs the user out within 1s and shows the "admin-only" modal.
6. **Audit:** `rg 'sweatdrop://' apps/admin-panel` must return **zero** results after Step 3.

### Automated checks

- Add a lint/CI guard: `rg -n 'sweatdrop://' apps/admin-panel` must fail the build if it matches. (Can be a simple `scripts/ci/no-mobile-deep-links-in-admin.sh`.)
- Add a unit test for `isConsumerRole()` covering: `'user'` → true; `'superadmin' | 'gym_admin' | 'receptionist' | null | undefined | ''` → false.

### Production verification (post-deploy)

- Watch Sentry for the `rejectElevatedSession` breadcrumb (Step 6). Expected rate: near zero after a short tail of pre-fix stale emails flushing out.
- Have a real superadmin trigger a reset in production and confirm the email points at `admin.sweat-drop.com`.

---

## Rollout Strategy

1. Merge Step 4 (mobile defense-in-depth) **first** and ship via OTA/EAS — this instantly closes the exploit on every installed device even if the email template is still wrong.
2. Merge Steps 1 + 3 (template + admin panel) next — this prevents the exploit at the source for new emails.
3. Merge Step 5 (landing page hardening) to cover inbox-stale emails.
4. Merge Step 6 (observability) last.

Each step is independently deployable; no coordinated release required.

---

## Out of Scope

- Migrating admin accounts off the `profiles` table into a dedicated `admin_users` table (would remove the shared-Supabase-Auth surface entirely — worth considering later, but not needed to close this bug).
- Enforcing 2FA on superadmin accounts (separate security plan).
- Changing Supabase `site_url` — leaving as `https://www.sweat-drop.com` because the consumer flow legitimately relies on it.

---

## Plan Review Checklist

- [x] All steps reference specific files/workspaces
- [x] Database changes (none) are correctly identified as N/A
- [x] Mobile changes are assigned to `mobile-coder`
- [x] Admin changes are assigned to `admin-coder`
- [x] Landing page changes are assigned to `landing-page-coder`
- [x] Dependencies are clearly listed
- [x] API contracts are defined
- [x] Testing requirements are specified
- [x] Rollout strategy deploys the safety net first
