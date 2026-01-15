#!/bin/bash

# Setup App Icons Script
# This script copies icons from assets folder to iOS and Android native folders

echo "Setting up app icons..."

# iOS: Copy 1024x1024 icon
if [ -f "assets/Assets.xcassets/AppIcon.appiconset/1024.png" ]; then
  cp "assets/Assets.xcassets/AppIcon.appiconset/1024.png" "ios/SweatDrop/Images.xcassets/AppIcon.appiconset/App-Icon-1024x1024@1x.png"
  echo "✅ Copied iOS 1024x1024 icon"
else
  echo "⚠️  iOS 1024x1024 icon not found"
fi

# iOS: Copy all icon sizes (optional - Expo will generate if missing)
if [ -d "assets/Assets.xcassets/AppIcon.appiconset" ]; then
  # Copy all PNG files except 1024.png (already copied above)
  find "assets/Assets.xcassets/AppIcon.appiconset" -name "*.png" ! -name "1024.png" -exec cp {} "ios/SweatDrop/Images.xcassets/AppIcon.appiconset/" \;
  echo "✅ Copied additional iOS icon sizes"
fi

# Android: Copy mipmap icons
if [ -d "assets/android" ]; then
  # Copy all mipmap folders
  cp -r assets/android/mipmap-* android/app/src/main/res/ 2>/dev/null
  echo "✅ Copied Android mipmap icons"
else
  echo "⚠️  Android mipmap icons not found - Expo will generate from adaptive-icon.png"
fi

echo ""
echo "Icon setup complete!"
echo ""
echo "Next steps:"
echo "1. Run 'npx expo prebuild --clean' to regenerate native folders with icons"
echo "2. Or rebuild the app to see the new icons"
