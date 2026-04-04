#!/bin/bash
#
# iOS Run Script — SweatDrop
#
# Usage:
#   ./scripts/run-ios.sh        → dev (default)
#   ./scripts/run-ios.sh dev    → dev env (jzyoyxab... supabase)
#   ./scripts/run-ios.sh prod   → prod env (production supabase)
#
# What it does:
#   1. Switches .env to dev or prod
#   2. Runs expo prebuild (regenerates native iOS files)
#   3. Installs CocoaPods
#   4. Opens Xcode — press Cmd+R to build & run on device/simulator

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MOBILE_APP_DIR="$ROOT_DIR/apps/mobile-app"
IOS_DIR="$MOBILE_APP_DIR/ios"

ENV_ARG="${1:-dev}"

if [[ "$ENV_ARG" != "dev" && "$ENV_ARG" != "prod" ]]; then
  echo -e "${RED}❌ Unknown env: '$ENV_ARG'. Use 'dev' or 'prod'.${NC}"
  echo "   Usage: ./scripts/run-ios.sh [dev|prod]"
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
echo -e "${BLUE}  SweatDrop iOS — env: ${ENV_ARG}${NC}"
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

# Step 1 — Install dependencies
echo -e "\n${BLUE}[1/4] Installing dependencies...${NC}"
cd "$ROOT_DIR"
pnpm install

# Step 1.5 — Assets symlink
if [ ! -e "$ROOT_DIR/assets" ]; then
  ln -s apps/mobile-app/assets "$ROOT_DIR/assets"
  echo -e "${GREEN}✅ Assets symlink created${NC}"
fi

# Step 2 — Skia XCFrameworks
echo -e "\n${BLUE}[2/4] Installing Skia XCFrameworks (if needed)...${NC}"
cd "$MOBILE_APP_DIR"
node "$(node --print "require.resolve('@shopify/react-native-skia/scripts/install-skia.mjs')")" || true

# Step 3 — Expo prebuild
echo -e "\n${BLUE}[3/4] Running expo prebuild...${NC}"
cd "$ROOT_DIR"
pnpm --filter sweatdrop-mobile-app exec expo prebuild --platform ios --clean

# Step 3.5 — Restore ci_scripts and signing config (expo prebuild --clean wipes ios/)
echo -e "\n${BLUE}[3/4] Restoring ci_scripts and signing config after prebuild...${NC}"

# Restore ci_scripts
mkdir -p "$IOS_DIR/ci_scripts"
for script in ci_post_clone.sh ci_pre_xcodebuild.sh; do
  if [ ! -f "$IOS_DIR/ci_scripts/$script" ]; then
    git -C "$ROOT_DIR" checkout -- "apps/mobile-app/ios/ci_scripts/$script" 2>/dev/null || \
      echo -e "${YELLOW}⚠️  Could not restore $script — commit it first${NC}"
  fi
done
chmod +x "$IOS_DIR/ci_scripts/"*.sh 2>/dev/null || true
echo -e "${GREEN}✅ ci_scripts restored${NC}"

# Patch CODE_SIGN_STYLE = Automatic into project.pbxproj (expo prebuild omits this,
# causing xcodebuild -exportArchive to fail with exit code 70 on Xcode Cloud)
PBXPROJ="$IOS_DIR/SweatDrop.xcodeproj/project.pbxproj"
if ! grep -q "CODE_SIGN_STYLE" "$PBXPROJ"; then
  sed -i '' 's/CODE_SIGN_ENTITLEMENTS = SweatDrop\/SweatDrop.entitlements;/CODE_SIGN_ENTITLEMENTS = SweatDrop\/SweatDrop.entitlements;\n\t\t\t\tCODE_SIGN_STYLE = Automatic;/g' "$PBXPROJ"
  echo -e "${GREEN}✅ CODE_SIGN_STYLE = Automatic patched into project.pbxproj${NC}"
else
  echo -e "${GREEN}✅ CODE_SIGN_STYLE already present in project.pbxproj${NC}"
fi

# Patch aps-environment = development for local dev builds
# (app.config.js sets production for CI; locally we need development to install on device)
ENTITLEMENTS="$IOS_DIR/SweatDrop/SweatDrop.entitlements"
if [ -f "$ENTITLEMENTS" ]; then
  sed -i '' 's|<string>production</string>|<string>development</string>|g' "$ENTITLEMENTS"
  echo -e "${GREEN}✅ aps-environment set to development for local build${NC}"
fi

# Step 4 — CocoaPods
echo -e "\n${BLUE}[4/4] Installing CocoaPods...${NC}"
cd "$IOS_DIR"
export LANG=en_US.UTF-8
arch -arm64 pod install

echo -e "\n${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Done! Opening Xcode...${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}  Next steps:${NC}"
echo "    1. Select your iPhone or Simulator in Xcode"
echo "    2. Press Cmd+R to build and run"
echo ""

open "$IOS_DIR/SweatDrop.xcworkspace"
