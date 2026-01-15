# App Icons Setup

## Current Status
✅ Main icon files created:
- `icon.png` (1024x1024) - Main app icon for Expo
- `adaptive-icon.png` (1024x1024) - Android adaptive icon
- `splash.png` (1024x1024) - Splash screen image

## Automatic Setup (Recommended)
Expo will automatically generate all required icon sizes when you run:
```bash
npx expo prebuild --clean
```

This will:
- Generate all iOS icon sizes from `icon.png`
- Generate all Android icon sizes from `adaptive-icon.png`
- Copy icons to appropriate iOS and Android folders

## Manual Setup (If needed)

### iOS Icons
If you want to use the existing icons from `Assets.xcassets/AppIcon.appiconset/`:

1. Copy the 1024x1024 icon:
```bash
cp assets/Assets.xcassets/AppIcon.appiconset/1024.png ios/SweatDrop/Images.xcassets/AppIcon.appiconset/App-Icon-1024x1024@1x.png
```

2. Or copy all sizes (Expo will use these if they exist):
```bash
cp -r assets/Assets.xcassets/AppIcon.appiconset/* ios/SweatDrop/Images.xcassets/AppIcon.appiconset/
```

### Android Icons
If you want to use the existing icons from `assets/android/mipmap-*/`:

1. Copy all mipmap folders:
```bash
cp -r assets/android/mipmap-* android/app/src/main/res/
```

2. Or let Expo generate them from `adaptive-icon.png` (recommended)

## Configuration
The `app.config.js` is already configured to use:
- `./assets/icon.png` - Main app icon
- `./assets/adaptive-icon.png` - Android adaptive icon
- `./assets/splash.png` - Splash screen

## Store Icons
- `appstore.png` - For App Store listing (1024x1024)
- `playstore.png` - For Play Store listing (512x512)
