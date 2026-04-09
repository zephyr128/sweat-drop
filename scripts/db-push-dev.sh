#!/bin/bash
#
# Push migrations to DEV Supabase (sweat-drop)
#
# Usage:
#   ./scripts/db-push-dev.sh
#
# What it does:
#   1. Links to sweat-drop (dev) project
#   2. Shows pending migrations
#   3. Pushes all pending migrations
#   4. Confirms final migration count

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

DEV_REF="jzyoyxabcdzvqcfnfzrz"
PROJECT_NAME="sweat-drop (DEV)"

echo ""
echo -e "${BLUE}═══════════════════════════════════════════${NC}"
echo -e "${BLUE}  SweatDrop DB Push → ${PROJECT_NAME}${NC}"
echo -e "${BLUE}═══════════════════════════════════════════${NC}"
echo ""

cd "$(dirname "$0")/../backend"

echo -e "${YELLOW}[1/4] Linking to ${PROJECT_NAME}...${NC}"
npx supabase link --project-ref "$DEV_REF" 2>&1 | grep -v "^$"
echo ""

echo -e "${YELLOW}[2/4] Checking pending migrations...${NC}"
PENDING=$(npx supabase migration list 2>&1 | grep '|                |' || true)

if [ -z "$PENDING" ]; then
  echo -e "${GREEN}✓ No pending migrations. Dev is up to date.${NC}"
  echo ""
  exit 0
fi

echo -e "${YELLOW}Pending migrations:${NC}"
echo "$PENDING"
echo ""

echo -e "${YELLOW}[3/4] Pushing migrations to ${PROJECT_NAME}...${NC}"
npx supabase db push
echo ""

echo -e "${YELLOW}[4/4] Verifying...${NC}"
STILL_PENDING=$(npx supabase migration list 2>&1 | grep '|                |' || true)

if [ -z "$STILL_PENDING" ]; then
  echo -e "${GREEN}═══════════════════════════════════════════${NC}"
  echo -e "${GREEN}  ✓ ${PROJECT_NAME} fully synced${NC}"
  echo -e "${GREEN}═══════════════════════════════════════════${NC}"
else
  echo -e "${RED}✗ Some migrations still pending:${NC}"
  echo "$STILL_PENDING"
  exit 1
fi
echo ""
