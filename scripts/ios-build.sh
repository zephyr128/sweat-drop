#!/bin/bash

# iOS Build Script for SweatDrop Mobile App
# This script handles the complete iOS build workflow for monorepo

set -e

echo "🚀 Starting iOS Build Workflow..."

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the root directory
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MOBILE_APP_DIR="$ROOT_DIR/apps/mobile-app"
IOS_DIR="$MOBILE_APP_DIR/ios"

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

echo -e "${BLUE}🏗️  Step 3: Running Expo prebuild...${NC}"
cd "$ROOT_DIR"
pnpm ios:prebuild

echo -e "${BLUE}📱 Step 4: Installing CocoaPods dependencies...${NC}"
cd "$IOS_DIR"
rm -rf Pods Podfile.lock
export LANG=en_US.UTF-8
arch -arm64 pod install

echo -e "${GREEN}✅ iOS setup complete!${NC}"
echo -e "${YELLOW}📂 Opening Xcode workspace...${NC}"
open "$IOS_DIR/SweatDrop.xcworkspace"

echo -e "${GREEN}🎉 Done! Xcode should now be open.${NC}"
echo -e "${YELLOW}💡 Next steps in Xcode:${NC}"
echo "   1. Select your iPhone or Simulator"
echo "   2. Press Cmd + R to build and run"
echo "   3. For physical device: Configure Signing & Capabilities"
