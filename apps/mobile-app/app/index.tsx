import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useAuthStore } from '@/lib/stores/authStore';
import { usePendingQRStore } from '@/lib/stores/usePendingQRStore';
import { shouldRequireEmailVerification } from '@/lib/authEmailVerification';
import { log } from '@/lib/logger';

// Keep splash screen visible while we determine the initial route
SplashScreen.preventAutoHideAsync();

export default function Index() {
  const router = useRouter();
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const session = useAuthStore((s) => s.session);
  const onboardingStep = useAuthStore((s) => s.onboardingStep);
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

        if (!session) {
          // If a QR deep link arrived while unauthenticated, we discard it here.
          // The user must log in first; they can re-scan after.
          consumePendingQR();
          router.replace('/(onboarding)/welcome');
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
            log.debug('[Index] Pending QR from cold-start deep link, opening scan:', pendingQR);
            router.replace('/home');
            // Small delay so home mounts before scan modal opens
            setTimeout(() => {
              router.push({ pathname: '/scan', params: { autoQR: pendingQR } });
            }, 400);
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
  }, [isInitialized, session, onboardingStep, hasNavigated, router]);

  return <View style={{ flex: 1, backgroundColor: '#000000' }} />;
}
