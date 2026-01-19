'use client';

import { createBrowserClient } from '@supabase/ssr';

// 1. Direktno izvlačenje bez funkcija-wrappera
// Vercel UI doesn't auto-trim values when copy-pasted from Supabase
// Newlines/whitespace in keys cause "Invalid value" fetch errors
const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const rawKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// 2. Ručni trim samo ako su stringovi
// CRITICAL: Always trim to remove newlines/whitespace from Vercel UI
// Supabase anon keys are usually 400-420 chars, but can be 454+ with whitespace
const supabaseUrl = typeof rawUrl === 'string' ? rawUrl.trim() : '';
const supabaseAnonKey = typeof rawKey === 'string' ? rawKey.trim() : '';

// 3. DEBUG LOG - Ovo će ti reći šta tačno Vercel šalje
if (typeof window !== 'undefined') {
  console.log('--- SUPABASE DEBUG ---');
  console.log('Raw URL:', rawUrl ? 'POSTOJI' : 'NE POSTOJI', '| Type:', typeof rawUrl, '| Length:', typeof rawUrl === 'string' ? rawUrl.length : 'N/A');
  console.log('Raw Key:', rawKey ? 'POSTOJI' : 'NE POSTOJI', '| Type:', typeof rawKey, '| Length:', typeof rawKey === 'string' ? rawKey.length : 'N/A');
  console.log('Final URL Length:', supabaseUrl.length);
  console.log('Final Key Length:', supabaseAnonKey.length);
  
  // Warn if key has extra whitespace (Supabase keys are usually 400-420 chars)
  if (typeof rawKey === 'string' && rawKey.length > 420) {
    const trimmedDiff = rawKey.length - supabaseAnonKey.length;
    console.warn(`⚠️ Key has ${trimmedDiff} extra characters (whitespace/newlines). Trimmed length: ${supabaseAnonKey.length}`);
    console.warn('⚠️ This is a common Vercel issue when copy-pasting from Supabase UI');
  }
}

// 4. Ako su i dalje 0, nemoj bacati Error (to kvari Hydration), nego vrati placeholder klijent
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Supabase ključevi su PRAZNI nakon trima!');
  console.error('❌ URL:', supabaseUrl ? `set (${supabaseUrl.length} chars)` : 'MISSING');
  console.error('❌ Key:', supabaseAnonKey ? `set (${supabaseAnonKey.length} chars)` : 'MISSING');
  console.error('💡 SOLUTION: Add environment variables in Vercel Settings → Environment Variables and redeploy');
}

// 5. Create client with placeholder if values are missing (prevents Hydration Error)
// Don't throw errors - that breaks React hydration when server/client mismatch
// Use placeholder values that will fail gracefully on first API call
export const supabase = createBrowserClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
);
