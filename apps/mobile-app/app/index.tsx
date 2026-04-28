import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useThrottledRouter } from '@/hooks/useThrottledRouter';
import * as SplashScreen from 'expo-splash-screen';
import { useAuthStore } from '@/lib/stores/authStore';
import { usePendingQRStore } from '@/lib/stores/usePendingQRStore';
import { shouldRequireEmailVerification } from '@/lib/authEmailVerification';
import { isConsumerRole } from '@/lib/auth/isConsumerAccount';
import { parseQrPayload } from '@/lib/qr/handleQrDeepLink';
import { log } from '@/lib/logger';

// Keep splash screen visible while we determine the initial route
SplashScreen.preventAutoHideAsync();

export default function Index() {
  const router = useThrottledRouter();
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const session = useAuthStore((s) => s.session);
  const profile = useAuthStore((s) => s.profile);
  const onboardingStep = useAuthStore((s) => s.onboardingStep);
  const pendingPasswordRecovery = useAuthStore((s) => s.pendingPasswordRecovery);
  const pendingVerificationEmail = useAuthStore((s) => s.pendingVerificationEmail);
  const consumePendingQR = usePendingQRStore((s) => s.consumePendingQR);

  const [hasNavigated, setHasNavigated] = useState(false);

  // Navigate once auth is initialized
  useEffect(() => {
    if (!isInitialized || hasNavigated) return;

    const navigate = async () => {
      try {
        // Hide splash screen
        await SplashScreen.hideAsync();
        // Small delay for smooth transition
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Password recovery deep-link: _layout.tsx will navigate to reset-password
        // once this flag is set. Yield here so we don't overwrite that navigation.
        if (pendingPasswordRecovery) {
          setHasNavigated(true);
          return;
        }

        if (!session) {
          // If a QR deep link arrived while unauthenticated, we discard it here.
          // The user must log in first; they can re-scan after.
          consumePendingQR();
          // Cold-start recovery: user signed up (email confirmation required)
          // but the OS evicted the app before confirmation. Route them back
          // to verify-email so the recovery CTA is shown.
          if (pendingVerificationEmail) {
            router.replace('/(onboarding)/verify-email');
          } else {
            router.replace('/(onboarding)/welcome');
          }
        } else if (profile && !isConsumerRole(profile.role)) {
          // Elevated role detected — authStore.fetchProfile() is already calling
          // rejectElevatedSession() which signs out and resets state. Yield here
          // so we don't race ahead and navigate into onboarding before reset settles.
          log.warn('[Index] Elevated role in profile — yielding for authStore rejection');
          setHasNavigated(true);
          return;
        } else if (shouldRequireEmailVerification(session?.user)) {
          consumePendingQR();
          router.replace('/(onboarding)/verify-email');
        } else if (onboardingStep !== 'done') {
          // Resume onboarding at the correct step
          consumePendingQR();
          switch (onboardingStep) {
            case 'auth':
              router.replace('/(onboarding)/auth');
              break;
            case 'stepper':
              router.replace('/(onboarding)/stepper');
              break;
            case 'display_name':
              router.replace('/(onboarding)/username');
              break;
            case 'avatar':
              router.replace('/(onboarding)/avatar');
              break;
            case 'notifications':
              router.replace('/(onboarding)/notifications');
              break;
            case 'profile_setup':
              router.replace('/(onboarding)/step-gender');
              break;
            default:
              router.replace('/home');
          }
        } else {
          // Logged in and onboarding done — check for pending QR from native camera
          const pendingQR = consumePendingQR();
          if (pendingQR) {
            log.debug('[Index] Pending QR from cold-start deep link, routing directly:', pendingQR);
            const parsed = parseQrPayload(pendingQR);
            router.replace('/home');
            // Delay > useThrottledRouter THROTTLE_MS (600ms) so the second
            // navigation actually fires (the throttle ref was just bumped by
            // the router.replace above and would silently drop a follow-up
            // call within 600ms, leaving the user stuck on /home with no
            // deep-link processing).
            setTimeout(() => {
              if (parsed.kind === 'machine') {
                router.push({
                  pathname: '/m/[uuid]',
                  params: {
                    uuid: parsed.qrUuid,
                    ...(parsed.sensorHint ? { s: parsed.sensorHint } : {}),
                  },
                });
              } else if (parsed.kind === 'checkin') {
                router.push({
                  pathname: '/c/[gymId]',
                  params: { gymId: parsed.gymId },
                });
              } else {
                router.push({ pathname: '/scan', params: { autoQR: pendingQR } });
              }
            }, 800);
          } else {
            // onboarding_completed — go straight to home.
            // Push token sync for returning users happens silently in _layout.tsx.
            router.replace('/home');
          }
        }

        setHasNavigated(true);
      } catch (e) {
        log.warn('[Index] Error during navigation:', e);
        setHasNavigated(true);
        await SplashScreen.hideAsync();
      }
    };

    navigate();
  }, [
    isInitialized,
    session,
    profile,
    onboardingStep,
    pendingPasswordRecovery,
    pendingVerificationEmail,
    hasNavigated,
    router,
    consumePendingQR,
  ]);

  return <View style={{ flex: 1, backgroundColor: '#000000' }} />;
}
