#!/bin/bash

# Fix iOS App Crash (SIGABRT) - Complete Clean and Rebuild
# This script performs a thorough cleanup and rebuild of iOS dependencies

set -e

echo "🔧 Fixing iOS App Crash (SIGABRT)..."

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Get directories
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MOBILE_APP_DIR="$ROOT_DIR/apps/mobile-app"
IOS_DIR="$MOBILE_APP_DIR/ios"

echo -e "${BLUE}🧹 Step 1: Cleaning Xcode Derived Data...${NC}"
rm -rf ~/Library/Developer/Xcode/DerivedData/* 2>/dev/null || true
echo -e "${GREEN}✅ Derived Data cleaned${NC}"

echo -e "${BLUE}🧹 Step 2: Cleaning iOS build artifacts...${NC}"
cd "$IOS_DIR"
rm -rf Pods Podfile.lock build
rm -rf ~/Library/Caches/CocoaPods 2>/dev/null || true
echo -e "${GREEN}✅ Build artifacts cleaned${NC}"

echo -e "${BLUE}🧹 Step 3: Cleaning node_modules cache...${NC}"
cd "$ROOT_DIR"
rm -rf node_modules/.cache 2>/dev/null || true
rm -rf apps/mobile-app/node_modules/.cache 2>/dev/null || true
echo -e "${GREEN}✅ Node cache cleaned${NC}"

echo -e "${BLUE}📦 Step 4: Reinstalling dependencies...${NC}"
cd "$ROOT_DIR"
pnpm install
echo -e "${GREEN}✅ Dependencies reinstalled${NC}"

echo -e "${BLUE}🔗 Step 5: Ensuring assets symlink exists...${NC}"
if [ ! -e "$ROOT_DIR/assets" ]; then
  echo -e "${YELLOW}Creating assets symlink...${NC}"
  ln -s apps/mobile-app/assets "$ROOT_DIR/assets"
  echo -e "${GREEN}✅ Assets symlink created${NC}"
elif [ ! -L "$ROOT_DIR/assets" ]; then
  echo -e "${YELLOW}⚠️  Warning: assets exists but is not a symlink${NC}"
else
  echo -e "${GREEN}✅ Assets symlink already exists${NC}"
fi

echo -e "${BLUE}🏗️  Step 6: Running Expo prebuild...${NC}"
cd "$ROOT_DIR"
pnpm ios:prebuild || echo -e "${YELLOW}⚠️  Prebuild warning (may be normal)${NC}"

echo -e "${BLUE}📱 Step 7: Installing CocoaPods dependencies...${NC}"
cd "$IOS_DIR"
export LANG=en_US.UTF-8
arch -arm64 pod deintegrate 2>/dev/null || true
arch -arm64 pod install --repo-update

echo -e "${GREEN}✅ CocoaPods dependencies installed${NC}"

echo -e "${BLUE}🔍 Step 8: Verifying react-native-svg installation...${NC}"
if [ -d "$ROOT_DIR/node_modules/react-native-svg" ]; then
  echo -e "${GREEN}✅ react-native-svg found in root node_modules${NC}"
elif [ -d "$MOBILE_APP_DIR/node_modules/react-native-svg" ]; then
  echo -e "${GREEN}✅ react-native-svg found in app node_modules${NC}"
else
  echo -e "${RED}❌ react-native-svg not found!${NC}"
  echo -e "${YELLOW}Installing react-native-svg...${NC}"
  cd "$MOBILE_APP_DIR"
  pnpm add react-native-svg
fi

echo -e "${GREEN}✅ iOS crash fix complete!${NC}"
echo -e "${YELLOW}💡 Next steps:${NC}"
echo "   1. Close Xcode completely"
echo "   2. Open Xcode workspace: $IOS_DIR/SweatDrop.xcworkspace"
echo "   3. In Xcode: Product > Clean Build Folder (Cmd + Shift + K)"
echo "   4. Select your device/simulator"
echo "   5. Build and run (Cmd + R)"
echo ""
echo -e "${YELLOW}📂 Opening Xcode workspace...${NC}"
open "$IOS_DIR/SweatDrop.xcworkspace"
