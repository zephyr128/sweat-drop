import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function createClient() {
  // CRITICAL FIX: Safe cookie access for build-time (error page generation)
  // During static generation of error pages, cookies() may throw
  let cookieStore;
  try {
    cookieStore = cookies();
  } catch (error) {
    // During build-time static generation (e.g., error pages), cookies() is not available
    // Return a client with dummy cookie handlers to prevent crashes
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    
    // Return a minimal client that won't crash during build
    return createServerClient(
      supabaseUrl || 'https://placeholder.supabase.co',
      supabaseAnonKey || 'placeholder',
      {
        cookies: {
          get() {
            return undefined; // No cookies during build
          },
          set() {
            // No-op during build
          },
          remove() {
            // No-op during build
          },
        },
      }
    );
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
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          try {
            cookieStore.set(name, value, options);
          } catch (error) {
            // Na serveru (Server Components) set ne radi direktno,
            // to se rešava u middleware-u.
            // Ovo je normalno i može se ignorisati.
          }
        },
        remove(name: string, options: any) {
          try {
            cookieStore.set(name, '', { ...options, maxAge: 0 });
          } catch (error) {
            // Na serveru (Server Components) remove ne radi direktno,
            // to se rešava u middleware-u.
            // Ovo je normalno i može se ignorisati.
          }
        },
      },
    }
  );
}
