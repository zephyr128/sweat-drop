# SweatDrop — Production Launch Playbook

> **Svrha:** Jedan dokument koji pokriva CEO proces izlaska u produkciju: Supabase prod, Admin panel, Mobile app (iOS + Android), store submission (TestFlight / Play Internal), i inicijalni setup pilot gyma (Vortex). Prati se redosledom — svaki korak je uslov za sledeći.
>
> **Pretpostavke trenutnog stanja:**
> - Sve smo razvijali na `features/dev` branchu sa dev Supabase (`jzyoyxabcdzvqcfnfzrz`).
> - Prod Supabase projekat postoji (`qdtdfofodfdlutkmlzzf`), ali nije u potpunosti konfigurisan ni popunjen.
> - Apple Developer + Google Play nalozi postoje, App Store Connect i Play Console app record-i su napravljeni (bundle `com.sweatdrop.app` / package `com.sweatdrop.app`).
> - Odluka: **5x-tap simulator se ISKLJUČUJE u prod buildu** (bezbedno za Apple review). Apple testeru ćemo dati zaseban demo nalog + printable QR + reviewer note.
> - Domeni: `https://www.sweat-drop.com` (landing), `https://admin.sweat-drop.com` (admin), `sweatdrop://` (mobile deep link).

---

## 0. Predpreduslovi (uradi jednom pre bilo čega)

1. **Pristupi:**
   - [ ] Apple Developer Program (tim `zephyr23`) — `Account Holder` ili `Admin` + `App Manager` role.
   - [ ] Google Play Console (publisher nalog SweatDrop).
   - [ ] Supabase org sa oba projekta (`sweat-drop` dev + `sweat-drop-prod`).
   - [ ] Vercel nalog sa pristupom `sweatdrop-admin-panel` projektu.
   - [ ] GitHub repo — write pristup na `main` branch.
   - [ ] Expo / EAS (`zephyr23` owner, projectId `970c6ba3-aae9-4b7a-b014-74915fff4df3`).
   - [ ] Resend nalog (za transakcijski mail iz admin panela) + verifikovan domen `sweat-drop.com`.
   - [ ] Sentry projekat `sweatdrop/sweat-drop`.
   - [ ] DNS kontrolu nad `sweat-drop.com` (za MX/SPF/DKIM + CNAME-ove).

2. **Lokalno okruženje:**
   ```bash
   node -v         # >= 18
   pnpm -v         # >= 10
   xcodebuild -version     # Xcode 15+ za iOS
   adb --version           # Android SDK
   npx supabase --version  # Supabase CLI
   eas --version       # eas-cli >= 10
   ```

3. **Git branch strategija (zaključano):**
   - `features/dev` → dev (DEV Supabase, TestFlight internal, Play Internal testing)
   - `main` → production (PROD Supabase, App Store + Play Production)
   - Nikad ne merguj iz `features/dev` u `main` bez Go/No-Go gate-a (Sekcija 9).

---

## 1. Supabase Production — baza, auth, mail, edge funkcije

**Prod projekat ref:** `qdtdfofodfdlutkmlzzf`
**URL:** `https://qdtdfofodfdlutkmlzzf.supabase.co`
**Dashboard:** https://supabase.com/dashboard/project/qdtdfofodfdlutkmlzzf

### 1.1 Link lokalni CLI na prod

```bash
cd backend
npx supabase link --project-ref qdtdfofodfdlutkmlzzf
npx supabase migration list
```

Ako CLI traži db password, uzmi ga iz: Dashboard → Settings → Database → Connection string.

### 1.2 Migracije (svih ~260 fajlova) — push na prod

Imamo helper skriptu koja prvo pokaže pending listu, traži `yes`, pushuje, pa se vrati na dev link:

```bash
cd /Users/np/Projects/sweatdrop
./scripts/db-push-prod.sh
```

Ako radiš ručno (isti efekat):
```bash
cd backend
npx supabase link --project-ref qdtdfofodfdlutkmlzzf
npx supabase db push --dry-run --include-all
npx supabase db push --include-all --yes
npx supabase migration list    # sve mora biti "|  ✓  |"
```

Posle toga:
- [ ] Otvori Studio → Table Editor → proveri da svi tabovi postoje (gyms, profiles, machines, sessions, drops_ledger, rewards, challenges, arenas, staff_invitations, referrals, friend_challenges, user_notifications, …).
- [ ] Otvori `backend/types/database.types.ts` — treba da se match-uje sa prod šemom (to se već auto-generiše sa dev; na prod je isto jer su migracije iste).
- [ ] Re-link nazad na dev: `cd backend && npx supabase link --project-ref jzyoyxabcdzvqcfnfzrz`.

### 1.3 Auth — Site URL i Redirect URL-ovi

U Dashboard → **Authentication → URL Configuration**:

- **Site URL:** `https://www.sweat-drop.com`
- **Additional Redirect URLs** (svaki u novom redu):
  ```
  exp://localhost:8081
  sweatdrop://
  sweatdrop://auth/confirm
  sweatdrop://auth/reset
  https://www.sweat-drop.com/auth/confirm
  https://www.sweat-drop.com/auth/reset
  https://www.sweat-drop.com/join
  https://admin.sweat-drop.com/auth/confirm
  https://admin.sweat-drop.com/auth/reset
  ```

> `config.toml` koji je u repo-u (`backend/supabase/config.toml`) služi samo za lokalni Supabase. Redirect-ovi za prod se postavljaju **u dashboardu** — CLI `config.toml` ne pushuje ove vrednosti na remote.

### 1.4 Auth — Provider keys (Google i Apple)

**Google:**
- Dashboard → Authentication → Providers → Google → Enabled → popuni:
  - Client ID: `620444177181-6o893vjr0d24r37u6ekviquoi8m6tq9e.apps.googleusercontent.com` (web)
  - Client Secret: iz Google Cloud Console (isti projekat, OAuth 2.0 Web credential).
- U Google Cloud Console → OAuth consent screen: **Publishing status = In production** (ako je još u Testing, web login će pucati za ne-whitelistovane korisnike).
- Redirect URI u Google Cloud: `https://qdtdfofodfdlutkmlzzf.supabase.co/auth/v1/callback`.

**Apple (Sign in with Apple):**
- U Apple Developer portalu → Identifiers → App IDs → `com.sweatdrop.app` → Capabilities → **Sign in with Apple** enabled.
- Services ID (odvojeni identifier): `com.sweatdrop.app.signin` (ili postojeći) → Domains and Subdomains: `qdtdfofodfdlutkmlzzf.supabase.co` → Return URL: `https://qdtdfofodfdlutkmlzzf.supabase.co/auth/v1/callback`.
- Generiši Apple Private Key (Keys → +), Key ID i Team ID.
- Dashboard → Authentication → Providers → Apple → Enabled → popuni Services ID, Team ID, Key ID, Private Key (base64).

### 1.5 Auth — Email templates i SMTP (Resend)

Fajlovi su u `backend/supabase/templates/`. Dashboard → Authentication → Email Templates:

- **Confirm signup:** paste iz `backend/supabase/templates/confirmation.html` (ili koji god dev već koristi), subject `Confirm your SweatDrop email`. Redirect button treba da pokazuje `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup`.
- **Reset password:** paste iz `backend/supabase/templates/reset_password.html`, subject `Reset your SweatDrop password`. Redirect `{{ .SiteURL }}/auth/reset?token_hash={{ .TokenHash }}&type=recovery`.
- **Magic Link / Invite / Email Change:** copy iz dev projekta (Dashboard → Authentication → Email Templates → Export na dev, Import na prod).

SMTP (za auth mail-ove od Supabase):
- Dashboard → Project Settings → **Auth → SMTP Settings → Enable custom SMTP**.
- Host: `smtp.resend.com`, Port: `465`, Username: `resend`, Password: `re_7d8QbJJ2_...` (postojeći Resend key iz `.env.prod.local`).
- Sender email: `noreply@sweat-drop.com`, Sender name: `SweatDrop`.
- Klikni **Send test email** na svoj mail da potvrdiš da stiže.

### 1.6 Resend — DNS za `sweat-drop.com`

Bez ovoga mail-ovi iz admin panela (staff invite, owner invite) idu u spam:
- U Resend dashboard → Domains → Add `sweat-drop.com` → pokaži DNS zapise (SPF, DKIM, return-path).
- U DNS provajderu dodaj TXT + CNAME zapise.
- Čekaj verifikaciju (do 24h, obično 10 min) → Status `Verified`.
- Verifikuj i `admin.sweat-drop.com` subdomain za return-path ako Resend traži.

### 1.7 Vault / Secrets za Edge funkcije

Edge funkcije koriste Supabase Vault za service role key i push credential-e. U Dashboard → Database → **Vault** → Add secrets:

| Secret name | Value |
|---|---|
| `project_url` | `https://qdtdfofodfdlutkmlzzf.supabase.co` |
| `service_role_key` | (iz Settings → API → `service_role` key) |
| `expo_access_token` | (opciono; iz expo.dev account settings, ako planiraš prelazak na Expo push direktno) |

Napomene:
- `send-push` edge funkcija ne treba APNs/FCM keys — koristi **Expo Push Service** preko `EXPO_PUBLIC_EAS_PROJECT_ID` koji je već ušančen u binary (vidi 3.3).
- Bez `project_url` i `service_role_key` u vault-u, cron-ovi (happy hour, re-engagement, streak reminder, arena finalize, prize distribution) **ne rade**. Ovo je najčešća greška.

### 1.8 Cron i edge funkcije — deploy + verify

```bash
cd backend
npx supabase link --project-ref qdtdfofodfdlutkmlzzf

# Deploy sve edge funkcije iz repo-a:
for fn in send-push re-engagement streak-reminder drops-expiry-warning \
          send-happy-hour-reminders distribute-leaderboard-prizes \
          finalize-arena notify-arena-participants process-campaigns \
          reset-challenges send-prize-ready-push delete-account; do
  npx supabase functions deploy "$fn"
done

npx supabase link --project-ref jzyoyxabcdzvqcfnfzrz   # re-link na dev
```

**Verifikacija cron-a (u SQL editoru na prod):**
```sql
SELECT jobname, schedule, active
FROM cron.job
WHERE jobname IN (
  'send-happy-hour-reminders','finalize-arena-check',
  'leaderboard-prize-distribution','process-campaigns-sweep',
  'streak-reminder','re-engagement','drops-expiry-warning',
  'reset-challenges'
) ORDER BY jobname;
```
Svi `active = true`. Ako fali neki → re-apply migracija iz `backend/supabase/migrations/` koja ga planira (vidi `docs/plans/push_notifications_systemic_fix_plan.md` §0.1 za tačne nazive migracija).

### 1.9 Storage bucket-i

Dashboard → Storage → Buckets (kreirani migracijama, ali proveri):
- `gym-logos` (public read)
- `gym-backgrounds` (public read)
- `reward-images` (public read)
- `machine-photos` (public read)
- `challenge-covers` (public read)
- `global-achievement-badges` (public read)
- `user-avatars` (public read, authenticated write)
- `staff-invitations` (private; samo admin)

Za svaki: proveri da postoji i da RLS policy prolazi. Ako nisu auto-kreirani, napravi manualno i postavi `public` flag.

### 1.10 Proveri health

- [ ] `SELECT count(*) FROM auth.users;` — 0 ili sa par superadmin/seed usera.
- [ ] `SELECT count(*) FROM public.gyms;` — 0 (ubacivaćemo Vortex u Sekciji 5).
- [ ] `SELECT * FROM pg_extension;` — `pg_cron`, `pgcrypto`, `uuid-ossp`, `pg_net` moraju biti tu.

---

## 2. Admin Panel — Vercel deploy (`admin.sweat-drop.com`)

**Branch za prod:** `main`. Root directory: `apps/admin-panel`.

### 2.1 Vercel projekat setup (uradi jednom)

1. Vercel → Add New → Project → Import `sweatdrop` repo.
2. **Project Settings → General:**
   - **Root Directory:** `apps/admin-panel`
   - **Framework Preset:** Next.js (auto)
   - **Build Command:** `pnpm build` (ili auto)
   - **Install Command:** `pnpm install`
   - **Node.js Version:** 20.x
3. **Project Settings → Git → Production Branch:** `main`.
4. **Project Settings → Domains:**
   - Dodaj `admin.sweat-drop.com` → sledi CNAME instrukcije u DNS-u.
   - (Opciono) `admin.sweatdrop.app` kao alias.

### 2.2 Environment Variables (Vercel → Settings → Environment Variables)

Scope: **Production** (za sve varijable osim onih koje su i za preview):

| Name | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://qdtdfofodfdlutkmlzzf.supabase.co` | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (prod anon iz `apps/admin-panel/.env.prod.local`) | |
| `SUPABASE_SERVICE_ROLE_KEY` | (prod service_role iz Supabase Settings → API) | **TAJNA** |
| `NEXT_PUBLIC_APP_URL` | `https://admin.sweat-drop.com` | Koristi se u email pozivnicama |
| `NEXT_PUBLIC_PRIVACY_POLICY_URL` | `https://www.sweat-drop.com/privacy` | |
| `NEXT_PUBLIC_TERMS_OF_SERVICE_URL` | `https://www.sweat-drop.com/terms` | |
| `NEXT_PUBLIC_SUPPORT_URL` | `https://www.sweat-drop.com/support` | |
| `RESEND_API_KEY` | `re_7d8QbJJ2_...` | **TAJNA** |
| `RESEND_FROM_EMAIL` | `SweatDrop <noreply@sweat-drop.com>` | |

> **Važno:** Vercel UI ponekad ubaci whitespace. Kod u `lib/supabase-client.ts` već radi `.trim()`, ali ručno proveri da nema space na kraju ključa kad paste-uješ.

### 2.3 Prvi deploy

```bash
git checkout main
git merge features/dev --no-ff     # sa svežim testiranim kodom
git push origin main
```

Vercel automatski pravi deployment. Posle `Ready`:
- [ ] `https://admin.sweat-drop.com/login` učitava se, layout OK.
- [ ] Nema client-side errora u devtools.
- [ ] Login sa superadmin nalogom (napravićeš ga u 5.1) radi.
- [ ] Middleware redirectuje nepotpisane korisnike na `/login`.

### 2.4 Landing page (ako je deploy-uje isti team)

Ako je `apps/landing-page` takođe u Vercelu kao zaseban projekat:
- Root Directory: `apps/landing-page`
- Domain: `www.sweat-drop.com` + `sweat-drop.com` (redirect na www)
- Env: `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `CONTACT_EMAIL` (vidi `apps/landing-page/EMAIL_SETUP.md`).

Landing mora biti online pre store submission-a jer Privacy Policy i Terms URL-ovi moraju biti **live** kad Apple/Google review pogledaju.

---

## 3. Mobile App — EAS build, iOS + Android, TestFlight + Play

**Bundle ID / Package:** `com.sweatdrop.app`
**EAS project ID:** `970c6ba3-aae9-4b7a-b014-74915fff4df3`
**Expo owner:** `zephyr23`

### 3.1 Push env na prod pre build-a

**Kritično pravilo:** Prod AAB/IPA mora biti build-ovan sa prod Supabase env-om. Ako slučajno build-uješ sa dev env-om, korisnici će pisati u dev bazu.

```bash
cd /Users/np/Projects/sweatdrop
pnpm env:mobile:prod
# ovo kopira apps/mobile-app/.env.prod.local → apps/mobile-app/.env
```

Brza provera:
```bash
grep EXPO_PUBLIC_SUPABASE_URL apps/mobile-app/.env
# Mora biti: https://qdtdfofodfdlutkmlzzf.supabase.co
```

**Demo mode guardrail (odluka: OFF u prod):**
```bash
grep EXPO_PUBLIC_DEV_QR_UUID apps/mobile-app/.env
# Mora biti prazno / neprisutno. Ako je set → obriši pre build-a.
```

### 3.2 EAS login + secrets (uradi jednom)

```bash
cd apps/mobile-app
eas login                               # u terminal paste token ili login-uj se
eas whoami                              # mora da piše `zephyr23`
eas project:info                        # proveri projectId
```

Postavi prod env vars u EAS (za CI build-ove koji ne čitaju lokalni `.env`):
```bash
# Iz apps/mobile-app/
eas secret:create --name EXPO_PUBLIC_SUPABASE_URL \
  --value "https://qdtdfofodfdlutkmlzzf.supabase.co" --scope project --force

eas secret:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY \
  --value "$(grep EXPO_PUBLIC_SUPABASE_ANON_KEY .env.prod.local | cut -d= -f2-)" \
  --scope project --force

eas secret:create --name EXPO_PUBLIC_SITE_URL \
  --value "https://www.sweat-drop.com" --scope project --force

eas secret:create --name EXPO_PUBLIC_TERMS_URL \
  --value "https://www.sweat-drop.com/terms" --scope project --force

eas secret:create --name EXPO_PUBLIC_PRIVACY_URL \
  --value "https://www.sweat-drop.com/privacy" --scope project --force

eas secret:create --name EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID \
  --value "620444177181-6o893vjr0d24r37u6ekviquoi8m6tq9e.apps.googleusercontent.com" \
  --scope project --force

eas secret:create --name EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID \
  --value "620444177181-ar724tn6j7lfr28h97fpaosbn2o48352.apps.googleusercontent.com" \
  --scope project --force

eas secret:create --name EXPO_PUBLIC_SENTRY_DSN \
  --value "$(grep EXPO_PUBLIC_SENTRY_DSN .env.prod.local | cut -d= -f2-)" \
  --scope project --force

eas secret:create --name SENTRY_AUTH_TOKEN \
  --value "$(grep SENTRY_AUTH_TOKEN .env.prod.local | cut -d= -f2-)" \
  --scope project --force
```

Lista:
```bash
eas secret:list
```

### 3.3 iOS — certifikati, APNs, TestFlight

#### 3.3.1 Provisioning i signing (EAS upravlja)
```bash
cd apps/mobile-app
eas credentials   # interaktivno → iOS → Production → Generate new credentials
```
EAS kreira distribution cert + provisioning profile. Potvrdi da je APNs key kreiran (`Push notifications key` u istom meniju); ako ne postoji → **Generate a new Apple Push Notifications Service Key**.

#### 3.3.2 Build production IPA
```bash
cd apps/mobile-app
eas build --platform ios --profile production
```
Traje ~15 min. Output: `.ipa` URL + build ID. Zapiši build ID u release manifest (sekcija 9).

#### 3.3.3 Submit na App Store Connect → TestFlight
```bash
eas submit --platform ios --latest
```
Traži Apple ID i App-specific password (Apple ID → Sign-In and Security → App-Specific Passwords).

Build će se pojaviti u App Store Connect → My Apps → SweatDrop → TestFlight (status `Processing` → ~30 min → `Ready to Submit`).

**Export compliance:** pri prvom build-u Apple pita "Uses encryption?" → odgovor: **Yes, but only standard HTTPS / iOS built-in encryption** (exempt). `ITSAppUsesNonExemptEncryption=NO` se automatski šalje preko `app.config.js` (provjeri da je dodato u `infoPlist` ako te Apple ponovo pita — trenutno nije tu, dodaj pre prvog submit-a):

```js
// apps/mobile-app/app.config.js → ios.infoPlist
ITSAppUsesNonExemptEncryption: false,
```

#### 3.3.4 Internal testing (prvi krug)
- App Store Connect → TestFlight → Internal Testing → Add Internal Testers (tvoj mail + tim, do 100 ljudi, ne treba Apple review).
- Instaliraj TestFlight app na iPhone → pojavi se build → tapni Install.
- Izvrši "smoke" flow iz sekcije 7.

#### 3.3.5 External testing / App Store Review
Kad internal prođe:
- TestFlight → External Testing → New Group "Vortex Pilot" → dodaj testere (mail) → klikni **Submit for Beta App Review**.
- Review traje 24-48h za prvi build. Naredni build-ovi iste verzije ne traže re-review (osim ako promeniš binary / metadata).

Ili idi pravo na Prod:
- App Store Connect → App Store → + Version → popuni sve metadata (šablon: `docs/release/app_store_connect_submission_checklist.md`).
- Dodeli TestFlight build → Submit for Review → Apple Review → **Release automatically** ili **Manual release**.

### 3.4 Android — keystore, FCM, Play Console

#### 3.4.1 Keystore
Već postoji `apps/mobile-app/@zephyr23__sweatdrop.jks` u repo-u. **NE brisati, ne menjati, ne pushovati nigde van ovog repo-a**. Play App Signing je aktivan (Google čuva upload key, ti čuvaš upload cert) — proveri:
```bash
cd apps/mobile-app
eas credentials   # Android → Production → View keystore SHA
```
SHA mora da se match-uje sa onim u Play Console → Setup → App integrity → Upload key certificate.

#### 3.4.2 FCM (Firebase Cloud Messaging) za Android push — **obavezno, jednokratno**

> **Zašto Firebase ako ne koristimo Firebase?** Google nameće da SVAKI Android app koji prima push mora da ide preko FCM-a. Ne postoji alternativa. Naš kod ne zove Firebase direktno — mobile zove `Expo.getExpoPushTokenAsync()`, backend šalje na `https://exp.host/--/api/v2/push/send`, a **Expo-jev push relay** (exp.host) preuzima poruku i prosleđuje je na FCM (Android) ili APNs (iOS). Expo koristi tvoj FCM V1 service account da se autentifikuje prema Google-u. Firebase projekat je tu čisto kao "auto-put" do Android uređaja. Ne plaćaš ništa, ne pišeš Firebase kod, ne dodaješ Firebase SDK u app.
>
> **Za iOS ne trebaš Firebase** — APNs ide preko tvog Apple Developer naloga, EAS sam generiše APNs key (vidi 3.3.3). `GoogleService-Info.plist` koji je u repo-u je samo stub sa Google Sign-In client ID-jem, nema push credentials i **ne koristi se za push**.

**Korak 1 — Kreiraj Firebase projekat (2 min)**

1. Otvori https://console.firebase.google.com → **Add project**.
2. Ime: `sweatdrop-prod`.
3. Google Analytics: **isključi** (ne treba nam, samo produžava setup).
4. Create project → Continue.

**Korak 2 — Dodaj Android app u projekat (2 min)**

1. U Project Overview → klik **ikonica za Android** (Add app).
2. **Android package name:** `com.sweatdrop.app` ← MORA biti identičan kao `android.package` u [apps/mobile-app/app.config.js](apps/mobile-app/app.config.js).
3. App nickname: `SweatDrop`.
4. Debug signing certificate SHA-1: **preskoči** (nije potrebno za FCM V1).
5. Register app → **Download google-services.json**.
6. Sačuvaj ga kao:
   ```
   apps/mobile-app/google-services.json
   ```
7. Firebase wizard → klikni **Next → Next → Continue to console**. Step "Add Firebase SDK" i "Verify installation" **preskoči** — to je za native Android Gradle, EAS to radi sam kroz `googleServicesFile` config.

**Korak 3 — Generiši FCM V1 service account JSON (2 min)**

1. U Firebase konzoli → zupčanik (⚙) → **Project settings** → tab **Service accounts**.
2. Pri dnu stranice: **Firebase Admin SDK** → **Generate new private key** → **Generate key**.
3. Browser skine JSON fajl tipa `sweatdrop-prod-firebase-adminsdk-xxxxx.json`.
4. Premesti ga **van repo-a** (npr. `~/sweatdrop-secrets/fcm-v1-service-account.json`). **NIKAD ne commit-uj** — ovaj JSON sadrži private key koji može da šalje push na sve tvoje uređaje.

**Korak 4 — Upload u EAS (1 min)**

```bash
cd apps/mobile-app
eas credentials
```

- Platform: **Android**
- Profile: **production**
- Odaberi: **Google Service Account**
- Odaberi: **Manage your Google Service Account Key for Push Notifications (FCM V1)**
- **Upload a new service account key** → putanja do `~/sweatdrop-secrets/fcm-v1-service-account.json`.

EAS sad drži ključ i pri svakom cloud buildu ga automatski ubacuje + registruje na Expo push serverima kao autorizovanog pošiljaoca za tvoj `projectId`.

**Korak 5 — Poveži `google-services.json` sa app configom**

Već je dodato u [apps/mobile-app/app.config.js](apps/mobile-app/app.config.js):
```js
android: {
  // ...
  googleServicesFile:
    process.env.GOOGLE_SERVICES_JSON || './google-services.json',
}
```

I u [apps/mobile-app/.gitignore](apps/mobile-app/.gitignore) je dodato `google-services.json` da ga slučajno ne commit-uješ.

**Za EAS cloud build** (opciono, ako ne želiš da keep-uješ `google-services.json` ni lokalno): upload ga kao EAS file secret:
```bash
cd apps/mobile-app
eas secret:create \
  --scope project \
  --name GOOGLE_SERVICES_JSON \
  --type file \
  --value ./google-services.json
```
Posle toga `google-services.json` može da stoji samo na tvom laptopu; cloud build povlači fajl iz EAS secrets preko env var `GOOGLE_SERVICES_JSON`.

**Korak 6 — Verifikacija**

Nakon prvog prod builda, instaliraj AAB/APK na fizički Android uređaj, prijavi se, i u Supabase Studio → Edge Functions → **send-push** → Invoke:
```json
{
  "tokens": ["<expo_push_token iz profiles tabele>"],
  "title": "FCM test",
  "body": "Ako ovo vidiš, FCM radi."
}
```
Ako stigne notifikacija na telefon → FCM pipeline radi. Ako ne stigne, u `send-push` logu traži `DeviceNotRegistered` (token istekao, ponovo registruj na app-u) ili `MismatchSenderId` (pogrešan Firebase projekat u EAS credentials).

**Šta NE treba da radiš:**

- ❌ Ne dodaj `@react-native-firebase/*` pakete. Nisu potrebni — `expo-notifications` + Expo push service obavljaju sav posao.
- ❌ Ne aktiviraj Firebase Authentication, Firestore, Analytics, Crashlytics — ništa od toga nije povezano sa SweatDrop-om.
- ❌ Ne brini se o legacy FCM Server Key — Google gasi legacy API, Expo i EAS već koriste FCM V1 (service account JSON). Tvoj setup je forward-compatible.
- ❌ Ne commit-uj FCM service account JSON ili google-services.json u repo.

#### 3.4.3 Build production AAB
Imamo lokalnu skriptu koja bump-uje versionCode i pravi release AAB (radi na tvom Macu, ne preko EAS cloud-a):
```bash
cd apps/mobile-app
pnpm build:android:prod
# interaktivno traži env — ili:
# bash scripts/build-android-release.sh --env prod
```
Output: `apps/mobile-app/android/app/build/outputs/bundle/release/app-release.aab`.

Alternativno, EAS cloud build (stabilnije za CI):
```bash
cd apps/mobile-app
eas build --platform android --profile production
```

#### 3.4.4 Submit na Play Console

Automatski:
```bash
cd apps/mobile-app
eas submit --platform android --latest
# Traži Google Play Service Account JSON.
```

Ručno (ako skripta):
- Play Console → SweatDrop → Production (ili Internal testing prvo) → **Create new release** → Upload `app-release.aab` → Release notes → Review → Rollout.

**Preporuka za prvi put:** Internal testing track (momentalni rollout na do 100 testera, nema Google review).

Kada Internal prođe:
- Create release in **Closed testing → Vortex Pilot** (oko 30 eksternih testera, prolazi Google review ~2-4h).
- Zatim **Production → Staged rollout 10%** (gate-ovano Play Vitals metrics, vidi sekciju 9.4).

### 3.5 Deep linking (Associated Domains + App Links)

Već je konfigurisano u `app.config.js` (`applinks:sweat-drop.com`, `intentFilters` za Android). Da bi radilo u prod-u:

**iOS — AASA fajl:**
Landing page (`apps/landing-page`) mora da servira `https://www.sweat-drop.com/.well-known/apple-app-site-association` (application/json, no redirects, TLS only):
```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "TEAMID.com.sweatdrop.app",
        "paths": ["/auth/confirm*", "/auth/reset*", "/join*"]
      }
    ]
  }
}
```
Zameni `TEAMID` sa Apple Team ID (10-char, App Store Connect → Membership).

**Android — Digital Asset Links:**
`https://www.sweat-drop.com/.well-known/assetlinks.json`:
```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.sweatdrop.app",
    "sha256_cert_fingerprints": ["AA:BB:CC:..."]
  }
}]
```
SHA-256 fingerprint uzmi iz Play Console → Setup → App integrity → App signing key certificate → SHA-256 certificate fingerprint.

**Verify:**
- iOS: `https://app-site-association.cdn-apple.com/a/v1/www.sweat-drop.com`
- Android: Play Console → Setup → Deep links → Auto verify status.

---

## 4. Apple reviewer — šta im pošalji (odluka: demo mode OFF u prod)

Pošto smo isključili 5x-tap simulator u prod buildu (nema `EXPO_PUBLIC_DEV_QR_UUID`), Apple tester fizički ne može da uđe u workout flow bez prave mašine. Rešenje:

### 4.1 Demo nalog (seed ga na prod pre submit-a)

Koristi SQL (Supabase Studio → SQL editor, prod projekat):
```sql
-- 1. Kreiraj auth user sa fiksnom šifrom (zamenom generated email-a ručno u auth):
-- Idi u Authentication → Users → Add user → Create new user
--   Email: apple-review@sweat-drop.com
--   Password: <generiši 20-char, sačuvaj u 1Password>
--   Auto Confirm User: YES

-- 2. Posle kreiranja, dopuni profile:
UPDATE public.profiles
SET username = 'appletester',
    display_name = 'Apple Reviewer',
    email_verified_at = NOW(),
    terms_accepted_at = NOW(),
    privacy_accepted_at = NOW(),
    home_gym_id = '<VORTEX_GYM_ID>'        -- iz sekcije 5.3
WHERE id = (SELECT id FROM auth.users WHERE email = 'apple-review@sweat-drop.com');

-- 3. Daj mu par drop-ova za demo:
INSERT INTO public.drops_ledger (user_id, gym_id, amount, source, reason)
VALUES (
  (SELECT id FROM auth.users WHERE email = 'apple-review@sweat-drop.com'),
  '<VORTEX_GYM_ID>',
  500,
  'admin_grant',
  'Apple reviewer demo seed'
);
```

### 4.2 Reviewer note (paste u App Store Connect → App Review Information → Notes)

```
SweatDrop is a fitness loyalty app used inside partner gyms.

Test credentials:
  Email: apple-review@sweat-drop.com
  Password: <see 1Password "AppleReview" entry>

Core flow requires physical gym hardware (QR-coded cardio machines). For
the review, please use the attached QR image as if it were printed on a
real treadmill:

  1. Sign in with the test credentials.
  2. Accept Terms + Privacy on the welcome screen.
  3. Tap "Start Workout" on Home → Camera opens (camera permission used
     to scan machine QR codes only).
  4. Point camera at the attached demo-machine.png (on another screen or
     printed). This starts a simulated 60-second workout session.
  5. At the end you will see session summary with earned Drops (our
     in-app reward points).
  6. Tap "Store" to browse rewards, "Redeem" to try a reward
     redemption. The receptionist side confirms in person (out of scope
     for review).

Permissions rationale:
  • Camera: scanning machine QR codes (NSCameraUsageDescription).
  • Bluetooth: optional, reads cadence/speed from Bluetooth fitness
    sensors (Magene / generic FTMS) during a workout. Not required for
    the review flow above.
  • Location (when in use): validates user is physically at the gym
    during check-in. Can be skipped in review flow.
  • Notifications: reminders for challenges, happy hour, reward arrival.

Support contact:
  Email: support@sweat-drop.com
  Phone: <your number>
```

### 4.3 Demo QR image
Kreiraj QR koji enkodira `sweatdrop://machine/<DEMO_MACHINE_QR_UUID>` gde je `DEMO_MACHINE_QR_UUID` stvarna mašina u Vortex gymu (sekcija 5.4). Embed-uj `demo-machine.png` u App Store Connect → App Review Information → Attachments.

Sitni screen-recording (30-45s) kako flow radi na TestFlight build-u — App Store Connect dozvoljava da ga priložiš uz review notes. Snimi na TestFlight build-u iOS screen recorder-om, upload-uj nezalistano na Dropbox/Drive, paste link u note.

---

## 5. Vortex Gym — initial data setup (from zero)

Redosled je bitan: prvo superadmin, pa gym, pa owner, pa staff, pa mašine, pa store, pa challenges.

### 5.1 Superadmin nalog

```sql
-- U Studio → SQL editor (prod projekat):
-- 1. Kreiraj usera u Authentication → Users → Add user:
--    Email: <tvoj admin mail, npr. admin@sweat-drop.com>
--    Password: <iz 1Password>
--    Auto Confirm User: YES

-- 2. Podigni mu role:
UPDATE public.profiles
SET role = 'superadmin',
    username = 'superadmin',
    email_verified_at = NOW()
WHERE id = (SELECT id FROM auth.users WHERE email = 'admin@sweat-drop.com');
```

Sada možeš da se uloguješ na `https://admin.sweat-drop.com/login` kao superadmin.

### 5.2 Vortex gym — kreiraj kroz admin panel

- Log in kao superadmin → `/dashboard/super/gyms` (ili `/dashboard/gyms/new`).
- **New gym**:
  - Name: `Vortex`
  - City: `Beograd` (ili lokacija)
  - Country: `Serbia`
  - Address: `<stvarna adresa>`
  - Primary color: `#00E5FF` (ili Vortex brand, npr `#FF3B30`)
  - Logo URL: upload u `gym-logos` bucket → paste public URL
  - Background URL: upload u `gym-backgrounds` bucket → paste public URL
  - Latitude / Longitude: stvarne GPS koordinate ulaza (važno za `perform_checkin` GPS verifikaciju)
  - Check-in radius (m): `75` (ili koliko je zgrada)
  - `is_pilot_enabled`: **TRUE** (da gym bude vidljiv u mobile app-u; vidi migraciju `20260311130000_add_pilot_gym_visibility_flag.sql`)

Zapamti `gym_id` (UUID) — trebaće ti svuda dalje.

### 5.3 Gym owner nalog (iz superadmin panela)

**Preporučen flow — kada imaš vlasnikov email:**

- `/dashboard/super/owners` → **Add Owner** (ili **Invite Owner** direktno iz `/dashboard/gym/<vortex_id>/settings` → tab **Ownership**).
- Email: `<vlasnik@vortex.rs>`, username, full name, selektuj gym: `Vortex`.
- Sistem pošalje pozivnicu (Resend → mail sa link-om ka `/accept-invitation/<token>`).
- Vlasnik klikne link → postavi šifru → auto-login → redirect na `/dashboard/gym/<vortex_id>/dashboard` (gym_owner role).
- RPC `accept_owner_invitation` automatski postavlja `gyms.owner_id = <vlasnik_user_id>` i upisuje audit red u `gym_ownership_history` (vidi migraciju `20260420150000_gym_owner_transfer_and_email_change_audit.sql`).

**Kada još nemaš vlasnikov email — kreiraj gym prazan:**

- Kreiraj Vortex gym kroz 5.2 sa `owner_id = null` (forma ne traži email). Gym je potpuno operativan — možeš odmah da mapiraš mašine, podesiš ekonomiju i store bez vlasnika.
- Kad dobiješ email, idi na **`/dashboard/gym/<vortex_id>/settings` → Ownership tab** (vidljiv samo superadminu) → **Invite by Email** → pošalji invitation. Vlasnik prihvata, `owner_id` se automatski popuni.

**Promena vlasnika kasnije (transfer, vlasnik je prodao, email change):**

Superadmin ima tri tool-a dostupna kroz **`/dashboard/gym/<gym_id>/settings` → Ownership tab**:

| Akcija | Kada koristiti | Efekat |
|---|---|---|
| **Invite by Email** | Novi vlasnik još nema SweatDrop nalog, ili ima ali nije `gym_owner`. | Šalje invitation. Stari vlasnik zadržava pristup dok novi ne prihvati. |
| **Assign Existing Owner** | Novi vlasnik je već `gym_owner` u sistemu (npr. vlasnik više teretana). | Trenutna reassign — stari odmah gubi pristup **ovoj** teretani (zadržava druge koje poseduje). |
| **Remove Owner** | Vlasnik odlazi bez zamene. | `owner_id = null`. Staff i podaci ostaju. |

Svaka promena je logovana u `gym_ownership_history` (dostupno kroz "Ownership History" u istom tabu).

**Promena email-a postojećeg vlasnika** (vlasnik hoće drugi email):

- `/dashboard/super/owners` → u tabeli pored vlasnika klikni **Change Email** dugme.
- Unesi novi email 2× (confirm) + reason + čekiraj "I have verified out-of-band".
- Sistem koristi `supabaseAdmin.auth.admin.updateUserById` da ažurira `auth.users` i `profiles.email`, sa `email_confirm: true` (preskače confirmation email flow).
- Audit red se upisuje u `user_email_change_history`.
- ⚠️ Koristi samo nakon što si telefonom / video pozivom verifikovao da novi email pripada istoj osobi. SweatDrop ne šalje confirmation mail — vlasnik može odmah da se uloguje sa novim email-om.

**Bez email-a / mail provider ne radi (fallback, ručno):**
```sql
-- 1. Napravi auth user-a kroz Studio UI (Authentication → Users → Invite/Create)
-- 2. Postavi ulogu i veži na gym:
UPDATE public.profiles
SET role = 'gym_owner',
    email_verified_at = NOW()
WHERE id = (SELECT id FROM auth.users WHERE email = '<vlasnik@vortex.rs>');

UPDATE public.gyms
SET owner_id = (SELECT id FROM auth.users WHERE email = '<vlasnik@vortex.rs>')
WHERE id = '<VORTEX_GYM_ID>';

-- 3. Audit (manually, jer ne ide kroz UI):
INSERT INTO public.gym_ownership_history (
  gym_id, old_owner_id, new_owner_id, changed_by, change_method, reason
) VALUES (
  '<VORTEX_GYM_ID>',
  NULL,
  (SELECT id FROM auth.users WHERE email = '<vlasnik@vortex.rs>'),
  (SELECT id FROM auth.users WHERE email = 'admin@sweat-drop.com'),
  'assign_existing',
  'Manual assignment via SQL (email provider unavailable)'
);
```

### 5.4 Mašine — mapiranje i QR kodovi

**Kroz admin panel** (preporučeno, automatski generiše QR UUID):
- Owner se uloguje → `/dashboard/gym` → **Machines** tab → **Add machine**.
- Za svaku mašinu unesi: Name (`Treadmill #1`), Type (`treadmill | bike | elliptical | stepper`), Floor zone (opciono), Photo (upload).
- Klikni **Save** → sistem generiše `qr_uuid` i čuva u tabeli `machines`.
- **Print QR:** `/dashboard/print-qr` → selektuj gym → štampa PDF sa svim QR kodovima (9 po stranici, format za sticker printer).

**Bluetooth sensor pairing:**
- Za svaku mašinu koja ima BLE senzor (Magene, FTMS treadmill), klikni **Pair sensor** na detalj stranici → aplikacija skenira BLE u okolini (web MVP: pair se radi preko mobile app-a: staff gym app → Pair mode → skenira nearby devices → selektuje sensor → upisuje `sensor_id` + `ble_protocol` u `machines` tabelu).
- Ako mašina nema BLE (puko QR), ostavi `sensor_id` NULL — u app-u će se pojaviti poruka "Sensor not paired" (vidi `ScannerScreen.tsx` linija 505).

**QR štampa — produkcijski standardi:**
- Sticker: min 35x35mm, quiet zone 4x module, error correction **H** (30% redundancy — preživljava vlagu, znoj, ogrebotine).
- Zaštita: lamirati ili prekriti PVC-om da znoj ne uništi boju.
- Ispod QR-a uvek vidljiv broj / ime mašine za staff backup.
- Drugi set printova: **A4 backup sheet** za recepciju (svi QR-ovi gym-a na jednom listu) — ako sticker otpadne sa mašine, staff može privremeno da skenira sa lista.

### 5.5 Receptionist nalog

- Owner se uloguje → `/dashboard/gym` → **Staff** tab → **Invite staff**.
- Email, First / Last name, Role: `receptionist`.
- Sistem pošalje mail → staff klikne link → šifra → login.

Receptionist scope (enforced u `middleware.ts` + RLS):
- `/dashboard/redemptions` (hand-over queue)
- `/dashboard/arenas` (prize shipment queue)
- `/dashboard/redeems` (legacy validation)
- `/dashboard/gym` (read-only KPIs)
- NEMA pristup: owners, gyms, super, branding, rewards edit.

### 5.6 Store / Rewards

Owner → `/dashboard/rewards` → **New reward**:
- Name, Description, Image (upload u `reward-images`), Cost (drops), Stock (ili unlimited).
- Type:
  - `instant` — redeem odmah (protein shake, voda).
  - `arena` — zahteva dostavu/fizički item (shaker, majica); receptionist mora da radi **Mark as received** pa **Confirm & Hand Over** (vidi `STATE_OF_THE_APP.md` §Reception reward flow).
  - `leaderboard` — nagrada za top 3 u periodu, se ne kupuje.
- Aktiviraj (`is_active = true`).

**Osnovni prod seed za Vortex (minimum 6 rewards):**
1. Voda 0.5L — 50 drops, instant, stock 999.
2. Proteinski shake — 150 drops, instant, stock 50.
3. Sauna pass (30 min) — 300 drops, instant, stock 10.
4. SweatDrop shaker — 500 drops, arena, stock 20.
5. Vortex tanktop — 1200 drops, arena, stock 15.
6. Personal trening (30 min) — 2000 drops, arena, stock 5.

### 5.7 Challenges

Owner → `/dashboard/gym` → **Challenges** tab (ili `/dashboard/super/achievements` za global):
- **Daily**: "Earn 100 drops today" — reward: 20 drops. Resets svaki dan u 00:00 lokalno vreme (cron `reset-challenges`).
- **Weekly**: "3 workouts this week" — reward: 50 drops + badge. Resets nedeljno ponedeljak 00:00.
- **Streak**: "7-day check-in streak" — reward: 200 drops. Progressive.
- **Social (opciono, u 2. fazi)**: "Invite a friend who checks in" — reward: 100 drops + referral unlock.

Detaljan spisak i formule u `docs/plans/challenge_lifecycle_plan.md`.

### 5.8 Leaderboard prizes

Superadmin → `/dashboard/leaderboard-rewards`:
- Period: Weekly / Monthly / Quarterly.
- Scope: `gym` / `city` / `country`.
- Top 1: npr. 500 drops + shaker, Top 2: 300 + voda × 5, Top 3: 200 + voda × 3.
- Cron `distribute-leaderboard-prizes` automatski distribuira na kraju perioda (nedeljno ponedeljak 00:05 UTC za weekly).

### 5.9 Arenas (tournament mode, opciono za MVP)

Superadmin → `/dashboard/arenas` → Create new → 7-day arena → entry cost 0 drops (free) ili 100 drops → prize pool.

### 5.10 Tokenomics config (drop earning rates)

Proveri da postoji `tokenomics_config` global default red:
```sql
SELECT * FROM public.tokenomics_config WHERE gym_id IS NULL;
-- Ako nema, migracija 20260409300001_seed_tokenomics_config_global_default.sql ga ubacuje.
```

Per-gym override:
- Superadmin → `/dashboard/super/gyms/<id>` → **Tokenomics** → podesi:
  - Check-in drops: 10
  - Session base drops: 20
  - Session per-minute drops: 2 (max 60 min = 120 drops)
  - Streak multiplier: +5% po danu streak-a (max +50%)
  - Daily cap: 300 drops / korisnik / dan
  - Rewarded sessions/day: 3 (preko toga 0 drops — anti-abuse)

---

## 6. Landing page — legal + support

Pre nego što submit-uješ na store-ove:
- [ ] `https://www.sweat-drop.com/privacy` → **live**, sa Data safety content-om koji se match-uje sa Play + App Store privacy questionnaire-om.
- [ ] `https://www.sweat-drop.com/terms` → **live**.
- [ ] `https://www.sweat-drop.com/support` → kontakt forma + support mail `support@sweat-drop.com`.
- [ ] Favicon + OG image + robots.txt + sitemap → čisti.
- [ ] `.well-known/apple-app-site-association` i `.well-known/assetlinks.json` servirani (sekcija 3.5).

Provera:
```bash
curl -sI https://www.sweat-drop.com/privacy | head -1    # HTTP/2 200
curl -sI https://www.sweat-drop.com/terms | head -1      # HTTP/2 200
curl -s https://www.sweat-drop.com/.well-known/apple-app-site-association | jq .
```

---

## 7. Smoke test — pre Go/No-Go

Uradi **na produkcijskom TestFlight / Internal Play build-u** (ne dev clientu) sa čistim telefonom:

### 7.1 Auth i onboarding
- [ ] Otvaranje app-a → splash → welcome screen.
- [ ] Prihvati Terms + Privacy (blokira dalje bez njih).
- [ ] Signup sa email-om → dobija email sa link-om → klik link → deep link u app-u → loguje.
- [ ] Signup sa Google → traži permission → vraća u app → profile kreiran.
- [ ] Signup sa Apple → isto, iOS only.
- [ ] Forgot password → mail stiže → reset deep link u app-u / web-u radi.

### 7.2 Home + gym selekcija
- [ ] Home screen prikazuje drop ring, stats, current gym.
- [ ] Lista gym-ova pokazuje **samo Vortex** (jer je `is_pilot_enabled = true` samo za Vortex).
- [ ] Selektuj Vortex kao home gym → radi.

### 7.3 Check-in + workout
- [ ] Tap "Start Workout" → traži camera permission.
- [ ] Skeniraj Vortex check-in QR (`sweatdrop://checkin/<gym_id>`) → uspešan check-in + drops.
- [ ] Skeniraj mašina QR → ako BLE senzor paired: radi workout sa live RPM/power; ako ne: poruka o nespojenom senzoru.
- [ ] Završi session → summary ekran → drops dodati u wallet.

### 7.4 Store + redemption
- [ ] Wallet pokazuje tačan balans.
- [ ] Store lista 6 rewards iz sekcije 5.6.
- [ ] Redeem "Voda" (instant) → drops oduzeti → redemption u history.
- [ ] Redeem "Shaker" (arena) → status `pending_verification` → recepcioner vidi u `/dashboard/redemptions` → Confirm → push notification stiže.

### 7.5 Challenges + leaderboard
- [ ] Daily challenge progress se updejtuje posle workout-a.
- [ ] Leaderboard pokazuje usera, tačan rank po gymu.

### 7.6 Push notifikacije
- [ ] Happy hour reminder stiže (test: manuelno pozovi `send-happy-hour-reminders` funkciju iz Supabase Studio → Edge Functions → Invoke).
- [ ] Prize ready push stiže nakon arene.
- [ ] Tap na notifikaciju otvara tačan screen (deep link).

### 7.7 Admin panel
- [ ] Superadmin login → dashboard.
- [ ] Owner login → vidi samo svoj gym.
- [ ] Receptionist login → vidi samo redemption/arena queue, ne vidi gym settings.
- [ ] Invite staff → mail stiže → accept flow radi.

### 7.8 Wrong-env test (kritično)
- [ ] Uloguj se u produkcijskom build-u → proveri u Network inspector-u da request-i idu na `qdtdfofodfdlutkmlzzf.supabase.co` (NE na `jzyoyxabcdzvqcfnfzrz`).
- [ ] U Supabase Studio dev projekta, proveri da NEMA novih profila sa tvog TestFlight testiranja.

Ako bilo šta padne — **Go/No-Go = NO-GO**, fix-uj pa nastavi.

---

## 8. Release manifest (fill-out pre svakog cut-a)

Otvori `docs/release/RELEASE_MANIFEST_TEMPLATE.md`, copy na `docs/release/manifests/<YYYY-MM-DD>_sweatdrop_prod_rc<N>.md` i popuni:
- Git SHA (iz `main` branch-a).
- iOS: version (`1.0.0`), build number (eas build ID, iz `eas build:list`).
- Android: versionName (`1.0.0`), versionCode (iz `app.config.js`, trenutno `13` — bump-uje se automatski skriptom).
- Supabase migrations applied (output `npx supabase migration list` na prod-u).
- Edge functions deployed + verzija.
- Go/No-Go decision: sva 5 gate-ova (G1-G5) zelena.
- On-call: primary + secondary.
- Rollback plan: link na `docs/release/INCIDENT_ROLLBACK_QUICKSHEET.md`.

---

## 9. Go / No-Go gates (sve moraju biti zelene pre rollout-a na 100%)

### G1 — Platform safety
- [ ] Nema kritične auth / RLS / drop-abuse rupe (reviewer signoff).
- [ ] Dev / prod izolacija verifikovana (sekcija 7.8).

### G2 — Product reliability
- [ ] Svi koraci iz sekcije 7 prošli.
- [ ] Push notifikacije rade na oba OS-a (iOS + Android, prod binary).

### G3 — Pilot readiness
- [ ] Vortex kreiran, mašine QR-ovane, rewards seeded, challenges aktivne.
- [ ] Staff (owner + 2 recepcionera) obučeni i zalogovani.
- [ ] QR sticker-i zalepljeni na sve mašine.

### G4 — Operational readiness
- [ ] Supabase Studio alerts (Dashboard → Reports) konfigurisani za error rate.
- [ ] Sentry alerti za mobile crash spike.
- [ ] Rollback rehearsan jednom (vidi `docs/release/INCIDENT_ROLLBACK_QUICKSHEET.md`).

### G5 — Store & compliance
- [ ] App Store Connect metadata complete (description, screenshots 6.7"+6.5"+iPad, keywords, privacy answers).
- [ ] Play Console Data Safety form complete, store listing sa screenshots + feature graphic 1024×500.
- [ ] Privacy + Terms URL-ovi live i linked iz store listings.
- [ ] AASA + assetlinks.json serve-uju se.

Ako ijedan gate red → **No-Go**, stop.

---

## 10. Cutover dan — tačan redosled komandi

```bash
# 0) Preflight (repo root, branch main)
git checkout main
git pull origin main
pnpm install
pnpm type-check
pnpm test:smoke
pnpm test:release-preflight

# 1) Supabase prod — migracije
./scripts/db-push-prod.sh

# 2) Edge funkcije
cd backend
npx supabase link --project-ref qdtdfofodfdlutkmlzzf
for fn in send-push re-engagement streak-reminder drops-expiry-warning \
          send-happy-hour-reminders distribute-leaderboard-prizes \
          finalize-arena notify-arena-participants process-campaigns \
          reset-challenges send-prize-ready-push delete-account; do
  npx supabase functions deploy "$fn"
done
npx supabase link --project-ref jzyoyxabcdzvqcfnfzrz
cd ..

# 3) Admin panel — automatski kroz Vercel kad push-neš main
git push origin main
# Otvori Vercel dashboard, čekaj "Ready".

# 4) Mobile — prod build-ovi
pnpm env:mobile:prod
cd apps/mobile-app

# iOS (traje ~15 min)
eas build --platform ios --profile production --non-interactive
# Posle success:
eas submit --platform ios --latest --non-interactive

# Android (lokalni AAB; brže)
pnpm build:android:prod
# Pa ručno upload u Play Console → Internal testing → Create release.
# ili EAS cloud + submit:
# eas build --platform android --profile production --non-interactive
# eas submit --platform android --latest --non-interactive

cd ../..

# 5) Verifikacija prod push-a
# - Loguj se na TestFlight/Internal build.
# - U Supabase Studio → Edge Functions → send-push → Invoke sa tvojim expo_push_token-om.
# - Push stiže.

# 6) Smoke test (sekcija 7) na stvarnim uređajima.

# 7) Ako sve zeleno → promovisati:
#    iOS: App Store Connect → TestFlight → Submit for Review (External) ili App Store Release.
#    Android: Play Console → Internal → Promote to Closed → Pilot testers → Production 10% staged.
```

---

## 11. Post-launch (T+4h i T+24h)

**T+4h:**
- [ ] Smoke test ponovo (sekcija 7) na stvarnim Vortex čupnim korisnicima.
- [ ] Supabase Dashboard → API → Auth error rate < baseline.
- [ ] Edge Function logs → nema APNs/FCM 401/403.
- [ ] Sentry → nema novih crash cluster-a.
- [ ] Admin panel → receptionist scope je blokiran van svoje zone.

**T+24h:**
- [ ] Play Vitals → crash + ANR < 1%.
- [ ] TestFlight → nema 1-star feedbacka sa istim keyword-om (auth, crash, login).
- [ ] Proveri `user_notifications` tabelu za 24h period — nema `delivery_status = 'failed'` spike-a.
- [ ] Popuni release manifest §9 (closing notes) — actual % rollout, hotfix SHA-ovi ako je bilo.

**Ako crash / auth / push spike:**
1. Halt rollout (Play Console → Halt release; App Store Connect → Remove from sale ili Phase Release Pause).
2. Otvori `docs/release/INCIDENT_ROLLBACK_QUICKSHEET.md`.
3. Fix → bump version code → re-submit.

---

## 12. Troubleshooting — najčešći problemi

| Simptom | Uzrok | Fix |
|---|---|---|
| Mobile app pokaže blank home, nema drop ring-a | Wrong env — app gleda prod Supabase ali user je iz dev-a (ili obrnuto) | `pnpm env:mobile:prod` + rebuild. Proveri sekciju 7.8. |
| Email confirmation link otvara admin panel umesto app-a | Redirect URL lista u Supabase Dashboard ne sadrži `sweatdrop://auth/confirm` | Sekcija 1.3. |
| Password reset mail ne stiže | SMTP nije konfigurisan na prod, ili Resend domen nije verifikovan | Sekcija 1.5 + 1.6. |
| Push stigne u backgroundu ali ne u foregroundu | Mobile expo-notifications handler nije set ili iOS `aps-environment` nije `production` | Proveri `app.config.js` `ios.entitlements` (trenutno je OK: `aps-environment: production`). |
| Apple review odbio zbog "Guideline 2.1 - App Completeness" | Testirali su bez QR-a, nije im bilo jasno kako da uđu u flow | Priloži demo QR image + snimak + precizniji reviewer note (sekcija 4.2). |
| Vercel deploy pada na `Cannot find module '@supabase/ssr'` | `apps/admin-panel/package.json` ne dolazi sa lockfile hoisted-om | Proveri da `pnpm-workspace.yaml` obuhvata `apps/*`, da `pnpm install` rabi catalog. Ako ne prolazi → `pnpm install --frozen-lockfile` lokalno pa commit `pnpm-lock.yaml`. |
| Google sign-in na Android pada sa `DEVELOPER_ERROR` | SHA-1 fingerprint Play App Signing key-a nije dodat u Google Cloud OAuth client | Play Console → Setup → App integrity → App signing key → SHA-1 → paste u Google Cloud → OAuth 2.0 Android client. |
| 5x-tap ne otvara simulator u TestFlight / Play build-u | **To i treba** — prod build namerno ima `EXPO_PUBLIC_DEV_QR_UUID` prazan. | Sekcija 4 je zamenski put za reviewer. |
| Migracija `supabase db push` baca "relation X already exists" | Prod već ima neku manuelno kreiranu tabelu | Uredi migraciju da koristi `IF NOT EXISTS` ili dropni konfliktnu migraciju i regeneriši. |

---

## 13. Quick reference — komande

```bash
# Env switch
pnpm env:mobile:prod        # prebaci mobile na prod
pnpm env:mobile:dev
pnpm env:admin:prod
pnpm env:admin:dev
pnpm env:prod               # oba
pnpm env:dev

# Supabase
./scripts/db-push-dev.sh
./scripts/db-push-prod.sh
cd backend && npx supabase link --project-ref qdtdfofodfdlutkmlzzf
cd backend && npx supabase functions deploy <name>

# Mobile
cd apps/mobile-app && eas build --platform ios --profile production
cd apps/mobile-app && eas build --platform android --profile production
cd apps/mobile-app && eas submit --platform ios --latest
cd apps/mobile-app && eas submit --platform android --latest
cd apps/mobile-app && pnpm build:android:prod     # lokalni AAB

# Admin (Vercel auto kroz main push)
git checkout main && git merge features/dev --no-ff && git push origin main

# Tests
pnpm type-check
pnpm test:smoke
pnpm test:release-preflight
pnpm test:ci
```

---

## 14. Sigurnosna napomena

- `.env.prod.local`, `.env.dev.local`, `@zephyr23__sweatdrop.jks`, `GoogleService-Info.plist`, `google-services.json` **ne smeju** nikad da odu na javni repo (gitignored). Ako se desi greška i push-neš → rotiraj ključeve odmah:
  - Supabase: Dashboard → Settings → API → **Regenerate** anon + service_role.
  - Resend: Dashboard → API Keys → Rotate.
  - Sentry: Project Settings → Client Keys → Regenerate.
  - Google OAuth: Google Cloud → Credentials → Reset secret.
  - Android keystore: **ne može da se rotira** u Play App Signing-u lako — kontaktiraj Google support ako se desi curenje.

Čuvaj tajne u: 1Password / Bitwarden → deljenje po ulozi (developer / devops / release owner).

---

## Referentni dokumenti

- `ENVIRONMENTS.md` — detaljan dev/prod env guide.
- `docs/plans/master_production_vortex_90d_execution_plan.md` — master execution plan.
- `docs/release/GO_LIVE_DAY_OF_CHECKLIST.md` — day-of detaljan checklist.
- `docs/release/PRODUCTION_CUTOVER_COMMANDS.md` — operator command sheet.
- `docs/release/app_store_connect_submission_checklist.md` — fillable App Store form.
- `docs/release/google_play_submission_checklist.md` — fillable Play form.
- `docs/release/INCIDENT_ROLLBACK_QUICKSHEET.md` — rollback procedure.
- `docs/plans/production_env_split_dev_prod_runbook.md` — env split runbook.
- `docs/plans/production_push_notifications_runbook.md` — push runbook.
- `docs/plans/legal_privacy_terms_mobile_compliance_checklist.md` — legal checklist.

---

**Owner:** Release Owner
**Last updated:** 2026-04-20
**Next review:** posle prvog produkcijskog rollout-a + week-1 retrospektive.
