module.exports = {
  // Must match `namespace` / applicationId in android/app/build.gradle. RN Gradle uses this for
  // ReactNativeApplicationEntryPoint BuildConfig references; keep in sync when changing the app id.
  project: {
    android: {
      packageName: 'com.sweatdrop.app',
    },
  },
  dependencies: {
    'react-native-ble-manager': {
      platforms: {
        ios: null,
      },
    },
  },
};
