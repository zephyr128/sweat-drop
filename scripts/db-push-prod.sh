#!/bin/bash
#
# Push migrations to PROD Supabase (sweat-drop-prod)
#
# Usage:
#   ./scripts/db-push-prod.sh
#
# What it does:
#   1. Links to sweat-drop-prod project
#   2. Shows pending migrations
#   3. Asks for confirmation before pushing
#   4. Pushes all pending migrations
#   5. Re-links back to dev (sweat-drop)

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

DEV_REF="jzyoyxabcdzvqcfnfzrz"
PROD_REF="gyqgdfqnatuegwyidrii"
PROD_NAME="sweat-drop-prod (PROD)"
DEV_NAME="sweat-drop (DEV)"

echo ""
echo -e "${RED}═══════════════════════════════════════════${NC}"
echo -e "${RED}  SweatDrop DB Push → ${PROD_NAME}${NC}"
echo -e "${RED}═══════════════════════════════════════════${NC}"
echo ""

cd "$(dirname "$0")/../backend"

echo -e "${YELLOW}[1/5] Linking to ${PROD_NAME}...${NC}"
npx supabase link --project-ref "$PROD_REF" 2>&1 | grep -v "^$"
echo ""

echo -e "${YELLOW}[2/5] Checking pending migrations...${NC}"
PENDING=$(npx supabase migration list 2>&1 | grep '|                |' || true)

if [ -z "$PENDING" ]; then
  echo -e "${GREEN}✓ No pending migrations. Prod is up to date.${NC}"
  echo ""
  echo -e "${YELLOW}Re-linking to ${DEV_NAME}...${NC}"
  npx supabase link --project-ref "$DEV_REF" 2>&1 | grep -v "^$"
  echo -e "${GREEN}✓ Linked back to dev.${NC}"
  echo ""
  exit 0
fi

COUNT=$(echo "$PENDING" | wc -l | tr -d ' ')
echo -e "${YELLOW}${COUNT} pending migration(s):${NC}"
echo "$PENDING"
echo ""

echo -e "${RED}⚠  You are about to push to PRODUCTION.${NC}"
read -p "Type 'yes' to continue: " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
  echo -e "${YELLOW}Aborted. Re-linking to ${DEV_NAME}...${NC}"
  npx supabase link --project-ref "$DEV_REF" 2>&1 | grep -v "^$"
  echo -e "${GREEN}✓ Linked back to dev.${NC}"
  exit 0
fi

echo ""
echo -e "${YELLOW}[3/5] Pushing migrations to ${PROD_NAME}...${NC}"
npx supabase db push
echo ""

echo -e "${YELLOW}[4/5] Verifying...${NC}"
STILL_PENDING=$(npx supabase migration list 2>&1 | grep '|                |' || true)

if [ -z "$STILL_PENDING" ]; then
  echo -e "${GREEN}═══════════════════════════════════════════${NC}"
  echo -e "${GREEN}  ✓ ${PROD_NAME} fully synced${NC}"
  echo -e "${GREEN}═══════════════════════════════════════════${NC}"
else
  echo -e "${RED}✗ Some migrations still pending:${NC}"
  echo "$STILL_PENDING"
  echo ""
  echo -e "${YELLOW}[5/5] Re-linking to ${DEV_NAME}...${NC}"
  npx supabase link --project-ref "$DEV_REF" 2>&1 | grep -v "^$"
  echo -e "${GREEN}✓ Linked back to dev.${NC}"
  exit 1
fi

echo ""
echo -e "${YELLOW}[5/5] Re-linking to ${DEV_NAME}...${NC}"
npx supabase link --project-ref "$DEV_REF" 2>&1 | grep -v "^$"
echo -e "${GREEN}✓ Linked back to dev.${NC}"
echo ""
