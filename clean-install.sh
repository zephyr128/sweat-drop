#!/bin/bash

# Clean Install Script for SweatDrop Monorepo
# This script removes all node_modules and pnpm-lock.yaml files
# and performs a fresh pnpm install

set -e  # Exit on error

echo "🧹 Cleaning up node_modules and lock files..."

# Remove root node_modules and lock file
rm -rf node_modules pnpm-lock.yaml

# Remove admin-panel node_modules and .next build folder
rm -rf apps/admin-panel/node_modules apps/admin-panel/.next

# Remove mobile-app node_modules
rm -rf apps/mobile-app/node_modules

echo "✅ Cleanup complete!"
echo ""
echo "📦 Installing dependencies with pnpm..."

# Install dependencies
pnpm install

echo ""
echo "✅ Installation complete!"
echo ""
echo "You can now run:"
echo "  - pnpm dev:admin (for admin panel)"
echo "  - pnpm dev:mobile (for mobile app)"
echo "  - pnpm build:admin (to build admin panel)"
echo "  - pnpm build:mobile (to build mobile app)"
