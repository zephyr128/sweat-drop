#!/usr/bin/env bash
# build-android-release.sh
# Builds a release AAB with optional env selection and versionCode bump.
#
# Usage:
#   ./scripts/build-android-release.sh                  # interactive env picker
#   ./scripts/build-android-release.sh --env prod        # production
#   ./scripts/build-android-release.sh --env dev         # development
#   ./scripts/build-android-release.sh --env prod --no-bump

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_CONFIG="$APP_DIR/app.config.js"
BUILD_GRADLE="$APP_DIR/android/app/build.gradle"
OUTPUT_DIR="$APP_DIR/android/app/build/outputs/bundle/release"

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'
BOLD='\033[1m'; NC='\033[0m'
info()    { echo -e "${CYAN}[build]${NC} $*"; }
success() { echo -e "${GREEN}[build]${NC} $*"; }
warn()    { echo -e "${YELLOW}[build]${NC} $*"; }
error()   { echo -e "${RED}[build]${NC} $*"; exit 1; }

# ── Parse args ────────────────────────────────────────────────────────────────
ENV_NAME=""
NO_BUMP=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)   ENV_NAME="$2"; shift 2 ;;
    --no-bump) NO_BUMP=true; shift ;;
    *) shift ;;
  esac
done

# ── Interactive env picker (if not passed via --env) ──────────────────────────
if [[ -z "$ENV_NAME" ]]; then
  echo ""
  echo -e "${BOLD}Select build environment:${NC}"
  echo "  1) production  (.env.prod.local  →  prod Supabase)"
  echo "  2) development (.env.dev.local   →  dev Supabase)"
  echo ""
  read -rp "Enter 1 or 2: " CHOICE
  case "$CHOICE" in
    1) ENV_NAME="prod" ;;
    2) ENV_NAME="dev" ;;
    *) error "Invalid choice. Use 1 or 2." ;;
  esac
fi

# ── Resolve env file ──────────────────────────────────────────────────────────
case "$ENV_NAME" in
  prod|production) ENV_FILE="$APP_DIR/.env.prod.local" ; LABEL="PRODUCTION" ;;
  dev|development) ENV_FILE="$APP_DIR/.env.dev.local"  ; LABEL="DEVELOPMENT" ;;
  *) error "Unknown env '$ENV_NAME'. Use: prod | dev" ;;
esac

[[ -f "$ENV_FILE" ]] || error "Env file not found: $ENV_FILE"

echo ""
info "Environment : ${BOLD}$LABEL${NC}"
info "Env file    : $ENV_FILE"

# ── Read current versionCode ──────────────────────────────────────────────────
CURRENT_CODE=$(grep -E 'versionCode: [0-9]+' "$APP_CONFIG" | grep -oE '[0-9]+' | head -1)
[[ -n "$CURRENT_CODE" ]] || error "Could not read versionCode from app.config.js"

if $NO_BUMP; then
  NEW_CODE=$CURRENT_CODE
  warn "Skipping version bump — keeping versionCode $NEW_CODE"
else
  NEW_CODE=$((CURRENT_CODE + 1))
  info "versionCode : $CURRENT_CODE → ${BOLD}$NEW_CODE${NC}"

  sed -i '' "s/versionCode: $CURRENT_CODE/versionCode: $NEW_CODE/" "$APP_CONFIG"
  sed -i '' "s/versionCode $CURRENT_CODE/versionCode $NEW_CODE/" "$BUILD_GRADLE"
  success "Bumped versionCode in app.config.js and build.gradle"
fi

# ── Load env vars ─────────────────────────────────────────────────────────────
info "Loading env vars ..."
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

# ── Prebuild ──────────────────────────────────────────────────────────────────
# Backup iOS icon Contents.json before prebuild — expo prebuild --platform android
# can still overwrite shared assets and remove manually-added iPad icon entries.
ICONSET="$APP_DIR/ios/SweatDrop/Images.xcassets/AppIcon.appiconset"
CONTENTS_BACKUP="/tmp/AppIcon_Contents_backup.json"
if [[ -f "$ICONSET/Contents.json" ]]; then
  cp "$ICONSET/Contents.json" "$CONTENTS_BACKUP"
  info "Backed up iOS AppIcon Contents.json"
fi

info "Running expo prebuild --platform android ..."
cd "$APP_DIR"
npx expo prebuild --platform android --no-install 2>&1 | tail -10

# Restore iOS icon Contents.json if prebuild overwrote it
if [[ -f "$CONTENTS_BACKUP" ]]; then
  cp "$CONTENTS_BACKUP" "$ICONSET/Contents.json"
  info "Restored iOS AppIcon Contents.json (iPad icons preserved)"
fi

# ── Remove duplicate launcher icons (prebuild generates .webp, old .png cause conflicts) ──
info "Removing duplicate PNG launcher icons ..."
find "$APP_DIR/android/app/src/main/res" -name "ic_launcher.png" -o -name "ic_launcher_round.png" | xargs rm -f 2>/dev/null || true

# ── Gradle build ──────────────────────────────────────────────────────────────
info "Building release AAB ..."
cd "$APP_DIR/android"
./gradlew bundleRelease --no-daemon 2>&1 | grep -E "BUILD|FAILED|error:|Task :|> Task" | tail -20

# ── Result ────────────────────────────────────────────────────────────────────
AAB_FILE="$OUTPUT_DIR/app-release.aab"
if [[ -f "$AAB_FILE" ]]; then
  AAB_SIZE=$(du -sh "$AAB_FILE" | cut -f1)
  echo ""
  success "══════════════════════════════════════════"
  success "  AAB built successfully!"
  success "  Env         : $LABEL"
  success "  versionCode : $NEW_CODE"
  success "  File        : $AAB_FILE"
  success "  Size        : $AAB_SIZE"
  success "══════════════════════════════════════════"
  echo ""
  info "Upload to Play Console → Internal Testing:"
  info "  https://play.google.com/console"
else
  error "Build finished but AAB not found at $AAB_FILE"
fi
