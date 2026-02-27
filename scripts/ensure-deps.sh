#!/bin/bash

# Ensure Dependencies Script for SweatDrop Monorepo
# This script checks if node_modules exist and installs them if needed
# Always run from root directory to maintain monorepo structure

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Get the root directory (where this script is located)
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Check if we're in the root directory
if [ ! -f "$ROOT_DIR/pnpm-workspace.yaml" ]; then
  echo -e "${RED}❌ Error: This script must be run from the project root directory${NC}"
  echo -e "${YELLOW}💡 Run: cd $(dirname "$ROOT_DIR") && ./scripts/ensure-deps.sh${NC}"
  exit 1
fi

cd "$ROOT_DIR"

# Check if root node_modules exists
if [ ! -d "$ROOT_DIR/node_modules" ]; then
  echo -e "${YELLOW}📦 Root node_modules not found. Installing dependencies...${NC}"
  pnpm install
  echo -e "${GREEN}✅ Dependencies installed!${NC}"
else
  # Check if pnpm-lock.yaml is newer than node_modules (indicating changes)
  if [ -f "$ROOT_DIR/pnpm-lock.yaml" ] && [ "$ROOT_DIR/pnpm-lock.yaml" -nt "$ROOT_DIR/node_modules" ]; then
    echo -e "${YELLOW}📦 pnpm-lock.yaml is newer than node_modules. Updating dependencies...${NC}"
    pnpm install
    echo -e "${GREEN}✅ Dependencies updated!${NC}"
  else
    echo -e "${GREEN}✅ Dependencies are up to date${NC}"
  fi
fi
