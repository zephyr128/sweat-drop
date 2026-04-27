import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { createMMKV } from 'react-native-mmkv';
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
const supabaseStorage = createMMKV({ id: 'supabase-auth' });

const supabaseMmkvStorage = {
  getItem: async (key: string) => {
    const value = supabaseStorage.getString(key);
    return value ?? null;
  },
  setItem: async (key: string, value: string) => {
    if (value == null) {
      supabaseStorage.remove(key);
      return;
    }
    supabaseStorage.set(key, value);
  },
  removeItem: async (key: string) => {
    supabaseStorage.remove(key);
  },
};

export const supabase = createClient(finalSupabaseUrl, finalSupabaseAnonKey, {
  auth: {
    storage: supabaseMmkvStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  realtime: {
    heartbeatIntervalMs: 45_000,
    reconnectAfterMs: (tries: number) =>
      Math.min(1000 * 2 ** tries, 30_000),
  },
  db: { schema: 'public' },
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
