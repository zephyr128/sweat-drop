const DEFAULT_GOOGLE_CLIENT_ID =
  '620444177181-ar724tn6j7lfr28h97fpaosbn2o48352.apps.googleusercontent.com';
const DEFAULT_GOOGLE_IOS_URL_SCHEME =
  'com.googleusercontent.apps.620444177181-ar724tn6j7lfr28h97fpaosbn2o48352';

const googleWebClientId =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID;
const googleIosClientId =
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID;
const googleIosUrlScheme =
  process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME || DEFAULT_GOOGLE_IOS_URL_SCHEME;

module.exports = {
  expo: {
    name: 'SweatDrop',
    slug: 'sweatdrop',
    owner: 'zephyr23',
    version: '1.0.0',
    orientation: 'portrait',
    userInterfaceStyle: 'dark',
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
      associatedDomains: ['applinks:www.sweat-drop.com'],
      entitlements: {
        'aps-environment': 'production',
        'com.apple.developer.applesignin': ['Default'],
      },
      infoPlist: {
        NSCameraUsageDescription:
          'SweatDrop uses the camera to scan QR codes on fitness equipment.',
        NSBluetoothAlwaysUsageDescription:
          'SweatDrop uses Bluetooth to communicate with Magene fitness sensors during workouts.',
        NSBluetoothPeripheralUsageDescription:
          'SweatDrop uses Bluetooth to communicate with Magene fitness sensors during workouts.',
        UIBackgroundModes: ['bluetooth-central'],
        CFBundleLocalizations: ['en', 'sr'],
        CFBundleDevelopmentRegion: 'en',
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png', // Android adaptive icon foreground (1024x1024)
        backgroundColor: '#0A0E1A', // Dark navy background
      },
      versionCode: 4,
      package: 'com.sweatdrop.app',
      intentFilters: [
        {
          action: 'VIEW',
          autoVerify: true,
          data: [
            {
              scheme: 'https',
              host: 'www.sweat-drop.com',
              pathPrefix: '/auth/confirm',
            },
            {
              scheme: 'https',
              host: 'www.sweat-drop.com',
              pathPrefix: '/auth/reset',
            },
            {
              scheme: 'https',
              host: 'www.sweat-drop.com',
              pathPrefix: '/join',
            },
          ],
          category: ['BROWSABLE', 'DEFAULT'],
        },
      ],
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
          cameraPermissionText: 'SweatDrop uses the camera to scan QR codes on fitness equipment.',
        },
      ],
      [
        '@react-native-google-signin/google-signin',
        {
          iosUrlScheme: googleIosUrlScheme,
        },
      ],
      [
        'expo-location',
        {
          locationWhenInUsePermission:
            'SweatDrop koristi lokaciju da potvrdi da si u teretani pri čekiranju.',
        },
      ],
      // expo-apple-authentication does NOT need a config plugin
      // It works automatically when bundleIdentifier is set
      ...(process.env.EXPO_PUBLIC_PUSH_ENABLED === 'true'
        ? [
            [
              'expo-notifications',
              {
                color: '#00E5FF',
                defaultChannel: 'default',
              },
            ],
          ]
        : []),
      ...(process.env.SENTRY_ORG
        ? [
            [
              '@sentry/react-native',
              {
                organization: process.env.SENTRY_ORG,
                project: process.env.SENTRY_PROJECT || '',
                url: 'https://sentry.io/',
              },
            ],
          ]
        : []),
    ],
    scheme: 'sweatdrop',
    extra: {
      googleWebClientId,
      googleIosClientId,
      router: {
        origin: false,
      },
      eas: {
        projectId:
          process.env.EXPO_PUBLIC_EAS_PROJECT_ID ||
          process.env.EAS_PROJECT_ID ||
          '970c6ba3-aae9-4b7a-b014-74915fff4df3',
      },
    },
    experiments: {
      // Alpha feature: Force autolinking to match Metro resolution (SDK 54+)
      // Helps with duplicate native modules in monorepos
      autolinkingModuleResolution: true,
    },
  },
};
