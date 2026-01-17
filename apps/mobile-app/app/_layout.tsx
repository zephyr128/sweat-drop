import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { Session } from '@supabase/supabase-js';
import { ThemeProvider, useTheme } from '@/lib/contexts/ThemeContext';
import { GymDataInitializer } from '@/components/GymDataInitializer';
import BleManager from 'react-native-ble-manager';
import { BleManager as BleManagerIOS } from 'react-native-ble-plx';
import * as SplashScreen from 'expo-splash-screen';

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
    </Stack>
  );
}

// Prevent splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
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

  return (
    <ThemeProvider>
      <GymDataInitializer />
      <StackNavigator />
      <StatusBar style="light" />
    </ThemeProvider>
  );
}
