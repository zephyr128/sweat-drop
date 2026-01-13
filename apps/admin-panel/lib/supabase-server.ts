import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
