# SweatDrop — Go Live Cheatsheet

> Kratak vodič: kako iz trenutnog stanja (sve radi na DEV) doći do **pilot launcha u Vortex teretani** (production build, production Supabase, distribuiran preko TestFlight + Play Internal Testing), i posle 2–4 nedelje bez incidenta — submit na App Store i Google Play.
>
> Detaljan playbook (260+ koraka) je u [`PRODUCTION.md`](./PRODUCTION.md). Ovaj fajl je samo brz pregled odluka i checklist-a.

---

## 0. Strateške odluke (zaključano)

### Bundle ID strategija

| Varijanta | Bundle ID | Gde živi | Ko je koristi |
|-----------|-----------|----------|---------------|
| **Production** | `com.sweatdrop.app` | App Store Connect + Play Console (postoji) | Pilot testeri u Vortexu (TestFlight / Play Internal), kasnije svi javni korisnici |
| **Dev** *(preporučeno)* | `com.sweatdrop.app.dev` | Samo EAS internal distribution (link/QR) | Tim, Cursor agenti |

**Pravilo:** **Samo jedan app record po platformi** (postojeci `com.sweatdrop.app`). Dev varijantu **ne uploaduješ** ni u jedan stor — ide samo kao dev client / internal build preko EAS.

> Privremeno možeš ostati sa jednim bundle ID-em (com.sweatdrop.app) za sve dok ne stigneš da razdvojiš. U tom slučaju nemoj imati istovremeno dev i prod build instaliran na istom telefonu.

### Pilot testeri = PROD environment

Eksterni testeri (članovi Vortex teretane) **idu na PROD Supabase, kroz prod build distribuiran kroz TestFlight / Play Internal Testing**. Ne na dev. Razlozi:

- Sweat dropovi, redemptioni, badge-ovi su **realni korisnicki podaci** — moraju da prežive razvojne reset-ove DB-a.
- TestFlight / Play Internal Testing su namenjeni baš za ovo: prod build, ograničena lista testera, bez stor review-a, instant updates.
- Email/push/RLS/auth — sve mora biti u prod uslovima da bi pilot bio validan.

**Dev environment ostaje samo za tim.**

---

## 1. Pre nego što išta diraš (Day 0)

- [ ] Branch: `git checkout features/dev` za dnevni rad. Pilot/store buildovi idu sa `main`.
- [ ] Pristup proverimo: Supabase prod (`gyqgdfqnatuegwyidrii`), Vercel projekat admin panela, App Store Connect, Play Console, EAS (`zephyr23`), Resend, Sentry, DNS na `sweat-drop.com`.
- [ ] Na lokalu: `pnpm -v ≥ 10`, `node -v ≥ 18`, `eas --version ≥ 10`, `npx supabase --version`.
- [ ] Postoji `apps/admin-panel/.env.prod.local` i `apps/mobile-app/.env.prod.local` sa prod kredencijalima (već postoji template — videti [`ENVIRONMENTS.md`](./ENVIRONMENTS.md)).

---

## 2. Production Supabase — proveri pre seedovanja

Migracije su već gurnute. Ostaje:

- [ ] **Auth provideri** → Dashboard › Authentication › Providers
  - Email enabled, "Confirm email" ON
  - Apple OAuth — Service ID + Team ID + Key ID + privatni ključ
  - Google OAuth — Web Client ID = `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`
- [ ] **Email templates** (Authentication › Email Templates) — koristi `https://www.sweat-drop.com/auth/confirm` i `/auth/reset` URL-ove.
- [ ] **Custom SMTP** (Resend) — Settings › Auth › SMTP Settings, from `noreply@sweat-drop.com`. Bez ovoga emailovi nakon ~3-4/sat počinju da kasne ili padaju.
- [ ] **Site URL** = `https://www.sweat-drop.com`. Redirect URLs: `https://www.sweat-drop.com/**`, `https://admin.sweat-drop.com/**`, `sweatdrop://**`.
- [ ] **Edge functions** — ako postoje (`reset-challenges`, push), `npx supabase functions deploy <name> --project-ref gyqgdfqnatuegwyidrii`.
- [ ] **Cron / scheduled functions** — proveri da daily/weekly reset radi u prod TZ.
- [ ] **Backup** — Settings › Database › Backups, potvrdi da PITR/daily backup radi.
- [ ] **RLS smoke test** — uloguj se kao test user kroz prod admin (lokalno: `pnpm env:admin:prod && pnpm dev:admin`) i klikni najmanje jedan flow (gym preview, redemption queue) da ti potvrdi da policies ne lome upit.

---

## 3. Admin panel u Vercel-u

- [ ] Vercel projekat povezan na `main` branch. Production deploy = `main`. Preview = svaki PR.
- [ ] Custom domen: `admin.sweat-drop.com` (CNAME → Vercel).
- [ ] Environment variables (Production scope, sve **trim**ovane bez razmaka):
  - `NEXT_PUBLIC_SUPABASE_URL` = `https://gyqgdfqnatuegwyidrii.supabase.co`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = *(prod publishable key)*
  - `SUPABASE_SERVICE_ROLE_KEY` = *(prod service role)*
  - `NEXT_PUBLIC_APP_URL` = `https://admin.sweat-drop.com`
  - `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (`noreply@sweat-drop.com`)
- [ ] Trigger redeploy → otvori `https://admin.sweat-drop.com` → login pod superadmin nalogom.

---

## 4. Seed produkcione baze kroz admin panel (Vortex pilot)

Sve se radi kroz UI na `https://admin.sweat-drop.com`, **ne SQL skriptama** (osim prvog superadmin invite-a).

1. **Superadmin nalog** (jednokratno) — najlakše: Authentication › Users › "Add user" u Supabase Dashboard → ručno setuj `profiles.role = 'superadmin'` SQL-om u editoru.
2. **Vortex gym** — `/dashboard/gyms/new`: naziv, lokacija (lat/lng za geofence), brending (primary boja, logo, background image).
3. **Gym admin / receptionists** — `/dashboard/gyms/<id>/staff` → invite preko Resend (proveri da im stigne email).
4. **Mašine** — `/dashboard/gyms/<id>/machines`: za svaku mašinu napravi entry, generiši QR, pari BLE sensor (`sensor_id`).
5. **Print QR-ova** — `/dashboard/gyms/<id>/machines` → "Print all" → zalepi na opremu.
6. **Rewards (store)** — `/dashboard/rewards`: realni pokloni iz Vortexa (stock, cena u dropovima, slika).
7. **Challenges** — `/dashboard/challenges`: bar 1 daily + 1 weekly + 1 streak da pilot ima šta da osvaja.
8. **Leaderboard rewards** — `/dashboard/leaderboard-rewards`: top 3 nagrade (daily/weekly/monthly) ako želite arena trake.
9. **Smoke test** — uloguj se u mobile app **prod build** kao testni user, skeniraj jedan QR, završi mini-sesiju, proveri da drops sleću u wallet, da challenge progress raste, i da redemption stiže u reception desk.

---

## 5. Mobile build za pilot — TestFlight + Play Internal Testing

### EAS sekreti (jednokratno)

```bash
cd apps/mobile-app

eas secret:create --name EXPO_PUBLIC_SUPABASE_URL \
  --value "https://gyqgdfqnatuegwyidrii.supabase.co" --scope project --force

eas secret:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY \
  --value "<prod-anon-key>" --scope project --force

eas secret:create --name EXPO_PUBLIC_SITE_URL \
  --value "https://www.sweat-drop.com" --scope project --force

eas secret:create --name EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID \
  --value "<google-web-client-id>" --scope project --force

eas secret:create --name EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID \
  --value "<google-ios-client-id>" --scope project --force

eas secret:create --name EXPO_PUBLIC_SENTRY_DSN \
  --value "<sentry-dsn>" --scope project --force
```

### Build i submit

```bash
git checkout main
git merge features/dev    # samo posle Go/No-Go gate-a
git push origin main

cd apps/mobile-app

# iOS
eas build --platform ios --profile production
eas submit --platform ios --latest    # → odlazi u App Store Connect

# Android
eas build --platform android --profile production
eas submit --platform android --latest --track internal    # → Play Internal Testing
```

### Distribucija pilot testerima

- **iOS / TestFlight:** App Store Connect → TestFlight → External Testing → kreiraj grupu "Vortex Pilot" → ubaci email-ove članova → Apple radi mali "TestFlight Beta App Review" (1–2 dana, samo prvi put), zatim instant builds.
- **Android / Play Internal Testing:** Play Console → Testing › Internal testing → "Create new release" → upload AAB (eas submit to već odradi) → "Testers" tab → ubaci email-ove ili Google grupu → daj im opt-in URL.

> Internal testing track-ovi **NE prolaze kroz pun Apple/Google review** i nemaju javnu vidljivost. Ovo je tačno onaj scenario koji ti treba za 2-4 nedelje pilot u teretani.

---

## 6. Pilot operacije (2–4 nedelje)

- [ ] **Sentry dashboard** — pogledaj svaki dan, fix-uj sve crash-eve.
- [ ] **Supabase logs** — Dashboard › Logs › API + Auth + Database → traži 4xx/5xx i RLS denials.
- [ ] **Push delivery** — proveri da push notifications stižu (i da imaš opt-in toggle u settings).
- [ ] **Reception desk** — receptionist-i koriste `/dashboard/redemptions` i `/dashboard/arenas` desk-ove; loguj feedback šta im fali.
- [ ] **Hotfix protokol** — bug u prod build-u? OTA update preko EAS-a (`eas update --branch production`) ako je JS-only; novi build (versionCode++/buildNumber++) ako je nativan.
- [ ] **Weekly review meeting** sa Vortex menadžmentom: koliko aktivnih korisnika, koliko sesija, koliko redemptionsa.

---

## 7. Go/No-Go za javni store release

Pre `eas submit` na produkcione trake:

- [ ] 0 critical Sentry issue-a u poslednjih 7 dana.
- [ ] ≥ 80% pilot testera ima 1+ workout sesiju.
- [ ] ≥ 5 redemptiona uspešno completed (validacija kroz reception flow).
- [ ] BLE konekcija stabilna ≥ 95% pokušaja na bar 3 različite mašine.
- [ ] Auth flow (email/Apple/Google) bez fail-ova u poslednjih 7 dana u Supabase auth log-u.
- [ ] App Privacy nutrition labels popunjene u App Store Connect.
- [ ] Data Safety form popunjen u Play Console.
- [ ] Reviewer note + demo nalog spremni (Apple traži; videti `PRODUCTION.md` sekciju 9).
- [ ] Screenshots, listing copy, privacy policy URL (`https://www.sweat-drop.com/privacy`), terms URL — sve uploadovano.

Ako sve ✅:

```bash
# iOS — promote build iz TestFlight u App Store
# (radi se kroz App Store Connect UI: izaberi build → "Submit for Review")

# Android — promote iz Internal u Production
# (Play Console: Internal release → "Promote release" → Production track)
```

---

## 8. Posle javnog launcha

- [ ] Postavi alarme: Sentry "new issue" → Slack; Supabase "auth fail spike" → email; Vercel deploy fail → Slack.
- [ ] Backup test: jednom mesečno restore prod backupa u staging Supabase projekat.
- [ ] Rotacija ključeva: svaka 3 meseca regenerisati `SUPABASE_SERVICE_ROLE_KEY` i ažurirati u Vercel + EAS.
- [ ] DEV branch ostaje **isključivo** za development — produkcioni korisnik nikada ne vidi taj environment.

---

## Brze reference

- Detaljan playbook: [`PRODUCTION.md`](./PRODUCTION.md)
- Env switching i strategija: [`ENVIRONMENTS.md`](./ENVIRONMENTS.md)
- Arhitektura: [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- Recent changes: [`CHANGELOG.md`](./CHANGELOG.md)
- Database state: [`MIGRATION_NOTES.md`](./MIGRATION_NOTES.md)

---

**Napomena:** Ovaj fajl je živ — kad odradiš korak, čekiraj ga. Kad uđeš u Sekciju 7 i prebaciš se na javni release, `GO_LIVE.md` postaje "v2 launch checklist" za sledeće release-ove.
