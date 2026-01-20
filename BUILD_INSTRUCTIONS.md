# 🚀 SweatDrop Build Instructions

## 📱 iOS Build Workflow

### Brzi Start (Sve u jednom)

```bash
# Iz root-a projekta
pnpm ios:build
```

Ovo će automatski:
1. Instalirati zavisnosti
2. Instalirati Skia XCFrameworks
3. Pokrenuti Expo prebuild
4. Instalirati CocoaPods dependencies
5. Otvoriti Xcode workspace

### Korak po Korak

```bash
# 1. Instaliraj zavisnosti (iz root-a)
pnpm install

# 2. Prebuild iOS native kod (iz root-a)
pnpm ios:prebuild

# 3. Instaliraj CocoaPods (iz root-a)
pnpm ios:setup

# 4. Otvori Xcode (iz root-a)
pnpm ios:xcode
```

### Alternativno: Bash Skripta

```bash
# Iz root-a projekta
./scripts/ios-build.sh
```

### U Xcode-u

1. **Izaberi uređaj**: Na vrhu Xcode-a, pored "Play" dugmeta, izaberi iPhone ili Simulator
2. **Signing & Capabilities** (za fizički telefon):
   - Klikni na plavi projekat (SweatDrop) → Targets → SweatDrop
   - Pod tabom Signing & Capabilities → izaberi svoj Team (Apple ID)
   - Promeni Bundle Identifier u nešto unikatno (npr. `com.tvojeime.sweatdrop`)
3. **Build**: Pritisni `Cmd + R` ili klikni "Play" dugme

---

## 🖥️ Admin Panel Build Workflow

### Development Server

```bash
# Iz root-a projekta
pnpm dev:admin

# Ili direktno
cd apps/admin-panel && pnpm dev
```

### Production Build

```bash
# Iz root-a projekta
pnpm admin:build

# Ili direktno
cd apps/admin-panel && pnpm build
```

### Alternativno: Bash Skripta

```bash
# Iz root-a projekta
./scripts/admin-build.sh
```

---

## 📁 Assets Folder (Monorepo Fix)

**Važno**: Expo prebuild očekuje `assets/` folder u root-u projekta. U monorepo strukturi, assets se nalaze u `apps/mobile-app/assets/`, pa je napravljen **symlink** iz root-a:

```bash
assets -> apps/mobile-app/assets
```

Ovaj symlink je automatski kreiran i ne treba ga brisati. Ako symlink nestane, ponovo ga kreiraj:

```bash
cd /Users/np/Projects/sweatdrop
ln -s apps/mobile-app/assets assets
```

---

## 📋 Sve Dostupne Skripte

### Root Package.json Skripte

| Skripta | Opis |
|---------|------|
| `pnpm dev:mobile` | Pokreni Metro bundler za mobile app |
| `pnpm dev:admin` | Pokreni Next.js dev server za admin panel |
| `pnpm build:mobile` | Build mobile app |
| `pnpm build:admin` | Build admin panel |
| `pnpm ios:prebuild` | Expo prebuild za iOS |
| `pnpm ios:setup` | Instaliraj CocoaPods dependencies |
| `pnpm ios:xcode` | Otvori Xcode workspace |
| `pnpm ios:build` | Kompletna iOS build workflow (prebuild + setup + xcode) |
| `pnpm admin:build` | Build admin panel |
| `pnpm admin:dev` | Dev server za admin panel |

### Bash Skripte

| Skripta | Opis |
|---------|------|
| `./scripts/ios-build.sh` | Kompletna iOS build workflow sa detaljnim output-om |
| `./scripts/admin-build.sh` | Kompletna admin panel build workflow |

---

## 🔧 Troubleshooting

### iOS Build Problemi

#### "Undefined symbol" greške za Skia

```bash
# 1. Proveri da li su Skia XCFrameworks instalirani
ls -la node_modules/@shopify/react-native-skia/libs/apple/

# 2. Ako nisu, pokreni instalaciju
cd apps/mobile-app
node $(node --print "require.resolve('@shopify/react-native-skia/scripts/install-skia.mjs')")

# 3. Reinstaliraj podove
cd ios
rm -rf Pods Podfile.lock
export LANG=en_US.UTF-8
arch -arm64 pod install
```

#### "No such module 'Expo'" greška

```bash
# Clean DerivedData
rm -rf ~/Library/Developer/Xcode/DerivedData/SweatDrop-*

# U Xcode-u: Product → Clean Build Folder (Cmd + Shift + K)
```

#### CocoaPods arhitekturalne greške (M1 Mac)

```bash
# Uvek koristi native arm64 za pod install
export LANG=en_US.UTF-8
arch -arm64 pod install
```

#### Release Build: "RNSVGNode.h file not found"

Ako dobijaš grešku `'RNSVGNode.h' file not found` u Release build-u:

```bash
# 1. Reinstaliraj podove (Podfile je ažuriran sa fix-om)
cd apps/mobile-app/ios
rm -rf Pods Podfile.lock
export LANG=en_US.UTF-8
arch -arm64 pod install

# 2. Clean Xcode DerivedData
rm -rf ~/Library/Developer/Xcode/DerivedData/SweatDrop-*

# 3. U Xcode-u: Product → Clean Build Folder (Cmd + Shift + K)

# 4. Pokušaj Release build ponovo
```

**Napomena**: Podfile je ažuriran sa specifičnim Header Search Paths za Release build u monorepo strukturi. Ako problem i dalje postoji, proveri da li je `react-native-svg` instaliran u root `node_modules`.

### Admin Panel Build Problemi

#### "Module not found" greške

```bash
# Reinstaliraj zavisnosti
cd apps/admin-panel
rm -rf node_modules .next
pnpm install
```

#### React version konflikti

```bash
# Proveri verzije
cd apps/admin-panel
pnpm list react react-dom

# Trebalo bi da vidiš React 18.3.1
```

---

## 📝 Važne Napomene

### Monorepo Struktura

- **Root**: `package.json` sa workspace skriptama
- **Mobile App**: `apps/mobile-app/` - Expo/React Native aplikacija
- **Admin Panel**: `apps/admin-panel/` - Next.js aplikacija

### pnpm Konfiguracija

- **`.npmrc`**: `node-linker=hoisted` (za SDK 54+ monorepo podršku)
- **`pnpm-workspace.yaml`**: Definiše workspace strukturu

### iOS Konfiguracija

- **Podfile**: Koristi Node resolve za monorepo putanje (prema Expo dokumentaciji)
- **Skia**: Linkovana kroz Expo autolinking (ne eksplicitno u Podfile)
- **XCFrameworks**: Instalirani kroz `postinstall` hook

---

## 🎯 Quick Reference

### Prvi Put Setup

```bash
# 1. Instaliraj zavisnosti
pnpm install

# 2. iOS build
pnpm ios:build

# 3. Admin panel build
pnpm admin:build
```

### Svakodnevni Rad

```bash
# Mobile app development
pnpm dev:mobile

# Admin panel development
pnpm dev:admin

# iOS build (kada dodaš novu native biblioteku)
pnpm ios:build
```

---

## 📚 Dodatni Resursi

- [Expo Monorepo Guide](https://docs.expo.dev/guides/monorepos/)
- [React Native Skia Documentation](https://shopify.github.io/react-native-skia/)
- [Next.js Documentation](https://nextjs.org/docs)
