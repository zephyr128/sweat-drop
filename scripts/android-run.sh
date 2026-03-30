#!/bin/bash

# Android Run Script for SweatDrop Mobile App
# This script handles the complete Android run workflow for monorepo

set -e

echo "🚀 Starting Android Run Workflow..."

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Get the root directory
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MOBILE_APP_DIR="$ROOT_DIR/apps/mobile-app"
ANDROID_DIR="$MOBILE_APP_DIR/android"
MOBILE_ENV_FILE="$MOBILE_APP_DIR/.env"

# Check if Android SDK is installed
if [ -z "$ANDROID_HOME" ]; then
  echo -e "${RED}❌ Error: ANDROID_HOME is not set${NC}"
  echo -e "${YELLOW}💡 Install Android Studio and set ANDROID_HOME in your shell profile:${NC}"
  echo "   export ANDROID_HOME=\$HOME/Library/Android/sdk"
  echo "   export PATH=\$PATH:\$ANDROID_HOME/emulator"
  echo "   export PATH=\$PATH:\$ANDROID_HOME/platform-tools"
  exit 1
fi

echo -e "${GREEN}✅ Android SDK found at: $ANDROID_HOME${NC}"

# Check if adb is available
if ! command -v adb &> /dev/null; then
  echo -e "${RED}❌ Error: adb command not found${NC}"
  echo -e "${YELLOW}💡 Add Android SDK platform-tools to your PATH${NC}"
  exit 1
fi

# Check Java version
if ! command -v java &> /dev/null; then
  echo -e "${RED}❌ Error: Java not found${NC}"
  echo -e "${YELLOW}💡 Install Java 17 or later:${NC}"
  echo "   brew install openjdk@17"
  exit 1
fi

JAVA_VERSION=$(java -version 2>&1 | head -n 1 | cut -d'"' -f2 | cut -d'.' -f1)
if [ "$JAVA_VERSION" -lt 17 ]; then
  echo -e "${RED}❌ Error: Java 17 or later required (found Java $JAVA_VERSION)${NC}"
  echo -e "${YELLOW}💡 Install Java 17:${NC}"
  echo "   brew install openjdk@17"
  echo "   export JAVA_HOME=\$(/usr/libexec/java_home -v 17)"
  echo ""
  echo -e "${YELLOW}Or use Android Studio's JDK:${NC}"
  echo "   export JAVA_HOME=\"/Applications/Android Studio.app/Contents/jbr/Contents/Home\""
  exit 1
fi

echo -e "${GREEN}✅ Java $JAVA_VERSION found${NC}"

echo -e "${BLUE}🔐 Step 0: Loading mobile env vars...${NC}"
if [ -f "$MOBILE_ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$MOBILE_ENV_FILE"
  set +a
  echo -e "${GREEN}✅ Loaded env from apps/mobile-app/.env${NC}"
else
  echo -e "${YELLOW}⚠️  apps/mobile-app/.env not found — using current shell env${NC}"
fi

echo -e "${BLUE}📦 Step 1: Installing dependencies...${NC}"
cd "$ROOT_DIR"
pnpm install

echo -e "${BLUE}🔗 Step 1.5: Ensuring assets symlink exists...${NC}"
if [ ! -e "$ROOT_DIR/assets" ]; then
  echo -e "${YELLOW}Creating assets symlink...${NC}"
  ln -s apps/mobile-app/assets "$ROOT_DIR/assets"
  echo -e "${GREEN}✅ Assets symlink created${NC}"
elif [ ! -L "$ROOT_DIR/assets" ]; then
  echo -e "${YELLOW}⚠️  Warning: assets exists but is not a symlink${NC}"
else
  echo -e "${GREEN}✅ Assets symlink already exists${NC}"
fi

echo -e "${BLUE}🔧 Step 2: Installing Skia XCFrameworks (if needed)...${NC}"
cd "$MOBILE_APP_DIR"
node $(node --print "require.resolve('@shopify/react-native-skia/scripts/install-skia.mjs')") || true

echo -e "${BLUE}📱 Step 3: Checking for connected Android devices/emulators...${NC}"
DEVICES=$(adb devices | grep -v "List" | grep "device" | wc -l | xargs)

if [ "$DEVICES" -eq 0 ]; then
  echo -e "${YELLOW}⚠️  No Android devices or emulators detected${NC}"
  echo -e "${BLUE}🚀 Starting Android emulator...${NC}"
  
  # List available emulators
  EMULATORS=$(emulator -list-avds)
  
  if [ -z "$EMULATORS" ]; then
    echo -e "${RED}❌ No Android emulators found${NC}"
    echo -e "${YELLOW}💡 Create an emulator in Android Studio:${NC}"
    echo "   1. Open Android Studio"
    echo "   2. Go to Tools > Device Manager"
    echo "   3. Create a new Virtual Device"
    exit 1
  fi
  
  # Get first emulator
  FIRST_EMULATOR=$(echo "$EMULATORS" | head -n 1)
  echo -e "${BLUE}Starting emulator: $FIRST_EMULATOR${NC}"
  emulator -avd "$FIRST_EMULATOR" &
  
  # Wait for emulator to boot
  echo -e "${BLUE}⏳ Waiting for emulator to boot...${NC}"
  adb wait-for-device
  
  # Wait for boot to complete
  while [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" != "1" ]; do
    echo -e "${YELLOW}Still booting...${NC}"
    sleep 2
  done
  
  echo -e "${GREEN}✅ Emulator is ready${NC}"
else
  echo -e "${GREEN}✅ Found $DEVICES Android device(s)/emulator(s)${NC}"
  adb devices
fi

echo -e "${BLUE}🏗️  Step 4: Building and running Android app...${NC}"
cd "$ROOT_DIR"

# Ensure PATH is available for Gradle
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

# Run expo run:android
pnpm --filter sweatdrop-mobile-app android

echo -e "${GREEN}✅ Android app should now be running!${NC}"
echo -e "${YELLOW}💡 Useful commands:${NC}"
echo "   - View logs: adb logcat | grep ReactNative"
echo "   - Reload app: adb shell input keyevent 82 (opens dev menu)"
echo "   - Clear app data: adb shell pm clear com.sweatdrop"
