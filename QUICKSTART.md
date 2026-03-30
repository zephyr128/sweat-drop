# SweatDrop Quick Start

## 🚀 Brzo pokretanje

### Android

```bash
# Setup environment (samo prvi put)
pnpm android:setup
source ~/.zshrc

# Prvi put
pnpm android:run

# Svakodnevno
pnpm android:dev
```

### iOS

```bash
# Prvi put
pnpm ios:build

# Svakodnevno
pnpm ios
```

### Admin Panel

```bash
pnpm dev:admin
```

## 📋 Preduslovi

### Android
- Java 17 ili novija verzija
- Android Studio instaliran
- `ANDROID_HOME` environment variable postavljena
- AVD (Android Virtual Device) kreiran

**Setup:**
```bash
# Java 17+
brew install openjdk@17
export JAVA_HOME=$(/usr/libexec/java_home -v 17)

# Android SDK
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools
export PATH=$PATH:$ANDROID_HOME/emulator
```

### iOS
- Xcode instaliran
- CocoaPods instaliran (`sudo gem install cocoapods`)

### Oba
- Node.js >= 18.0.0
- pnpm >= 10.0.0

## 🔧 Korisne komande

### Android Debug

```bash
# Prikaži logove
adb logcat | grep ReactNative

# Otvori dev menu
adb shell input keyevent 82

# Prikaži uređaje
adb devices

# Očisti app data
adb shell pm clear com.sweatdrop
```

### Metro Bundler

```bash
# Očisti cache
cd apps/mobile-app
npx expo start -c
```

### Supabase

```bash
cd backend

# Pokreni lokalni Supabase
supabase start

# Resetuj bazu
supabase db reset

# Primeni migracije
supabase db push

# Generiši tipove
supabase gen types typescript --local > ../types/database.types.ts
```

## 🐛 Troubleshooting

### "Java 17 or later required"
```bash
brew install openjdk@17
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
source ~/.zshrc
java -version
```

### "ANDROID_HOME is not set"
```bash
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools
source ~/.zshrc
```

### "No emulators found"
Kreiraj u Android Studio: Tools > Device Manager > Create Device

### Build greška
```bash
./clean-install.sh
pnpm android:run
```

### Metro bundler greška
```bash
cd apps/mobile-app
npx expo start -c
```

## 📚 Detaljnija dokumentacija

- [ANDROID_SETUP.md](./ANDROID_SETUP.md) - Kompletan Android setup
- [SCRIPTS.md](./SCRIPTS.md) - Sve dostupne skripte
- [README.md](./README.md) - Opšti pregled projekta
- [BUILD_INSTRUCTIONS.md](./BUILD_INSTRUCTIONS.md) - Build instrukcije

## 💡 Tips

- Koristi `pnpm android:dev` za brzo pokretanje nakon što je sve podešeno
- Dodaj Android SDK u PATH za lakše korišćenje `adb` komandi
- Koristi `adb logcat | grep ReactNative` za filtriranje logova
- Kreiraj alias u `.zshrc` za često korišćene komande:

```bash
alias android-dev="cd ~/Projects/sweatdrop && pnpm android:dev"
alias android-logs="adb logcat | grep ReactNative"
alias android-menu="adb shell input keyevent 82"
```
