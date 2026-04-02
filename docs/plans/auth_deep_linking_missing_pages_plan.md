# Plan: Authentication & Deep Linking — Missing Pages & Flows

**Created:** 2026-04-02  
**Priority:** High (pre-launch blocker)  
**Workspaces Affected:** `apps/landing-page/`, `apps/admin-panel/`, `apps/mobile-app/`, `backend/supabase/`

---

## Context

Supabase Auth emails (email confirmation, password reset) redirect users to web URLs. The app and admin panel rely on these web pages to complete auth flows. An audit reveals several critical gaps that will break real user auth flows in production.

---

## Current State Audit

### What EXISTS

| Flow | Mobile App | Landing Page (Web) | Admin Panel | Supabase Config |
|------|-----------|-------------------|-------------|-----------------|
| **Email/Password Sign Up** | `auth.tsx` — `signUp` | — | `signup/SignupForm.tsx` — `signUp` | `enable_signup: true` |
| **Email/Password Sign In** | `auth.tsx` — `signInWithPassword` | — | `login/LoginForm.tsx` — `signInWithPassword` | — |
| **Google OAuth** | `auth.tsx` — `signInWithIdToken` | — | No | — |
| **Apple OAuth** | `auth.tsx` — `signInWithIdToken` (iOS) | — | No | — |
| **Email Verification Gate** | `verify-email.tsx` — polls `refreshSession` | `/auth/confirm` — shows "EMAIL CONFIRMED" + redirect to `sweatdrop://` | No page | `additional_redirect_urls` includes `/auth/confirm` |
| **Email Verification Resend** | `verify-email.tsx` — `resend({ type: 'signup', emailRedirectTo })` | — | — | — |
| **Password Reset Request** | `auth.tsx` — `resetPasswordForEmail({ redirectTo: siteUrl + '/auth/reset' })` | — | **No** | — |
| **Password Reset Completion** | **No** — expects web page | **No `/auth/reset` page** | **No** | `/auth/reset` **NOT in `additional_redirect_urls`** |
| **Auth Callback (PKCE)** | Not needed (`detectSessionInUrl: false`) | **No** | **No** — admin `emailRedirectTo` goes to `/dashboard` or `/accept-invitation/...` without token exchange | No PKCE config found |
| **Staff Invitation Accept** | — | — | `/accept-invitation/[token]` — works | — |
| **Forgot Password (Admin)** | — | — | **No** | — |

### What's MISSING (Critical)

1. **`/auth/reset` web page** — Password reset emails link to `EXPO_PUBLIC_SITE_URL + '/auth/reset'` but this page doesn't exist anywhere. Users who click "Reset Password" in the email hit a 404.

2. **`/auth/reset` not in `additional_redirect_urls`** — Even if the page existed, Supabase would reject the redirect because only `/auth/confirm` is allowlisted in `config.toml`.

3. **Admin panel auth callback** — Admin `signUp` uses `emailRedirectTo` to `window.location.origin + /dashboard`, but there's no callback handler to exchange the PKCE code or hash token. The user lands on `/dashboard` without a valid session, gets redirected to `/login` by middleware.

4. **Admin panel forgot password** — No "Forgot Password?" link or flow in the admin login page.

5. **`EXPO_PUBLIC_SITE_URL` not documented** — This critical env var drives all email redirect URLs in the mobile app but is missing from `.env.example`, `.env.prod.example`, and `ENVIRONMENTS.md`.

6. **Admin panel redirect URLs not in `config.toml`** — The admin domain (e.g., `https://admin.sweat-drop.com`) is not in `additional_redirect_urls`, so Supabase will reject `emailRedirectTo` from admin signup.

### What's WORKING (No Changes Needed)

- Mobile email/password auth (sign in, sign up)
- Mobile Google/Apple OAuth
- Mobile email verification gate + polling
- Landing page `/auth/confirm` (shows success + opens app)
- Admin login with password
- Admin staff invitation flow
- Mobile `shouldRequireEmailVerification` guard in `_layout.tsx`

---

## Dependencies

- Landing page (`apps/landing-page`) must be deployed to the domain set as `site_url` in Supabase (`https://www.sweat-drop.com`)
- Admin panel domain must be known (currently `https://admin.sweat-drop.com` per ENVIRONMENTS.md)
- `EXPO_PUBLIC_SITE_URL` must match the landing page domain

---

## Execution Plan

### Step 1: Create `/auth/reset` Page on Landing Page (landing-page-coder)

**File (new):** `apps/landing-page/app/auth/reset/page.tsx`

**Purpose:** Handle Supabase password reset redirect. When user clicks the reset link in their email, Supabase redirects to this page with a hash fragment containing the access token.

**Implementation:**
1. Client component (`'use client'`)
2. On mount, extract tokens from URL hash fragment (`#access_token=...&type=recovery`)
3. Call `supabase.auth.setSession({ access_token, refresh_token })` to establish session
4. Show a "Set New Password" form (two password fields + confirm)
5. On submit, call `supabase.auth.updateUser({ password: newPassword })`
6. On success, show "Password Updated" confirmation with "Open SweatDrop" button (same pattern as `/auth/confirm`)
7. On error, show appropriate error message with "Try Again" option

**Design:** Match the existing `/auth/confirm` page style (dark background, centered card, cyan accent, "OPEN SWEATDROP" CTA).

**Supabase Client:** Need a lightweight Supabase client for the landing page:

**File (new):** `apps/landing-page/lib/supabase.ts`
```typescript
import { createClient } from '@supabase/supabase-js';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

**Environment:** Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to landing page env config.

**Dependency:** `@supabase/supabase-js` must be added to landing page: `pnpm add @supabase/supabase-js --filter sweatdrop-landing-page`

### Step 2: Fix `/auth/confirm` to Handle Token Exchange (landing-page-coder)

**File:** `apps/landing-page/app/auth/confirm/page.tsx`

**Problem:** Current page just shows "EMAIL CONFIRMED" and redirects to `sweatdrop://`. It does NOT extract the Supabase token from the URL hash. For PKCE flow or hash-based confirmations, the page should:

1. Extract `#access_token=...&type=signup` (or `type=email_change`) from URL hash on mount
2. Call `supabase.auth.setSession()` to actually confirm the email server-side (or `verifyOtp` if using PKCE)
3. Then show the success message and redirect

**Note:** If Supabase is configured with **implicit flow** (default for email confirm), the hash fragment alone confirms the email when the page loads — the current "do nothing" approach *may work* because Supabase does the confirm on the redirect itself. But for robustness (and PKCE compatibility), explicitly handling the token is safer.

**Changes:**
- Add Supabase client import
- On mount, parse `window.location.hash` for tokens
- If tokens found, call `setSession` to confirm
- Show error state if token exchange fails
- Keep existing success UI and `sweatdrop://` redirect

### Step 3: Create Auth Callback for Admin Panel (admin-coder)

**File (new):** `apps/admin-panel/app/auth/callback/route.ts`

**Purpose:** Next.js Route Handler that exchanges Supabase auth codes/tokens for a session. Required for:
- Email confirmation after admin signup
- Password reset completion (if admin gets their own reset flow)
- Any future OAuth flows

**Implementation (standard Supabase + Next.js pattern):**
```typescript
import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
```

**Update admin signup `emailRedirectTo`:**

**File:** `apps/admin-panel/app/signup/SignupForm.tsx`

Change `emailRedirectTo` from:
```
window.location.origin + '/dashboard'
```
to:
```
window.location.origin + '/auth/callback?next=/dashboard'
```

And for invitations:
```
window.location.origin + '/auth/callback?next=/accept-invitation/' + inviteToken
```

### Step 4: Add Forgot Password to Admin Panel (admin-coder)

**File:** `apps/admin-panel/app/login/LoginForm.tsx`

**Changes:**
1. Add "Forgot Password?" link below the password field
2. When clicked, show an email input field (pre-filled if user already typed email)
3. Call `supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/auth/reset' })`
4. Show success message: "Check your email for the reset link"

**File (new):** `apps/admin-panel/app/auth/reset/page.tsx`

**Purpose:** Password reset completion page for admin panel users.

**Implementation:**
1. Client component
2. Extract tokens from URL hash (`#access_token=...&type=recovery`)
3. Establish session via `supabase.auth.setSession()`
4. Show "Set New Password" form
5. Call `supabase.auth.updateUser({ password })`
6. On success, redirect to `/dashboard`
7. On error, show error with "Try Again"

**Design:** Follow admin panel's existing Tailwind styling (dark/light theme, form inputs consistent with login page).

### Step 5: Update Supabase Redirect URLs (supabase-dba)

**File:** `backend/supabase/config.toml`

**Change `additional_redirect_urls` to:**
```toml
additional_redirect_urls = [
  "exp://localhost:8081",
  "sweatdrop://",
  "https://www.sweat-drop.com/auth/confirm",
  "https://www.sweat-drop.com/auth/reset",
  "https://admin.sweat-drop.com/auth/callback",
  "https://admin.sweat-drop.com/auth/reset"
]
```

**Also update in Supabase Dashboard** (for both dev and prod projects):
- Authentication → URL Configuration → Redirect URLs
- Add all the above URLs
- Ensure `Site URL` matches `https://www.sweat-drop.com`

### Step 6: Document `EXPO_PUBLIC_SITE_URL` (mobile-coder / docs)

**File:** `apps/mobile-app/.env.example`

Add:
```
# Website URL for auth email redirects (email confirm, password reset)
EXPO_PUBLIC_SITE_URL=https://www.sweat-drop.com
```

**File:** `apps/mobile-app/.env.prod.example`

Add:
```
EXPO_PUBLIC_SITE_URL=https://www.sweat-drop.com
```

**File:** `ENVIRONMENTS.md`

Add `EXPO_PUBLIC_SITE_URL` to the mobile env var table with description: "Landing page URL — used for email confirm/reset redirect targets."

### Step 7: Improve Mobile Password Reset UX (mobile-coder)

**File:** `apps/mobile-app/app/(onboarding)/auth.tsx`

**Current state:** "Forgot Password?" calls `resetPasswordForEmail` and shows a toast. User opens email, clicks link, goes to web. **But** the web page (`/auth/reset`) doesn't exist yet (fixed in Step 1).

**Enhancement (after Step 1 is deployed):**
1. After showing "Reset email sent" success, add clearer instructions: "Check your email and follow the link to set a new password. Then return here to sign in."
2. Add a "Resend Reset Email" button if the user returns without having reset
3. Consider adding an in-app "enter new password" screen that listens for `PASSWORD_RECOVERY` auth event — this would allow users to complete the flow without leaving the app (advanced, lower priority)

### Step 8: Handle `PASSWORD_RECOVERY` Auth Event in Mobile (mobile-coder) — Optional Enhancement

**File:** `apps/mobile-app/lib/stores/authStore.ts`

**Currently:** `onAuthStateChange` only handles `SIGNED_IN` and `SIGNED_OUT`. If the user opens the reset link with the app's custom scheme (`sweatdrop://`), Supabase could fire a `PASSWORD_RECOVERY` event.

**Enhancement:**
```typescript
if (event === 'PASSWORD_RECOVERY' && session) {
  // Navigate to a "Set New Password" screen
  // This allows in-app password reset completion
}
```

**File (new):** `apps/mobile-app/app/(onboarding)/reset-password.tsx`

**Purpose:** In-app screen to set a new password after `PASSWORD_RECOVERY` event.

**Implementation:**
1. Two password fields (new + confirm)
2. Call `supabase.auth.updateUser({ password })`
3. On success, navigate to `/home` or `/(onboarding)/auth`

**Note:** This is a nice-to-have. The web-based flow (Step 1) is the MVP path. This in-app flow requires adding `sweatdrop://auth/reset` to the deep link handler and to Supabase redirect URLs.

---

## Summary: What's Missing Per Workspace

### Landing Page (`apps/landing-page/`)
| Page | Status | Priority |
|------|--------|----------|
| `/auth/confirm` | EXISTS — needs token exchange fix | Medium |
| `/auth/reset` | **MISSING** — critical | **P0** |
| Supabase client lib | **MISSING** — needed for both | **P0** |

### Admin Panel (`apps/admin-panel/`)
| Page | Status | Priority |
|------|--------|----------|
| `/login` | EXISTS | — |
| `/signup` | EXISTS — needs `emailRedirectTo` fix | High |
| `/auth/callback` (route handler) | **MISSING** — signup confirm broken | **P0** |
| `/auth/reset` (password reset) | **MISSING** | High |
| Forgot password on login page | **MISSING** | High |

### Mobile App (`apps/mobile-app/`)
| Feature | Status | Priority |
|---------|--------|----------|
| Email verification gate | EXISTS — working | — |
| Password reset request | EXISTS — sends email | — |
| `EXPO_PUBLIC_SITE_URL` docs | **MISSING** from .env.example | Medium |
| In-app password reset screen | **MISSING** — optional | Low |
| `PASSWORD_RECOVERY` event handler | **MISSING** — optional | Low |

### Backend (`backend/supabase/`)
| Config | Status | Priority |
|--------|--------|----------|
| `site_url` | Set to `https://www.sweat-drop.com` | — |
| `/auth/confirm` in redirect URLs | EXISTS | — |
| `/auth/reset` in redirect URLs | **MISSING** | **P0** |
| Admin domain in redirect URLs | **MISSING** | **P0** |

---

## Implementation Priority & Sequencing

| # | Task | Workspace | Blocked By | Effort |
|---|------|-----------|------------|--------|
| 1 | Add `/auth/reset` + Supabase client to landing page | landing-page | — | Medium |
| 2 | Fix `/auth/confirm` token exchange | landing-page | #1 (shares client) | Small |
| 3 | Update `additional_redirect_urls` in config.toml + dashboard | supabase | — | Small |
| 4 | Create `/auth/callback` route handler in admin | admin-panel | #3 | Small |
| 5 | Fix admin signup `emailRedirectTo` | admin-panel | #4 | Small |
| 6 | Add forgot password to admin login + `/auth/reset` page | admin-panel | #3 | Medium |
| 7 | Document `EXPO_PUBLIC_SITE_URL` in env examples | mobile-app / docs | — | Small |
| 8 | Improve mobile password reset UX copy | mobile-app | #1 deployed | Small |
| 9 | (Optional) In-app password reset screen + deep link | mobile-app | #3 | Medium |

**Recommended order:** #3 → #1 → #2 → #4 → #5 → #6 → #7 → #8 → #9

Steps #3 (config) and #1 (landing page) are the highest priority — without them, password reset is completely broken for all users.

---

## Testing Requirements

- [ ] Mobile user signs up with email → receives confirmation email → clicks link → lands on `/auth/confirm` → email is confirmed → app picks up verified status via polling
- [ ] Mobile user taps "Forgot Password" → receives reset email → clicks link → lands on `/auth/reset` → sets new password → returns to app → signs in with new password
- [ ] Admin user signs up → receives confirmation email → clicks link → `/auth/callback` exchanges token → redirected to dashboard (or invitation page)
- [ ] Admin user clicks "Forgot Password" on login → receives email → clicks link → `/auth/reset` → sets new password → redirected to dashboard
- [ ] Invalid/expired reset tokens show appropriate error on `/auth/reset`
- [ ] All redirect URLs are allowlisted in Supabase dashboard (both dev and prod)
- [ ] `EXPO_PUBLIC_SITE_URL` is set in mobile .env files and matches landing page domain

---

## Plan Review Checklist

- [x] All steps reference specific files/workspaces
- [x] Database/config changes assigned to `supabase-dba`
- [x] Mobile changes assigned to `mobile-coder`
- [x] Admin changes assigned to `admin-coder`
- [x] Landing page changes assigned to `landing-page-coder`
- [x] Dependencies clearly listed
- [x] API contracts defined (URL patterns, Supabase methods)
- [x] Testing requirements specified
- [x] Implementation priority and sequencing defined
