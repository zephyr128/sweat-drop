# Vercel Deployment Guide for Landing Page

## Problem
Vercel ne vidi `apps/landing-page` jer je to monorepo projekat. Vercel mora da zna gde je root directory Next.js aplikacije.

**Error:** "No Next.js version detected" - ovo znači da Vercel gleda u pogrešan direktorijum.

## Rešenje

### ⚠️ OBAVEZNO: Postaviti Root Directory u Vercel Dashboard

**Ovo je KRITIČNO i mora biti urađeno prvo!**

1. Idite na Vercel Dashboard → Vaš projekat → **Settings** → **General**
2. U sekciji **"Root Directory"** kliknite **"Edit"**
3. **Unesite:** `apps/landing-page` (bez leading slash)
4. Kliknite **"Save"**
5. Vercel će automatski detektovati Next.js projekat iz `apps/landing-page/package.json`

**Bez ovog koraka, Vercel neće moći da detektuje Next.js!**

### Opcija 2: Koristiti Vercel CLI

```bash
# Instalirajte Vercel CLI
npm i -g vercel

# Linkujte projekat
cd apps/landing-page
vercel link

# Prilikom linkovanja, postavite:
# - Root Directory: apps/landing-page
# - Build Command: pnpm build (ili npm run build)
# - Output Directory: .next
```

### Opcija 3: Kreirati zaseban Vercel projekat

Ako želite da landing-page bude zaseban projekat:

1. U Vercel Dashboard, kreirajte novi projekat
2. Povežite ga sa istim GitHub repository-jem
3. Postavite Root Directory na `apps/landing-page`
4. Build Command: `pnpm build` (ili `cd apps/landing-page && pnpm build`)
5. Install Command: `pnpm install` (ili `cd ../.. && pnpm install`)

## Environment Variables

Ne zaboravite da dodate environment variables u Vercel:

- `GMAIL_USER` - Vaša Gmail adresa
- `GMAIL_APP_PASSWORD` - Gmail App Password

Vidi `EMAIL_SETUP.md` za detalje.

## Build Settings

**Nakon što postavite Root Directory na `apps/landing-page`**, Vercel će automatski:
- ✅ Detektovati Next.js framework iz `package.json`
- ✅ Koristiti `package.json` iz `apps/landing-page`
- ✅ Pokrenuti `pnpm install` (ili `npm install`)
- ✅ Pokrenuti `pnpm build` (ili `npm run build`)

**Trenutni `vercel.json` koristi pnpm filter komande:**
- `buildCommand`: `pnpm --filter ./apps/landing-page build`
- `outputDirectory`: `apps/landing-page/.next`
- `installCommand`: `pnpm install --filter ./apps/landing-page...`

**NAPOMENA:** Ako postavite Root Directory na `apps/landing-page`, možete koristiti jednostavnije komande:
- `buildCommand`: `pnpm build` (ili `npm run build`)
- `outputDirectory`: `.next`
- `installCommand`: `pnpm install` (ili `npm install`)

## Troubleshooting

### Problem: "Cannot find module"
**Rešenje:** Proverite da li je Root Directory postavljen na `apps/landing-page`

### Problem: "Build failed"
**Rešenje:** 
- Proverite da li su svi dependencies instalirani
- Možda treba da koristite `pnpm install` umesto `npm install`
- Proverite da li postoji `pnpm-workspace.yaml` u root-u

### Problem: "No Next.js version detected" ili "Framework not detected"
**Rešenje:** 
1. **Proverite Root Directory** - mora biti postavljen na `apps/landing-page` u Vercel Settings → General
2. Proverite da li `apps/landing-page/package.json` sadrži `"next"` u dependencies
3. Eksplicitno postavite Framework na "Next.js" u Vercel Settings → General → Framework Preset
4. Ako i dalje ne radi, pokušajte da redeploy-ujete projekat nakon promene Root Directory

## Trenutna Konfiguracija

Fajl `vercel.json` je kreiran sa osnovnom konfiguracijom. Ako postavite Root Directory u Vercel dashboard-u, ova konfiguracija će raditi.
