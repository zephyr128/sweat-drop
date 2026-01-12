import { useEffect } from 'react';
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

  // Handle root path explicitly
  useEffect(() => {
    // This helps handle deep links properly
  }, [pathname]);

  if (loading) {
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

  // Check if user has completed onboarding (has username set)
  // For now, redirect to home - you can add onboarding check later
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
