#!/bin/sh
set -e

echo "──── SweatDrop CI: post-clone start ────"

# ── 1. Install Node.js (Xcode Cloud has Homebrew pre-installed) ──
if ! command -v node >/dev/null 2>&1; then
  brew install node
fi
echo "node $(node --version)  •  npm $(npm --version)"

# ── 2. Install pnpm (matches packageManager in root package.json) ──
if ! command -v pnpm >/dev/null 2>&1; then
  npm install -g pnpm@10
fi
echo "pnpm $(pnpm --version)"

# ── 3. Install monorepo dependencies ──
cd "$CI_PRIMARY_REPOSITORY_PATH"
pnpm install --frozen-lockfile

# ── 4. Clean pods and install from scratch ──
#    Prevents stale prebuilt-framework caches from causing crashes.
cd "$CI_PRIMARY_REPOSITORY_PATH/apps/mobile-app/ios"
rm -rf Pods
pod cache clean --all 2>/dev/null || true
pod install --verbose

# ── 5. Generate .xcode.env.local for Xcode build phases ──
cat > .xcode.env.local << 'XCODE_ENV'
export NODE_BINARY=$(command -v node)
export SENTRY_DISABLE_AUTO_UPLOAD=true
XCODE_ENV

echo "──── SweatDrop CI: post-clone done ────"
