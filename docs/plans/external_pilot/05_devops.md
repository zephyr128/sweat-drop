# Step 5 — DevOps: EAS Build + TestFlight + Play Closed Testing (CEO/devops)

> **Za koga:** ti (CEO) ili devops-namenjeni agent. Ovo je terminal step — sve prethodno mora biti merged i smoke-testirano.
>
> **Šta radiš:** EAS env split, prod secrets, build, submit, TestFlight External grupa sa Public Link, Play Closed Testing track sa Web Link, Apple/Google Beta review pripreme.

---

## Mandatory pre-read

1. `GO_LIVE.md` — high-level strategija (već imaš).
2. `ENVIRONMENTS.md` — env switching commands.
3. `PRODUCTION.md` — full playbook (referenca).
4. `apps/mobile-app/eas.json` — trenutni profil setup.
5. `apps/mobile-app/app.config.js` — verzioniranje.

---

## Dependencies (BLOCKER)

- ✅ Step 1 (DBA) merged.
- ✅ Step 2 (mobile-coder) merged.
- ✅ Step 3 (UI/UX) merged.
- ✅ Step 4 (admin-coder) merged.
- ✅ Step 6 (reviewer audit) prošao.
- ✅ Demo nalog `apple-review@sweatdrop.com` postoji u PROD Supabase, sa `is_demo = true`.
- ✅ Bar jedna PROD Vortex mašina markirana `is_demo_machine = true`.
- ✅ PROD admin panel deploy-ovan na `https://admin.sweat-drop.com`.

Ako nešto fali, **STOP**.

---

## Tasks

### 5.1 Update `apps/mobile-app/eas.json`

**Cilj:** `EXPO_PUBLIC_DEV_QR_UUID` ostaje **samo u dev/preview** profilima (developer convenience). Prod profil ga nema — Apple reviewer dobija demo mašinu kroz RPC `get_my_demo_machine()`.

**Korak 1 — proveri EAS secrets:**
```bash
cd apps/mobile-app
eas secret:list
```

Ako `EXPO_PUBLIC_DEV_QR_UUID` postoji sa scope `project`, **obriši ga** (bio bi nasleđen u prod build):
```bash
eas secret:delete --name EXPO_PUBLIC_DEV_QR_UUID
```

**Korak 2 — postavi env per profil u `eas.json`:**
```json
{
  "cli": { "version": ">= 10.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "env": {
        "EXPO_PUBLIC_APP_ENV": "development",
        "EXPO_PUBLIC_PUSH_ENABLED": "true",
        "EXPO_PUBLIC_DEV_QR_UUID": "<dev-machine-uuid>",
        "EXPO_PUBLIC_EAS_PROJECT_ID": "970c6ba3-aae9-4b7a-b014-74915fff4df3",
        "SENTRY_DISABLE_AUTO_UPLOAD": "true"
      }
    },
    "preview": {
      "distribution": "internal",
      "env": {
        "EXPO_PUBLIC_APP_ENV": "preview",
        "EXPO_PUBLIC_PUSH_ENABLED": "true",
        "EXPO_PUBLIC_DEV_QR_UUID": "<dev-machine-uuid>",
        "EXPO_PUBLIC_EAS_PROJECT_ID": "970c6ba3-aae9-4b7a-b014-74915fff4df3",
        "SENTRY_DISABLE_AUTO_UPLOAD": "true"
      }
    },
    "production": {
      "env": {
        "EXPO_PUBLIC_APP_ENV": "production",
        "EXPO_PUBLIC_PUSH_ENABLED": "true",
        "EXPO_PUBLIC_EAS_PROJECT_ID": "970c6ba3-aae9-4b7a-b014-74915fff4df3",
        "SENTRY_DISABLE_AUTO_UPLOAD": "true"
      }
    },
    "internalDevStore": {
      "distribution": "store",
      "env": {
        "EXPO_PUBLIC_APP_ENV": "development",
        "EXPO_PUBLIC_PUSH_ENABLED": "true",
        "EXPO_PUBLIC_EAS_PROJECT_ID": "970c6ba3-aae9-4b7a-b014-74915fff4df3",
        "SENTRY_DISABLE_AUTO_UPLOAD": "true"
      }
    }
  }
}
```

> **Verifikuj:** otvori `apps/mobile-app/eas.json` i potvrdi da `production.env` **NEMA** `EXPO_PUBLIC_DEV_QR_UUID` red.

### 5.2 EAS production secrets (Supabase prod kredencijali)

```bash
cd apps/mobile-app

eas secret:create --name EXPO_PUBLIC_SUPABASE_URL \
  --value "https://gyqgdfqnatuegwyidrii.supabase.co" --scope project --force

eas secret:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY \
  --value "<prod-anon-key-iz-supabase-dashboarda>" --scope project --force

eas secret:create --name EXPO_PUBLIC_SITE_URL \
  --value "https://www.sweat-drop.com" --scope project --force

eas secret:create --name EXPO_PUBLIC_SENTRY_DSN \
  --value "<prod-sentry-dsn>" --scope project --force

eas secret:create --name EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID \
  --value "<google-web-client-id>" --scope project --force

eas secret:create --name EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID \
  --value "<google-ios-client-id>" --scope project --force
```

**Verifikacija:**
```bash
eas secret:list
```
Sve gore mora biti vidljivo. **`EXPO_PUBLIC_DEV_QR_UUID` ne sme biti u listi.**

### 5.3 Bump verzije

**Fajl:** `apps/mobile-app/app.config.js`

- `version: '1.0.0'` — ostaje za prvi pilot.
- `android.versionCode: 16` → `17`.
- `ios.buildNumber` (ako nije eksplicitan, EAS auto-bumpuje; opciono postavi `'17'`).

### 5.4 Merge i build

```bash
git checkout main
git merge features/dev   # samo posle Step 1-4-6 merged i Step 6 prošao
git push origin main

cd apps/mobile-app

# iOS — production build
eas build --platform ios --profile production
# (sačekaj 15-30 min, link na build u terminalu)
eas submit --platform ios --latest
# → upload u App Store Connect (sačekaj još ~10-30 min za Processing)

# Android — production build
eas build --platform android --profile production
eas submit --platform android --latest --track internal
# → upload u Play Console Internal track (kasnije promote-uješ u Closed)
```

### 5.5 Apple TestFlight — External Testing sa Public Link

**App Store Connect** (https://appstoreconnect.apple.com):

1. My Apps → **SweatDrop** → **TestFlight** tab.
2. Sačekaj da build (1.0.0 / 17) prođe **Processing** (~10–30 min) — biće "Ready to Submit".
3. **Test Information** (levo sidebar):
   - **Beta App Description**: "SweatDrop pilot za Vortex teretanu — Sweat Drops loyalty program preko BLE senzora."
   - **Feedback Email**: tvoj email.
   - **Privacy Policy URL**: `https://www.sweat-drop.com/privacy`.
4. **External Testing** sekcija → **+ Add New Group** → naziv "Vortex Pilot".
5. **Add Build to Group** → izaberi 1.0.0 (17) → submit za **Beta App Review**.
6. **Test Information za review** (popup posle submit-a):
   - **Sign-in required**: YES.
   - **Sign-in info**:
     ```
     Email:    apple-review@sweatdrop.com
     Password: <strong-random-password-iz-1Passworda>
     ```
   - **Notes** *(critical — paste doslovno):*
     ```
     SweatDrop is a fitness loyalty platform that pairs with Bluetooth Low
     Energy (BLE) sensors physically installed on gym equipment (treadmills,
     bikes, ellipticals). Real workouts are tracked via these sensors;
     since they are not available at your test desk, we provide a demo
     simulator unlocked only for the reviewer account above.

     STEPS TO REVIEW WORKOUT FLOW:

     1. Open the app and tap "Continue with Email".
     2. Sign in with the credentials provided above
        (apple-review@sweatdrop.com).
     3. Once signed in, you will see an orange "DEMO MODE" banner at the
        top of the screen — this confirms simulator access is enabled.
     4. From the home screen, tap "Scan QR" (allow camera permission).
     5. On the scanner screen, tap the central scan frame 5 times in
        rapid succession. A simulator modal will appear.
     6. Choose "Bike", leave default values, tap "Start Simulator".
     7. A 60-second simulated workout will run automatically and credit
        Sweat Drops to the wallet.
     8. Tap back to home, open "Wallet" to see drops balance.
     9. Open "Store" to redeem a reward (use any reward, redemption is
        validated by the gym reception desk in real use).

     The simulator is gated server-side by `profiles.is_demo = true`
     and `machines.is_demo_machine = true`, and is invisible to all
     regular users.

     Bluetooth permission and Camera permission are required for
     normal use (sensor pairing + QR scanning of equipment).
     ```
7. Submit → **Apple Beta App Review** (1–2 dana prvi put).
8. Posle approval-a → ista grupa → **Enable Public Link** toggle → kopiraj URL `https://testflight.apple.com/join/XXXXXXXX`.
9. Pošalji link Vortex iOS korisnicima.

> **Sledeći buildovi sa istom verzijom (1.0.0 build 18, 19...) ne prolaze ponovo Beta Review** — instant raspoloživi testerima.
> **Nova verzija (1.0.1) = ponovni Beta Review.**

### 5.6 Google Play — Closed Testing sa Web Link

**Play Console** (https://play.google.com/console):

1. SweatDrop → Testing → **Closed testing** → **Create track** → naziv "vortex-pilot".
2. **Create new release** → upload AAB iz EAS build artifacta (ili promote-uj iz Internal track-a koji je `eas submit` već postavio).
3. **Release notes**:
   ```
   en-US: First Vortex pilot build. Sweat Drops loyalty program with BLE sensor support.
   sr-RS: Prva Vortex pilot verzija. Sweat Drops loyalty program sa BLE senzorima.
   ```
4. **Save → Review release → Start rollout to Closed testing**.
5. **Testers** tab unutar "vortex-pilot" track-a:
   - Kreiraj novu listu "Vortex Members" (možeš ostaviti praznu).
   - **How testers join your test**:
     - Toggle ON **"Anyone with the link can opt-in"**.
     - Kopiraj **Opt-in URL** (`https://play.google.com/apps/testing/com.sweatdrop.app`).
6. **Countries / regions**: izaberi RS (Srbija) za pilot.
7. Sačekaj Google review (~1–3 dana prvi put).
8. Posle approval-a → pošalji opt-in URL Vortex Android korisnicima.

> **Posle 14 dana sa 12+ active testera** ispunjavaš Google requirement za promociju u Production track.

### 5.7 Reviewer credential management

- Demo nalog (`apple-review@sweatdrop.com`) i password čuvaj u **1Password / Bitwarden vault** sa pristupom samo CEO + tech lead.
- Posle svake major verzije (`1.x.0`), rotiraj password i ažuriraj reviewer notes pre sledećeg submit-a.
- Periodično (mesečno) reset-uj `apple-review` workout/redemption podatke u PROD-u da nalog ostane "čist" za sledećeg reviewera.

---

## Pilot ops checklist (posle slanja link-ova)

- [ ] **Sentry dashboard** — gledaj svaki dan, fix-uj sve crash-eve.
- [ ] **Supabase Logs** → API + Auth + Database, traži 4xx/5xx i RLS denials.
- [ ] **Push delivery** verifikacija (TestFlight + Play prima notifikacije).
- [ ] **Reception desk** koristi `/dashboard/redemptions` i `/dashboard/arenas`; loguj feedback.
- [ ] **Hotfix protokol:**
  - JS-only bug → `eas update --branch production --message "Fix description"` (instant OTA, par minuta do testera).
  - Native bug → bump versionCode/buildNumber → novi build → testeri dobijaju update automatski preko TestFlight/Play.
- [ ] **Weekly review** sa Vortex menadžmentom (broj aktivnih, broj sesija, broj redemptionsa).

---

## Smoke test pre slanja link-ova

- [ ] Skini build sa TestFlight kao privatni tester (sebe dodaj u "Vortex Pilot" grupu pre javnog opt-in-a).
- [ ] Sign-in kao **običan user** (registruj svežu email adresu kroz signup flow) → 5× tap = ništa, banner ne postoji. ✅
- [ ] Sign-in kao **demo nalog** (`apple-review@sweatdrop.com`) → narandžasti banner se pojavi → 5× tap → simulator radi → drops sleću u wallet. ✅
- [ ] Redemption flow radi (sign-in kao receptionist u admin panelu, mark redemption fulfilled).
- [ ] Push notifikacija stiže (probaj "challenge progress" notification).

Ako bilo šta puca — **NE šalji link**. Vrati se na Step 2/3 + bump build (1.0.0 / 18) → resubmit.

---

## Out of scope za tebe

- ❌ Code izmene (mobile-coder / admin-coder zaduženje).
- ❌ Database promene (DBA zaduženje).
- ❌ Production rollout u Open Testing / javni stor — to dolazi posle 2-4 nedelje stabilnog pilota (vidi `GO_LIVE.md` Sekcija 7).

---

## Rollback (ako Apple/Google odbije)

- Apple Beta App Review reject — fix problem (najverovatnije misleading copy ili nedostatak demo objašnjenja) → bump build (1.0.0 / 18) → resubmit. Demo nalog ostaje aktivan.
- Google review reject — slično. Play je obično tolerantniji ali strogo proverava Data Safety form.
- Bug u prod-u nakon distribucije link-a — OTA update za JS bug, novi build za native. Ne treba touchovati DB.
