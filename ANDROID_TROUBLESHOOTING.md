# Android Troubleshooting Guide

Brzi vodič za rešavanje najčešćih problema sa Android build-om.

## 🔴 Kritični Problemi

### 1. "Java 17 or later required (found Java 11)"

**Problem:** Android Gradle plugin zahteva Java 17+, a koristiš stariju verziju.

**Rešenje:**

```bash
# Instaliraj Java 17
brew install openjdk@17

# Dodaj u ~/.zshrc
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
export PATH=$JAVA_HOME/bin:$PATH

# Učitaj promene
source ~/.zshrc

# Proveri
java -version
# Trebalo bi: openjdk version "17.x.x"
```

**Alternativa - koristi Android Studio JDK:**

```bash
# Dodaj u ~/.zshrc
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export PATH=$JAVA_HOME/bin:$PATH

source ~/.zshrc
```

---

### 2. "ANDROID_HOME is not set"

**Problem:** Android SDK path nije konfigurisan.

**Rešenje:**

```bash
# Dodaj u ~/.zshrc
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools

# Učitaj promene
source ~/.zshrc

# Proveri
echo $ANDROID_HOME
# Trebalo bi: /Users/your-username/Library/Android/sdk
```

---

### 3. "adb command not found"

**Problem:** Android platform-tools nisu u PATH-u.

**Rešenje:**

```bash
# Dodaj u ~/.zshrc
export PATH=$PATH:$ANDROID_HOME/platform-tools

source ~/.zshrc

# Proveri
adb --version
```

---

### 4. "No Android emulators found"

**Problem:** Nemaš kreiran Android Virtual Device (AVD).

**Rešenje:**

1. Otvori Android Studio
2. Idi na **Tools > Device Manager**
3. Klikni **Create Device**
4. Izaberi uređaj (npr. **Pixel 6**)
5. Izaberi system image (npr. **Android 13 - Tiramisu**)
6. Klikni **Finish**

**Proveri iz terminala:**

```bash
emulator -list-avds
# Trebalo bi da prikaže listu kreiranih AVD-ova
```

---

### 4.5. "A problem occurred starting process 'command 'node'"

**Problem:** Gradle ne može da pronađe `node` komandu.

**Rešenje 1: Proveri da li je node u PATH-u**

```bash
which node
node --version
```

**Rešenje 2: Eksplicitno postavi PATH**

Skripte `android:run` i `android:dev` automatski postavljaju PATH, ali ako pokrećeš direktno:

```bash
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
pnpm android
```

**Rešenje 3: Dodaj u gradle.properties**

Dodaj u `apps/mobile-app/android/gradle.properties`:

```properties
# Node.js path
systemProp.org.gradle.project.nodeExecutable=/usr/local/bin/node
```

**Rešenje 4: Očisti Gradle cache**

```bash
cd apps/mobile-app/android
./gradlew clean --refresh-dependencies
cd ../../..
pnpm android:run
```

---

## ⚠️ Build Problemi

### 5. "BUILD FAILED" - Gradle greška

**Rešenje 1: Očisti Gradle cache**

```bash
cd apps/mobile-app/android
./gradlew clean
cd ../../..
pnpm android:run
```

**Rešenje 2: Očisti sve i reinstaliraj**

```bash
./clean-install.sh
pnpm android:run
```

---

### 6. Metro Bundler greška

**Problem:** Metro bundler cache je korumpiran.

**Rešenje:**

```bash
cd apps/mobile-app
npx expo start -c
```

Ili direktno:

```bash
rm -rf apps/mobile-app/.expo
rm -rf apps/mobile-app/node_modules/.cache
pnpm android:dev
```

---

### 7. "Could not connect to development server"

**Problem:** Metro bundler nije pokrenut ili emulator ne može da se poveže.

**Rešenje:**

```bash
# Proveri da li je Metro pokrenut
# Trebalo bi da vidiš "Metro waiting on..."

# Ako nije, pokreni ga
cd apps/mobile-app
npx expo start

# U drugom terminalu
pnpm android
```

**Alternativa - reverse port:**

```bash
adb reverse tcp:8081 tcp:8081
```

---

## 🔧 Emulator Problemi

### 8. Emulator se ne pokreće

**Rešenje 1: Proveri da li je već pokrenut**

```bash
adb devices
# Ako vidiš "emulator-5554 device", emulator je već pokrenut
```

**Rešenje 2: Pokreni ručno**

```bash
# Lista AVD-ova
emulator -list-avds

# Pokreni specifičan AVD
emulator -avd Pixel_6_API_33
```

**Rešenje 3: Restartuj adb**

```bash
adb kill-server
adb start-server
```

---

### 9. Emulator je spor

**Rešenje:**

1. Otvori Android Studio
2. Tools > Device Manager
3. Edit AVD
4. Advanced Settings
5. Povećaj **RAM** (npr. 4096 MB)
6. Povećaj **VM heap** (npr. 512 MB)
7. Omogući **Hardware acceleration**

---

## 📱 App Problemi

### 10. App se ne učitava / beli ekran

**Rešenje:**

```bash
# Očisti app data
adb shell pm clear com.sweatdrop

# Reinstaliraj app
pnpm android:run
```

---

### 11. "Unable to load script" greška

**Rešenje:**

```bash
# Restartuj Metro bundler
cd apps/mobile-app
npx expo start -c

# U drugom terminalu
pnpm android
```

---

### 12. Hot reload ne radi

**Rešenje:**

```bash
# Otvori dev menu
adb shell input keyevent 82

# Izaberi "Enable Fast Refresh"
```

---

## 🔍 Debugging

### Prikaži logove

```bash
# Svi logovi
adb logcat

# Samo React Native logovi
adb logcat | grep ReactNative

# Samo greške
adb logcat *:E
```

### Otvori Dev Menu

```bash
adb shell input keyevent 82
```

### Reload App

```bash
adb shell input text "RR"
```

### Prikaži instaliran app

```bash
adb shell pm list packages | grep sweatdrop
```

### Deinstaliraj app

```bash
adb uninstall com.sweatdrop
```

---

## 🧹 Cleanup Komande

### Potpuno čišćenje

```bash
# Očisti sve
./clean-install.sh

# Ili ručno:
rm -rf node_modules
rm -rf apps/mobile-app/node_modules
rm -rf apps/mobile-app/.expo
rm -rf apps/mobile-app/android/build
rm -rf apps/mobile-app/android/app/build

pnpm install
pnpm android:run
```

### Očisti samo Android build

```bash
cd apps/mobile-app/android
./gradlew clean
cd ../../..
```

### Očisti Metro cache

```bash
cd apps/mobile-app
npx expo start -c
```

---

## ✅ Provera Setup-a

Koristi ovu komandu da proveriš da li je sve podešeno:

```bash
echo "=== Java ==="
java -version
echo ""
echo "=== JAVA_HOME ==="
echo $JAVA_HOME
echo ""
echo "=== Android SDK ==="
echo $ANDROID_HOME
echo ""
echo "=== adb ==="
adb --version
echo ""
echo "=== Emulators ==="
emulator -list-avds
echo ""
echo "=== Connected Devices ==="
adb devices
```

Sačuvaj ovu komandu kao alias u `~/.zshrc`:

```bash
alias android-check="echo '=== Java ===' && java -version && echo '' && echo '=== JAVA_HOME ===' && echo \$JAVA_HOME && echo '' && echo '=== Android SDK ===' && echo \$ANDROID_HOME && echo '' && echo '=== adb ===' && adb --version && echo '' && echo '=== Emulators ===' && emulator -list-avds && echo '' && echo '=== Connected Devices ===' && adb devices"
```

---

## 📚 Dodatni Resursi

- [ANDROID_SETUP.md](./ANDROID_SETUP.md) - Kompletan setup guide
- [QUICKSTART.md](./QUICKSTART.md) - Brzi start
- [SCRIPTS.md](./SCRIPTS.md) - Sve dostupne komande
- `pnpm android:help` - Brzi pregled komandi

---

## 💡 Pro Tips

1. **Kreiraj aliase za često korišćene komande:**

```bash
# Dodaj u ~/.zshrc
alias android-dev="cd ~/Projects/sweatdrop && pnpm android:dev"
alias android-logs="adb logcat | grep ReactNative"
alias android-menu="adb shell input keyevent 82"
alias android-reload="adb shell input text 'RR'"
alias android-clear="adb shell pm clear com.sweatdrop"
```

2. **Koristi Android Studio za debugging:**
   - View > Tool Windows > Logcat
   - Filtruj po "ReactNative"

3. **Čuvaj emulator pokrenut:**
   - Ne gasi emulator između sesija
   - Brže pokretanje aplikacije

4. **Koristi `android:dev` za svakodnevni rad:**
   - Brže od `android:run`
   - Preskače instalaciju dependencies

---

**Ako problem i dalje postoji, proveri:**
1. Da li su sve environment variables podešene
2. Da li je Android Studio ažuriran
3. Da li je Expo CLI ažuriran: `npm install -g expo-cli`
4. Da li ima dovoljno prostora na disku
