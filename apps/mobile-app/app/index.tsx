import { useEffect, useState } from 'react';
import { Redirect, usePathname } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/lib/contexts/ThemeContext';

export default function Index() {
  const { session, loading } = useSession();
  const pathname = usePathname();
  const { theme } = useTheme();
  const [checkingUsername, setCheckingUsername] = useState(true);
  const [hasUsername, setHasUsername] = useState(false);

  // Check if user has username after session is loaded
  useEffect(() => {
    async function checkUsername() {
      if (loading || !session) {
        setCheckingUsername(false);
        return;
      }

      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('username')
          .eq('id', session.user.id)
          .single();

        // Check if username is missing or is a temporary/random username (starts with 'user_')
        const hasValidUsername = profile?.username && !profile.username.startsWith('user_');
        setHasUsername(!!hasValidUsername);
      } catch (error) {
        console.error('Error checking username:', error);
        setHasUsername(false);
      } finally {
        setCheckingUsername(false);
      }
    }

    checkUsername();
  }, [session, loading]);

  if (loading || checkingUsername) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={['#000000', '#0A0E1A', '#000000']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/(onboarding)/welcome" />;
  }

  // If user doesn't have username, redirect to username screen
  if (!hasUsername) {
    return <Redirect href="/(onboarding)/username" />;
  }

  // User has username, redirect to home
  return <Redirect href="/home" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
