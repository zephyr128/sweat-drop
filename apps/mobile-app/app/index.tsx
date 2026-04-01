import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '@/lib/stores/authStore';
import { shouldRequireEmailVerification } from '@/lib/authEmailVerification';
import { log } from '@/lib/logger';

// Keep splash screen visible while we determine the initial route
SplashScreen.preventAutoHideAsync();

export default function Index() {
  const router = useRouter();
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const session = useAuthStore((s) => s.session);
  const onboardingStep = useAuthStore((s) => s.onboardingStep);

  const [pushAsked, setPushAsked] = useState<boolean | null>(null);
  const [hasNavigated, setHasNavigated] = useState(false);

  // Load push notification status from AsyncStorage
  useEffect(() => {
    const loadPushStatus = async () => {
      try {
        const status = await AsyncStorage.getItem('pushNotificationsAsked');
        setPushAsked(status === 'true');
      } catch {
        setPushAsked(false);
      }
    };
    loadPushStatus();
  }, []);

  // Navigate once auth is initialized and push status is loaded
  useEffect(() => {
    if (!isInitialized || pushAsked === null || hasNavigated) return;

    const navigate = async () => {
      try {
        // Hide splash screen
        await SplashScreen.hideAsync();
        // Small delay for smooth transition
        await new Promise((resolve) => setTimeout(resolve, 100));

        if (!session) {
          router.replace('/(onboarding)/welcome');
        } else if (shouldRequireEmailVerification(session?.user)) {
          router.replace('/(onboarding)/verify-email');
        } else if (onboardingStep !== 'done') {
          // Resume onboarding at the correct step
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
              if (!pushAsked) {
                router.replace('/(onboarding)/notifications');
              } else {
                // Already asked — re-fetch profile to determine next step
                await useAuthStore.getState().fetchProfile();
                const nextStep = useAuthStore.getState().onboardingStep;
                if (nextStep === 'profile_setup') {
                  router.replace('/(onboarding)/step-gender');
                } else {
                  useAuthStore.getState().setOnboardingStep('done');
                  router.replace('/home');
                }
              }
              break;
            case 'profile_setup':
              router.replace('/(onboarding)/step-gender');
              break;
            default:
              router.replace('/home');
          }
        } else {
          // Existing users after reinstall should still see the push prompt screen once.
          if (!pushAsked) {
            router.replace('/(onboarding)/notifications');
          } else {
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
  }, [isInitialized, session, onboardingStep, pushAsked, hasNavigated, router]);

  // Render nothing — splash screen is visible until navigation
  return null;
}
