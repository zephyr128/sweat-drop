'use client';

import { createBrowserClient } from '@supabase/ssr';

// CRITICAL: Extract and trim environment variables
// Vercel UI doesn't auto-trim values when copy-pasted from Supabase
// Newlines/whitespace in keys cause "Invalid value" fetch errors
// .trim() is MANDATORY for both local and production
function getEnvString(name: string): string {
  const value = process.env[name];
  
  // Return empty string if missing (validation happens later)
  // Don't throw here to prevent app crash during build/runtime
  if (!value) {
    return '';
  }
  
  // CRITICAL: Always trim to remove newlines/whitespace from Vercel UI
  // Supabase anon keys are usually 400-420 chars, but can be 454+ with whitespace
  return String(value).trim();
}

const supabaseUrl = getEnvString('NEXT_PUBLIC_SUPABASE_URL');
const supabaseAnonKey = getEnvString('NEXT_PUBLIC_SUPABASE_ANON_KEY');

// Validate that both are non-empty strings
const hasValidUrl = supabaseUrl.length > 0 && supabaseUrl !== 'undefined' && supabaseUrl.startsWith('http');
const hasValidKey = supabaseAnonKey.length > 0 && supabaseAnonKey !== 'undefined';

// Log validation status on client-side for debugging
if (typeof window !== 'undefined') {
  // Log raw values to debug whitespace issues
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const rawKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  console.log('🔍 Environment Variables Check:');
  console.log('  Raw URL length:', typeof rawUrl === 'string' ? rawUrl.length : 'N/A');
  console.log('  Raw Key length:', typeof rawKey === 'string' ? rawKey.length : 'N/A');
  console.log('  Trimmed URL length:', supabaseUrl.length);
  console.log('  Trimmed Key length:', supabaseAnonKey.length);
  
  // Warn if key has extra whitespace (Supabase keys are usually 400-420 chars)
  if (typeof rawKey === 'string' && rawKey.length > 420) {
    const trimmedDiff = rawKey.length - supabaseAnonKey.length;
    console.warn(`⚠️ Key has ${trimmedDiff} extra characters (whitespace/newlines). Trimmed length: ${supabaseAnonKey.length}`);
    console.warn('⚠️ This is a common Vercel issue when copy-pasting from Supabase UI');
  }
  
  if (!hasValidUrl || !hasValidKey) {
    const missing = [];
    if (!hasValidUrl) missing.push('NEXT_PUBLIC_SUPABASE_URL');
    if (!hasValidKey) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
    
    console.error('❌ ==========================================');
    console.error('❌ MISSING ENVIRONMENT VARIABLES!');
    console.error('❌ ==========================================');
    console.error(`Missing: ${missing.join(', ')}`);
    console.error('Current values:', {
      url: supabaseUrl || '(not set or empty)',
      urlType: typeof supabaseUrl,
      urlLength: supabaseUrl?.length || 0,
      key: supabaseAnonKey ? `${supabaseAnonKey.substring(0, 10)}... (${supabaseAnonKey.length} chars)` : '(not set or empty)',
      keyType: typeof supabaseAnonKey,
    });
    console.error('');
    console.error('💡 SOLUTION:');
    console.error('1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables');
    console.error('2. Add these variables:');
    console.error('   - NEXT_PUBLIC_SUPABASE_URL=your_supabase_url');
    console.error('   - NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key');
    console.error('3. Redeploy your project');
    console.error('4. For local dev: Create .env.local in apps/admin-panel/ with these variables');
    console.error('❌ ==========================================');
  } else {
    // Log successful validation in development
    if (process.env.NODE_ENV === 'development') {
      console.log('✅ Supabase environment variables validated successfully');
      console.log('✅ URL type:', typeof supabaseUrl, 'Key type:', typeof supabaseAnonKey);
    }
  }
}

// CRITICAL: Only create client if both URL and key are valid
// Empty strings will cause "Invalid value" fetch errors - must have actual values
if (!hasValidUrl || !hasValidKey) {
  // Don't create client with invalid values - will cause fetch errors
  // Log error is already done above, so just export a dummy client that will fail gracefully
  throw new Error(
    `Cannot create Supabase client: Missing environment variables. ` +
    `NEXT_PUBLIC_SUPABASE_URL: ${supabaseUrl ? 'set' : 'MISSING'}, ` +
    `NEXT_PUBLIC_SUPABASE_ANON_KEY: ${supabaseAnonKey ? 'set' : 'MISSING'}. ` +
    `Please set these variables in Vercel Settings → Environment Variables and redeploy.`
  );
}

// Create browser client with validated values
// Both URL and key are guaranteed to be valid non-empty strings at this point
// CRITICAL: Ensure we pass raw strings, not objects
// Double-check types and values before passing to createBrowserClient
if (typeof supabaseUrl !== 'string' || typeof supabaseAnonKey !== 'string') {
  throw new Error(
    `Invalid environment variable types. ` +
    `URL type: ${typeof supabaseUrl}, Key type: ${typeof supabaseAnonKey}. ` +
    `Both must be strings.`
  );
}

// Final validation: Ensure URL looks like a valid Supabase URL
if (!supabaseUrl.startsWith('https://') || supabaseUrl.length < 20) {
  console.error('❌ Invalid Supabase URL:', {
    url: supabaseUrl,
    length: supabaseUrl.length,
    startsWithHttps: supabaseUrl.startsWith('https://'),
  });
  throw new Error(
    `Invalid Supabase URL format. URL length: ${supabaseUrl.length}, ` +
    `Expected: https://*.supabase.co (usually 40+ characters)`
  );
}

// Log final values being passed to createBrowserClient
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  console.log('✅ Creating Supabase client with:', {
    urlLength: supabaseUrl.length,
    urlPreview: `${supabaseUrl.substring(0, 30)}...`,
    keyLength: supabaseAnonKey.length,
    urlType: typeof supabaseUrl,
    keyType: typeof supabaseAnonKey,
  });
}

export const supabase = createBrowserClient(
  String(supabaseUrl), // Explicit string conversion as final safety check
  String(supabaseAnonKey) // Explicit string conversion as final safety check
);
