import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  // CRITICAL: Next.js 15 requires await cookies() and uses get()/set() instead of getAll()/setAll()
  // This matches how middleware.ts reads cookies and ensures consistent session handling
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set(name, value, options);
          } catch (error) {
            // Cannot set cookies in Server Components - this is normal
            // Cookies are set by middleware or client components
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set(name, '', { ...options, maxAge: 0 });
          } catch (error) {
            // Cannot remove cookies in Server Components - this is normal
          }
        },
      },
    }
  );
}
