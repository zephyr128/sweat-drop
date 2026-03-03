import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState, useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { Session, AuthChangeEvent } from '@supabase/supabase-js';
import { ThemeProvider, useTheme } from '@/lib/contexts/ThemeContext';
import { GymDataInitializer } from '@/components/GymDataInitializer';
import BleManager from 'react-native-ble-manager';
import { BleManager as BleManagerIOS } from 'react-native-ble-plx';
import * as SplashScreen from 'expo-splash-screen';
import {
  PUSH_NOTIFICATIONS_ENABLED,
  configureNotificationHandler,
  registerForPushNotifications,
  savePushToken,
  addNotificationListeners,
  getInitialNotification,
  getDeepLinkFromNotification,
} from '@/lib/notifications';

// AGENT NOTE: [2026-03-02] - mobile-coder (Task 3.1)
// Configure notification handler OUTSIDE of component (must run before any notification arrives)
// Guarded: no-ops when push notifications are disabled (Personal Dev Team limitation).
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
          fontWeight: 'bold',
        },
        contentStyle: {
          backgroundColor: '#000000', // Black background to match splash
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
          presentation: 'modal', // iOS-style slide-up modal
          gestureEnabled: false, // Prevent swipe to dismiss
        }} 
      />
      <Stack.Screen name="workout" options={{ headerShown: false }} />
      <Stack.Screen name="session-summary" options={{ headerShown: false }} />
      <Stack.Screen name="workout-history" options={{ headerShown: false }} />
      <Stack.Screen name="profile" options={{ headerShown: false }} />
    </Stack>
  );
}

// Prevent splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const router = useRouter();
  const pushTokenRegistered = useRef(false);

  // Push notification tap handler — navigates to the deep link route
  const handleNotificationTap = useCallback((deepLink: string | null) => {
    if (deepLink) {
      console.log('[App] Navigating from notification tap:', deepLink);
      // Small delay to ensure navigation stack is ready
      setTimeout(() => {
        router.push(deepLink as any);
      }, 100);
    }
  }, [router]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      setSession(session);
    });

    // Initialize BLE Manager
    if (Platform.OS === 'android') {
      BleManager.start({ showAlert: false })
        .then(() => {
          console.log('[App] BLE Manager initialized (Android)');
        })
        .catch((error) => {
          console.error('[App] Failed to initialize BLE Manager:', error);
        });
    }
    // iOS BLE Manager is initialized in ble-service.ts

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PUSH NOTIFICATIONS — register token when user is authenticated
  // Disabled when PUSH_NOTIFICATIONS_ENABLED = false (Personal Dev Team)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  useEffect(() => {
    if (!PUSH_NOTIFICATIONS_ENABLED) return;
    if (!session?.user?.id) {
      pushTokenRegistered.current = false;
      return;
    }

    // Only register once per session
    if (pushTokenRegistered.current) return;
    pushTokenRegistered.current = true;

    const registerPush = async () => {
      const token = await registerForPushNotifications();
      if (token) {
        await savePushToken(session.user.id, token);
      }
    };

    registerPush();

    // Check if app was opened from a notification (cold start)
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

  return (
    <ThemeProvider>
      <GymDataInitializer />
      <StackNavigator />
      <StatusBar style="light" />
    </ThemeProvider>
  );
}
