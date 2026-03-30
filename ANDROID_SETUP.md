# Android Setup & Run Guide

Ovaj dokument objašnjava kako pokrenuti SweatDrop mobilnu aplikaciju na Android uređaju ili emulatoru.

## Preduslovi

### 1. Instaliraj Android Studio

Preuzmi i instaliraj [Android Studio](https://developer.android.com/studio).

### 2. Podesi Android SDK

Nakon instalacije Android Studio:

1. Otvori Android Studio
2. Idi na **Settings** (ili **Preferences** na macOS)
3. Navigiraj na **Appearance & Behavior > System Settings > Android SDK**
4. Instaliraj:
   - **Android SDK Platform** (najnovija verzija)
   - **Android SDK Build-Tools**
   - **Android SDK Platform-Tools**
   - **Android Emulator**

### 3. Instaliraj Java 17

Android Gradle plugin zahteva Java 17 ili noviju verziju.

**Koristi Homebrew (preporučeno):**

```bash
# Instaliraj Java 17
brew install openjdk@17

# Proveri verziju
java -version
# Trebalo bi da prikaže: openjdk version "17.x.x"
```

**Alternativa - koristi Android Studio JDK:**

Android Studio dolazi sa JDK 17. Možeš ga koristiti umesto instaliranja posebnog JDK-a.

### 4. Podesi Environment Variables

**Automatski setup (preporučeno):**

```bash
pnpm android:setup
source ~/.zshrc
```

Ova skripta će automatski dodati sve potrebne environment variables u tvoj shell profile.

**Ručni setup (alternativa):**

Dodaj sledeće u svoj shell profile (`~/.zshrc`, `~/.bashrc`, ili `~/.bash_profile`):

```bash
# Java - Use Android Studio JDK
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export PATH="$JAVA_HOME/bin:$PATH"

# Android SDK
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools
export PATH=$PATH:$ANDROID_HOME/tools
export PATH=$PATH:$ANDROID_HOME/tools/bin
```

Nakon toga, učitaj promene:

```bash
source ~/.zshrc  # ili ~/.bashrc
```

### 4. Kreiraj Android Virtual Device (AVD)

1. Otvori Android Studio
2. Idi na **Tools > Device Manager**
3. Klikni **Create Device**
4. Izaberi uređaj (npr. Pixel 6)
5. Izaberi system image (npr. Android 13 - Tiramisu)
6. Završi setup

### 7. Proveri sve preduslove

```bash
# Proveri sve odjednom
echo "ANDROID_HOME: $ANDROID_HOME"
echo "JAVA_HOME: $JAVA_HOME"
java -version
adb --version
emulator -list-avds
```

## Pokretanje Aplikacije

### Opcija 1: Kompletan Setup i Run (Prvi put)

Ova skripta instalira sve dependencies i pokreće aplikaciju:

```bash
pnpm android:run
```

Ovo će:
- ✅ Instalirati sve pnpm dependencies
- ✅ Kreirati assets symlink
- ✅ Instalirati Skia XCFrameworks
- ✅ Proveriti za Android uređaje/emulatore
- ✅ Pokrenuti emulator ako nije pokrenut
- ✅ Buildovati i pokrenuti aplikaciju

### Opcija 2: Brzo Pokretanje (Dev Mode)

Ako su već instalirani dependencies, koristi brzu verziju:

```bash
pnpm android:dev
```

Ovo će:
- ✅ Učitati environment variables
- ✅ Proveriti za uređaje
- ✅ Pokrenuti emulator ako treba
- ✅ Pokrenuti Expo dev server

### Opcija 3: Direktno Pokretanje (Bez Skripte)

Ako želiš da pokreneš direktno bez dodatnih provera:

```bash
pnpm android
```

## Troubleshooting

### Problem: "Java 17 or later required"

**Rešenje:**
Instaliraj Java 17:

```bash
# Koristi Homebrew
brew install openjdk@17

# Dodaj u ~/.zshrc
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
export PATH=$JAVA_HOME/bin:$PATH

# Učitaj promene
source ~/.zshrc

# Proveri
java -version
```

**Alternativa - koristi Android Studio JDK:**

```bash
# Dodaj u ~/.zshrc
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export PATH=$JAVA_HOME/bin:$PATH

# Učitaj promene
source ~/.zshrc
```

### Problem: "ANDROID_HOME is not set"

**Rešenje:**
Dodaj Android SDK path u svoj shell profile:

```bash
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools
```

Zatim:
```bash
source ~/.zshrc
```

### Problem: "adb command not found"

**Rešenje:**
Dodaj platform-tools u PATH:

```bash
export PATH=$PATH:$ANDROID_HOME/platform-tools
```

### Problem: "No Android emulators found"

**Rešenje:**
Kreiraj AVD u Android Studio:
1. Tools > Device Manager
2. Create Device
3. Izaberi uređaj i system image

### Problem: Emulator se ne pokreće

**Rešenje:**
Proveri da li je emulator već pokrenut:

```bash
adb devices
```

Ako vidiš uređaj sa statusom "device", emulator je već pokrenut.

### Problem: Build greška

**Rešenje:**
Očisti build cache:

```bash
cd apps/mobile-app/android
./gradlew clean
cd ../../..
pnpm android:run
```

### Problem: Metro bundler greška

**Rešenje:**
Očisti Metro cache:

```bash
cd apps/mobile-app
npx expo start -c
```

## Korisne Komande

### Prikaži logove

```bash
adb logcat | grep ReactNative
```

### Otvori Dev Menu na emulatoru

```bash
adb shell input keyevent 82
```

### Očisti app data

```bash
adb shell pm clear com.sweatdrop
```

### Instaliraj APK na uređaj

```bash
adb install path/to/app.apk
```

### Prikaži povezane uređaje

```bash
adb devices
```

### Restartuj adb server

```bash
adb kill-server
adb start-server
```

## Struktura Skripti

- **`scripts/android-run.sh`** - Kompletan setup i pokretanje (za prvi put)
- **`scripts/android-dev.sh`** - Brzo pokretanje za development

## Environment Variables

Aplikacija koristi `.env` fajl u `apps/mobile-app/.env`. Sve varijable moraju imati `EXPO_PUBLIC_` prefix:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## Dodatne Informacije

- **Expo dokumentacija:** https://docs.expo.dev/
- **React Native dokumentacija:** https://reactnative.dev/
- **Android Studio dokumentacija:** https://developer.android.com/studio/intro

## Podrška

Ako imaš problema sa pokretanjem aplikacije:
1. Proveri da li su svi preduslovi ispunjeni
2. Pogledaj [ANDROID_TROUBLESHOOTING.md](./ANDROID_TROUBLESHOOTING.md) za detaljno rešavanje problema
3. Pogledaj Troubleshooting sekciju iznad
4. Proveri Expo i React Native dokumentaciju
