# Bugfix: Owner Invite — Wrong Email Confirm + Wrong Role

> **Dva baga u produkciji koji oba potiču iz istog root cause-a:** kada superadmin pošalje invite gym owneru, email verifikacija i role assignment ne rade ispravno.

---

## Bug 1: Email verification šalje korisnika na landing page

### Reprodukcija
1. Superadmin invite-uje gym ownera (email koji nema nalog).
2. Owner klikne "Accept Invitation" → admin panel SignupForm → `supabase.auth.signUp(...)`.
3. Supabase šalje **confirmation email** koristeći ugrađeni template `confirmation.html`.
4. Template koristi `{{ .SiteURL }}` = `https://www.sweat-drop.com` → link u emailu je `https://www.sweat-drop.com/auth/confirm?token_hash=...&type=email`.
5. Owner klikne → otvori se **landing page** (mobile-oriented "EMAIL CONFIRMED — Open in SweatDrop" sa deep link-om).
6. Owner nikad ne stiže nazad na admin panel.

### Root cause
`supabase.auth.signUp({ emailRedirectTo: ... })` postavlja `redirectTo` u Supabase metapodatke, ali **Supabase confirmation template ignoriše `redirectTo`** — koristi hard-coded `{{ .SiteURL }}` za CTA link. Template ne podržava kondicionalno rutiranje kao što reset template radi za `.RedirectTo`.

Čak i kad bi template koristio `.RedirectTo`, **Supabase hosted auth ne garantuje** da će svaki email provider / klijent sačuvati redirect intact — isto ponašanje koje je dovelo do prebacivanja admin password reset-a na Resend.

### Fix
Isti pattern koji već radi za admin forgot-password: **bypass Supabase email, koristi `generateLink` + Resend**.

---

## Bug 2: Invited owner završi sa rolom `user`

### Reprodukcija
1. Owner klikne email confirm link → landing page "Open in SweatDrop".
2. Owner NE zna da se vrati na admin panel (nema razloga, upravo je potvrdio email).
3. `handle_new_user()` trigger na `auth.users INSERT` kreira profil sa **`role = 'user'`** (hardcoded, linija 81 u `20260304000020_auth_foundation.sql`).
4. Owner nikad ne klikne "Accept Invitation" na admin panelu → `accept_owner_invitation` RPC **nikad se ne pozove** → `profiles.role` ostaje `'user'`.
5. Owner otvori `admin.sweat-drop.com` → middleware/RBAC vidi `role = 'user'` → **beli ekran** (dashboard se ne renderuje za `user` rolu; verovatno nema pristup nikakvom gymu).

### Root cause
Flow je prekinut u Bug 1 — korisnik nikad ne dovrši `accept_owner_invitation` jer ga email šalje na pogrešno mesto. Ali čak i da owner nekako stigne nazad na admin panel, flow je fragilan:

- `SignupForm` (linija 76) radi `router.push(`/accept-invitation/${inviteToken}`)` posle signup-a, ali to se desi **pre email verifikacije**. U tom momentu korisnik **nije confirmed** i ne može da pozove RPC (jer nema sesiju, ili sesiju sa neconfirmed email-om).
- Tek posle email confirm-a korisnik dobija pravu sesiju — ali tada je već na landing page-u.

### Fix
Napravi signup → confirm → accept **jedan neprekinut flow na admin domenu**, bez da korisnik ikad napusti admin panel.

---

## Workspace Assignments

| Agent | Workspace | Briefing |
|-------|-----------|----------|
| **admin-coder** | `apps/admin-panel/` | Jedini agent — sav fix je u admin panelu |

> Nema DB migracija, nema mobile izmena, nema landing page izmena. Celokupan fix je u admin panelu jer koristimo `generateLink` API (server action) + Resend za email, i admin panel `/auth/confirm` route (koji već postoji i radi za password reset) za potrošnju tokena.

---

## Execution Plan

### Step 1: Server Action — `sendAdminSignupConfirmEmail`

**Kreiraj/dodaj u:** `apps/admin-panel/lib/actions/signup-confirm-actions.ts`

Ova akcija radi isti pattern kao `sendAdminPasswordResetEmail` u `password-reset-actions.ts`, ali za `signUp` (tip `signup` umesto `recovery`):

```typescript
'use server';

import { getAdminClient } from '@/lib/utils/supabase-admin';
import { sendEmail, buildAdminEmailConfirmHtml } from '@/lib/utils/email-service';
```

**Logika:**
1. Primi `email: string` i `inviteToken: string | null` kao argumente.
2. Resolve admin appUrl koristeći **isti `resolveAdminAppUrl()` helper** iz `password-reset-actions.ts` (extractuj ga u shared util ako je private).
3. Pozovi `admin.auth.admin.generateLink({ type: 'signup', email, ... })`.
   - **Pažnja:** `generateLink` za `signup` radi samo ako je `email_confirm_enabled = true` u Supabase Auth settings. Alternativno koristi `type: 'magiclink'` — proveri šta radi za tvoj setup.
   - Ako `generateLink` za `signup` ne radi (Supabase zahteva da user već postoji), prebaci strategiju — vidi **Alternativna strategija** ispod.
4. Iz response-a izvuci `hashed_token`.
5. Konstruiši URL: `${appUrl}/auth/confirm?token_hash=${hashedToken}&type=email&next=/accept-invitation/${inviteToken}`.
   - **`next` param** je ključan — admin `/auth/confirm` route će posle verifikacije redirect-ovati korisnika na `next` URL umesto na `/login`.
6. Pošalji email preko Resend koristeći novi `buildAdminEmailConfirmHtml({ confirmUrl, gymName? })` template.

**Alternativna strategija (ako `generateLink` za signup ne radi):**

Supabase `signUp()` **automatski** šalje confirmation email koji ne možeš da sprečiš (osim da isključiš confirm emails u Auth settings, što ne želiš za consumer korisnike). Umesto toga:

1. U `SignupForm` pozovi `supabase.auth.signUp({ ..., options: { emailRedirectTo: ... } })` kao sad.
2. **Ali odmah posle signup-a**, pozovi server action koja:
   - Koristi `admin.auth.admin.generateLink({ type: 'magiclink', email })` da dobije svež token.
   - Pošalje **drugi** email preko Resend sa linkom ka `admin.sweat-drop.com/auth/confirm?token_hash=...&type=magiclink&next=/accept-invitation/{token}`.
   - Ovaj email stigne u inbox pored Supabase-ovog default emaila.
3. Korisnik klikne Resend email (koji ima "Verify your email for SweatDrop Admin" subject — jasniji od generičkog Supabase emaila).
4. Supabase-ov default email i dalje stiže, ali ako ga korisnik klikne, ode na landing page (neidealno, ali bar Resend email radi ispravno). **Bolje rešenje:** vidi Step 1b.

### Step 1b: Suppress Supabase default confirm email za admin signupe

**Preporučeno rešenje** (clean, jedan email):

1. U `SignupForm` NE koristi `supabase.auth.signUp()` sa klijenta.
2. Umesto toga, pozovi **server action** `createAdminUser`:
   - Koristi `admin.auth.admin.createUser({ email, password, email_confirm: false, user_metadata: { username } })` — kreira korisnika **bez slanja confirmation emaila** (jer `email_confirm: false` preskače auto-confirm, a mi šaljemo svoj email).
   - Odmah pozovi `admin.auth.admin.generateLink({ type: 'signup', email })` da dobiješ `hashed_token`.
   - Pošalji Resend email sa linkom: `${appUrl}/auth/confirm?token_hash=${hashedToken}&type=email&next=/accept-invitation/${inviteToken}`.
3. Korisnik dobije **samo jedan email** (od Resend, na admin domenu).

> **Sigurnosna napomena:** `admin.auth.admin.createUser` zahteva `service_role` ključ. Već imaš `getAdminClient()` koji to koristi (vidi `password-reset-actions.ts`). Server action je server-side pa je safe.

> **Edge case:** ako korisnik već postoji (`auth.users` row) ali je neconfirmed, `createUser` će failovati. Handluj taj case: detektuj "User already registered" error, pa pozovi samo `generateLink` za tog postojećeg usera.

### Step 2: Email template `buildAdminEmailConfirmHtml`

**Fajl:** `apps/admin-panel/lib/utils/email-service.ts`

Dodaj novu template builder funkciju (pored postojeće `buildAdminPasswordResetEmailHtml`):

```typescript
export function buildAdminEmailConfirmHtml(vars: {
  confirmUrl: string;
  gymName?: string;
}): string {
  const gymText = vars.gymName
    ? ` to manage <strong style="color:#fff">${vars.gymName}</strong> on`
    : ' to';
  return wrapEmailHtml({
    heading: 'Verify your email',
    bodyText: `You've been invited${gymText} <strong style="color:#00E5FF">SweatDrop</strong>.<br><br>Please confirm your email address to activate your account and accept the invitation.`,
    acceptUrl: vars.confirmUrl,
    ctaLabel: 'Verify Email',
  });
}
```

### Step 3: Update admin `/auth/confirm` route da podrži `next` redirect

**Fajl:** `apps/admin-panel/app/auth/confirm/route.ts`

Trenutno (linija 42):
```typescript
return NextResponse.redirect(`${baseUrl}/login?confirmed=true`);
```

Promeni da čita `next` query param:

```typescript
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as 'email' | 'recovery' | 'magiclink' | null;
  const next = searchParams.get('next');

  const baseUrl = request.nextUrl.origin;

  if (!tokenHash || !type) {
    return NextResponse.redirect(`${baseUrl}/login?error=invalid_link`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: type === 'recovery' ? 'recovery' : type === 'magiclink' ? 'magiclink' : 'email',
  });

  if (error) {
    const msg = error.message.toLowerCase().includes('expired')
      ? 'link_expired'
      : 'confirmation_failed';
    return NextResponse.redirect(`${baseUrl}/login?error=${msg}`);
  }

  if (type === 'recovery') {
    return NextResponse.redirect(`${baseUrl}/auth/reset`);
  }

  // Email/magiclink confirmation — redirect to `next` if provided
  if (next && next.startsWith('/')) {
    return NextResponse.redirect(`${baseUrl}${next}?confirmed=true`);
  }

  return NextResponse.redirect(`${baseUrl}/login?confirmed=true`);
}
```

> **Sigurnost:** `next.startsWith('/')` sprečava open redirect (ne može da bude `https://evil.com`). Dozvoljena su samo relativna admin panel putanja.

### Step 4: Update `SignupForm` da koristi server action

**Fajl:** `apps/admin-panel/app/signup/SignupForm.tsx`

**Opcija A (preporučena — full server-side user creation):**

Zameni `supabase.auth.signUp(...)` pozivom server action-a:

```typescript
const handleSignup = async (e: React.FormEvent) => {
  e.preventDefault();
  setError(null);
  // ... validacija ...
  setLoading(true);

  try {
    const result = await createAdminUser({
      email: email.trim(),
      password,
      username,
      inviteToken,
    });

    if (!result.success) throw new Error(result.message);

    toast.success('Account created! Check your email to verify and accept the invitation.');

    // Ne redirect-uj — korisnik mora da klikne email link
    setStep('check-email');
  } catch (err) {
    // ...
  }
};
```

Dodaj "check your email" state umesto instant redirect-a:

```typescript
if (step === 'check-email') {
  return (
    <div className="text-center">
      <h1>Check your email</h1>
      <p>We sent a verification link to {email}. Click it to confirm your email and accept the invitation.</p>
    </div>
  );
}
```

**Opcija B (minimalnija — dual email):**

Zadrži `supabase.auth.signUp(...)` ali odmah posle pozovi server action `sendAdminSignupConfirmEmail(email, inviteToken)` koja šalje Resend email. Korisnik dobije dva emaila — Supabase default (landing page link) + Resend (admin panel link). Manje clean, ali manje code izmena.

> **Preporuka: Opcija A.** Jedan email, čist flow, isti proven pattern kao password reset.

### Step 5: Flow posle email confirm-a → auto accept invitation

Posle Step 3, korisnik koji klikne email link:
1. → `admin.sweat-drop.com/auth/confirm?token_hash=...&type=email&next=/accept-invitation/TOKEN`
2. → `verifyOtp` uspe → sesija kreirana
3. → redirect na `/accept-invitation/TOKEN?confirmed=true`
4. → `InvitationHandler` se učita → user je authenticated → prikaže "Accept Invitation" button
5. → Korisnik klikne → `accept_owner_invitation` RPC → role postaje `gym_owner` → redirect na dashboard

**Opciono poboljšanje (auto-accept):** u `InvitationHandler.tsx`, ako `searchParams.get('confirmed')` postoji i user je authenticated, **automatski pozovi `handleAccept()`** bez čekanja na klik:

```typescript
useEffect(() => {
  if (isAuthenticated && invitation && searchParams.get('confirmed') === 'true') {
    handleAccept();
  }
}, [isAuthenticated, invitation]);
```

Ovo skraćuje flow za 1 klik. Korisnik vidi "Accepting invitation..." → odmah redirect na dashboard. Best UX.

---

## Dijagram: sadašnji vs. novi flow

### Sadašnji (broken):
```
Superadmin invite → Resend email (accept link) → Owner clicks
  → Admin /accept-invitation/{token} → "Create Account" → SignupForm
  → supabase.auth.signUp() → Supabase sends confirm email
  → www.sweat-drop.com/auth/confirm → "OPEN SWEATDROP" (mobile!)
  ✗ Owner lost. Never returns to admin. Role stays 'user'.
```

### Novi (fixed):
```
Superadmin invite → Resend email (accept link) → Owner clicks
  → Admin /accept-invitation/{token} → "Create Account" → SignupForm
  → Server Action: createUser + generateLink + Resend email
  → admin.sweat-drop.com/auth/confirm?...&next=/accept-invitation/{token}
  → verifyOtp → redirect /accept-invitation/{token}?confirmed=true
  → InvitationHandler auto-accepts → accept_owner_invitation RPC
  → role = 'gym_owner' → redirect /dashboard/gym/{id}/dashboard ✓
```

---

## Smoke Tests

- [ ] Superadmin šalje invite novom email-u → owner dobije **Resend invite email** (već radi, ne menjamo).
- [ ] Owner klikne invite → admin panel `/accept-invitation/{token}` → klikne "Create Account" → admin panel `/signup`.
- [ ] Owner popuni form, submit → **ne dobije Supabase default confirm email** (jer koristimo `admin.createUser` umesto `supabase.signUp`).
- [ ] Owner dobije **Resend confirm email** sa linkom ka `admin.sweat-drop.com/auth/confirm?...&next=/accept-invitation/{token}`.
- [ ] Owner klikne link → email potvrđen → redirect na `/accept-invitation/{token}?confirmed=true`.
- [ ] `InvitationHandler` auto-accept-uje → RPC `accept_owner_invitation` → `profiles.role = 'gym_owner'` ✅.
- [ ] Owner redirect-ovan na gym dashboard (ili general dashboard ako gym_id = null).
- [ ] Ponovi iste testove na `admin.dev.sweat-drop.com` (dev env) → linkovi u emailu su ka dev domenu, ne prod.
- [ ] **Regresija:** consumer signup (mobile app) i dalje radi normalno (ne diračemo Supabase auth config, samo admin panel).
- [ ] **Regresija:** admin forgot-password i dalje radi (ne diramo `password-reset-actions.ts`).

---

## Edge Cases

| Scenario | Handlovanje |
|----------|-------------|
| Owner već ima nalog (signup error "User already registered") | Server action detektuje → pozove samo `generateLink` + Resend → user dobije verification email, klikne, redirect na accept |
| Owner ima nalog i confirmed email (stari nalog) | Na `/accept-invitation/{token}` → "Log In to Accept" button → login → accept → done |
| Invite token expired | `InvitationHandler` prikaže "Invitation expired" (već postoji) |
| Owner klikne Supabase default email greškom (ako je stigao) | Landing page prikaže "Email Confirmed — Open SweatDrop" — ali role neće biti `gym_owner` dok se ne vrati na admin. Neidealno, ali sa Opcijom A (server-side createUser) **Supabase default email se uopšte ne šalje** |
| Beli ekran za `user` rolu | Ovo je simptom Bug 2; posle fix-a neće se dešavati. Za existing broken usere, superadmin može ručno promeniti role u DB-u ili kroz buduću admin UI |

---

## Fajlovi koji se menjaju

| Fajl | Izmena |
|------|--------|
| `apps/admin-panel/lib/actions/signup-confirm-actions.ts` | **NOVO** — server action za createUser + generateLink + Resend |
| `apps/admin-panel/lib/utils/email-service.ts` | Dodaj `buildAdminEmailConfirmHtml` |
| `apps/admin-panel/lib/actions/password-reset-actions.ts` | Extractuj `resolveAdminAppUrl` u shared util (opciono, može i copy-paste) |
| `apps/admin-panel/app/auth/confirm/route.ts` | Dodaj `next` param + `magiclink` type support |
| `apps/admin-panel/app/signup/SignupForm.tsx` | Zameni `supabase.auth.signUp` sa server action; dodaj "check email" state |
| `apps/admin-panel/app/accept-invitation/[token]/InvitationHandler.tsx` | Auto-accept kad `confirmed=true` u query |

> Ništa van `apps/admin-panel/` se ne menja. Nema migracija, nema mobile izmena, nema landing page izmena.

---

## Timeline

| Task | Trajanje |
|------|----------|
| Server action + email template (Step 1, 1b, 2) | 1.5 h |
| Update auth confirm route (Step 3) | 15 min |
| Update SignupForm (Step 4) | 30 min |
| Auto-accept in InvitationHandler (Step 5) | 15 min |
| Smoke testing (oba env-a) | 30 min |
| **Total** | **~3 h** |

---

## Rollback

Ako nešto pukne:
- Revert `SignupForm.tsx` → korisnici se opet registruju kroz `supabase.auth.signUp()` (stari broken flow, ali barem radi signup).
- Ručno u DB: `UPDATE profiles SET role = 'gym_owner' WHERE email = '<owner-email>';` za svakog pogođenog ownera.
- Alternativno: superadmin ode na `accept_owner_invitation` stranu sa ownerovim tokenom i prihvati za njega (ne postoji UI za ovo, ali RPC se može pozvati iz Supabase SQL editora).

---

## Reference

- `apps/admin-panel/lib/actions/password-reset-actions.ts` — proven pattern za bypass Supabase email template-a.
- `apps/admin-panel/app/auth/confirm/route.ts` — admin confirm route koji radi za recovery, proširujemo za email/magiclink.
- `backend/supabase/migrations/20240101000023_owner_invitations.sql` — `accept_owner_invitation` RPC.
- `backend/supabase/migrations/20260304000020_auth_foundation.sql` — `handle_new_user` trigger (hardcodes `role = 'user'`).
