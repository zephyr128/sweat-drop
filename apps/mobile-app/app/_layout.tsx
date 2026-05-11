import '@/lib/i18n';
import { Stack, useSegments } from 'expo-router';
import { ThemeProvider as NavigationThemeProvider, DarkTheme } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useCallback } from 'react';
import { AppState, Platform, Linking, View } from 'react-native';
import { ThemeProvider, useTheme } from '@/lib/contexts/ThemeContext';
import { GymDataInitializer } from '@/components/GymDataInitializer';
import { useAuthStore } from '@/lib/stores/authStore';
import { usePendingReferralStore } from '@/lib/stores/usePendingReferralStore';
import { usePendingQRStore } from '@/lib/stores/usePendingQRStore';
import { supabase } from '@/lib/supabase';
import * as SplashScreen from 'expo-splash-screen';
import { useThrottledRouter } from '@/hooks/useThrottledRouter';
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
  clearPushToken,
  addNotificationListeners,
  getInitialNotification,
  getDeepLinkFromNotification,
} from '@/lib/notifications';
import { log } from '@/lib/logger';
import { shouldRequireEmailVerification } from '@/lib/authEmailVerification';
import { isConsumerRole, rejectElevatedSession } from '@/lib/auth/isConsumerAccount';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { OfflineBanner } from '@/components/OfflineBanner';
import { AppModal } from '@/components/AppModal';
import { useActiveSessionRecoveryWatch } from '@/lib/workout/useActiveSessionRecovery';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

const APP_NAV_THEME = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: '#000000',
    card: '#000000',
  },
};

// Inner component that uses theme (must be inside ThemeProvider)
function StackNavigator() {
  const { branding } = useTheme();

  return (
    <NavigationThemeProvider value={APP_NAV_THEME}>
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
        // Default slide animation for all screens — overridden per-screen below.
        // This eliminates the Android white-flash + material scale transition.
        animation: 'slide_from_right',
        animationDuration: 280,
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false, animation: 'none' }} />
      <Stack.Screen
        name="(onboarding)"
        options={{
          headerShown: false,
          animation: 'fade',
          animationDuration: 300,
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="home"
        options={{
          headerShown: false,
          animation: 'fade',
          animationDuration: 300,
          gestureEnabled: false,
        }}
      />
      <Stack.Screen name="wallet" options={{ headerShown: false }} />
      <Stack.Screen name="stats" options={{ headerShown: false }} />
      <Stack.Screen name="store" options={{ headerShown: false }} />
      <Stack.Screen name="reward-detail" options={{ headerShown: false }} />
      <Stack.Screen name="challenges" options={{ headerShown: false }} />
      <Stack.Screen name="challenge-detail" options={{ headerShown: false }} />
      <Stack.Screen name="redemptions" options={{ headerShown: false }} />
      <Stack.Screen name="gym-detail" options={{ headerShown: false }} />
      <Stack.Screen name="leaderboard" options={{ headerShown: false }} />
      <Stack.Screen name="smartcoach" options={{ headerShown: false }} />
      <Stack.Screen name="trophy-room" options={{ headerShown: false }} />
      <Stack.Screen name="gym-plans" options={{ headerShown: false }} />
      <Stack.Screen name="plan-detail" options={{ headerShown: false }} />
      <Stack.Screen
        name="scan"
        options={{
          headerShown: false,
          presentation: 'transparentModal',
          animation: 'slide_from_bottom',
          animationDuration: 320,
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="gym-welcome"
        options={{
          headerShown: false,
          presentation: 'transparentModal',
          animation: 'fade',
          animationDuration: 400,
          gestureEnabled: false,
        }}
      />
      <Stack.Screen name="checkin-result" options={{ headerShown: false, presentation: 'transparentModal', animation: 'fade', gestureEnabled: false }} />
      <Stack.Screen name="workout" options={{ headerShown: false }} />
      <Stack.Screen name="workout-sim" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="session-summary" options={{ headerShown: false }} />
      <Stack.Screen name="workout-history" options={{ headerShown: false }} />
      <Stack.Screen name="arenas" options={{ headerShown: false }} />
      <Stack.Screen name="arena" options={{ headerShown: false }} />
      <Stack.Screen name="gyms" options={{ headerShown: false }} />
      <Stack.Screen name="user/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="profile" options={{ headerShown: false, animation: 'slide_from_bottom', animationDuration: 350 }} />
      <Stack.Screen name="settings" options={{ headerShown: false }} />
      <Stack.Screen name="notifications" options={{ headerShown: false }} />
      <Stack.Screen name="happy-hours" options={{ headerShown: false }} />
      <Stack.Screen name="invite-friend" options={{ headerShown: false }} />
      <Stack.Screen name="auth/confirm" options={{ headerShown: false, animation: 'none' }} />
      <Stack.Screen name="join/[code]" options={{ headerShown: false, animation: 'none' }} />
      <Stack.Screen name="transactions" options={{ headerShown: false }} />
      {/* QR/NFC deep-link routes — plain card screens (NOT transparentModal).
          Foreground NFC/QR taps router.push one of these, the route's
          useEffect runs handleQrDeepLink which router.replace's onto the
          real destination (/workout, /checkin-result, /gym-welcome, /home).
          Using transparentModal here used to contaminate the destination
          screen with iOS modal presentation context, so /workout appeared
          as a stacked modal instead of a full-screen workout view.
          A short fade hides the brief black-screen mount. */}
      <Stack.Screen
        name="m/[uuid]"
        options={{
          headerShown: false,
          animation: 'fade',
          animationDuration: 200,
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="c/[gymId]"
        options={{
          headerShown: false,
          animation: 'fade',
          animationDuration: 200,
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="machine/[uuid]"
        options={{
          headerShown: false,
          animation: 'fade',
          animationDuration: 200,
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="checkin/[gymId]"
        options={{
          headerShown: false,
          animation: 'fade',
          animationDuration: 200,
          gestureEnabled: false,
        }}
      />
    </Stack>
    </NavigationThemeProvider>
  );
}

function parseReferralCode(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(/(?:sweatdrop:\/\/|https?:\/\/(?:www\.)?sweat-drop\.com\/)join\/([A-Za-z0-9_\-%.]+)/);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/**
 * Extract Supabase auth tokens from a deep link URL.
 * Checks query parameters first (Android-safe), then hash fragment (iOS / legacy).
 *
 * Android strips hash fragments from custom-scheme intents, so the landing page
 * now sends tokens as query params:
 *   sweatdrop://auth/confirm?access_token=...&refresh_token=...&type=signup
 *
 * Hash fragment parsing is kept for backward compatibility (iOS universal links,
 * older landing page versions):
 *   sweatdrop://auth/confirm#access_token=...&refresh_token=...
 */
function parseAuthTokensFromUrl(url: string | null): {
  accessToken: string;
  refreshToken: string;
  type: string | null;
  passwordUpdated: boolean;
} | null {
  if (!url) return null;

  const extract = (params: URLSearchParams) => ({
    type: params.get('type'),
    passwordUpdated: params.get('password_updated') === '1',
  });

  // Try query parameters first (Android-safe path)
  const qIndex = url.indexOf('?');
  if (qIndex !== -1) {
    const qStr = url.slice(qIndex + 1).split('#')[0];
    const qParams = new URLSearchParams(qStr);
    const qAccess = qParams.get('access_token');
    const qRefresh = qParams.get('refresh_token');
    if (qAccess && qRefresh) {
      return { accessToken: qAccess, refreshToken: qRefresh, ...extract(qParams) };
    }
  }

  // Fallback: hash fragment (works on iOS, may be stripped on Android)
  const hashIndex = url.indexOf('#');
  if (hashIndex !== -1) {
    const hash = url.slice(hashIndex + 1);
    const hParams = new URLSearchParams(hash);
    const hAccess = hParams.get('access_token');
    const hRefresh = hParams.get('refresh_token');
    if (hAccess && hRefresh) {
      return { accessToken: hAccess, refreshToken: hRefresh, ...extract(hParams) };
    }
  }

  return null;
}

// Prevent splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const router = useThrottledRouter();
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
  const setPendingQR = usePendingQRStore((s) => s.setPendingQR);
  // cold-start QR URL — stored here before auth is ready, consumed in effect below
  const coldStartQRUrl = useRef<string | null>(null);

  // Deferred Sentry init — avoids top-level TurboModule access that can
  // throw native exceptions and corrupt Hermes GC in release builds.
  useEffect(() => {
    import('@/lib/sentry').then(({ initSentry }) => {
      try { initSentry(); } catch { /* swallow — non-critical */ }
    });
  }, []);

  // Hydrate pending referral code from AsyncStorage on cold start
  useEffect(() => {
    hydratePendingReferral();
  }, []);

  // Deep link handler for ALL incoming URLs:
  // - HTTPS Universal / App Links (sweat-drop.com/m/... /c/...)
  // - Legacy sweatdrop:// custom scheme (sweatdrop://machine/... /checkin/...)
  // - Auth tokens, referral codes
  useEffect(() => {
    const processUrl = async (url: string, isWarmLaunch: boolean) => {
      // HTTPS Universal / App Links: sweat-drop.com/m/<uuid> and /c/<gymId>
      // expo-router's origin is false so it cannot auto-resolve these; handle explicitly.
      const httpsMatch = url.match(
        /^https:\/\/(?:www\.)?sweat-drop\.com\/(m|c)\/([^?#]+)(\?.*)?$/,
      );
      if (httpsMatch) {
        const [, type, id, qs] = httpsMatch;
        log.debug('[App] HTTPS deep link received:', url, 'warm:', isWarmLaunch);
        if (isWarmLaunch) {
          const currentSession = useAuthStore.getState().session;
          if (!currentSession?.user) {
            router.replace('/(onboarding)/welcome');
            return;
          }
          // push (not replace) so the previous screen (e.g. /home) stays on
          // the stack beneath the deep-link route. /m/[uuid] then immediately
          // router.replace's onto /workout (or /checkin-result), giving the
          // user a back-stack of [home, workout] they can swipe back from.
          if (type === 'm') {
            const sensorParam = qs
              ? new URLSearchParams(qs.slice(1)).get('s') ??
                new URLSearchParams(qs.slice(1)).get('sensor')
              : null;
            router.push({
              pathname: '/m/[uuid]',
              params: { uuid: id, ...(sensorParam ? { s: sensorParam } : {}) },
            });
          } else {
            router.push({ pathname: '/c/[gymId]', params: { gymId: id } });
          }
        } else {
          coldStartQRUrl.current = url;
        }
        return;
      }

      // QR deep links via legacy sweatdrop:// custom scheme.
      const isCheckin = url.startsWith('sweatdrop://checkin/');
      const isMachine = url.startsWith('sweatdrop://machine/');
      if (isCheckin || isMachine) {
        log.debug('[App] QR deep link received:', url, 'warm:', isWarmLaunch);
        if (isWarmLaunch) {
          const currentSession = useAuthStore.getState().session;
          if (!currentSession?.user) {
            router.replace('/(onboarding)/welcome');
            return;
          }
          if (isMachine) {
            const rest = url.slice('sweatdrop://machine/'.length);
            const [uuid, qs] = rest.split('?');
            const sensorParam = qs
              ? new URLSearchParams(qs).get('sensor') ??
                new URLSearchParams(qs).get('s')
              : null;
            router.push({
              pathname: '/machine/[uuid]',
              params: { uuid, ...(sensorParam ? { s: sensorParam } : {}) },
            });
          } else {
            const gymId = url.slice('sweatdrop://checkin/'.length);
            router.push({ pathname: '/checkin/[gymId]', params: { gymId } });
          }
        } else {
          coldStartQRUrl.current = url;
        }
        return;
      }

      // Auth tokens from landing page (email confirm / password reset)
      const tokens = parseAuthTokensFromUrl(url);
      if (tokens) {
        const isRecovery = tokens.type === 'recovery';
        log.debug('[App] Auth tokens received via deep link, type:', tokens.type, 'passwordUpdated:', tokens.passwordUpdated);

        // Set the recovery flag BEFORE setSession so that index.tsx (which
        // fires once isInitialized becomes true) can see it immediately.
        // This eliminates the race where index.tsx reads the flag before
        // the async setSession completes.
        if (isRecovery) {
          useAuthStore.getState().setPendingPasswordRecovery(tokens.passwordUpdated);
        }

        try {
          const { error } = await supabase.auth.setSession({
            access_token: tokens.accessToken,
            refresh_token: tokens.refreshToken,
          });
          if (error) {
            log.warn('[App] setSession from deep link failed:', error.message);
            if (isRecovery) {
              useAuthStore.getState().clearPendingPasswordRecovery();
            }
          } else {
            // Defense-in-depth: check role BEFORE allowing recovery flow to proceed.
            // An admin resetting their password on mobile must be rejected here so that
            // pendingPasswordRecovery never becomes visible to the in-app reset screen.
            const { data: userData } = await supabase.auth.getUser();
            if (userData?.user) {
              // Wait briefly for authStore to settle its profile fetch triggered by
              // onAuthStateChange SIGNED_IN (which also checks role). If the profile
              // isn't ready yet, read role from app_metadata as a fast fallback.
              const appMetaRole =
                (userData.user.app_metadata?.role as string | undefined) ??
                (userData.user.user_metadata?.role as string | undefined);
              if (appMetaRole !== undefined && !isConsumerRole(appMetaRole)) {
                log.warn('[App] Deep-link setSession: elevated role detected, rejecting', { role: appMetaRole });
                if (isRecovery) {
                  useAuthStore.getState().clearPendingPasswordRecovery();
                }
                await rejectElevatedSession('deep_link_elevated_role', appMetaRole);
                return;
              }
            }
          }
        } catch (e) {
          log.warn('[App] setSession from deep link exception:', e);
          if (isRecovery) {
            useAuthStore.getState().clearPendingPasswordRecovery();
          }
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

  // Cold-start QR: once auth is initialized, route to appropriate screen.
  // If user is logged in → save QR to store so index.tsx opens /scan with autoQR.
  // If user is not logged in → index.tsx will route to welcome; QR is stored for
  // after login (user will need to scan again — we show a hint via pendingQR store).
  useEffect(() => {
    if (!coldStartQRUrl.current) return;
    if (!isInitialized) return;

    const url = coldStartQRUrl.current;
    coldStartQRUrl.current = null;

    if (!session?.user) {
      // Not logged in — save so index.tsx can show a hint after login
      setPendingQR(url);
      log.debug('[App] Cold-start QR — user not logged in, storing for later:', url);
      return;
    }

    // Logged in — save to store, index.tsx will open /scan?autoQR=...
    log.debug('[App] Cold-start QR — user logged in, routing to scan:', url);
    setPendingQR(url);
  }, [isInitialized, session?.user]);

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

  // Keep session in a ref so the notification tap callback never changes reference.
  //
  // BUG: useThrottledRouter() returns a new object literal `{ ...router, push, … }`
  // on every render. Putting that object in useCallback deps means handleNotificationTap
  // is a new function reference on EVERY render. addNotificationListeners' effect
  // re-runs on every render, re-registering addNotificationResponseReceivedListener.
  // On Android, a newly registered listener replays the notification that launched
  // the app → router.push fires again → user lands back on the notification screen
  // every time the component re-renders (navigation changes, auth token refreshes, …).
  //
  // FIX: read session via a ref (never stale, no dependency), and use the individually
  // stable push/replace callbacks from useThrottledRouter (each is a memoised
  // useCallback with stable deps inside useThrottledRouter) so the outer useCallback
  // deps are truly stable → handleNotificationTap identity never changes.
  const notifSessionRef = useRef(session);
  notifSessionRef.current = session;

  // These are the individually-memoised methods — stable across renders.
  const { push: routerPush, replace: routerReplace } = router;

  // Track the last notification we have already navigated for so that the
  // getInitialNotification path and the addNotificationResponseReceivedListener
  // path cannot both fire for the same cold-start notification.
  const lastHandledDeepLink = useRef<string | null>(null);

  const handleNotificationTap = useCallback(
    (deepLink: string | null) => {
      if (shouldRequireEmailVerification(notifSessionRef.current?.user)) {
        routerReplace('/(onboarding)/verify-email');
        return;
      }
      if (deepLink) {
        // Deduplicate: ignore if this exact link was just handled (within 2s).
        // Prevents double-fire when both getInitialNotification and the response
        // listener deliver the same cold-start notification on Android.
        if (lastHandledDeepLink.current === deepLink) {
          log.debug('[App] Notification tap deduplicated (already handled):', deepLink);
          return;
        }
        lastHandledDeepLink.current = deepLink;
        setTimeout(() => { lastHandledDeepLink.current = null; }, 2000);

        log.debug('[App] Navigating from notification tap:', deepLink);
        setTimeout(() => {
          routerPush(deepLink as any);
        }, 100);
      }
    },
    [routerPush, routerReplace], // stable: individually memoised inside useThrottledRouter
  );

  // Single auth initialization — THE ONLY auth listener in the app
  useEffect(() => {
    const cleanup = initialize();
    return cleanup;
  }, []);

  // Drain any pending workout finalization left over from a previous session
  // where the network was unavailable at workout end. Runs once after auth is
  // ready so award_drops has a valid JWT. Silently no-ops if nothing is pending.
  useEffect(() => {
    if (!isInitialized || !session?.user) return;
    import('@/lib/workout/pendingFinalization').then(({ drainPendingFinalization }) => {
      drainPendingFinalization();
    });
  }, [isInitialized, session?.user]);

  // Bug 4b: detect orphan `is_active = true` sessions left over from a
  // previous app run and surface the recovery banner on /home. The hook
  // reads its own auth + segments state and is gated internally.
  useActiveSessionRecoveryWatch();

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
    configureNotificationHandler();
  }, []);

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

  // On app foreground: if permission was revoked, clear the stale push token
  // so the backend stops trying to send pushes and the inbox banner can appear.
  useEffect(() => {
    if (!PUSH_NOTIFICATIONS_ENABLED || !session?.user?.id) return;
    const userId = session.user.id;

    const checkPermissionOnForeground = async () => {
      const status = await getPushPermissionStatus();
      if (status === 'denied') {
        const { data } = await supabase
          .from('profiles')
          .select('expo_push_token')
          .eq('id', userId)
          .single();
        if (data?.expo_push_token) {
          await clearPushToken(userId);
          log.debug('[App] Push permission denied — stale token cleared');
        }
      }
    };

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void checkPermissionOnForeground();
      }
    });

    return () => sub.remove();
  }, [session?.user?.id]);

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
  // Guard with isInitialized so this fires after index.tsx has already run and
  // the navigator is ready. Without this, a cold-start deep link would set the
  // flag before the router is mounted and index.tsx would overwrite the navigation.
  //
  // CRITICAL: skip the navigation if we're ALREADY on /reset-password. The
  // in-app fallback flow calls supabase.auth.verifyOtp({type:'recovery'}) from
  // inside the reset-password screen, which fires a second PASSWORD_RECOVERY
  // auth event → authStore flips pendingPasswordRecovery=true again → without
  // this guard router.replace remounts the screen, its unmount cleanup wipes
  // passwordAlreadyReset/pendingRecoveryTokenHash and local formDone state
  // resets to false, so the user sees the password form a second time right
  // after successful update. Just clear the flag and stay put.
  useEffect(() => {
    if (!isInitialized) return;
    if (!pendingPasswordRecovery) return;
    const inOnboarding = segments[0] === '(onboarding)';
    const onResetPassword =
      inOnboarding && (segments as string[])[1] === 'reset-password';
    clearPendingPasswordRecovery();
    if (onResetPassword) return;
    router.replace('/(onboarding)/reset-password');
  }, [
    isInitialized,
    pendingPasswordRecovery,
    clearPendingPasswordRecovery,
    router,
    segments,
  ]);

  // Ensure native splash dismisses even when the initial route skips index.tsx
  // (Universal Link → /m/[uuid] / /c/[gymId] hydration). index.tsx also
  // hides the splash after auth routing — duplicate hideAsync is safe.
  useEffect(() => {
    if (!fontsLoaded && !fontError) return;
    void SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return <View style={{ flex: 1, backgroundColor: '#000000' }} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <ThemeProvider>
          <GymDataInitializer />
          <StackNavigator />
          <StatusBar style="light" />
          <OfflineBanner />
          <AppModal />
        </ThemeProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
