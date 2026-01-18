'use client';

import { createBrowserClient } from '@supabase/ssr';

// CRITICAL: Validate environment variables at build/runtime
// Empty strings or undefined will cause "Failed to execute 'fetch' on 'Window': Invalid value" errors
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || '';

// Validate that both are non-empty strings
const hasValidUrl = supabaseUrl.length > 0 && supabaseUrl !== 'undefined';
const hasValidKey = supabaseAnonKey.length > 0 && supabaseAnonKey !== 'undefined';

if (!hasValidUrl || !hasValidKey) {
  const missing = [];
  if (!hasValidUrl) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!hasValidKey) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  
  const errorMsg = `Missing required environment variables: ${missing.join(', ')}`;
  
  if (typeof window !== 'undefined') {
    // Client-side: Log detailed error
    console.error('❌', errorMsg);
    console.error('Current values:', {
      url: supabaseUrl || '(not set or empty)',
      key: supabaseAnonKey ? `${supabaseAnonKey.substring(0, 10)}...` : '(not set or empty)',
    });
    console.error('💡 Solution: Add environment variables in Vercel Settings → Environment Variables');
    console.error('💡 For local dev: Create .env.local in apps/admin-panel/ with these variables');
  }
  
  // Use placeholder values to prevent immediate crash
  // This will fail on first Supabase call with clear error message
}

// Create browser client with validated values or placeholders
// If values are missing, fetch will fail with "Invalid value" - this is expected
// User must set environment variables in Vercel Settings
export const supabase = createBrowserClient(
  hasValidUrl ? supabaseUrl : 'https://MISSING_ENV_VAR.supabase.co',
  hasValidKey ? supabaseAnonKey : 'MISSING_ANON_KEY'
);
