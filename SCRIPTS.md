# SweatDrop Scripts Reference

Brzi pregled svih dostupnih skripti za razvoj SweatDrop aplikacije.

## 📱 Mobile App Scripts

### Android

| Komanda | Opis | Kada koristiti |
|---------|------|----------------|
| `pnpm android:run` | Kompletan setup + pokretanje | Prvi put ili nakon većih promena |
| `pnpm android:dev` | Brzo pokretanje dev servera | Svakodnevni development |
| `pnpm android` | Direktno pokretanje | Kada je sve već podešeno |

**Detalji:** Pogledaj [ANDROID_SETUP.md](./ANDROID_SETUP.md)

### iOS

| Komanda | Opis | Kada koristiti |
|---------|------|----------------|
| `pnpm ios:build` | Kompletan iOS setup | Prvi put ili nakon većih promena |
| `pnpm ios:prebuild` | Samo Expo prebuild | Kada trebaš regenerisati native kod |
| `pnpm ios:setup` | Samo CocoaPods install | Kada dodaješ native dependencies |
| `pnpm ios:clean` | Očisti build artifacts | Kada imaš build probleme |
| `pnpm ios:xcode` | Otvori Xcode workspace | Za pokretanje iz Xcode-a |
| `pnpm ios` | Direktno pokretanje | Kada je sve već podešeno |

### Opšte Mobile

| Komanda | Opis |
|---------|------|
| `pnpm dev:mobile` | Pokreni Expo dev server |
| `pnpm build:mobile` | Build mobile app |

## 🖥️ Admin Panel Scripts

| Komanda | Opis |
|---------|------|
| `pnpm dev:admin` | Pokreni development server |
| `pnpm build:admin` | Build za production |
| `pnpm admin:dev` | Alternativna komanda za dev |
| `pnpm admin:build` | Alternativna komanda za build |

## 🗄️ Backend Scripts

| Komanda | Opis |
|---------|------|
| `cd backend && supabase start` | Pokreni lokalni Supabase |
| `cd backend && supabase db reset` | Resetuj lokalnu bazu |
| `cd backend && supabase db push` | Primeni migracije |
| `cd backend && supabase gen types typescript --local` | Generiši TypeScript tipove |

## 🧪 Testing Scripts

| Komanda | Opis |
|---------|------|
| `pnpm test:db` | Database testovi |
| `pnpm test:mobile` | Mobile app testovi |
| `pnpm test:admin` | Admin panel testovi |
| `pnpm test:e2e` | End-to-end testovi |
| `pnpm test:smoke` | Smoke testovi |
| `pnpm test:mobile-gates` | Mobile quality gates |
| `pnpm test:release-preflight` | Pre-release provere |
| `pnpm test:ci` | CI test suite |

## 🔧 Utility Scripts

| Komanda | Opis |
|---------|------|
| `pnpm ensure-deps` | Proveri i instaliraj dependencies |
| `pnpm lint` | Linting svih workspace-a |
| `pnpm type-check` | TypeScript type checking |
| `pnpm env:mobile:dev` | Prebaci na dev environment |
| `pnpm env:mobile:prod` | Prebaci na prod environment |

## 🧹 Cleanup Scripts

| Komanda | Opis |
|---------|------|
| `./clean-install.sh` | Očisti sve i reinstaliraj |
| `pnpm ios:clean` | Očisti iOS build artifacts |
| `./scripts/fix-ios-crash.sh` | Popravi iOS crash probleme |
| `./scripts/fix-ios-svg-headers.sh` | Popravi SVG header probleme |

## 📦 Installation & Setup

### Prvi put setup

```bash
# 1. Instaliraj dependencies
pnpm install

# 2. Pokreni lokalni Supabase
cd backend
supabase start
supabase db reset
cd ..

# 3. Podesi environment variables
# Kopiraj .env.example u .env za svaki workspace

# 4. Pokreni aplikaciju
pnpm android:run  # Za Android
# ili
pnpm ios:build    # Za iOS
```

### Svakodnevni development

```bash
# Android
pnpm android:dev

# iOS
pnpm ios

# Admin panel
pnpm dev:admin
```

## 🔍 Debugging

### Mobile App Logs

```bash
# Android
adb logcat | grep ReactNative

# iOS
# Koristi Xcode konzolu
```

### Metro Bundler

```bash
# Očisti cache
cd apps/mobile-app
npx expo start -c
```

### Database

```bash
# Proveri status
cd backend
supabase status

# Pogledaj logove
supabase logs
```

## 📚 Dodatna Dokumentacija

- [ANDROID_SETUP.md](./ANDROID_SETUP.md) - Detaljan Android setup guide
- [BUILD_INSTRUCTIONS.md](./BUILD_INSTRUCTIONS.md) - Build instrukcije
- [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) - Supabase konfiguracija
- [README.md](./README.md) - Opšti pregled projekta

## 💡 Tips & Tricks

### Brzo restartovanje

```bash
# Android - otvori dev menu
adb shell input keyevent 82

# Zatim izaberi "Reload"
```

### Očisti sve cache-ove

```bash
# Metro bundler
rm -rf apps/mobile-app/.expo
rm -rf apps/mobile-app/node_modules/.cache

# Watchman (ako koristiš)
watchman watch-del-all

# Android
cd apps/mobile-app/android
./gradlew clean
```

### Proveri verzije

```bash
node --version    # >= 18.0.0
pnpm --version    # >= 10.0.0
expo --version    # ~54.0.0
```

## ⚠️ Common Issues

### "ANDROID_HOME is not set"
```bash
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools
```

### "adb command not found"
Dodaj Android SDK platform-tools u PATH (vidi iznad).

### "No emulators found"
Kreiraj AVD u Android Studio: Tools > Device Manager > Create Device

### Metro bundler greška
```bash
cd apps/mobile-app
npx expo start -c
```

### Build greška
```bash
./clean-install.sh
pnpm android:run
```
