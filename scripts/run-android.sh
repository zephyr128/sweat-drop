#!/bin/bash
#
# Android Run Script — SweatDrop
#
# Usage:
#   ./scripts/run-android.sh        → dev (default)
#   ./scripts/run-android.sh dev    → dev env (jzyoyxab... supabase)
#   ./scripts/run-android.sh prod   → prod env (production supabase)
#
# What it does:
#   1. Switches .env to dev or prod
#   2. Checks Android SDK / Java / connected devices
#   3. Starts emulator if no device is connected
#   4. Builds and runs the app via expo run:android

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MOBILE_APP_DIR="$ROOT_DIR/apps/mobile-app"

ENV_ARG="${1:-dev}"

if [[ "$ENV_ARG" != "dev" && "$ENV_ARG" != "prod" ]]; then
  echo -e "${RED}❌ Unknown env: '$ENV_ARG'. Use 'dev' or 'prod'.${NC}"
  echo "   Usage: ./scripts/run-android.sh [dev|prod]"
  exit 1
fi

ENV_SOURCE="$MOBILE_APP_DIR/.env.${ENV_ARG}.local"
ENV_TARGET="$MOBILE_APP_DIR/.env"

if [ ! -f "$ENV_SOURCE" ]; then
  echo -e "${RED}❌ Missing env file: apps/mobile-app/.env.${ENV_ARG}.local${NC}"
  echo -e "${YELLOW}   Create it from: apps/mobile-app/.env.${ENV_ARG}.example${NC}"
  exit 1
fi

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  SweatDrop Android — env: ${ENV_ARG}${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Step 0 — Switch env
echo -e "\n${BLUE}[0/4] Switching to ${ENV_ARG} env...${NC}"
cp "$ENV_SOURCE" "$ENV_TARGET"
APP_ENV=$(grep 'EXPO_PUBLIC_APP_ENV' "$ENV_TARGET" | cut -d'=' -f2 | tr -d '[:space:]')
SUPABASE_URL=$(grep 'EXPO_PUBLIC_SUPABASE_URL' "$ENV_TARGET" | cut -d'=' -f2 | tr -d '[:space:]')
echo -e "${GREEN}✅ Env: ${APP_ENV} → ${SUPABASE_URL}${NC}"

# Step 0.5 — Switch icons
echo -e "\n${BLUE}[0/4] Switching app icons to ${ENV_ARG}...${NC}"
"$ROOT_DIR/scripts/switch-icons.sh" "$ENV_ARG"

# Step 1 — Check prerequisites
echo -e "\n${BLUE}[1/4] Checking prerequisites...${NC}"

if [ -z "$ANDROID_HOME" ]; then
  echo -e "${RED}❌ ANDROID_HOME is not set${NC}"
  echo -e "${YELLOW}   Add to your shell profile (~/.zshrc):${NC}"
  echo "     export ANDROID_HOME=\$HOME/Library/Android/sdk"
  echo "     export PATH=\$PATH:\$ANDROID_HOME/emulator:\$ANDROID_HOME/platform-tools"
  exit 1
fi
echo -e "${GREEN}✅ Android SDK: $ANDROID_HOME${NC}"

if ! command -v adb &> /dev/null; then
  echo -e "${RED}❌ adb not found — add \$ANDROID_HOME/platform-tools to PATH${NC}"
  exit 1
fi

# Resolve JAVA_HOME to a JDK 17+ (required by Gradle 8+)
# Priority: existing JAVA_HOME → Homebrew openjdk@17 → Android Studio JBR → system default
if [ -n "$JAVA_HOME" ] && "$JAVA_HOME/bin/java" -version 2>&1 | head -1 | grep -qE '"(1[7-9]|[2-9][0-9])'; then
  : # existing JAVA_HOME is 17+, keep it
elif [ -x "/opt/homebrew/opt/openjdk@17/bin/java" ]; then
  export JAVA_HOME="/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"
elif [ -x "/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/java" ]; then
  export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
elif ! command -v java &> /dev/null; then
  echo -e "${RED}❌ Java not found${NC}"
  echo -e "${YELLOW}   brew install openjdk@17${NC}"
  exit 1
fi

JAVA_VERSION=$("${JAVA_HOME:-/usr}/bin/java" -version 2>&1 | head -n 1 | cut -d'"' -f2 | cut -d'.' -f1)
if [ "$JAVA_VERSION" -lt 17 ]; then
  echo -e "${RED}❌ Java 17+ required (found Java $JAVA_VERSION)${NC}"
  echo -e "${YELLOW}   brew install openjdk@17${NC}"
  echo -e "${YELLOW}   Or use Android Studio JDK:${NC}"
  echo "     export JAVA_HOME=\"/Applications/Android Studio.app/Contents/jbr/Contents/Home\""
  exit 1
fi
echo -e "${GREEN}✅ Java $JAVA_VERSION — JAVA_HOME=$JAVA_HOME${NC}"

# Step 2 — Install dependencies
echo -e "\n${BLUE}[2/4] Installing dependencies...${NC}"
cd "$ROOT_DIR"
pnpm install

if [ ! -e "$ROOT_DIR/assets" ]; then
  ln -s apps/mobile-app/assets "$ROOT_DIR/assets"
  echo -e "${GREEN}✅ Assets symlink created${NC}"
fi

# Step 3 — Check / start device
echo -e "\n${BLUE}[3/4] Checking for connected devices...${NC}"
DEVICES=$(adb devices | awk 'NR>1 && $2=="device" {count++} END {print count+0}')

if [ "$DEVICES" -eq 0 ]; then
  echo -e "${YELLOW}⚠️  No devices connected — starting emulator...${NC}"

  EMULATORS=$(emulator -list-avds 2>/dev/null)
  if [ -z "$EMULATORS" ]; then
    echo -e "${RED}❌ No emulators found${NC}"
    echo -e "${YELLOW}   Create one in Android Studio → Tools → Device Manager${NC}"
    exit 1
  fi

  FIRST_EMULATOR=$(echo "$EMULATORS" | head -n 1)
  echo -e "${BLUE}   Starting: $FIRST_EMULATOR${NC}"
  emulator -avd "$FIRST_EMULATOR" &

  adb wait-for-device
  while [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" != "1" ]; do
    echo -e "${YELLOW}   Booting...${NC}"
    sleep 2
  done
  echo -e "${GREEN}✅ Emulator ready${NC}"
else
  echo -e "${GREEN}✅ Found $DEVICES device(s)${NC}"
  adb devices | grep "device$"
fi

# Step 4 — Build and run
echo -e "\n${BLUE}[4/4] Building and running...${NC}"
cd "$ROOT_DIR"
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"

NODE_BIN=$(which node 2>/dev/null || echo "/usr/local/bin/node")
export NODE_BINARY="$NODE_BIN"
echo -e "${GREEN}✅ NODE_BINARY=$NODE_BIN${NC}"

# Expo's autolinking Kotlin plugin calls bare "node" via Gradle's providers.exec.
# A long-running Gradle daemon may have been started with a PATH that doesn't
# include node (e.g. from Android Studio). Stop any stale daemon so a fresh one
# inherits our current PATH.
GRADLEW="$MOBILE_APP_DIR/android/gradlew"
if [ -x "$GRADLEW" ]; then
  "$GRADLEW" --stop >/dev/null 2>&1 || true
fi

pnpm --filter sweatdrop-mobile-app android

echo -e "\n${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Done!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}  Useful commands:${NC}"
echo "    View logs:  adb logcat | grep ReactNative"
echo "    Dev menu:   adb shell input keyevent 82"
echo "    Clear data: adb shell pm clear com.sweatdrop.app"
