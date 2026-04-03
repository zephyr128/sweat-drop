# Bugfix: Registration Email Confirmation — "Invalid Link" + Lost Session

**Created:** 2026-04-03  
**Priority:** P0 (registration is broken for all email users)  
**Workspaces Affected:** `apps/landing-page/`, `apps/mobile-app/`, `backend/supabase/` (config only)

---

## Bug Report

**Steps to reproduce:**
1. Sign up with email/password in mobile app
2. Receive confirmation email
3. Click the confirm link in the email
4. **BUG:** Web page shows "invalid link" / "LINK EXPIRED"
5. Click "OPEN SWEATDROP" → app opens to "get started" (welcome) screen
6. Login with the same credentials → works fine

**Expected:**
- Web page shows "EMAIL CONFIRMED"
- Deep link opens app → app advances past email verification

**Actual:**
- Web page shows "LINK EXPIRED" even though the email IS confirmed
- App loses context and shows the welcome screen

---

## Root Cause Analysis

There are **three compounding failures** in the email confirmation flow:

### Failure 1: Landing page `/auth/confirm` — `setSession()` fails

**File:** `apps/landing-page/app/auth/confirm/page.tsx`

When the user clicks the confirmation link in the email, Supabase:
1. Processes the token at its own `/auth/v1/verify` endpoint
2. **Confirms the email** (sets `email_confirmed_at` server-side)
3. Redirects to `https://www.sweat-drop.com/auth/confirm` with session tokens

The landing page then calls `supabase.auth.setSession()` with the tokens from the URL hash. If this call fails for **any** reason, the page shows "LINK EXPIRED" — which is misleading because the email was already confirmed in step 2.

**Why `setSession()` can fail:**
- **Env vars missing on production deployment:** If `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` are not set in Vercel/hosting, `hasSupabasePublicEnv` = false → immediate error state (no network call even attempted)
- **Supabase PKCE flow:** If the production Supabase project uses PKCE (default in newer versions), the redirect contains `?code=<auth_code>` in query parameters instead of `#access_token=...` in hash fragment. The confirm page only checks `window.location.hash` — it never sees the code
- **Token exchange error:** Even in implicit flow, `setSession()` can fail due to network errors, CORS, or token format issues

**Impact:** The error state causes the "OPEN SWEATDROP" button to use bare `sweatdrop://` deep link (no tokens), so the app gets nothing useful from the redirect.

### Failure 2: Mobile app loses session on restart

**File:** `apps/mobile-app/app/index.tsx`

When Supabase has email confirmations enabled, `signUp()` returns `{ user, session: null }`. The mobile auth screen (`auth.tsx`) manually navigates to `verify-email` after signup. However:

- `session` is `null` (Supabase doesn't issue sessions for unconfirmed users)
- If the app is killed/restarted (e.g., when user switches to browser for email), `supabase.auth.getSession()` returns `null`
- `index.tsx` checks `if (!session)` → navigates to `/(onboarding)/welcome` (the "get started" screen)
- The user never reaches `verify-email` again, and its polling logic never runs

**Impact:** After clicking the email link and returning to the app, the user sees "get started" instead of being advanced through the verification gate.

### Failure 3: No PKCE / token_hash handling on confirm page

**File:** `apps/landing-page/app/auth/confirm/page.tsx`

The confirm page only handles one auth flow variant (implicit grant with hash fragment tokens). It does not handle:
- **PKCE flow:** `?code=<auth_code>` in query params (needs `exchangeCodeForSession()`)
- **Token hash flow:** `?token_hash=<hash>&type=email` (newer Supabase email templates, needs `verifyOtp()`)
- **Error redirects:** Supabase may redirect with `#error=...&error_description=...` in the hash — the page doesn't detect this

---

## Dependencies

- Landing page must be deployed to `https://www.sweat-drop.com`
- Supabase production project URL: `https://jzyoyxabcdzvqcfnfzrz.supabase.co`
- Landing page `.env.local` has the correct Supabase credentials (verified locally)
- Must verify these same env vars exist on the deployment platform (Vercel, etc.)

---

## Execution Plan

### Step 0: Diagnostic — Verify Production Environment (devops / manual)

**Before any code changes, verify:**

1. **Landing page deployment env vars:**
   - Go to the deployment platform (Vercel dashboard, etc.)
   - Confirm `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set
   - These are **build-time** env vars in Next.js — the landing page must be rebuilt after they're added
   - If missing: **this alone explains the entire bug** — `hasSupabasePublicEnv` is false → immediate "LINK EXPIRED"

2. **Supabase email flow type:**
   - Go to Supabase Dashboard → Authentication → URL Configuration
   - Check if "Email OTP" is using PKCE or Implicit flow
   - Check the email template: does it use `{{ .ConfirmationURL }}` (old, goes through Supabase first) or `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email` (new, goes directly to your site)?
   - Check that `https://www.sweat-drop.com/auth/confirm` is in the Redirect URLs allowlist

3. **Quick browser test:**
   - Open the landing page confirm URL directly: `https://www.sweat-drop.com/auth/confirm`
   - Open browser dev tools → Console
   - Check for `[supabase] Missing NEXT_PUBLIC_SUPABASE_URL...` warning
   - If this warning appears → env vars are missing on production

---

### Step 1: Fix Landing Page `/auth/confirm` — Handle All Flow Types (landing-page-coder)

**File:** `apps/landing-page/app/auth/confirm/page.tsx`

**Changes:**

#### 1a. Handle PKCE flow (code in query params)

Add parsing of `window.location.search` for `code` parameter:

```typescript
// After existing hash parsing, add:
const searchParams = new URLSearchParams(window.location.search);
const code = searchParams.get('code');
```

If `code` is found, call `supabase.auth.exchangeCodeForSession(code)` instead of `setSession()`.

#### 1b. Handle token_hash flow (newer email templates)

Add parsing of `token_hash` and `type` from query params:

```typescript
const tokenHash = searchParams.get('token_hash');
const type = searchParams.get('type');
```

If `token_hash` is found, call `supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as any })`.

#### 1c. Handle Supabase error redirects

Check hash fragment for `error` parameter:

```typescript
const errorParam = params.get('error');
const errorDescription = params.get('error_description');
```

If error is present, show a specific error message (not generic "LINK EXPIRED").

#### 1d. Show success even when session handoff fails

**Critical change:** When the URL contains tokens/code (meaning Supabase DID redirect here after confirming), show "EMAIL CONFIRMED" success even if `setSession` fails. The email IS confirmed server-side — the `setSession` failure only means the web client couldn't establish a local session, which doesn't matter since the user is going back to the mobile app.

```typescript
// Instead of:
if (error) { setConfirmState('error'); }

// Do:
if (error) {
  log.warn('setSession failed, but email was likely confirmed server-side:', error.message);
  // Still show success — email confirmation happened at Supabase's verify endpoint
  setConfirmState('success');
}
```

Only show "LINK EXPIRED" when:
- No tokens/code/token_hash at all AND no hash fragment → user navigated here directly (not from email)
- Explicit error redirect from Supabase (`#error=...`)

#### 1e. Always try to build a deep link with tokens

Even if `setSession` partially fails, if tokens were in the URL, pass them to the deep link:

```typescript
// Even on setSession failure, store the original URL tokens for the deep link
tokensRef.current = { access: accessToken, refresh: refreshToken };
```

**Full priority logic for token detection:**

```
1. Check query params for `code` → exchangeCodeForSession()
2. Check query params for `token_hash` → verifyOtp()
3. Check hash fragment for `access_token` → setSession() (current behavior)
4. Check hash fragment for `error` → show specific error
5. None of the above → show generic "no confirmation data" error
```

---

### Step 2: Fix Mobile App — Persist "Awaiting Verification" State (mobile-coder)

**File:** `apps/mobile-app/lib/stores/authStore.ts`

**Problem:** After signup, `session` is `null` (Supabase doesn't issue sessions for unconfirmed email users). When the app restarts, `index.tsx` sees no session and goes to welcome.

**Fix:** Add a persisted flag `awaitingEmailVerification` to the auth store:

```typescript
interface AuthState {
  // ... existing fields
  awaitingEmailVerification: boolean;
  pendingVerificationEmail: string | null;
  setAwaitingEmailVerification: (email: string) => void;
  clearAwaitingEmailVerification: () => void;
}
```

Set this flag after signup in `auth.tsx`:
```typescript
useAuthStore.getState().setAwaitingEmailVerification(email);
router.replace('/(onboarding)/verify-email');
```

Make sure `awaitingEmailVerification` and `pendingVerificationEmail` are included in Zustand's `partialize` (persisted fields).

**File:** `apps/mobile-app/app/index.tsx`

**Change:** Add a check for the awaiting verification flag:

```typescript
// Current:
if (!session) {
  router.replace('/(onboarding)/welcome');
}

// Fixed:
if (!session) {
  if (useAuthStore.getState().awaitingEmailVerification) {
    router.replace('/(onboarding)/verify-email');
  } else {
    router.replace('/(onboarding)/welcome');
  }
}
```

**File:** `apps/mobile-app/app/(onboarding)/verify-email.tsx`

**Change:** Clear the flag when verification succeeds and the user advances:

```typescript
// After confirmation detected + navigating forward:
useAuthStore.getState().clearAwaitingEmailVerification();
```

Also clear the flag in `handleSignOut`:
```typescript
useAuthStore.getState().clearAwaitingEmailVerification();
```

---

### Step 3: Improve Verify-Email Resilience — Handle Sessionless State (mobile-coder)

**File:** `apps/mobile-app/app/(onboarding)/verify-email.tsx`

**Problem:** The polling logic calls `supabase.auth.refreshSession()` and `supabase.auth.getUser()`, but both require a valid session/access token. If `session` is `null` (Supabase didn't issue one for unconfirmed signup), these calls will fail, and the polling never detects confirmation.

**Fix:** When the user has no session but has a `pendingVerificationEmail`, poll differently:

```typescript
// If no session, try signing in silently (the user just signed up — 
// if the email is now confirmed, signInWithPassword won't work without password)
// Alternative: try supabase.auth.signUp again with the same email — 
// Supabase returns the existing user with email_confirmed_at if already confirmed
```

Actually, the better approach: when the deep link brings the user back (from the confirmed email page), the deep link handler in `_layout.tsx` should call `setSession` with any tokens received. If no tokens, the verify screen should prompt the user to "Check Verification Status" manually by:

1. Calling `supabase.auth.resend({ type: 'signup', email })` — if already confirmed, this returns an error indicating the email is already confirmed
2. OR: The user can simply try to log in (the email IS confirmed at this point)

**Add a "Sign In Now" button** on the verify-email screen that navigates back to `auth.tsx` and pre-fills the email. Since the email IS confirmed (Supabase did it server-side), login will succeed.

---

### Step 4: Update Supabase Redirect URLs (supabase-dba / dashboard)

**File:** `backend/supabase/config.toml`

**Current:**
```toml
additional_redirect_urls = ["exp://localhost:8081", "sweatdrop://", "https://www.sweat-drop.com/auth/confirm"]
```

**Change to:**
```toml
additional_redirect_urls = [
  "exp://localhost:8081",
  "sweatdrop://",
  "sweatdrop://auth/confirm",
  "https://www.sweat-drop.com/auth/confirm",
  "https://www.sweat-drop.com/auth/reset"
]
```

**Also update in Supabase Dashboard** (production project):
- Authentication → URL Configuration → Redirect URLs
- Add all the above URLs
- Verify `Site URL` is set to `https://www.sweat-drop.com`

---

### Step 5: Improve Error UX on Landing Page (landing-page-coder)

**File:** `apps/landing-page/app/auth/confirm/page.tsx`

Replace the generic "LINK EXPIRED" error state with context-aware messaging:

| Scenario | Heading | Body | CTA |
|----------|---------|------|-----|
| `setSession` failed but tokens were in URL | "EMAIL CONFIRMED" | "Your email has been verified. Open the app to continue." | "OPEN SWEATDROP" (with tokens) |
| Explicit `#error=otp_expired` from Supabase | "LINK EXPIRED" | "This confirmation link has expired. Open the app to request a new one." | "OPEN SWEATDROP" (bare) |
| No tokens/code at all in URL | "INVALID LINK" | "No confirmation data found. Open the app to request a new verification email." | "OPEN SWEATDROP" (bare) |
| Env vars missing (dev only) | "CONFIGURATION ERROR" | "Supabase is not configured. Check environment variables." | — |

---

## Implementation Priority & Sequencing

| # | Task | Workspace | Effort | Fixes |
|---|------|-----------|--------|-------|
| **0** | **Diagnostic: check production env vars** | devops | 5 min | May fix everything |
| **1** | Fix confirm page (all flow types + error UX) | landing-page | Medium | Failure 1 + 3 |
| **2** | Persist "awaiting verification" flag | mobile-app | Small | Failure 2 |
| **3** | Add "Sign In Now" fallback on verify screen | mobile-app | Small | UX improvement |
| **4** | Update redirect URLs | supabase config | Small | Prevention |
| **5** | Improve error messages | landing-page | Small | UX improvement |

**Recommended order:** **#0** (instant check) → **#1** → **#2** → **#3** → **#4** → **#5**

**If Step 0 reveals missing env vars:** Adding them and redeploying the landing page likely fixes the "LINK EXPIRED" issue entirely. Steps 1-5 are still recommended for robustness.

---

## Testing Requirements

- [ ] Sign up with email → receive email → click confirm → web page shows "EMAIL CONFIRMED" → "OPEN SWEATDROP" opens app → app advances past verification
- [ ] Same flow, but kill the app before clicking email link → click confirm → open app → app goes to verify-email (not welcome), polling detects confirmation
- [ ] Sign up → close app completely → reopen → app shows verify-email (not welcome)
- [ ] On verify-email screen, "Sign In Now" takes user to auth screen with email pre-filled → login succeeds
- [ ] Expired/invalid confirmation link → web page shows clear "LINK EXPIRED" error (not misleading)
- [ ] No tokens in URL (direct navigation to /auth/confirm) → appropriate error message
- [ ] Test with both PKCE and implicit flow (check Supabase dashboard config)

---

## Security Note

The landing page `.env.local` contains `SUPABASE_SERVICE_ROLE_KEY` and `GMAIL_APP_PASSWORD`. These should:
- Never be committed to git (verify `.gitignore` covers `.env.local`)
- Only the `NEXT_PUBLIC_*` vars should be used in client-side code (already correct)
- The service role key should be rotated if it was ever exposed

---

## Plan Review Checklist

- [x] All steps reference specific files/workspaces
- [x] Landing page changes assigned to `landing-page-coder`
- [x] Mobile changes assigned to `mobile-coder`
- [x] Config changes assigned to `supabase-dba`
- [x] Dependencies clearly listed
- [x] Root cause analysis with evidence
- [x] Testing requirements specified
- [x] Implementation priority defined
- [x] Diagnostic step included (Step 0)
