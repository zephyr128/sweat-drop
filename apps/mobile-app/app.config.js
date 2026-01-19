module.exports = {
  expo: {
    name: 'SweatDrop',
    slug: 'sweatdrop',
    version: '1.0.0',
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',
    platforms: ['ios', 'android'],
    icon: './assets/icon.png', // App icon (1024x1024)
    splash: {
      image: './assets/splash.png', // Splash screen image
      backgroundColor: '#000000', // Pure black splash screen
      resizeMode: 'contain',
    },
    assetBundlePatterns: ['**/*'],
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.sweatdrop.app',
      infoPlist: {
        NSCameraUsageDescription:
          'SweatDrop koristi kameru za skeniranje QR kodova na fitnes spravama.',
        NSBluetoothAlwaysUsageDescription:
          'SweatDrop koristi Bluetooth za komunikaciju sa Magene fitnes senzorima tokom treninga.',
        NSBluetoothPeripheralUsageDescription:
          'SweatDrop koristi Bluetooth za komunikaciju sa Magene fitnes senzorima tokom treninga.',
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png', // Android adaptive icon foreground (1024x1024)
        backgroundColor: '#0A0E1A', // Dark navy background
      },
      package: 'com.sweatdrop.app',
      permissions: [
        'CAMERA',
        'android.permission.BLUETOOTH',
        'android.permission.BLUETOOTH_ADMIN',
        'android.permission.BLUETOOTH_SCAN',
        'android.permission.BLUETOOTH_CONNECT',
        'android.permission.ACCESS_FINE_LOCATION',
      ],
    },
    plugins: [
      'expo-router',
      [
        'react-native-vision-camera',
        {
          cameraPermissionText: 'SweatDrop koristi kameru za skeniranje QR kodova na fitnes spravama.',
        },
      ],
      // NOTE: expo-web-browser does NOT require a config plugin in Expo SDK 54
      // It can be used directly without adding it to plugins array
      // Adding it here causes ESM/TypeScript loading errors with pnpm isolated linker
    ],
    scheme: 'sweatdrop',
    extra: {
      router: {
        origin: false,
      },
    },
  },
};
