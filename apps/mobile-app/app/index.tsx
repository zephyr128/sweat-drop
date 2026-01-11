import { useEffect } from 'react';
import { Redirect, usePathname } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { View, ActivityIndicator } from 'react-native';

export default function Index() {
  const { session, loading } = useSession();
  const pathname = usePathname();

  // Handle root path explicitly
  useEffect(() => {
    // This helps handle deep links properly
  }, [pathname]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#6366f1" />
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
