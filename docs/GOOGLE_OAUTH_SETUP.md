# Google OAuth Setup za Supabase

Ovaj vodič će ti pomoći da konfigurišeš Google OAuth za SweatDrop aplikaciju.

## Korak 1: Kreiranje Google OAuth Credentials

### 1.1. Otvori Google Cloud Console

1. Idi na [Google Cloud Console](https://console.cloud.google.com/)
2. Uloguj se sa svojim Google nalogom
3. Kreiraj novi projekat ili izaberi postojeći:
   - Klikni na dropdown sa imenom projekta (gore levo)
   - Klikni "New Project"
   - Unesi ime (npr. "SweatDrop")
   - Klikni "Create"

### 1.2. Omogući Google+ API

1. U meniju sa leve strane, idi na **APIs & Services** > **Library**
2. Pretraži "Google+ API" ili "Google Identity"
3. Klikni na "Google+ API" ili "Google Identity Services API"
4. Klikni "Enable"

### 1.3. Konfiguriši OAuth Consent Screen

1. Idi na **APIs & Services** > **OAuth consent screen**
2. Izaberi **External** (za development/testing) ili **Internal** (samo za Google Workspace)
3. Popuni obavezne informacije:
   - **App name**: SweatDrop
   - **User support email**: Tvoj email
   - **Developer contact information**: Tvoj email
4. Klikni "Save and Continue"
5. Na "Scopes" ekranu, klikni "Save and Continue" (ne treba da dodaješ dodatne scope-ove)
6. Na "Test users" ekranu (ako si izabrao External), možeš dodati test email-ove, ili klikni "Save and Continue"
7. Klikni "Back to Dashboard"

### 1.4. Kreiraj OAuth 2.0 Client ID

**VAŽNO: Koristiš "Web application", ne iOS/Android!**

Zašto? Supabase radi kao **proxy/server** između tvoje mobile aplikacije i Google-a. Flow je:
1. Tvoja app → Supabase (sa redirect URL)
2. Supabase → Google OAuth
3. Google → Supabase callback URL
4. Supabase → Tvoja app (sa deep link)

Zato koristiš **Web application** sa Supabase callback URL-om.

1. Idi na **APIs & Services** > **Credentials**
2. Klikni "Create Credentials" > "OAuth client ID"
3. Ako te pita za OAuth consent screen, klikni "Configure Consent Screen" i završi korak 1.3
4. Izaberi **Application type**: **Web application** ✅ (NE iOS ili Android!)
5. Unesi **Name**: SweatDrop Mobile (ili bilo koje ime)
6. **Authorized JavaScript origins**:
   ```
   https://[YOUR_SUPABASE_PROJECT_REF].supabase.co
   ```
   Zameni `[YOUR_SUPABASE_PROJECT_REF]` sa tvojim Supabase project reference (možeš ga naći u Supabase Dashboard > Settings > API)
   
   Primer:
   ```
   https://abcdefghijklmnop.supabase.co
   ```
7. **Authorized redirect URIs** (OVO JE KLJUČNO):
   
   **VAŽNO: Google OAuth prihvata SAMO web URLs (https://), NE exp:// ili custom schemes!**
   
   **Dodaj SAMO Supabase callback URL:**
   ```
   https://[YOUR_SUPABASE_PROJECT_REF].supabase.co/auth/v1/callback
   ```
   
   **Primer:**
   ```
   https://abcdefghijklmnop.supabase.co/auth/v1/callback
   ```
   
   **NAPOMENA:** 
   - ❌ **NE dodavaj** `exp://localhost:8081`, `exp://localhost:8082`, ili `sweatdrop://` u Google OAuth redirect URIs
   - ✅ **Dodaj SAMO** Supabase callback URL (`https://...supabase.co/auth/v1/callback`)
   - Supabase će automatski redirectovati u tvoju app preko deep link-a nakon što primi Google callback
   - Deep link URLs (`exp://`, `sweatdrop://`) se konfigurišu u **Supabase Dashboard**, ne u Google!
   
8. Klikni "Create"
9. **SAČUVAJ** Client ID i Client Secret koji se prikažu (nećeš moći da vidiš secret ponovo!)

## Korak 2: Konfiguracija u Supabase

### 2.1. Omogući Google Provider

1. Idi na [Supabase Dashboard](https://app.supabase.com/)
2. Izaberi svoj projekat
3. Idi na **Authentication** > **Providers** (u levom meniju)
4. Pronađi **Google** u listi providera
5. Klikni na toggle da ga **omogućiš** (Enable)

### 2.2. Unesi Credentials

1. U Google provider sekciji, unesi:
   - **Client ID (for OAuth)**: Kopiraj iz Google Cloud Console
   - **Client Secret (for OAuth)**: Kopiraj iz Google Cloud Console
2. Klikni "Save"

### 2.3. Konfiguriši Redirect URLs (VAŽNO!)

**Ovo je kritično!** Ako ne konfigurišeš ovo, Supabase će redirectovati na localhost umesto u tvoju aplikaciju.

1. U Supabase Dashboard, idi na **Authentication** > **URL Configuration**
2. U sekciji **Redirect URLs**, klikni **"Add URL"** i dodaj sledeće URL-ove (jedan po jedan):
   
   **Za Development:**
   ```
   exp://localhost:8081
   exp://127.0.0.1:8081
   sweatdrop://
   ```
   
   **Za Production:**
   ```
   sweatdrop://
   ```
   
   **VAŽNO:** URL-ovi moraju biti **tačno** onako kako su napisani, bez dodatnih karaktera ili razmaka!

3. Klikni **"Save"** nakon dodavanja svakog URL-a

4. Proveri da su svi URL-ovi vidljivi u listi

**Napomena:** Ako koristiš Expo Go, koristi `exp://localhost:8081`. Ako koristiš dev client, koristi `sweatdrop://`.

## Korak 3: Testiranje

### 3.1. U Mobile App

1. Pokreni aplikaciju: `cd apps/mobile-app && npm start`
2. Idi na auth screen
3. Klikni "Continue with Google"
4. Trebalo bi da se otvori browser sa Google login
5. Uloguj se sa Google nalogom
6. Trebalo bi da se vratiš u aplikaciju i da si ulogovan

### 3.2. Provera u Supabase

1. Idi na **Authentication** > **Users** u Supabase Dashboard
2. Trebalo bi da vidiš novog korisnika sa Google email-om
3. Proveri da je kreiran i profil u `profiles` tabeli

## Troubleshooting

### Problem: "redirect_uri_mismatch" error

**Rešenje**: 
- Proveri da li si dodao tačan redirect URI u Google Cloud Console
- Proveri da li si dodao redirect URI u Supabase URL Configuration
- Redirect URI mora biti identičan u oba mesta

### Problem: "invalid_client" error

**Rešenje**:
- Proveri da li si tačno kopirao Client ID i Client Secret u Supabase
- Proveri da nema dodatnih razmaka ili karaktera

### Problem: OAuth se otvara ali se ne vraća u app

**Rešenje**:
- Proveri da li je `expo-web-browser` instaliran: `npm install expo-web-browser`
- Proveri da li je `WebBrowser.maybeCompleteAuthSession()` pozvan u auth.tsx
- Proveri da li su redirect URLs konfigurisani u Supabase

### Problem: "Access blocked: This app's request is invalid"

**Rešenje**:
- Ako si izabrao "External" u OAuth consent screen, možda treba da dodaš test users
- Ili promeni na "Internal" ako imaš Google Workspace

## Produkcija

Za produkciju, treba da:

1. **Google Cloud Console**:
   - Promeni OAuth consent screen status sa "Testing" na "In Production"
   - Dodaj sve potrebne redirect URIs za produkciju

2. **Supabase**:
   - Dodaj produkcijski redirect URI u URL Configuration
   - Proveri da su sve environment varijable postavljene

3. **Expo**:
   - Konfiguriši `app.json` sa tačnim scheme-om:
   ```json
   {
     "expo": {
       "scheme": "sweatdrop"
     }
   }
   ```

## Korisni Linkovi

- [Google Cloud Console](https://console.cloud.google.com/)
- [Supabase Dashboard](https://app.supabase.com/)
- [Supabase Auth Docs](https://supabase.com/docs/guides/auth)
- [Expo Auth Session Docs](https://docs.expo.dev/guides/authentication/#google)
