import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  let cookieStore;
  
  try {
    // Koristimo 'as any' da sprečimo TS error, a 'await' jer Next.js 15 to zahteva u runtime-u
    cookieStore = await (cookies() as any);
  } catch (e) {
    // Tokom build-a (statička generacija), cookies() bacaju grešku
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
          } catch {
            return [];
          }
        },
        // Eksplicitni tipovi su obavezni za Vercel deploy
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          if (!cookieStore) return;
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch (error) {
            // Normalno ponašanje u Server Components
          }
        },
      },
    }
  );
}
