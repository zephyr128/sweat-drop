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
KEYSTORE_PROPS="$APP_DIR/android/keystore.properties"
PATCH_SIGNING_PY="$SCRIPT_DIR/patch-android-signing.py"

# SHA1 fingerprint that Google Play expects for the upload keystore.
# Update this if the Play Console upload key is ever rotated.
EXPECTED_UPLOAD_SHA1="32:0F:C2:DF:D8:63:A0:34:F4:3A:2E:F9:38:D6:D9:4C:49:E7:CA:AE"

detect_ios_iconset_dir() {
  shopt -s nullglob
  local matches=("$APP_DIR"/ios/*/Images.xcassets/AppIcon.appiconset)
  shopt -u nullglob
  if [[ ${#matches[@]} -eq 0 ]]; then
    echo ""
    return
  fi
  echo "${matches[0]}"
}

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

if [[ ! -f "$KEYSTORE_PROPS" ]]; then
  error "Missing $KEYSTORE_PROPS — copy keystore.properties.example and fill in upload key credentials (from: npx eas credentials)."
fi

if grep -qE "REPLACE_ME" "$KEYSTORE_PROPS"; then
  error "$KEYSTORE_PROPS still contains REPLACE_ME placeholders — fill in real values before building."
fi

STORE_FILE_VALUE="$(grep -E '^storeFile=' "$KEYSTORE_PROPS" | cut -d'=' -f2-)"
if [[ -n "$STORE_FILE_VALUE" && ! -f "$STORE_FILE_VALUE" ]]; then
  error "Upload keystore not found at storeFile=$STORE_FILE_VALUE"
fi

echo ""
info "Environment : ${BOLD}$LABEL${NC}"
info "Env file    : $ENV_FILE"
info "Keystore    : $STORE_FILE_VALUE"

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
ICONSET="$(detect_ios_iconset_dir)"
CONTENTS_BACKUP="/tmp/AppIcon_Contents_backup.json"
if [[ -n "$ICONSET" && -f "$ICONSET/Contents.json" ]]; then
  cp "$ICONSET/Contents.json" "$CONTENTS_BACKUP"
  info "Backed up iOS AppIcon Contents.json"
fi

# Backup keystore.properties — expo prebuild --clean wipes the entire android/ dir
KEYSTORE_PROPS_BACKUP="/tmp/sweatdrop_keystore.properties.bak"
cp "$KEYSTORE_PROPS" "$KEYSTORE_PROPS_BACKUP"

info "Running expo prebuild --platform android --clean ..."
cd "$APP_DIR"
npx expo prebuild --platform android --clean --no-install 2>&1 | tail -10

# Restore keystore.properties after prebuild wiped android/
cp "$KEYSTORE_PROPS_BACKUP" "$KEYSTORE_PROPS"
info "Restored keystore.properties after prebuild"

# Restore iOS icon Contents.json if prebuild overwrote it
if [[ -n "$ICONSET" && -f "$CONTENTS_BACKUP" ]]; then
  cp "$CONTENTS_BACKUP" "$ICONSET/Contents.json"
  info "Restored iOS AppIcon Contents.json (iPad icons preserved)"
fi

# ── Remove duplicate launcher icons (prebuild generates .webp, old .png cause conflicts) ──
info "Removing duplicate PNG launcher icons ..."
find "$APP_DIR/android/app/src/main/res" -name "ic_launcher.png" -o -name "ic_launcher_round.png" | xargs rm -f 2>/dev/null || true

# ── Patch build.gradle to sign release with real upload keystore ──────────────
# expo prebuild regenerates build.gradle every run with debug-signed release
# (Google Play rejects debug-signed AABs with "wrong signing key"). Re-apply
# the release signingConfig now — idempotent so safe to re-run.
info "Patching android/app/build.gradle for release signing ..."
python3 "$PATCH_SIGNING_PY" "$BUILD_GRADLE"

# ── Reset generated android build state (prevents stale package/buildConfig mismatch) ──
info "Cleaning stale Android generated artifacts ..."
cd "$APP_DIR/android"
./gradlew --stop >/dev/null 2>&1 || true
rm -rf "$APP_DIR/android/app/build/generated/autolinking" \
       "$APP_DIR/android/app/build/generated/source/buildConfig" \
       "$APP_DIR/android/app/build/intermediates" \
       "$APP_DIR/android/app/build/tmp"
./gradlew clean --no-daemon >/dev/null

# ── Gradle build ──────────────────────────────────────────────────────────────
info "Building release AAB ..."
./gradlew bundleRelease --no-daemon 2>&1 | grep -E "BUILD|FAILED|error:|Task :|> Task" | tail -20

# ── Result ────────────────────────────────────────────────────────────────────
AAB_FILE="$OUTPUT_DIR/app-release.aab"
if [[ -f "$AAB_FILE" ]]; then
  AAB_SIZE=$(du -sh "$AAB_FILE" | cut -f1)

  # ── Verify AAB is signed with the expected upload key ─────────────────────
  # Google Play rejects uploads signed with the wrong certificate. Fail the
  # build here (before the developer wastes time on Play Console) if the SHA1
  # of the signing cert doesn't match what Play expects.
  info "Verifying AAB signing certificate ..."
  SIG_SHA1="$(keytool -printcert -jarfile "$AAB_FILE" 2>/dev/null \
              | awk -F': ' '/SHA1:/ {print $2; exit}' | tr -d '[:space:]')"

  EXPECTED_CLEAN="$(echo "$EXPECTED_UPLOAD_SHA1" | tr -d ':[:space:]' | tr '[:lower:]' '[:upper:]')"
  ACTUAL_CLEAN="$(echo "$SIG_SHA1" | tr -d ':[:space:]' | tr '[:lower:]' '[:upper:]')"

  if [[ -z "$SIG_SHA1" ]]; then
    warn "Could not read AAB signing SHA1 (keytool missing?) — skipping verification"
  elif [[ "$ACTUAL_CLEAN" != "$EXPECTED_CLEAN" ]]; then
    echo ""
    error "AAB signed with WRONG key — Google Play will reject this upload.
         Expected SHA1: $EXPECTED_UPLOAD_SHA1
         Actual   SHA1: $SIG_SHA1
         Check $KEYSTORE_PROPS (storeFile / keyAlias / passwords)."
  else
    success "Signature verified — SHA1 matches Play upload key"
  fi

  echo ""
  success "══════════════════════════════════════════"
  success "  AAB built successfully!"
  success "  Env         : $LABEL"
  success "  versionCode : $NEW_CODE"
  success "  File        : $AAB_FILE"
  success "  Size        : $AAB_SIZE"
  success "  SHA1        : $SIG_SHA1"
  success "══════════════════════════════════════════"
  echo ""
  info "Upload to Play Console → Internal Testing:"
  info "  https://play.google.com/console"
else
  error "Build finished but AAB not found at $AAB_FILE"
fi
