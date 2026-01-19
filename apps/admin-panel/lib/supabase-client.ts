'use client';

import { createBrowserClient } from '@supabase/ssr';

// CRITICAL: Extract raw string values from environment variables
// Ensure we get actual strings, not objects or wrapped values
// Convert to string explicitly to prevent any object wrapping issues
const getEnvString = (value: any): string => {
  if (typeof value === 'string') return value.trim();
  if (value == null) return '';
  
  // If it's an object, try to extract string value properly
  if (typeof value === 'object') {
    console.warn('⚠️ Environment variable is an object, attempting to extract string value');
    
    // Try common object properties that might contain the string
    if ('value' in value && typeof value.value === 'string') {
      return value.value.trim();
    }
    if ('default' in value && typeof value.default === 'string') {
      return value.default.trim();
    }
    if ('toString' in value && typeof value.toString === 'function') {
      const str = value.toString();
      // If toString returns [object Object], it's not useful
      if (str && str !== '[object Object]' && str.startsWith('http')) {
        return str.trim();
      }
    }
    
    // Last resort: try JSON.stringify if it's a simple object
    try {
      const json = JSON.stringify(value);
      // If it's a JSON string (starts with "), parse it
      if (json.startsWith('"') && json.endsWith('"')) {
        return JSON.parse(json).trim();
      }
    } catch (e) {
      // Ignore JSON errors
    }
    
    // Final fallback: String() conversion (might give [object Object])
    const str = String(value).trim();
    if (str === '[object Object]' || str.length < 10) {
      console.error('❌ Failed to extract string from object:', value);
      return '';
    }
    return str;
  }
  
  return String(value).trim();
};

const supabaseUrl = getEnvString(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseAnonKey = getEnvString(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// Validate that both are non-empty strings
const hasValidUrl = supabaseUrl.length > 0 && supabaseUrl !== 'undefined' && supabaseUrl.startsWith('http');
const hasValidKey = supabaseAnonKey.length > 0 && supabaseAnonKey !== 'undefined';

// Log validation status on client-side for debugging
if (typeof window !== 'undefined') {
  // Log raw values to debug object wrapping issues
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const rawKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  console.log('🔍 Raw env values (supabase-client.ts):');
  console.log('  rawUrl type:', typeof rawUrl, '| value:', rawUrl);
  console.log('  rawKey type:', typeof rawKey, '| length:', typeof rawKey === 'string' ? rawKey.length : 'N/A');
  console.log('  After getEnvString - supabaseUrl type:', typeof supabaseUrl, '| length:', supabaseUrl.length);
  console.log('  After getEnvString - supabaseAnonKey type:', typeof supabaseAnonKey, '| length:', supabaseAnonKey.length);
  
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
