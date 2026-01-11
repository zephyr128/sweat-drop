# SweatDrop Mobile App

React Native mobile application built with Expo and TypeScript.

## Features

- **Onboarding & Auth**: Email authentication with username setup and optional home gym selection
- **QR Scan**: Scan QR codes on gym equipment to start workouts
- **Active Workout**: Real-time drops counter and session tracking
- **Session Summary**: View workout results and percentile rankings
- **Wallet**: Track drops earned (today, this week, this month)
- **Rewards Store**: Browse and redeem rewards with drops
- **Challenges**: Participate in daily/weekly/streak challenges
- **Leaderboards**: View rankings by period and scope

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables:
Create a `.env` file with:
```
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

3. Start the development server:
```bash
npm start
```

## Running on Simulators

### iOS Simulator (macOS only)

**Prerequisites:**
- macOS
- Xcode installed (from App Store)
- iOS Simulator available through Xcode

**Steps:**
1. Open iOS Simulator:
   ```bash
   open -a Simulator
   ```
   Or: Xcode → Open Developer Tool → Simulator

2. Navigate to the mobile app directory:
   ```bash
   cd apps/mobile-app
   ```

3. Run the app on iOS simulator:
   ```bash
   npm run ios
   ```
   
   Or from the Expo dev server menu:
   ```bash
   npm start
   # Then press 'i' to open iOS simulator
   ```

### Android Emulator

**Prerequisites:**
- Android Studio installed
- Android SDK configured
- Android Virtual Device (AVD) created

**Steps:**
1. Open Android Studio and start an emulator:
   - Tools → Device Manager
   - Create a new Virtual Device or start an existing one

2. Navigate to the mobile app directory:
   ```bash
   cd apps/mobile-app
   ```

3. Run the app on Android emulator:
   ```bash
   npm run android
   ```
   
   Or from the Expo dev server menu:
   ```bash
   npm start
   # Then press 'a' to open Android emulator
   ```

### Alternative: Using Expo Go App (Physical Device)

1. Install Expo Go on your iOS/Android device:
   - [iOS App Store](https://apps.apple.com/app/expo-go/id982107779)
   - [Google Play Store](https://play.google.com/store/apps/details?id=host.exp.exponent)

2. Start the dev server:
   ```bash
   cd apps/mobile-app
   npm start
   ```

3. Scan the QR code with:
   - **iOS**: Camera app
   - **Android**: Expo Go app

## Development

- `npm start` - Start Expo development server (opens interactive menu)
- `npm run ios` - Run on iOS simulator (macOS only)
- `npm run android` - Run on Android emulator
- `npm run web` - Run on web browser
- `npm run lint` - Run ESLint
- `npm run type-check` - Type check TypeScript

**Quick Tip:** When the Expo dev server is running, you can press:
- `i` - Open iOS simulator
- `a` - Open Android emulator
- `w` - Open in web browser
- `r` - Reload the app

## Project Structure

- `app/` - Expo Router app directory
  - `(onboarding)/` - Onboarding flow (welcome, auth, username, home-gym)
  - `(tabs)/` - Main app tabs (scan, wallet, store, challenges, leaderboard)
  - `workout.tsx` - Active workout screen
  - `session-summary.tsx` - Workout summary screen
- `lib/` - Utility functions and Supabase client
- `hooks/` - Custom React hooks
