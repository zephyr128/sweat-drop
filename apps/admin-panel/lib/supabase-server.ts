import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Build-safe Supabase server client
 * Handles cookie access gracefully during static generation of error pages
 */
export async function createClient() {
  // 1. Handle cookieStore safely (await is required in Next 15, safe in Next 14)
  let cookieStore: any;
  try {
    cookieStore = await cookies();
  } catch (error) {
    // If cookies() fails (during static build), we continue without it
    if (process.env.NODE_ENV === 'development') {
      console.warn('[Supabase] Cookies not available (static build context)');
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables. NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set.');
  }

  return createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          // If no cookieStore (build time), return empty array
          if (!cookieStore) return [];
          try {
            return cookieStore.getAll();
          } catch (e) {
            return [];
          }
        },
        setAll(cookiesToSet) {
          if (!cookieStore) return;
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing user sessions.
          }
        },
      },
    }
  );
}
