import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  let cookieStore: any;
  
  try {
    // Next.js 15 zahteva await za cookies()
    cookieStore = await cookies();
  } catch (e) {
    // Tokom build-a na Vercelu, cookies() baca error. 
    // Hvatanje ovog errora sprečava "Export encountered errors" pad.
    cookieStore = null;
  }

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          if (!cookieStore) return [];
          return cookieStore.getAll();
        },
        // DODAT TIP: { name: string; value: string; options: CookieOptions }[]
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          if (!cookieStore) return;
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch (error) {
            // Server Components ne dozvoljavaju setovanje kolačića, što je normalno
          }
        },
      },
    }
  );
}
