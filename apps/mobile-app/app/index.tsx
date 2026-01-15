import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import * as SplashScreen from 'expo-splash-screen';

// Keep splash screen visible while we load
SplashScreen.preventAutoHideAsync();

export default function Index() {
  const router = useRouter();
  const { session, loading } = useSession();
  const [checkingUsername, setCheckingUsername] = useState(true);
  const [hasUsername, setHasUsername] = useState(false);
  const [hasNavigated, setHasNavigated] = useState(false);

  // Check if user has username after session is loaded
  useEffect(() => {
    async function checkUsername() {
      if (loading) {
        return;
      }

      if (!session) {
        setCheckingUsername(false);
        return;
      }

      try {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('username')
          .eq('id', session.user.id)
          .single();

        if (error) {
          console.error('Error checking username:', error);
          setHasUsername(false);
        } else if (!profile) {
          console.log('No profile found for user');
          setHasUsername(false);
        } else {
          const hasValidUsername = profile.username && typeof profile.username === 'string' && !profile.username.startsWith('user_');
          console.log('Username check:', { username: profile.username, hasValidUsername });
          setHasUsername(hasValidUsername);
        }
      } catch (error) {
        console.error('Error checking username:', error);
        setHasUsername(false);
      } finally {
        setCheckingUsername(false);
      }
    }

    checkUsername();
  }, [session, loading]);

  // Handle navigation and splash screen hiding
  useEffect(() => {
    async function prepare() {
      // Wait for all checks to complete
      if (loading || checkingUsername) {
        return;
      }

      try {
        // Determine navigation target
        let targetRoute: string;
        if (!session) {
          targetRoute = '/(onboarding)/welcome';
        } else if (!hasUsername) {
          targetRoute = '/(onboarding)/username';
        } else {
          targetRoute = '/home';
        }

        // Mark as navigated to prevent multiple navigations
        setHasNavigated(true);

        // Hide splash screen first (while still showing black background)
        await SplashScreen.hideAsync();
        
        // Small delay to ensure splash is hidden and smooth transition
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Navigate with replace (fade animation is handled by Stack.Screen options)
        router.replace(targetRoute as any);
      } catch (e) {
        console.warn('Error during app initialization:', e);
        setHasNavigated(true);
        // Hide splash even on error
        await SplashScreen.hideAsync();
      }
    }

    // Only prepare if we haven't navigated yet
    if (!hasNavigated) {
      prepare();
    }
  }, [loading, checkingUsername, session, hasUsername, router, hasNavigated]);

  // Don't render anything - let native splash screen show
  // Fade animation is handled by Stack.Screen options in _layout.tsx
  return null;
}

