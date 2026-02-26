#!/bin/bash

# Fix iOS react-native-svg Header Search Paths
# This script reinstalls CocoaPods dependencies with updated header paths

set -e

echo "🔧 Fixing react-native-svg Header Search Paths..."

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Get directories
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IOS_DIR="$ROOT_DIR/apps/mobile-app/ios"

echo -e "${BLUE}📱 Step 1: Cleaning CocoaPods cache...${NC}"
cd "$IOS_DIR"
rm -rf Pods Podfile.lock

echo -e "${BLUE}📦 Step 2: Reinstalling CocoaPods dependencies...${NC}"
export LANG=en_US.UTF-8
arch -arm64 pod install --repo-update

echo -e "${GREEN}✅ CocoaPods dependencies reinstalled!${NC}"
echo -e "${YELLOW}💡 Next steps:${NC}"
echo "   1. Clean build folder in Xcode (Cmd + Shift + K)"
echo "   2. Close and reopen Xcode workspace"
echo "   3. Try building again (Cmd + B)"
