#!/bin/bash

# Admin Panel Build Script for SweatDrop
# This script handles the admin panel build workflow

set -e

echo "🚀 Starting Admin Panel Build Workflow..."

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the root directory
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ADMIN_DIR="$ROOT_DIR/apps/admin-panel"

echo -e "${BLUE}📦 Step 1: Installing dependencies...${NC}"
cd "$ROOT_DIR"
pnpm install

echo -e "${BLUE}🏗️  Step 2: Building admin panel...${NC}"
cd "$ADMIN_DIR"
pnpm build

echo -e "${GREEN}✅ Admin panel build complete!${NC}"
echo -e "${YELLOW}💡 To start the dev server, run:${NC}"
echo "   pnpm dev:admin"
echo "   or"
echo "   cd apps/admin-panel && pnpm dev"
