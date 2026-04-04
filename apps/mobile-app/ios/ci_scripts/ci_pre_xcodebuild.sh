#!/bin/sh
set -e

echo "──── SweatDrop CI: pre-xcodebuild start ────"

# Ensure NODE_BINARY is set so React Native build phases can find node
if [ -z "$NODE_BINARY" ]; then
  if command -v node >/dev/null 2>&1; then
    export NODE_BINARY=$(command -v node)
  fi
fi

echo "NODE_BINARY=${NODE_BINARY:-not set}"
echo "Xcode version: $(xcodebuild -version | head -1)"

echo "──── SweatDrop CI: pre-xcodebuild done ────"
