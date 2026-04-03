#!/bin/sh
set -e

echo "---- SweatDrop CI post-clone start ----"

# 1) Ensure Node is available
if ! command -v node >/dev/null 2>&1; then
  brew install node
fi
echo "node $(node --version)  •  npm $(npm --version)"

# 2) Ensure pnpm is available
if ! command -v pnpm >/dev/null 2>&1; then
  npm install -g pnpm@10
fi
echo "pnpm $(pnpm --version)"

# 3) Install monorepo dependencies
cd "$CI_PRIMARY_REPOSITORY_PATH"
pnpm install --frozen-lockfile

# 4) Install CocoaPods for iOS app
cd "$CI_PRIMARY_REPOSITORY_PATH/apps/mobile-app/ios"
pod install

# 5) Xcode env for build phases
cat > .xcode.env.local << 'XCODE_ENV'
export NODE_BINARY=$(command -v node)
export SENTRY_DISABLE_AUTO_UPLOAD=true
XCODE_ENV

echo "---- SweatDrop CI post-clone done ----"
#!/bin/sh
set -e

# ─────────────────────────────────────────────────────────────
# SweatDrop — Xcode Cloud post-clone script
#
# Runs after Xcode Cloud clones the repo.  Installs Node,
# pnpm, JS deps, and CocoaPods so xcodebuild can succeed.
# ─────────────────────────────────────────────────────────────

echo "──── SweatDrop CI: post-clone start ────"

# ── 1. Install Node.js (Xcode Cloud has Homebrew pre-installed) ──
brew install node
echo "node $(node --version)  •  npm $(npm --version)"

# ── 2. Install pnpm (matches packageManager in root package.json) ──
npm install -g pnpm@10
echo "pnpm $(pnpm --version)"

# ── 3. Install monorepo dependencies ──
cd "$CI_PRIMARY_REPOSITORY_PATH"
pnpm install --frozen-lockfile

# ── 4. Install CocoaPods ──
cd "$CI_PRIMARY_REPOSITORY_PATH/apps/mobile-app/ios"
pod install

# ── 5. Generate .xcode.env.local for Xcode build phases ──
#    • Points NODE_BINARY to the Homebrew-installed node
#    • Disables Sentry debug-symbol upload (avoids build failure
#      when SENTRY_AUTH_TOKEN isn't configured yet)
cat > .xcode.env.local << 'XCODE_ENV'
export NODE_BINARY=$(command -v node)
export SENTRY_DISABLE_AUTO_UPLOAD=true
XCODE_ENV

echo "──── SweatDrop CI: post-clone done ────"
