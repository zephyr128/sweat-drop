# Kako da popraviš "Redirect URIs: exp://localhost:8082" grešku

## Problem

Dobijaš grešku:
```
The request failed because one of the fields is invalid:
Redirect URIs: exp://localhost:8082
```

## Uzrok

**Google OAuth prihvata SAMO web URLs (https://) u Authorized redirect URIs, NE custom schemes kao što su `exp://` ili `sweatdrop://`!**

## Rešenje

### 1. U Google Cloud Console

**Idi na:** APIs & Services > Credentials > [Tvoj OAuth 2.0 Client ID]

**U sekciji "Authorized redirect URIs":**

✅ **Dodaj SAMO:**
```
https://[YOUR_SUPABASE_REF].supabase.co/auth/v1/callback
```

❌ **NE dodavaj:**
- `exp://localhost:8081`
- `exp://localhost:8082`
- `exp://127.0.0.1:8081`
- `sweatdrop://`
- Bilo koji custom scheme URL

**Primer:**
```
https://abcdefghijklmnop.supabase.co/auth/v1/callback
```

### 2. Zašto ovo radi?

OAuth flow sa Supabase:

```
1. Mobile App → Supabase (sa redirectTo: 'sweatdrop://')
2. Supabase → Google OAuth (sa callback: 'https://...supabase.co/auth/v1/callback')
3. Google → Supabase callback (https://...supabase.co/auth/v1/callback) ✅
4. Supabase → Mobile App (preko deep link: sweatdrop://) ✅
```

- **Google** vidi samo web URL (`https://...supabase.co/auth/v1/callback`)
- **Supabase** prima callback i redirectuje u app preko deep link-a
- **Deep link URLs** se konfigurišu u Supabase Dashboard, ne u Google!

### 3. Konfiguracija Deep Links u Supabase

Deep link URLs se konfigurišu u **Supabase Dashboard**, ne u Google:

1. Idi na **Supabase Dashboard** > **Authentication** > **URL Configuration**
2. U sekciji **"Redirect URLs"**, dodaj:
   ```
   exp://localhost:8081
   exp://localhost:8082
   sweatdrop://
   ```

Ovi URL-ovi su za Supabase da zna gde da redirectuje nakon što primi Google callback.

## Provera

### Google Cloud Console:
```
Authorized redirect URIs:
✓ https://[project].supabase.co/auth/v1/callback
```

### Supabase Dashboard:
```
Redirect URLs:
✓ exp://localhost:8081
✓ exp://localhost:8082
✓ sweatdrop://
```

### Kod u auth.tsx:
```typescript
const redirectTo = __DEV__ 
  ? (Constants.expoConfig?.hostUri ? `exp://${Constants.expoConfig.hostUri}` : 'sweatdrop://')
  : 'sweatdrop://';
```

## Troubleshooting

### Problem: I dalje dobijam grešku

**Rešenje:**
1. Proveri da li si **obrisao** sve `exp://` i custom scheme URLs iz Google OAuth redirect URIs
2. Proveri da imaš **samo** Supabase callback URL u Google
3. Proveri da je Supabase callback URL tačan (bez dodatnih karaktera)

### Problem: Ne znam koji port koristim (8081 ili 8082)

**Rešenje:**
- Proveri u Expo DevTools ili terminal koji port koristiš
- Ili dodaj oba u Supabase Dashboard:
  ```
  exp://localhost:8081
  exp://localhost:8082
  ```

### Problem: Kako da znam koji Supabase project reference koristim?

**Rešenje:**
1. Idi na **Supabase Dashboard** > **Settings** > **API**
2. Nađi **"Project URL"** - to je tvoj project reference
3. Primer: Ako je URL `https://abcdefghijklmnop.supabase.co`, onda je reference `abcdefghijklmnop`

## Zaključak

- **Google OAuth:** Samo web URLs (https://)
- **Supabase Dashboard:** Custom schemes (exp://, sweatdrop://)
- **Kod:** Koristi app scheme koji se poklapa sa Supabase Redirect URLs
