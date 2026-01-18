import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  let cookieStore: any;

  try {
    // Ovo je ključ: Next.js 15 zahteva await, ali puca tokom builda ako nije u try-catch
    cookieStore = await cookies();
  } catch (e) {
    // Ako smo u build procesu, cookies() ne postoje. Vraćamo null.
    cookieStore = null;
  }

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          if (!cookieStore) return [];
          try {
            return cookieStore.getAll();
          } catch (e) {
            return [];
          }
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          if (!cookieStore) return;
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch (error) {
            // Ignorišemo greške setovanja tokom builda ili u Server Components
          }
        },
      },
    }
  );
}
