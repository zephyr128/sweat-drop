#!/bin/bash

# Setup Android Environment Script
# This script adds necessary environment variables to your shell profile

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔧 Setting up Android environment...${NC}"

# Detect shell profile
if [ -f "$HOME/.zshrc" ]; then
  SHELL_PROFILE="$HOME/.zshrc"
  SHELL_NAME="zsh"
elif [ -f "$HOME/.bashrc" ]; then
  SHELL_PROFILE="$HOME/.bashrc"
  SHELL_NAME="bash"
elif [ -f "$HOME/.bash_profile" ]; then
  SHELL_PROFILE="$HOME/.bash_profile"
  SHELL_NAME="bash"
else
  echo -e "${RED}❌ Could not find shell profile (.zshrc or .bashrc)${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Found shell profile: $SHELL_PROFILE${NC}"

# Check if already configured
if grep -q "SWEATDROP_ANDROID_ENV" "$SHELL_PROFILE"; then
  echo -e "${YELLOW}⚠️  Android environment already configured in $SHELL_PROFILE${NC}"
  echo -e "${BLUE}To reconfigure, remove the SWEATDROP_ANDROID_ENV section and run again.${NC}"
  exit 0
fi

# Backup shell profile
cp "$SHELL_PROFILE" "$SHELL_PROFILE.backup.$(date +%Y%m%d%H%M%S)"
echo -e "${GREEN}✅ Backed up shell profile${NC}"

# Add Android environment variables
echo -e "${BLUE}📝 Adding Android environment variables...${NC}"

cat >> "$SHELL_PROFILE" << 'EOF'

# SWEATDROP_ANDROID_ENV - Added by setup-android-env.sh
# Java - Use Android Studio JDK
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export PATH="$JAVA_HOME/bin:$PATH"

# Android SDK
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$PATH:$ANDROID_HOME/emulator"
export PATH="$PATH:$ANDROID_HOME/platform-tools"
export PATH="$PATH:$ANDROID_HOME/tools"
export PATH="$PATH:$ANDROID_HOME/tools/bin"
# END SWEATDROP_ANDROID_ENV

EOF

echo -e "${GREEN}✅ Added Android environment variables to $SHELL_PROFILE${NC}"
echo ""
echo -e "${YELLOW}📋 Next steps:${NC}"
echo "   1. Reload your shell profile:"
echo -e "      ${BLUE}source $SHELL_PROFILE${NC}"
echo ""
echo "   2. Verify setup:"
echo -e "      ${BLUE}java -version${NC}"
echo -e "      ${BLUE}echo \$ANDROID_HOME${NC}"
echo -e "      ${BLUE}adb --version${NC}"
echo ""
echo "   3. Run Android app:"
echo -e "      ${BLUE}pnpm android:run${NC}"
echo ""
echo -e "${GREEN}🎉 Setup complete!${NC}"
