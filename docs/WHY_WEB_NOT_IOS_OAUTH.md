# Zašto koristim "Web application" umesto "iOS" u Google OAuth?

## Kratak odgovor

**Koristiš "Web application" jer Supabase radi kao proxy/server između tvoje mobile aplikacije i Google-a.**

## Detaljno objašnjenje

### Kako funkcioniše OAuth flow sa Supabase:

```
┌─────────────┐         ┌──────────────┐         ┌──────────┐
│ Mobile App  │ ──────> │   Supabase   │ ──────> │  Google  │
│             │         │   (Server)   │         │  OAuth   │
└─────────────┘         └──────────────┘         └──────────┘
     │                          │                        │
     │                          │                        │
     │ <────────────────────────┼────────────────────────┘
     │                          │
     │                          │
     └──────────────────────────┘
        (Deep link redirect)
```

### Koraci u flow-u:

1. **Mobile App** → Poziva `supabase.auth.signInWithOAuth()` sa `redirectTo: 'sweatdrop://'`
2. **Supabase** → Generiše OAuth URL i šalje ga u browser
3. **Google** → Korisnik se loguje i Google šalje callback na Supabase server
4. **Supabase Server** → Prima callback na `https://[project].supabase.co/auth/v1/callback`
5. **Supabase** → Redirectuje korisnika nazad u app preko deep link-a (`sweatdrop://`)

### Zašto "Web application"?

- **Supabase callback URL** (`https://...supabase.co/auth/v1/callback`) je **web URL**
- Google mora da može da redirectuje na taj web URL
- Zato koristiš **"Web application"** tip u Google Cloud Console
- **Authorized redirect URIs** mora da sadrži Supabase callback URL

### Zašto NE "iOS" ili "Android"?

- iOS/Android client types su za **direktnu** komunikaciju između app-a i Google-a
- Ne koriste server kao proxy
- Ne rade sa Supabase OAuth flow-om
- Ne bi mogli da redirectuju na Supabase callback URL

## Konfiguracija

### Google Cloud Console:

**Application type:** Web application ✅

**Authorized redirect URIs:**
```
https://[YOUR_SUPABASE_REF].supabase.co/auth/v1/callback  ← OBAVEZNO!
exp://localhost:8081                                        ← Opciono (dev)
sweatdrop://                                               ← Opciono (dev)
```

### Supabase Dashboard:

**Authentication > URL Configuration > Redirect URLs:**
```
exp://localhost:8081    ← Za development
sweatdrop://            ← Za production
```

## Alternativa: Direktan iOS/Android OAuth (bez Supabase)

Ako bi hteo da koristiš direktan iOS/Android OAuth (bez Supabase proxy):

1. Kreiraj **iOS** ili **Android** OAuth client u Google
2. Koristi Google SDK direktno u app-u
3. **ALI:** Nećeš moći da koristiš Supabase Auth
4. Morao bi da ručno upravljaš sesijama, tokenima, itd.

**Zaključak:** Za Supabase Auth, koristi **Web application** tip.

## Provera

Da proveriš da li je sve dobro konfigurisano:

1. **Google Cloud Console:**
   - ✅ Application type: Web application
   - ✅ Authorized redirect URIs sadrži Supabase callback URL

2. **Supabase Dashboard:**
   - ✅ Redirect URLs sadrži app scheme (`sweatdrop://` ili `exp://localhost:8081`)

3. **Kod:**
   - ✅ `redirectTo` u `signInWithOAuth()` se poklapa sa Supabase Redirect URLs

## Troubleshooting

### Problem: "redirect_uri_mismatch"

**Uzrok:** Redirect URI u Google ne odgovara onom koji Supabase šalje.

**Rešenje:** 
- Proveri da li si dodao `https://[project].supabase.co/auth/v1/callback` u Google
- Proveri da nema razlike u URL-u (velika/mala slova, `/` na kraju, itd.)

### Problem: Redirectuje na localhost umesto u app

**Uzrok:** Supabase ne prepoznaje app scheme kao validan redirect URL.

**Rešenje:**
- Dodaj app scheme (`sweatdrop://` ili `exp://localhost:8081`) u Supabase Dashboard > Authentication > URL Configuration
