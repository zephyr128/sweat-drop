# Vercel Deployment Guide for Landing Page

## Problem
Vercel ne vidi `apps/landing-page` jer je to monorepo projekat. Vercel mora da zna gde je root directory Next.js aplikacije.

## Rešenje

### Opcija 1: Postaviti Root Directory u Vercel Dashboard (Preporučeno)

1. Idite na Vercel Dashboard → Vaš projekat → Settings → General
2. U sekciji **"Root Directory"** kliknite **"Edit"**
3. Unesite: `apps/landing-page`
4. Sačuvajte promene
5. Vercel će automatski detektovati Next.js projekat

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

## Build Settings (Ako se koristi Root Directory)

Ako ste postavili Root Directory na `apps/landing-page`, Vercel će automatski:
- Detektovati Next.js framework
- Koristiti `package.json` iz `apps/landing-page`
- Pokrenuti `pnpm install` (ili `npm install`)
- Pokrenuti `pnpm build` (ili `npm run build`)

## Troubleshooting

### Problem: "Cannot find module"
**Rešenje:** Proverite da li je Root Directory postavljen na `apps/landing-page`

### Problem: "Build failed"
**Rešenje:** 
- Proverite da li su svi dependencies instalirani
- Možda treba da koristite `pnpm install` umesto `npm install`
- Proverite da li postoji `pnpm-workspace.yaml` u root-u

### Problem: "Framework not detected"
**Rešenje:** 
- Eksplicitno postavite Framework na "Next.js" u Vercel settings
- Ili dodajte `vercel.json` sa `"framework": "nextjs"`

## Trenutna Konfiguracija

Fajl `vercel.json` je kreiran sa osnovnom konfiguracijom. Ako postavite Root Directory u Vercel dashboard-u, ova konfiguracija će raditi.
