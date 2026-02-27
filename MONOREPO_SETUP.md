# 🏗️ SweatDrop Monorepo Setup Guide

## ⚠️ Važno: Uvek koristi skripte iz root direktorijuma!

**NIKAD ne pokreći `pnpm install` direktno u `apps/admin-panel/` ili `apps/mobile-app/` folderima!**

## 🔧 Problem koji je bio rešen

Ranije je postojao problem gde:
- `apps/admin-panel/.npmrc` je imao `node-linker=isolated` (konflikt sa root konfiguracijom)
- Kada bi pokrenuo `pnpm install` u admin-panel folderu, kreirao bi se lokalni `node_modules` i gubili bi se linkovi sa root-om
- Mobile app i Admin panel nisu mogli da rade istovremeno

**Rešenje**: Obrisan je `apps/admin-panel/.npmrc` fajl. Sada svi workspace-ovi koriste root `.npmrc` konfiguraciju sa `node-linker=hoisted`.

## ✅ Kako pravilno koristiti monorepo

### 1. Prvi put setup

```bash
# Iz root direktorijuma
cd /Users/np/Projects/sweatdrop
pnpm install
```

Ovo će instalirati sve zavisnosti za sve workspace-ove u root `node_modules` folderu.

### 2. Pokretanje development servera

**Uvek koristi skripte iz root-a:**

```bash
# Terminal 1 - Admin Panel
cd /Users/np/Projects/sweatdrop
pnpm dev:admin

# Terminal 2 - Mobile App
cd /Users/np/Projects/sweatdrop
pnpm dev:mobile
```

**NIKAD ne radi:**
```bash
# ❌ POGREŠNO - ne idi u workspace folder
cd apps/admin-panel
pnpm install  # Ovo će pokvariti monorepo strukturu!
pnpm dev
```

### 3. Ako dodaješ nove zavisnosti

```bash
# Iz root direktorijuma
cd /Users/np/Projects/sweatdrop

# Dodaj zavisnost u admin-panel
pnpm add <package> --filter sweatdrop-admin-panel

# Dodaj zavisnost u mobile-app
pnpm add <package> --filter sweatdrop-mobile-app

# Dodaj dev zavisnost
pnpm add -D <package> --filter <workspace-name>
```

### 4. Helper skripta za proveru zavisnosti

Ako nisi siguran da li su zavisnosti instalirane:

```bash
cd /Users/np/Projects/sweatdrop
pnpm ensure-deps
```

Ova skripta će proveriti i instalirati zavisnosti ako je potrebno.

## 📁 Monorepo struktura

```
sweatdrop/
├── node_modules/          # SVE zavisnosti ovde (hoisted)
├── pnpm-lock.yaml         # Lock fajl za sve workspace-ove
├── .npmrc                 # Root konfiguracija (node-linker=hoisted)
├── pnpm-workspace.yaml    # Workspace definicije
├── package.json           # Root package.json sa skriptama
├── apps/
│   ├── admin-panel/       # Next.js app (NEMA lokalni .npmrc)
│   │   ├── package.json
│   │   └── node_modules/  # Symlinkovi ka root node_modules
│   └── mobile-app/        # Expo/React Native app
│       ├── package.json
│       └── node_modules/  # Symlinkovi ka root node_modules
└── scripts/
    └── ensure-deps.sh     # Helper skripta za proveru zavisnosti
```

## 🎯 Quick Reference

### Development

```bash
# Admin Panel
pnpm dev:admin

# Mobile App
pnpm dev:mobile

# Oba istovremeno (u različitim terminalima)
pnpm dev:admin    # Terminal 1
pnpm dev:mobile   # Terminal 2
```

### Build

```bash
# Admin Panel
pnpm build:admin

# Mobile App
pnpm build:mobile
```

### iOS Build

```bash
# Kompletna iOS build workflow
pnpm ios:build

# Ili korak po korak
pnpm ios:prebuild
pnpm ios:setup
pnpm ios:xcode
```

## 🔍 Troubleshooting

### Problem: "Module not found" greške

**Rešenje:**
```bash
cd /Users/np/Projects/sweatdrop
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

### Problem: Workspace ne vidi zavisnosti

**Uzrok**: Verovatno si pokrenuo `pnpm install` u workspace folderu umesto u root-u.

**Rešenje:**
```bash
cd /Users/np/Projects/sweatdrop
# Obriši lokalne node_modules iz workspace-ova
rm -rf apps/admin-panel/node_modules apps/mobile-app/node_modules
# Reinstaliraj iz root-a
pnpm install
```

### Problem: "Cannot find module" u jednom workspace-u, a radi u drugom

**Uzrok**: Konflikt u node_modules strukturi.

**Rešenje:**
```bash
cd /Users/np/Projects/sweatdrop
./clean-install.sh
```

## 📝 Važne napomene

1. **Uvek koristi skripte iz root-a**: `pnpm dev:admin`, `pnpm dev:mobile`, itd.
2. **NIKAD ne pokreći `pnpm install` u workspace folderima**: Uvek iz root-a
3. **Koristi `--filter` flag**: Za dodavanje zavisnosti u specifičan workspace
4. **Root `.npmrc` je jedini važeći**: Workspace-ovi ne treba da imaju svoje `.npmrc` fajlove (osim ako nije eksplicitno potrebno)

## 🚀 Preporučeni workflow

1. **Prvi put setup:**
   ```bash
   cd /Users/np/Projects/sweatdrop
   pnpm install
   ```

2. **Svakodnevni rad:**
   ```bash
   # Terminal 1
   cd /Users/np/Projects/sweatdrop
   pnpm dev:admin
   
   # Terminal 2
   cd /Users/np/Projects/sweatdrop
   pnpm dev:mobile
   ```

3. **Kada dodaš novu zavisnost:**
   ```bash
   cd /Users/np/Projects/sweatdrop
   pnpm add <package> --filter <workspace-name>
   ```

4. **Ako imaš problema:**
   ```bash
   cd /Users/np/Projects/sweatdrop
   ./clean-install.sh
   ```

---

**Zapamti**: Monorepo znači da sve zavisnosti upravljaš iz root-a. Workspace-ovi su samo organizacione jedinice, ne nezavisni projekti!
