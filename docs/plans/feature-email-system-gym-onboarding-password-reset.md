# Feature: Email System, Gym Onboarding & Password Reset

## Context

Ceo proces kreiranja teretane (gym), ownera, admina i pozivanja staffa treba da bude pokriven email notifikacijama. Takodje je potreban password reset flow za admin panel korisnike. Trenutno postoji parcijalna implementacija (Resend API, inline HTML, `staff_invitations` tabela, Supabase auth templates), ali ima duplikacija, nedostajucih stranica i nekompletnih tokova.

---

## Current State Audit

### What EXISTS (Working)

| Component | Status | Location |
|-----------|--------|----------|
| `staff_invitations` table | Full schema + email delivery tracking | Multiple migrations |
| Resend API integration | Inline HTML, 3 separate copies | `staff-actions.ts`, `gym-actions.ts`, `owner-actions.ts` |
| Owner invitation flow | Superadmin creates owner → invitation email → accept | `owner-actions.ts`, `gym-actions.ts` |
| Staff invitation flow | Gym owner/admin invites staff → email → accept | `staff-actions.ts` |
| Accept invitation page | Login/Signup → accept RPC → redirect | `/accept-invitation/[token]/` |
| Supabase auth email templates | Confirmation + Password Reset HTML | `backend/supabase/templates/` |
| `config.toml` recovery template | Template path + redirect URL configured | `config.toml` |
| Login page | Email/password only | `/login/LoginForm.tsx` |
| Signup page | Works with invitation flow | `/signup/` |

### What's MISSING / Broken

| Issue | Priority | Description |
|-------|----------|-------------|
| No "Forgot Password?" on login | **P0** | Login page has no link to trigger password reset |
| No `/auth/reset` page | **P0** | Recovery email links to `{{ .SiteURL }}/auth/reset` but no page handles it |
| No `/auth/confirm` page | **P1** | Confirmation email links to `{{ .SiteURL }}/auth/confirm` but no page handles it |
| Email code duplication | **P1** | `sendOwnerInvitationEmail` copied in 2 files, `sendInvitationEmail` in a third — all with inline HTML |
| `resendStaffInvitationEmail` doesn't re-send | **P2** | Calls DB RPC to reset status but never calls Resend API to actually re-send email |
| No email delivery dashboard | **P3** | DB has `email_delivery_status` fields but no admin UI to see delivery failures |
| Inconsistent email design | **P2** | Resend invitation emails use simple inline HTML vs. Supabase auth templates have full responsive design |

---

## Dependencies

- [x] `staff_invitations` table exists with delivery tracking columns
- [x] Resend API key configured (`RESEND_API_KEY` env var)
- [x] Supabase Auth configured with email confirmation + recovery
- [x] `accept_staff_invitation` and `accept_owner_invitation` RPCs exist
- [ ] `NEXT_PUBLIC_APP_URL` must be set correctly in production (for email links)
- [ ] Supabase `site_url` in `config.toml` must point to production domain

---

## Execution Plan

### Phase 1: Password Reset Flow (P0)

#### Step 1.1: Auth Pages — `admin-coder` 🔵

Create the missing auth pages that handle Supabase's email link redirects.

**Files to create/modify:**

1. **`apps/admin-panel/app/auth/confirm/route.ts`** — Server route handler
   - Parse `token_hash` and `type` from query params
   - Call `supabase.auth.verifyOtp({ token_hash, type })` server-side
   - On success: redirect to `/login?confirmed=true`
   - On error: redirect to `/login?error=confirmation_failed`

2. **`apps/admin-panel/app/auth/reset/page.tsx`** — Password reset page
   - Parse `token_hash` and `type=recovery` from URL (Supabase puts these in the fragment/query)
   - Show "Set New Password" form (password + confirm password)
   - Call `supabase.auth.verifyOtp({ token_hash, type: 'recovery' })` to establish session
   - Then `supabase.auth.updateUser({ password })` to set new password
   - On success: redirect to `/login?reset=success`
   - Styled consistently with existing login page (dark theme, `#00E5FF` accent)

3. **`apps/admin-panel/app/forgot-password/page.tsx`** — Forgot password request page
   - Email input form
   - Call `supabase.auth.resetPasswordForEmail(email, { redirectTo })` 
   - `redirectTo` must point to `NEXT_PUBLIC_APP_URL/auth/reset`
   - Show success message: "Check your email for reset instructions"
   - Styled consistently with login page

4. **Modify `apps/admin-panel/app/login/LoginForm.tsx`**
   - Add "Forgot Password?" link below the password field
   - Link to `/forgot-password`
   - Also handle `?reset=success` and `?confirmed=true` query params with success toast/banner

**Testing:**
- [ ] Click "Forgot Password?" → enter email → receive email → click link → set new password → login works
- [ ] Email confirmation link from signup redirects correctly
- [ ] Invalid/expired tokens show appropriate error messages

---

### Phase 2: Unified Email Service (P1)

#### Step 2.1: Extract Shared Email Utility — `admin-coder` 🔵

Eliminate code duplication by creating a centralized email service.

**Files to create/modify:**

1. **Create `apps/admin-panel/lib/utils/email-service.ts`**
   - Export `sendEmail({ to, subject, html })` that wraps Resend API
   - Export `buildInvitationEmailHtml({ type, gymName, roleName, acceptUrl })` for consistent templates
   - Export `buildOwnerInvitationEmailHtml({ gymName, acceptUrl })`
   - Export `buildStaffInvitationEmailHtml({ gymName, roleName, acceptUrl })`
   - All templates should match the quality of existing Supabase auth templates (responsive, dark theme, SweatDrop branding, logo, accent lines)
   - Handle `RESEND_API_KEY` absence gracefully (log URL for manual sharing)
   - Return `{ success, messageId?, error? }` for delivery tracking

2. **Refactor `apps/admin-panel/lib/actions/staff-actions.ts`**
   - Replace `sendInvitationEmail()` private function with imported `sendEmail` + `buildStaffInvitationEmailHtml`
   - Fix `resendStaffInvitationEmail()` to actually re-send email via Resend after RPC resets status

3. **Refactor `apps/admin-panel/lib/actions/gym-actions.ts`**
   - Replace `sendOwnerInvitationEmail()` private function with imported `sendEmail` + `buildOwnerInvitationEmailHtml`

4. **Refactor `apps/admin-panel/lib/actions/owner-actions.ts`**
   - Replace `sendOwnerInvitationEmail()` private function with imported `sendEmail` + `buildOwnerInvitationEmailHtml`

**Testing:**
- [ ] Staff invitation email sends with new template
- [ ] Owner invitation email sends with new template
- [ ] Resend staff invitation actually re-sends email
- [ ] Email delivery status updates in DB correctly
- [ ] Without `RESEND_API_KEY`, URLs are logged for manual sharing

---

### Phase 3: Complete Gym Onboarding Flow (P1)

#### Step 3.1: Tighten Gym Creation + Owner Invitation — `admin-coder` 🔵

Ensure the full gym creation → owner invitation → owner onboarding flow works end-to-end.

**Verify/fix these flows:**

**Flow A: Superadmin Creates Gym + New Owner**
1. SuperAdmin goes to `/dashboard/super` (Control Tower)
2. Fills in gym name, city, country, address
3. Checks "Create New Owner" → enters email, username
4. `createGym()` → creates gym (owner_id: null) → creates `staff_invitations` (gym_owner) → sends Resend email
5. Owner receives email → clicks "Accept Invitation"
6. Owner lands on `/accept-invitation/[token]`
7. If no account: clicks "Create Account" → `/signup?email=...&invite=...`
8. Owner signs up → email confirmed → returns to accept-invitation
9. Accepts invitation → `accept_owner_invitation` RPC → gym.owner_id set → profile.role = gym_owner
10. Redirected to `/dashboard/gym/[id]/dashboard`

**Flow B: Superadmin Creates Owner Without Gym**
1. SuperAdmin goes to `/dashboard/super/owners`
2. Clicks "Invite New Owner" → enters email, username
3. `createOwner()` → creates `staff_invitations` (gym_owner, gym_id: null) → sends email
4. Owner receives email → clicks → signup → accepts
5. Profile becomes gym_owner, no gym assigned yet
6. SuperAdmin later creates gym with existing owner_id

**Flow C: Owner/Admin Invites Staff**
1. Owner/Admin goes to `/dashboard/gym/[id]/team`
2. Clicks "Invite Staff" → enters email, role (gym_admin/receptionist)
3. `createStaffInvitation()` → inserts into `staff_invitations` → sends Resend email
4. Staff receives email → clicks → signup/login → accepts
5. Profile role updated, assigned_gym_id set, gym_staff row created

**Files to check/fix:**

1. **`apps/admin-panel/components/modules/TeamList.tsx`**
   - Verify invite form works correctly
   - Ensure resend button calls the fixed `resendStaffInvitationEmail` that actually sends email
   - Show `email_delivery_status` indicator next to invitations (sent/failed/pending)

2. **`apps/admin-panel/app/accept-invitation/[token]/InvitationHandler.tsx`**
   - Already works — verify after auth page changes that the flow still works
   - Ensure post-signup redirect back to accept-invitation works

3. **`apps/admin-panel/app/signup/SignupForm.tsx`**
   - Verify `invite` query param is preserved through signup
   - Ensure `emailRedirectTo` correctly returns user to accept-invitation after email confirmation

**Testing:**
- [ ] Flow A: Full end-to-end gym + owner creation
- [ ] Flow B: Standalone owner invitation
- [ ] Flow C: Staff invitation (gym_admin and receptionist)
- [ ] Resend button works and actually sends new email
- [ ] Expired invitation shows appropriate error
- [ ] Wrong email match shows appropriate error

---

### Phase 4: Email Delivery Monitoring (P3)

#### Step 4.1: Admin UI for Email Status — `admin-coder` 🔵

**Optional/future enhancement.** Add visibility into email delivery status.

1. **On Team page (`TeamList.tsx`):**
   - Show pill badge next to each invitation: `Sent` (green), `Failed` (red), `Pending` (yellow)
   - Show `email_failure_reason` in tooltip on failed items
   - Show `resend_count` when > 0

2. **On Owners page (`/dashboard/super/owners`):**
   - Same delivery status indicators for owner invitations

---

## Agent Execution Order

```
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 1: Password Reset Flow (P0) — CRITICAL                  │
│                                                                 │
│  Agent: admin-coder 🔵                                         │
│  Step 1.1: Create /auth/confirm, /auth/reset, /forgot-password │
│            Modify LoginForm.tsx to add "Forgot Password?"       │
│                                                                 │
│  Estimated: ~2 agent calls                                     │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 2: Unified Email Service (P1)                           │
│                                                                 │
│  Agent: admin-coder 🔵                                         │
│  Step 2.1: Create email-service.ts (shared utility)            │
│            Refactor staff-actions.ts                            │
│            Refactor gym-actions.ts                              │
│            Refactor owner-actions.ts                            │
│            Fix resendStaffInvitationEmail to actually send      │
│                                                                 │
│  Estimated: ~2 agent calls                                     │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 3: Complete Gym Onboarding Flow (P1)                    │
│                                                                 │
│  Agent: admin-coder 🔵                                         │
│  Step 3.1: Verify/fix TeamList.tsx (delivery status badges)    │
│            Verify/fix InvitationHandler.tsx post-auth changes  │
│            Verify/fix SignupForm.tsx invite param handling      │
│                                                                 │
│  Estimated: ~1-2 agent calls                                   │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 4: Email Delivery Monitoring (P3 — Optional)            │
│                                                                 │
│  Agent: admin-coder 🔵                                         │
│  Step 4.1: Add delivery status pills to Team + Owners pages   │
│                                                                 │
│  Estimated: ~1 agent call                                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Summary: Agent Roster

| Phase | Agent | What |
|-------|-------|------|
| 1 | **admin-coder** | Password reset + email confirm pages, forgot password page, login page update |
| 2 | **admin-coder** | Shared email service, refactor 3 action files, fix resend |
| 3 | **admin-coder** | Verify/fix onboarding flows (team, invitation handler, signup) |
| 4 | **admin-coder** | Email delivery status UI (optional) |

**Note:** No `supabase-dba` work is needed — the database schema (`staff_invitations` with delivery tracking, RPCs, auth templates) is already complete. No `mobile-coder` work needed — this is admin panel only.

---

## Environment Variables Required

| Variable | Where | Purpose |
|----------|-------|---------|
| `RESEND_API_KEY` | Vercel + `.env.local` | Resend API authentication |
| `RESEND_FROM_EMAIL` | Vercel + `.env.local` | Sender address (default: `SweatDrop <noreply@sweatdrop.com>`) |
| `NEXT_PUBLIC_APP_URL` | Vercel + `.env.local` | Base URL for invitation links + auth redirects |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel + `.env.local` | Admin client for user management |

---

## Supabase Auth Configuration Notes

The `config.toml` already has:
- `site_url = "https://www.sweat-drop.com"` — recovery/confirmation links point here
- Recovery template: `./supabase/templates/reset_password.html` — uses `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`
- Confirmation template: `./supabase/templates/confirmation.html` — uses `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`

Both templates redirect to `/auth/confirm` with token_hash. The server route handler needs to handle both `type=recovery` (redirect to reset form) and `type=email` (verify and redirect to login).

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Password reset link expires | Show clear "link expired" message, offer to resend |
| Email lands in spam | Use proper Resend domain verification, consistent From address |
| Invitation token replay | Tokens are single-use (status changes to 'accepted') |
| Race condition on invitation accept | RPCs use transactions |
| Missing env vars in production | Email service logs warning, falls back to manual URL sharing |
