# Scripts Directory

Ovaj direktorijum sadrži sve shell skripte za automatizaciju razvoja SweatDrop aplikacije.

## 📱 Mobile Scripts

### Android

- **`android-run.sh`** - Kompletan Android setup i pokretanje
  - Instalira dependencies
  - Kreira assets symlink
  - Instalira Skia
  - Pokreće emulator ako treba
  - Builda i pokreće aplikaciju
  - **Koristi:** `pnpm android:run`

- **`android-dev.sh`** - Brzo Android pokretanje za development
  - Proverava za uređaje
  - Pokreće emulator ako treba
  - Pokreće Expo dev server
  - **Koristi:** `pnpm android:dev`

### iOS

- **`ios-build.sh`** - Kompletan iOS setup i build
  - Instalira dependencies
  - Kreira assets symlink
  - Instalira Skia XCFrameworks
  - Pokreće Expo prebuild
  - Instalira CocoaPods
  - Otvara Xcode workspace
  - **Koristi:** `pnpm ios:build`

- **`fix-ios-crash.sh`** - Popravlja iOS crash probleme
- **`fix-ios-svg-headers.sh`** - Popravlja SVG header probleme
- **`debug-ios-crash.sh`** - Debug iOS crash-eva

## 🖥️ Admin Panel Scripts

- **`admin-build.sh`** - Build admin panel aplikacije

## 🔧 Utility Scripts

- **`ensure-deps.sh`** - Proverava i instalira dependencies

## Kako koristiti

### Prvi put setup

```bash
# Android
pnpm android:run

# iOS
pnpm ios:build
```

### Svakodnevni development

```bash
# Android
pnpm android:dev

# iOS
pnpm ios
```

## Struktura skripti

Sve skripte prate isti pattern:

1. **Provera preduslova** (SDK, tools, etc.)
2. **Učitavanje environment variables**
3. **Instalacija dependencies** (ako je potrebno)
4. **Setup assets i native modules**
5. **Pokretanje aplikacije**

## Environment Variables

Skripte automatski učitavaju `.env` fajl iz `apps/mobile-app/.env`.

Za mobile app, sve varijable moraju imati `EXPO_PUBLIC_` prefix:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## Troubleshooting

Ako skripta ne radi:

1. Proveri da li je izvršna:
   ```bash
   chmod +x scripts/script-name.sh
   ```

2. Proveri da li su preduslovi ispunjeni:
   - Android: `ANDROID_HOME` environment variable
   - iOS: Xcode instaliran
   - Oba: Node.js >= 18, pnpm >= 10

3. Pokreni sa debug outputom:
   ```bash
   bash -x scripts/script-name.sh
   ```

## Dodatna dokumentacija

- [ANDROID_SETUP.md](../ANDROID_SETUP.md) - Detaljan Android setup
- [SCRIPTS.md](../SCRIPTS.md) - Kompletan pregled svih komandi
- [README.md](../README.md) - Opšti pregled projekta
