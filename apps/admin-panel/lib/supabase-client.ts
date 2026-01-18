'use client';

import { createBrowserClient } from '@supabase/ssr';

// CRITICAL: Validate environment variables at build/runtime
// undefined or empty strings will cause "Failed to execute 'fetch' on 'Window': Invalid value" errors
// MUST use || '' fallback to prevent undefined, but then validate before creating client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || '';

// Validate that both are non-empty strings
const hasValidUrl = supabaseUrl.length > 0 && supabaseUrl !== 'undefined' && supabaseUrl.startsWith('http');
const hasValidKey = supabaseAnonKey.length > 0 && supabaseAnonKey !== 'undefined';

// Log validation status on client-side for debugging
if (typeof window !== 'undefined') {
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
      urlLength: supabaseUrl?.length || 0,
      key: supabaseAnonKey ? `${supabaseAnonKey.substring(0, 10)}... (${supabaseAnonKey.length} chars)` : '(not set or empty)',
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
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);
