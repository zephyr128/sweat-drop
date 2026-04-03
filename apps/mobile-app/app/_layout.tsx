import { initSentry } from '@/lib/sentry';
initSentry();

import '@/lib/i18n'; // Initialize i18n before anything else
import { Stack, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useCallback } from 'react';
import { Platform, Linking } from 'react-native';
import { ThemeProvider, useTheme } from '@/lib/contexts/ThemeContext';
import { GymDataInitializer } from '@/components/GymDataInitializer';
import { useAuthStore } from '@/lib/stores/authStore';
import { usePendingReferralStore } from '@/lib/stores/usePendingReferralStore';
import { supabase } from '@/lib/supabase';
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
  getPushPermissionStatus,
  savePushToken,
  addNotificationListeners,
  getInitialNotification,
  getDeepLinkFromNotification,
} from '@/lib/notifications';
import { log } from '@/lib/logger';
import { shouldRequireEmailVerification } from '@/lib/authEmailVerification';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { OfflineBanner } from '@/components/OfflineBanner';
import { AppModal } from '@/components/AppModal';

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
      <Stack.Screen name="stats" options={{ headerShown: false }} />
      <Stack.Screen name="store" options={{ headerShown: false }} />
      <Stack.Screen name="reward-detail" options={{ headerShown: false }} />
      <Stack.Screen name="challenges" options={{ headerShown: false }} />
      <Stack.Screen name="challenge-detail" options={{ headerShown: false }} />
      <Stack.Screen name="redemptions" options={{ headerShown: false }} />
      <Stack.Screen name="gym-detail" options={{ headerShown: false, animation: 'slide_from_right' }} />
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
      <Stack.Screen name="workout-sim" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="session-summary" options={{ headerShown: false }} />
      <Stack.Screen name="workout-history" options={{ headerShown: false }} />
      <Stack.Screen name="arenas" options={{ headerShown: false }} />
      <Stack.Screen name="arena" options={{ headerShown: false }} />
      <Stack.Screen name="gyms" options={{ headerShown: false }} />
      <Stack.Screen name="user/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="profile" options={{ headerShown: false, animation: 'slide_from_bottom', animationDuration: 350 }} />
      <Stack.Screen name="settings" options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="happy-hours" options={{ headerShown: false }} />
      <Stack.Screen name="invite-friend" options={{ headerShown: false }} />
      <Stack.Screen name="auth/confirm" options={{ headerShown: false, animation: 'none' }} />
      <Stack.Screen name="join/[code]" options={{ headerShown: false, animation: 'none' }} />
      <Stack.Screen name="transactions" options={{ headerShown: false }} />
    </Stack>
  );
}

function parseReferralCode(url: string | null): string | null {
  if (!url) return null;
  // Match both plain and percent-encoded characters (encodeURIComponent from the web page)
  const match = url.match(/(?:sweatdrop:\/\/|https?:\/\/sweat-drop\.com\/)join\/([A-Za-z0-9_\-%.]+)/);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/**
 * Extract Supabase auth tokens from a deep link URL.
 * The landing page passes them as a hash fragment:
 *   sweatdrop://auth/confirm#access_token=...&refresh_token=...&type=signup
 */
function parseAuthTokensFromUrl(url: string | null): {
  accessToken: string;
  refreshToken: string;
} | null {
  if (!url) return null;
  // Look for hash fragment tokens in sweatdrop://auth/* URLs
  const hashIndex = url.indexOf('#');
  if (hashIndex === -1) return null;
  const hash = url.slice(hashIndex + 1);
  const params = new URLSearchParams(hash);
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

// Prevent splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const initialize = useAuthStore((s) => s.initialize);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const session = useAuthStore((s) => s.session);
  const pendingPasswordRecovery = useAuthStore((s) => s.pendingPasswordRecovery);
  const clearPendingPasswordRecovery = useAuthStore((s) => s.clearPendingPasswordRecovery);
  const pushTokenRegistered = useRef(false);
  const coldStartReferralCode = useRef<string | null>(null);
  const setPendingCode = usePendingReferralStore((s) => s.setPendingCode);
  const hydratePendingReferral = usePendingReferralStore((s) => s.hydrate);

  // Hydrate pending referral code from AsyncStorage on cold start
  useEffect(() => {
    hydratePendingReferral();
  }, []);

  // Deep link handler for sweatdrop:// URLs
  // Handles: sweatdrop://join/<code> (referral), sweatdrop://auth/confirm#... (email verification tokens)
  useEffect(() => {
    const processUrl = async (url: string, isWarmLaunch: boolean) => {
      // Auth tokens from landing page (email confirm / password reset)
      const tokens = parseAuthTokensFromUrl(url);
      if (tokens) {
        log.debug('[App] Auth tokens received via deep link');
        try {
          const { error } = await supabase.auth.setSession({
            access_token: tokens.accessToken,
            refresh_token: tokens.refreshToken,
          });
          if (error) {
            log.warn('[App] setSession from deep link failed:', error.message);
          }
        } catch (e) {
          log.warn('[App] setSession from deep link exception:', e);
        }
        return;
      }

      // Referral codes — always store the code.
      const code = parseReferralCode(url);
      if (code) {
        log.debug('[App] Referral deep link received:', code, 'warm:', isWarmLaunch);
        setPendingCode(code);
        if (isWarmLaunch) {
          setTimeout(() => router.navigate('/invite-friend' as any), 150);
        } else {
          // Flag for cold-start navigation effect (fires once user reaches a main screen)
          coldStartReferralCode.current = code;
        }
      }
    };

    // Cold start: just store the code, don't navigate (index.tsx handles routing)
    Linking.getInitialURL().then((url) => {
      if (url) processUrl(url, false);
    });

    // Warm/hot launch: store and navigate
    const sub = Linking.addEventListener('url', (event) => {
      processUrl(event.url, true);
    });
    return () => sub.remove();
  }, []);

  // Cold-start referral: once initial routing completes and user lands on a main
  // screen (home, wallet, etc.), auto-navigate to /invite-friend so they see the
  // accept sheet immediately. Only fires for codes from getInitialURL (not hydration).
  useEffect(() => {
    if (!coldStartReferralCode.current) return;
    if (!isInitialized || !session?.user) return;

    const topSegment = (segments as string[])[0];
    const isMainScreen =
      topSegment === 'home' ||
      topSegment === 'wallet' ||
      topSegment === 'profile' ||
      topSegment === 'stats';
    if (!isMainScreen) return;

    const code = coldStartReferralCode.current;
    coldStartReferralCode.current = null;
    log.debug('[App] Cold-start referral — navigating to invite-friend with code:', code);
    setTimeout(() => router.navigate('/invite-friend' as any), 300);
  }, [isInitialized, session?.user, segments]);

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
      if (shouldRequireEmailVerification(session?.user)) {
        router.replace('/(onboarding)/verify-email');
        return;
      }
      if (deepLink) {
        log.debug('[App] Navigating from notification tap:', deepLink);
        setTimeout(() => {
          router.push(deepLink as any);
        }, 100);
      }
    },
    [router, session?.user],
  );

  // Single auth initialization — THE ONLY auth listener in the app
  useEffect(() => {
    const cleanup = initialize();
    return cleanup;
  }, []);

  // Initialize BLE Manager (Android)
  useEffect(() => {
    if (Platform.OS === 'android') {
      (async () => {
        try {
          const module = await import('react-native-ble-manager');
          await module.default.start({ showAlert: false });
          log.debug('[App] BLE Manager initialized (Android)');
        } catch (error: unknown) {
          // Keep startup resilient even if BLE native module is unavailable.
          log.error('[App] Failed to initialize BLE Manager:', error);
        }
      })();
    }
  }, []);

  // Push notifications — sync token only when permission is already granted.
  // IMPORTANT: Do NOT trigger permission prompt here. Permission is requested
  // exclusively from the dedicated notifications onboarding screen.
  useEffect(() => {
    if (!PUSH_NOTIFICATIONS_ENABLED) return;
    if (!session?.user?.id) {
      pushTokenRegistered.current = false;
      return;
    }

    if (pushTokenRegistered.current) return;
    pushTokenRegistered.current = true;

    const syncGrantedPushToken = async () => {
      const permissionStatus = await getPushPermissionStatus();
      if (permissionStatus !== 'granted') {
        return;
      }
      const token = await registerForPushNotifications();
      if (token) {
        await savePushToken(session.user.id, token);
      }
    };

    syncGrantedPushToken();

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

  // Global verification guard to prevent deep-link/restore bypass.
  useEffect(() => {
    if (!isInitialized || !session?.user) return;
    if (!shouldRequireEmailVerification(session.user)) return;

    const childSegment = (segments as string[])[1];
    const inOnboarding = segments[0] === '(onboarding)';
    const onVerifyScreen = inOnboarding && childSegment === 'verify-email';
    if (!onVerifyScreen) {
      router.replace('/(onboarding)/verify-email');
    }
  }, [isInitialized, session?.user, segments, router]);

  // PASSWORD_RECOVERY deep-link handler — navigate to in-app reset screen.
  useEffect(() => {
    if (!pendingPasswordRecovery) return;
    clearPendingPasswordRecovery();
    router.replace('/(onboarding)/reset-password');
  }, [pendingPasswordRecovery, clearPendingPasswordRecovery, router]);

  // Block render until custom fonts are loaded
  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <GymDataInitializer />
        <StackNavigator />
        <StatusBar style="light" />
        <OfflineBanner />
        <AppModal />
      </ThemeProvider>
    </ErrorBoundary>
  );
}
