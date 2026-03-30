#!/bin/bash

# Android Dev Script for SweatDrop Mobile App
# Quick start script for development (assumes dependencies are installed)

set -e

echo "🚀 Starting Android Dev Server..."

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Get the root directory
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MOBILE_APP_DIR="$ROOT_DIR/apps/mobile-app"
MOBILE_ENV_FILE="$MOBILE_APP_DIR/.env"

# Check if Android SDK is installed
if [ -z "$ANDROID_HOME" ]; then
  echo -e "${RED}❌ Error: ANDROID_HOME is not set${NC}"
  echo -e "${YELLOW}💡 Install Android Studio and set ANDROID_HOME in your shell profile${NC}"
  exit 1
fi

# Check if adb is available
if ! command -v adb &> /dev/null; then
  echo -e "${RED}❌ Error: adb command not found${NC}"
  exit 1
fi

# Check Java version
if ! command -v java &> /dev/null; then
  echo -e "${RED}❌ Error: Java not found${NC}"
  echo -e "${YELLOW}💡 Install Java 17: brew install openjdk@17${NC}"
  exit 1
fi

JAVA_VERSION=$(java -version 2>&1 | head -n 1 | cut -d'"' -f2 | cut -d'.' -f1)
if [ "$JAVA_VERSION" -lt 17 ]; then
  echo -e "${RED}❌ Error: Java 17 or later required (found Java $JAVA_VERSION)${NC}"
  echo -e "${YELLOW}💡 Install Java 17: brew install openjdk@17${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Java $JAVA_VERSION found${NC}"

echo -e "${BLUE}🔐 Loading mobile env vars...${NC}"
if [ -f "$MOBILE_ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$MOBILE_ENV_FILE"
  set +a
  echo -e "${GREEN}✅ Loaded env from apps/mobile-app/.env${NC}"
fi

echo -e "${BLUE}📱 Checking for connected Android devices/emulators...${NC}"
DEVICES=$(adb devices | grep -v "List" | grep "device" | wc -l | xargs)

if [ "$DEVICES" -eq 0 ]; then
  echo -e "${YELLOW}⚠️  No Android devices detected${NC}"
  echo -e "${BLUE}🚀 Starting first available emulator...${NC}"
  
  EMULATORS=$(emulator -list-avds)
  if [ -z "$EMULATORS" ]; then
    echo -e "${RED}❌ No emulators found. Create one in Android Studio.${NC}"
    exit 1
  fi
  
  FIRST_EMULATOR=$(echo "$EMULATORS" | head -n 1)
  echo -e "${BLUE}Starting: $FIRST_EMULATOR${NC}"
  emulator -avd "$FIRST_EMULATOR" &
  
  echo -e "${BLUE}⏳ Waiting for device...${NC}"
  adb wait-for-device
  
  while [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" != "1" ]; do
    sleep 2
  done
  
  echo -e "${GREEN}✅ Emulator ready${NC}"
else
  echo -e "${GREEN}✅ Found $DEVICES device(s)${NC}"
fi

echo -e "${BLUE}🏃 Starting Expo dev server with Android...${NC}"
cd "$ROOT_DIR"

# Ensure PATH is available for Gradle
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

pnpm --filter sweatdrop-mobile-app android

echo -e "${GREEN}✅ Done!${NC}"
