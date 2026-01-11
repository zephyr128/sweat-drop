# Building Standalone iOS App (Bez Expo Servera)

## Problem

Kada pokrećeš aplikaciju iz Xcode-a, ona traži Expo server jer koristi **development build** koji i dalje koristi Metro bundler za JavaScript.

## Rešenje: Production Build

Za standalone aplikaciju koja radi **bez Expo servera**, treba da build-uješ **Release** verziju umesto Debug.

## Metoda 1: Build Release Scheme u Xcode-u

### Koraci:

1. **Otvori Xcode:**
   ```bash
   cd apps/mobile-app
   open ios/SweatDrop.xcworkspace
   ```

2. **Izaberi Release Scheme:**
   - Na vrhu Xcode-a, klikni na **scheme selector** (pored device selector-a)
   - Izaberi **"Edit Scheme..."**
   - U **"Run"** sekciji, promeni **Build Configuration** sa **Debug** na **Release**
   - Klikni **Close**

3. **Build i Run:**
   - Izaberi svoj iPhone u device selector-u
   - Klikni **Play** (▶️) ili `Cmd + R`
   - Xcode će build-ovati **Release** verziju koja **ne zahteva Metro bundler**

## Metoda 2: Build Release iz Command Line

```bash
cd apps/mobile-app

# Build Release verziju
npx expo run:ios --configuration Release --device
```

## Metoda 3: EAS Build za Production (Preporučeno za TestFlight/App Store)

Za pravi production build za distribuciju:

1. **Instaliraj EAS CLI:**
   ```bash
   npm install -g eas-cli
   ```

2. **Login:**
   ```bash
   eas login
   ```

3. **Konfiguriši EAS:**
   ```bash
   eas build:configure
   ```

4. **Build za iOS:**
   ```bash
   eas build --platform ios --profile production
   ```

## Razlika: Debug vs Release

### Debug Build (Trenutno)
- ✅ Brz build
- ✅ Hot reload / Fast refresh
- ✅ Debugging podrška
- ❌ Zahteva Metro bundler (Expo server)
- ❌ Ne može da se distribuira

### Release Build
- ✅ Standalone aplikacija (radi bez servera)
- ✅ Optimizovana performanse
- ✅ Može se distribuirati (TestFlight, App Store)
- ❌ Sporiji build
- ❌ Nema hot reload

## Napomena

Za **lokalni testing** na uređaju, **Release build u Xcode-u** je najbrži način. Aplikacija će raditi standalone bez potrebe za Expo serverom!

## Troubleshooting

### "No bundle URL present"
- Problem: Pokušavaš da pokreneš Debug build bez Metro bundlera
- Rešenje: Koristi Release build (Metoda 1 ili 2)

### "Could not connect to development server"
- Problem: Debug build pokušava da se poveže sa Metro bundlerom
- Rešenje: Build-uj Release verziju
