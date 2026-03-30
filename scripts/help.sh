#!/bin/bash

# SweatDrop Help Script
# Prikazuje sve dostupne komande

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║           SweatDrop - Dostupne Komande                    ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${GREEN}📱 MOBILE APP - ANDROID${NC}"
echo -e "${BLUE}  pnpm android:run${NC}     - Kompletan setup i pokretanje (prvi put)"
echo -e "${BLUE}  pnpm android:dev${NC}     - Brzo pokretanje (svakodnevno)"
echo -e "${BLUE}  pnpm android${NC}         - Direktno pokretanje"
echo ""

echo -e "${GREEN}📱 MOBILE APP - iOS${NC}"
echo -e "${BLUE}  pnpm ios:build${NC}       - Kompletan iOS setup i build"
echo -e "${BLUE}  pnpm ios:prebuild${NC}    - Samo Expo prebuild"
echo -e "${BLUE}  pnpm ios:setup${NC}       - Samo CocoaPods install"
echo -e "${BLUE}  pnpm ios:clean${NC}       - Očisti build artifacts"
echo -e "${BLUE}  pnpm ios:xcode${NC}       - Otvori Xcode workspace"
echo -e "${BLUE}  pnpm ios${NC}             - Direktno pokretanje"
echo ""

echo -e "${GREEN}🖥️  ADMIN PANEL${NC}"
echo -e "${BLUE}  pnpm dev:admin${NC}       - Pokreni development server"
echo -e "${BLUE}  pnpm build:admin${NC}     - Build za production"
echo ""

echo -e "${GREEN}🧪 TESTING${NC}"
echo -e "${BLUE}  pnpm test:db${NC}         - Database testovi"
echo -e "${BLUE}  pnpm test:mobile${NC}     - Mobile app testovi"
echo -e "${BLUE}  pnpm test:admin${NC}      - Admin panel testovi"
echo -e "${BLUE}  pnpm test:e2e${NC}        - End-to-end testovi"
echo ""

echo -e "${GREEN}🔧 UTILITY${NC}"
echo -e "${BLUE}  pnpm lint${NC}            - Linting svih workspace-a"
echo -e "${BLUE}  pnpm type-check${NC}      - TypeScript type checking"
echo -e "${BLUE}  ./clean-install.sh${NC}   - Očisti sve i reinstaliraj"
echo ""

echo -e "${GREEN}🗄️  SUPABASE${NC}"
echo -e "${BLUE}  cd backend && supabase start${NC}        - Pokreni lokalni Supabase"
echo -e "${BLUE}  cd backend && supabase db reset${NC}     - Resetuj lokalnu bazu"
echo -e "${BLUE}  cd backend && supabase db push${NC}      - Primeni migracije"
echo ""

echo -e "${YELLOW}📚 DOKUMENTACIJA${NC}"
echo -e "  ${CYAN}QUICKSTART.md${NC}      - Brzi start guide"
echo -e "  ${CYAN}ANDROID_SETUP.md${NC}   - Detaljan Android setup"
echo -e "  ${CYAN}SCRIPTS.md${NC}         - Kompletan pregled skripti"
echo -e "  ${CYAN}README.md${NC}          - Opšti pregled projekta"
echo ""

echo -e "${YELLOW}💡 TIPS${NC}"
echo -e "  Za Android logove: ${CYAN}adb logcat | grep ReactNative${NC}"
echo -e "  Za dev menu: ${CYAN}adb shell input keyevent 82${NC}"
echo -e "  Za Metro cache: ${CYAN}cd apps/mobile-app && npx expo start -c${NC}"
echo ""
