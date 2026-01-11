module.exports = {
  expo: {
    name: 'SweatDrop',
    slug: 'sweatdrop',
    version: '1.0.0',
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',
    splash: {
      backgroundColor: '#6366f1',
      resizeMode: 'contain',
    },
    assetBundlePatterns: ['**/*'],
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.sweatdrop.app',
      infoPlist: {
        NSCameraUsageDescription:
          'We need access to your camera to scan QR codes on equipment.',
      },
    },
    android: {
      adaptiveIcon: {
        backgroundColor: '#6366f1',
      },
      package: 'com.sweatdrop.app',
      permissions: ['CAMERA'],
    },
    plugins: [
      'expo-router',
    ],
    scheme: 'sweatdrop',
    extra: {
      router: {
        origin: false,
      },
    },
  },
};
