import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  // Next.js 15 zahteva await za cookies()
  // Koristimo anonimnu funkciju da izbegnemo pucanje tokom statičke generacije
  const cookieStore = await cookies().catch(() => null);

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          if (!cookieStore) return [];
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          if (!cookieStore) return;
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch (error) {
            // Server Components ne dozvoljavaju setovanje kolačića - ovo je normalno
          }
        },
      },
    }
  );
}
