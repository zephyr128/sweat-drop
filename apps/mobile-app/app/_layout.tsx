import '@/lib/i18n'; // Initialize i18n before anything else
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import { ThemeProvider, useTheme } from '@/lib/contexts/ThemeContext';
import { GymDataInitializer } from '@/components/GymDataInitializer';
import { useAuthStore } from '@/lib/stores/authStore';
import BleManager from 'react-native-ble-manager';
import * as SplashScreen from 'expo-splash-screen';
import { useRouter } from 'expo-router';
import { useFonts } from 'expo-font';
import {
  BebasNeue_400Regular,
} from '@expo-google-fonts/bebas-neue';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import {
  SpaceMono_400Regular,
} from '@expo-google-fonts/space-mono';
import {
  PUSH_NOTIFICATIONS_ENABLED,
  configureNotificationHandler,
  registerForPushNotifications,
  savePushToken,
  addNotificationListeners,
  getInitialNotification,
  getDeepLinkFromNotification,
} from '@/lib/notifications';

// Configure notification handler OUTSIDE of component (must run before any notification arrives)
if (PUSH_NOTIFICATIONS_ENABLED) {
  configureNotificationHandler();
}

// Inner component that uses theme (must be inside ThemeProvider)
function StackNavigator() {
  const { branding } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: branding.primary,
        },
        headerTintColor: branding.onPrimary,
        headerTitleStyle: {
          fontFamily: 'BebasNeue_400Regular',
        },
        contentStyle: {
          backgroundColor: '#000000',
        },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen
        name="(onboarding)"
        options={{
          headerShown: false,
          animation: 'fade' as any,
          animationDuration: 300,
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="home"
        options={{
          headerShown: false,
          animation: 'fade' as any,
          animationDuration: 300,
        }}
      />
      <Stack.Screen name="wallet" options={{ headerShown: false }} />
      <Stack.Screen name="store" options={{ headerShown: false }} />
      <Stack.Screen name="challenges" options={{ headerShown: false }} />
      <Stack.Screen name="challenge-detail" options={{ headerShown: false }} />
      <Stack.Screen name="redemptions" options={{ headerShown: false }} />
      <Stack.Screen name="leaderboard" options={{ headerShown: false }} />
      <Stack.Screen name="smartcoach" options={{ headerShown: false }} />
      <Stack.Screen name="trophy-room" options={{ headerShown: false }} />
      <Stack.Screen name="gym-plans" options={{ headerShown: false }} />
      <Stack.Screen name="plan-detail" options={{ headerShown: false }} />
      <Stack.Screen
        name="scan"
        options={{
          headerShown: false,
          presentation: 'modal',
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="gym-welcome"
        options={{
          headerShown: false,
          presentation: 'modal',
          animation: 'fade',
          animationDuration: 400,
          gestureEnabled: false,
        }}
      />
      <Stack.Screen name="checkin-result" options={{ headerShown: false, presentation: 'modal', gestureEnabled: false }} />
      <Stack.Screen name="workout" options={{ headerShown: false }} />
      <Stack.Screen name="session-summary" options={{ headerShown: false }} />
      <Stack.Screen name="workout-history" options={{ headerShown: false }} />
      <Stack.Screen name="arenas" options={{ headerShown: false }} />
      <Stack.Screen name="arena" options={{ headerShown: false }} />
      <Stack.Screen name="gyms" options={{ headerShown: false }} />
      <Stack.Screen name="user/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="profile" options={{ headerShown: false, animation: 'slide_from_bottom', animationDuration: 350 }} />
    </Stack>
  );
}

// Prevent splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const router = useRouter();
  const initialize = useAuthStore((s) => s.initialize);
  const session = useAuthStore((s) => s.session);
  const pushTokenRegistered = useRef(false);

  // Load custom fonts
  const [fontsLoaded, fontError] = useFonts({
    BebasNeue_400Regular,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    SpaceMono_400Regular,
  });

  // Push notification tap handler
  const handleNotificationTap = useCallback(
    (deepLink: string | null) => {
      if (deepLink) {
        console.log('[App] Navigating from notification tap:', deepLink);
        setTimeout(() => {
          router.push(deepLink as any);
        }, 100);
      }
    },
    [router],
  );

  // Single auth initialization — THE ONLY auth listener in the app
  useEffect(() => {
    const cleanup = initialize();
    return cleanup;
  }, []);

  // Initialize BLE Manager (Android)
  useEffect(() => {
    if (Platform.OS === 'android') {
      BleManager.start({ showAlert: false })
        .then(() => {
          console.log('[App] BLE Manager initialized (Android)');
        })
        .catch((error: any) => {
          console.error('[App] Failed to initialize BLE Manager:', error);
        });
    }
  }, []);

  // Push notifications — register token when user is authenticated
  useEffect(() => {
    if (!PUSH_NOTIFICATIONS_ENABLED) return;
    if (!session?.user?.id) {
      pushTokenRegistered.current = false;
      return;
    }

    if (pushTokenRegistered.current) return;
    pushTokenRegistered.current = true;

    const registerPush = async () => {
      const token = await registerForPushNotifications();
      if (token) {
        await savePushToken(session.user.id, token);
      }
    };

    registerPush();

    getInitialNotification().then((data) => {
      if (data) {
        const deepLink = getDeepLinkFromNotification(data);
        handleNotificationTap(deepLink);
      }
    });
  }, [session?.user?.id, handleNotificationTap]);

  // Push notification listeners (foreground + tap)
  useEffect(() => {
    if (!PUSH_NOTIFICATIONS_ENABLED) return;
    const cleanup = addNotificationListeners(handleNotificationTap);
    return cleanup;
  }, [handleNotificationTap]);

  // Block render until custom fonts are loaded
  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <ThemeProvider>
      <GymDataInitializer />
      <StackNavigator />
      <StatusBar style="light" />
    </ThemeProvider>
  );
}
