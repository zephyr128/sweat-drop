#!/bin/bash

# Debug iOS App Crash Script
# This script helps identify why the iOS app is crashing

set -e

echo "🔍 Debugging iOS App Crash..."
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MOBILE_APP_DIR="$ROOT_DIR/apps/mobile-app"

echo -e "${BLUE}📱 Step 1: Checking TypeScript errors...${NC}"
cd "$MOBILE_APP_DIR"
if command -v pnpm &> /dev/null; then
  pnpm type-check 2>&1 | head -50 || echo -e "${YELLOW}⚠️  TypeScript check failed or found errors${NC}"
else
  npx tsc --noEmit 2>&1 | head -50 || echo -e "${YELLOW}⚠️  TypeScript check failed or found errors${NC}"
fi

echo ""
echo -e "${BLUE}📦 Step 2: Checking for missing dependencies...${NC}"
cd "$ROOT_DIR"
if command -v pnpm &> /dev/null; then
  pnpm install --frozen-lockfile 2>&1 | tail -20 || echo -e "${YELLOW}⚠️  Dependency check failed${NC}"
else
  npm install 2>&1 | tail -20 || echo -e "${YELLOW}⚠️  Dependency check failed${NC}"
fi

echo ""
echo -e "${BLUE}🔍 Step 3: Checking for common crash causes...${NC}"

# Check for undefined imports
echo "Checking for undefined imports..."
grep -r "import.*from.*undefined" "$MOBILE_APP_DIR/app" 2>/dev/null && echo -e "${RED}❌ Found undefined imports${NC}" || echo -e "${GREEN}✅ No undefined imports${NC}"

# Check for missing hooks
echo "Checking for missing hooks..."
if [ ! -f "$MOBILE_APP_DIR/hooks/useActiveProgram.ts" ]; then
  echo -e "${RED}❌ Missing useActiveProgram.ts hook${NC}"
else
  echo -e "${GREEN}✅ useActiveProgram.ts exists${NC}"
fi

# Check for RPC function usage
echo "Checking RPC function calls..."
grep -r "get_user_active_program" "$MOBILE_APP_DIR" 2>/dev/null | head -5 || echo -e "${YELLOW}⚠️  No RPC calls found${NC}"

echo ""
echo -e "${BLUE}📋 Step 4: Recent file changes...${NC}"
find "$MOBILE_APP_DIR/app" -name "*.tsx" -type f -mtime -7 -exec basename {} \; | head -10

echo ""
echo -e "${YELLOW}💡 Next steps:${NC}"
echo "   1. Check Xcode console for crash logs"
echo "   2. Run: cd apps/mobile-app && npx expo start --ios"
echo "   3. Check Metro bundler for JavaScript errors"
echo "   4. Verify Supabase RPC functions are deployed"
echo "   5. Check if migrations are applied: backend/supabase/migrations/20240101000041_workout_programs_system.sql"
