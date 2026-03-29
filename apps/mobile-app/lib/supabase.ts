import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { getDeviceFingerprintHash } from '@/lib/security/deviceFingerprint';

const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  if (!__DEV__) {
    throw new Error(
      'EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY must be set in production',
    );
  }
  console.warn('⚠️ Supabase URL and Anon Key not configured. Using placeholder values.');
  console.warn('To configure: Create .env file with EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY');
}
const finalSupabaseUrl = supabaseUrl || 'https://placeholder.supabase.co';
const finalSupabaseAnonKey = supabaseAnonKey || 'placeholder-anon-key';

export const supabase = createClient(finalSupabaseUrl, finalSupabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  global: {
    fetch: async (input, init) => {
      const headers = new Headers(init?.headers);
      const deviceHash = await getDeviceFingerprintHash();
      headers.set('x-sweatdrop-device-hash', deviceHash);
      headers.set('x-sweatdrop-client', 'mobile-app');
      return globalThis.fetch(input, {
        ...init,
        headers,
      });
    },
  },
});
