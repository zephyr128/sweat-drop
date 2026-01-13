# Kako da popraviš Redirect na Localhost Problem

Ako te Google sign in redirectuje na `localhost` umesto u aplikaciju, to znači da Supabase ne prepoznaje tvoj app scheme kao validan redirect URL.

## Brzo Rešenje

### 1. Otvori Supabase Dashboard

1. Idi na [Supabase Dashboard](https://app.supabase.com/)
2. Izaberi svoj projekat
3. Idi na **Authentication** (u levom meniju)
4. Klikni na **URL Configuration** (podsekcija)

### 2. Dodaj Redirect URLs

U sekciji **"Redirect URLs"**, klikni **"Add URL"** i dodaj sledeće URL-ove:

**Za Development sa Expo Go:**
```
exp://localhost:8081
```

**Za Development sa Dev Client:**
```
sweatdrop://
```

**Za Production:**
```
sweatdrop://
```

**VAŽNO:**
- Dodaj svaki URL posebno (jedan po jedan)
- Klikni "Save" nakon svakog
- URL-ovi moraju biti **tačno** onako kako su napisani
- Ne dodavaj `/` na kraju (npr. `sweatdrop://` a ne `sweatdrop:///`)

### 3. Proveri da li su URL-ovi dodati

Nakon dodavanja, trebalo bi da vidiš listu URL-ova u sekciji "Redirect URLs". Primer:

```
✓ exp://localhost:8081
✓ sweatdrop://
```

### 4. Testiraj ponovo

1. Restartuj aplikaciju
2. Pokušaj Google sign in ponovo
3. Sada bi trebalo da te redirectuje u aplikaciju umesto na localhost

## Kako da proveriš koji URL koristi aplikacija?

U `apps/mobile-app/app/(onboarding)/auth.tsx`, u funkciji `handleGoogleSignIn`, postoji `console.log` koji ispisuje koji URL se koristi:

```typescript
console.log('Using redirect URL:', redirectTo);
```

Proveri u konzoli (Expo DevTools ili terminal) koji URL se koristi i proveri da li je taj URL dodat u Supabase.

## Troubleshooting

### Problem: I dalje me redirectuje na localhost

**Rešenje:**
1. Proveri da li si kliknuo "Save" nakon dodavanja URL-a
2. Proveri da nema dodatnih karaktera u URL-u (razmaci, `/` na kraju, itd.)
3. Restartuj aplikaciju
4. Proveri u konzoli koji URL aplikacija koristi i uporedi sa onim u Supabase

### Problem: "Invalid redirect URL" greška

**Rešenje:**
- URL koji šalješ u `signInWithOAuth` mora biti **identičan** onom koji si dodao u Supabase
- Proveri da nema razlike u velikim/malim slovima
- Proveri da nema dodatnih karaktera

### Problem: Ne znam da li koristim Expo Go ili Dev Client

**Rešenje:**
- **Expo Go**: Ako pokrećeš app sa `expo start` i skeniraš QR kod sa Expo Go aplikacijom
- **Dev Client**: Ako si build-ovao custom development build (`expo run:ios` ili `expo run:android`)

Ako nisi siguran, dodaj oba URL-a u Supabase:
```
exp://localhost:8081
sweatdrop://
```

## Primer konfiguracije

**Supabase Dashboard > Authentication > URL Configuration:**

```
Redirect URLs:
✓ exp://localhost:8081
✓ exp://127.0.0.1:8081
✓ sweatdrop://
```

**Google Cloud Console > OAuth 2.0 Client IDs > Authorized redirect URIs:**

```
https://[YOUR_SUPABASE_REF].supabase.co/auth/v1/callback
exp://localhost:8081
exp://127.0.0.1:8081
```

**Kod u `auth.tsx`:**

```typescript
const redirectTo = __DEV__ 
  ? (Constants.expoConfig?.hostUri ? `exp://${Constants.expoConfig.hostUri}` : 'sweatdrop://')
  : 'sweatdrop://';
```

Svi ovi URL-ovi moraju da se poklapaju!
