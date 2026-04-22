#!/bin/sh
set -e

echo "──── SweatDrop CI: post-clone start ────"

# Pinned versions — must match local dev environment exactly
NODE_VERSION="22.22.0"
PNPM_VERSION="10.0.0"
COCOAPODS_VERSION="1.16.2"

# ── 1. Install exact Node.js version via nvm ──
if ! command -v nvm >/dev/null 2>&1; then
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  export NVM_DIR="$HOME/.nvm"
  # shellcheck disable=SC1091
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
fi
nvm install "$NODE_VERSION"
nvm use "$NODE_VERSION"
nvm alias default "$NODE_VERSION"
echo "node $(node --version)  •  npm $(npm --version)"

# ── 2. Install exact pnpm version ──
npm install -g "pnpm@$PNPM_VERSION"
echo "pnpm $(pnpm --version)"

# ── 3. Generate .env from Xcode Cloud environment variables ──
# These must be set in App Store Connect → Xcode Cloud → Workflow → Environment
# Required: EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY
# Optional: all other EXPO_PUBLIC_* vars
cd "$CI_PRIMARY_REPOSITORY_PATH/apps/mobile-app"

if [ -z "$EXPO_PUBLIC_SUPABASE_URL" ] || [ -z "$EXPO_PUBLIC_SUPABASE_ANON_KEY" ]; then
  echo "ERROR: EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY must be set in Xcode Cloud environment variables."
  exit 1
fi

cat > .env << ENV
EXPO_PUBLIC_SUPABASE_URL=${EXPO_PUBLIC_SUPABASE_URL}
EXPO_PUBLIC_SUPABASE_ANON_KEY=${EXPO_PUBLIC_SUPABASE_ANON_KEY}
EXPO_PUBLIC_APP_ENV=${EXPO_PUBLIC_APP_ENV:-production}
EXPO_PUBLIC_PUSH_ENABLED=${EXPO_PUBLIC_PUSH_ENABLED:-true}
EXPO_PUBLIC_EAS_PROJECT_ID=${EXPO_PUBLIC_EAS_PROJECT_ID:-970c6ba3-aae9-4b7a-b014-74915fff4df3}
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=${EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID:-}
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=${EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID:-}
EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME=${EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME:-}
EXPO_PUBLIC_SITE_URL=${EXPO_PUBLIC_SITE_URL:-https://www.sweat-drop.com}
EXPO_PUBLIC_TERMS_URL=${EXPO_PUBLIC_TERMS_URL:-https://www.sweat-drop.com/terms}
EXPO_PUBLIC_PRIVACY_URL=${EXPO_PUBLIC_PRIVACY_URL:-https://www.sweat-drop.com/privacy}
EXPO_PUBLIC_SENTRY_DSN=${EXPO_PUBLIC_SENTRY_DSN:-}
SENTRY_ORG=${SENTRY_ORG:-}
SENTRY_PROJECT=${SENTRY_PROJECT:-}
SENTRY_AUTH_TOKEN=${SENTRY_AUTH_TOKEN:-}
ENV

echo ".env generated for Xcode Cloud build"

# ── 3b. Apply environment-specific iOS app icon assets ──
# We keep target Contents.json intact (it includes iPad entries), and only
# replace PNG assets. Source icon set comes from canonical env folders
# (AppIcons / AppIconsDev), never from mutable assets/.
APP_ENV_VALUE="${EXPO_PUBLIC_APP_ENV:-production}"
IOS_DIR="$CI_PRIMARY_REPOSITORY_PATH/apps/mobile-app/ios"
IOS_APPICON_DIR=""
for candidate in "$IOS_DIR"/SweatDrop*/Images.xcassets/AppIcon.appiconset; do
  if [ -d "$candidate" ]; then
    IOS_APPICON_DIR="$candidate"
    break
  fi
done

if [ "$APP_ENV_VALUE" = "production" ]; then
  APPICON_SOURCE_DIR="$CI_PRIMARY_REPOSITORY_PATH/apps/mobile-app/AppIcons/Assets.xcassets/AppIcon.appiconset"
  ICON_LABEL="PRODUCTION"
else
  APPICON_SOURCE_DIR="$CI_PRIMARY_REPOSITORY_PATH/apps/mobile-app/AppIconsDev/Assets.xcassets/AppIcon.appiconset"
  ICON_LABEL="DEVELOPMENT"
fi

if [ -d "$IOS_APPICON_DIR" ] && [ -d "$APPICON_SOURCE_DIR" ]; then
  echo "Applying $ICON_LABEL iOS app icon assets..."
  rsync -av \
    --exclude "Contents.json" \
    "$APPICON_SOURCE_DIR/" \
    "$IOS_APPICON_DIR/"

  # Keep the legacy 1024 naming used by some iOS project templates in sync.
  if [ -f "$IOS_APPICON_DIR/1024.png" ]; then
    cp "$IOS_APPICON_DIR/1024.png" "$IOS_APPICON_DIR/App-Icon-1024x1024@1x.png"
  fi
else
  echo "WARNING: App icon directories missing, skipping iOS icon sync."
  echo "  env=$APP_ENV_VALUE"
  echo "  source=$APPICON_SOURCE_DIR"
  echo "  target=$IOS_APPICON_DIR"
fi

# ── 4. Install monorepo dependencies ──
cd "$CI_PRIMARY_REPOSITORY_PATH"
pnpm install --frozen-lockfile

# ── 4b. Ensure expected iOS workspace exists for this env ──
# Xcode Cloud workflow points to a fixed workspace/scheme path. On ci_dev this
# must be SweatDropDev.*, while production uses SweatDrop.*.
EXPECTED_IOS_PROJECT_NAME="SweatDrop"
if [ "$APP_ENV_VALUE" != "production" ]; then
  EXPECTED_IOS_PROJECT_NAME="SweatDropDev"
fi
EXPECTED_IOS_WORKSPACE="$IOS_DIR/${EXPECTED_IOS_PROJECT_NAME}.xcworkspace"

if [ ! -d "$EXPECTED_IOS_WORKSPACE" ]; then
  echo "Expected workspace missing ($EXPECTED_IOS_WORKSPACE). Regenerating iOS native project..."
  cd "$CI_PRIMARY_REPOSITORY_PATH"
  EXPO_NO_DOTENV=1 EXPO_PUBLIC_APP_ENV="$APP_ENV_VALUE" \
    pnpm --filter sweatdrop-mobile-app exec expo prebuild --platform ios --clean --no-install

  # prebuild --clean deletes ios/ci_scripts; restore so Xcode Cloud hooks remain.
  mkdir -p "$IOS_DIR/ci_scripts"
  for script in ci_post_clone.sh ci_pre_xcodebuild.sh; do
    git -C "$CI_PRIMARY_REPOSITORY_PATH" checkout -- "apps/mobile-app/ios/ci_scripts/$script" 2>/dev/null || true
  done
  chmod +x "$IOS_DIR/ci_scripts/"*.sh 2>/dev/null || true
fi

if [ ! -d "$EXPECTED_IOS_WORKSPACE" ]; then
  echo "ERROR: Expected workspace still missing after prebuild: $EXPECTED_IOS_WORKSPACE"
  exit 1
fi

# Re-apply icon assets after potential prebuild regeneration.
IOS_APPICON_DIR=""
for candidate in "$IOS_DIR"/SweatDrop*/Images.xcassets/AppIcon.appiconset; do
  if [ -d "$candidate" ]; then
    IOS_APPICON_DIR="$candidate"
    break
  fi
done
if [ -d "$IOS_APPICON_DIR" ] && [ -d "$APPICON_SOURCE_DIR" ]; then
  echo "Re-applying $ICON_LABEL iOS app icon assets after prebuild..."
  rsync -av --exclude "Contents.json" "$APPICON_SOURCE_DIR/" "$IOS_APPICON_DIR/"
  if [ -f "$IOS_APPICON_DIR/1024.png" ]; then
    cp "$IOS_APPICON_DIR/1024.png" "$IOS_APPICON_DIR/App-Icon-1024x1024@1x.png"
  fi
fi

# ── 5. Install exact CocoaPods version and reinstall pods ──
# Use Homebrew Ruby to avoid system Ruby permission issues on Xcode Cloud
if command -v brew >/dev/null 2>&1; then
  BREW_RUBY="$(brew --prefix)/opt/ruby/bin/ruby"
  BREW_GEM="$(brew --prefix)/opt/ruby/bin/gem"
  if [ -f "$BREW_GEM" ]; then
    export PATH="$(brew --prefix)/opt/ruby/bin:$PATH"
    export GEM_HOME="$HOME/.gem/ruby/$(ruby -e 'puts RUBY_VERSION')"
    export PATH="$GEM_HOME/bin:$PATH"
    "$BREW_GEM" install cocoapods -v "$COCOAPODS_VERSION" --no-document
  else
    brew install ruby
    export PATH="$(brew --prefix)/opt/ruby/bin:$PATH"
    export GEM_HOME="$HOME/.gem/ruby/$(ruby -e 'puts RUBY_VERSION')"
    export PATH="$GEM_HOME/bin:$PATH"
    gem install cocoapods -v "$COCOAPODS_VERSION" --no-document
  fi
else
  gem install cocoapods -v "$COCOAPODS_VERSION" --no-document --user-install
  export PATH="$HOME/.gem/bin:$PATH"
fi

echo "CocoaPods version: $(pod --version)"
cd "$CI_PRIMARY_REPOSITORY_PATH/apps/mobile-app/ios"
rm -rf Pods
pod cache clean --all 2>/dev/null || true
pod _${COCOAPODS_VERSION}_ install --verbose

# ── 6. Generate .xcode.env.local for Xcode build phases ──
NODE_PATH="$(command -v node)"
cat > .xcode.env.local << XCODE_ENV
export NODE_BINARY=${NODE_PATH}
export SENTRY_DISABLE_AUTO_UPLOAD=true
XCODE_ENV

echo "──── SweatDrop CI: post-clone done ────"
echo "Versions: node=$(node --version) pnpm=$(pnpm --version) pod=$(pod --version)"
