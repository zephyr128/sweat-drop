#!/bin/bash
#
# Switch App Icons — SweatDrop
#
# Usage:
#   ./scripts/switch-icons.sh dev    → copies AppIconsDev into assets + native folders
#   ./scripts/switch-icons.sh prod   → copies AppIcons into assets + native folders
#
# Called automatically by run-ios.sh and run-android.sh before prebuild.

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
  echo -e "${RED}❌ Usage: ./scripts/switch-icons.sh [dev|prod]${NC}"
  exit 1
fi

if [[ "$ENV_ARG" == "prod" ]]; then
  ICON_SOURCE="$MOBILE_APP_DIR/AppIcons"
else
  ICON_SOURCE="$MOBILE_APP_DIR/AppIconsDev"
fi

if [ ! -d "$ICON_SOURCE" ]; then
  echo -e "${RED}❌ Icon folder not found: $ICON_SOURCE${NC}"
  exit 1
fi

echo -e "${BLUE}  Switching icons → ${ENV_ARG} ($ICON_SOURCE)${NC}"

# ─── 1. Expo source assets (used by `expo prebuild`) ──────────────────────────
# Copies the 1024px master icon + xcassets into assets/ so that Expo picks them
# up when regenerating native projects.

ASSETS_DIR="$MOBILE_APP_DIR/assets"
XCASSETS_SRC="$ICON_SOURCE/Assets.xcassets"
XCASSETS_DST="$ASSETS_DIR/Assets.xcassets"

if [ -d "$XCASSETS_SRC" ]; then
  rm -rf "$XCASSETS_DST"
  cp -r "$XCASSETS_SRC" "$XCASSETS_DST"
fi

# Copy the 1024px master icon as icon.png (used by Expo for iOS generation)
if [ -f "$ICON_SOURCE/Assets.xcassets/AppIcon.appiconset/1024.png" ]; then
  cp "$ICON_SOURCE/Assets.xcassets/AppIcon.appiconset/1024.png" "$ASSETS_DIR/icon.png"
  echo -e "${GREEN}  ✅ icon.png updated${NC}"
fi

# Copy Play Store / App Store assets if present
[ -f "$ICON_SOURCE/appstore.png" ]  && cp "$ICON_SOURCE/appstore.png"  "$ASSETS_DIR/appstore.png"
[ -f "$ICON_SOURCE/playstore.png" ] && cp "$ICON_SOURCE/playstore.png" "$ASSETS_DIR/playstore.png"

# ─── 2. iOS native xcassets (skipped if ios/ doesn't exist yet) ───────────────
IOS_XCASSETS="$MOBILE_APP_DIR/ios/SweatDrop/Images.xcassets/AppIcon.appiconset"

if [ -d "$IOS_XCASSETS" ]; then
  SRC_APPICONSET="$ICON_SOURCE/Assets.xcassets/AppIcon.appiconset"
  if [ -d "$SRC_APPICONSET" ]; then
    cp "$SRC_APPICONSET"/*.png "$IOS_XCASSETS/" 2>/dev/null || true
    [ -f "$SRC_APPICONSET/Contents.json" ] && cp "$SRC_APPICONSET/Contents.json" "$IOS_XCASSETS/"
    echo -e "${GREEN}  ✅ iOS native xcassets updated${NC}"
  fi
else
  echo -e "${YELLOW}  ⚠️  iOS native folder not found (run prebuild first) — skipping native copy${NC}"
fi

# ─── 3. Android native mipmaps (skipped if android/ doesn't exist yet) ────────
ANDROID_RES="$MOBILE_APP_DIR/android/app/src/main/res"
ANDROID_SRC="$ICON_SOURCE/android"

if [ -d "$ANDROID_RES" ] && [ -d "$ANDROID_SRC" ]; then
  for density in mipmap-mdpi mipmap-hdpi mipmap-xhdpi mipmap-xxhdpi mipmap-xxxhdpi; do
    SRC_DENSITY="$ANDROID_SRC/$density"
    DST_DENSITY="$ANDROID_RES/$density"
    if [ -d "$SRC_DENSITY" ] && [ -d "$DST_DENSITY" ]; then
      # For each .png we're about to copy, remove any same-name .webp to
      # avoid Android's "Duplicate resources" error.
      for png in "$SRC_DENSITY"/*.png; do
        base=$(basename "$png" .png)
        rm -f "$DST_DENSITY/${base}.webp" 2>/dev/null || true
      done
      cp "$SRC_DENSITY"/*.png "$DST_DENSITY/" 2>/dev/null || true
      # Some exported assets can be JPEG data with a .png extension.
      # Normalize copied files to real PNG so AAPT can compile release resources.
      for copied_png in "$DST_DENSITY"/*.png; do
        [ -f "$copied_png" ] || continue
        sips -s format png "$copied_png" --out "$copied_png" >/dev/null 2>&1 || true
      done
    fi
  done
  echo -e "${GREEN}  ✅ Android native mipmaps updated${NC}"
else
  echo -e "${YELLOW}  ⚠️  Android native folder not found (run prebuild first) — skipping native copy${NC}"
fi

echo -e "${GREEN}  Icons switched to: ${ENV_ARG}${NC}"
