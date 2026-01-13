import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({
    request: {
      headers: req.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          req.cookies.set({ name, value, ...options });
          res = NextResponse.next({
            request: { headers: req.headers },
          });
          res.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          req.cookies.set({ name, value: '', ...options });
          res = NextResponse.next({
            request: { headers: req.headers },
          });
          res.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  // VRLO BITNO: Koristi getUser() umesto getSession() u middleware-u zbog bezbednosti
  const { data: { user } } = await supabase.auth.getUser();
  const pathname = req.nextUrl.pathname;

  // 1. Ako nema korisnika, a pokušava da pristupi /dashboard -> Redirect na /login
  if (!user && pathname.startsWith('/dashboard')) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // 2. Ako je korisnik ulogovan
  if (user) {
    // Dohvati profil samo ako je potreban (za /login ili /dashboard rute)
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, admin_gym_id')
      .eq('id', user.id)
      .single();

    if (!profile) {
      // Ako ulogovan korisnik nema profil, možda je greška u bazi -> Logout
      return res; 
    }

    // REDIRECT SA LOGIN STRANICE: Ako je već ulogovan, ne daj mu na /login
    if (pathname === '/login') {
      const redirectUrl = req.nextUrl.clone();
      if (profile.role === 'gym_admin' && profile.admin_gym_id) {
        redirectUrl.pathname = `/dashboard/gym/${profile.admin_gym_id}/dashboard`;
      } else {
        redirectUrl.pathname = '/dashboard';
      }
      return NextResponse.redirect(redirectUrl);
    }

    // ZAŠTITA DASHBOARD RUTA NA OSNOVU ROLE
    if (pathname.startsWith('/dashboard')) {
      const gymRouteMatch = pathname.match(/^\/dashboard\/gym\/([^/]+)/);
      const gymIdFromUrl = gymRouteMatch ? gymRouteMatch[1] : null;

      // GYM ADMIN LOGIKA
      if (profile.role === 'gym_admin') {
        const targetPathStart = `/dashboard/gym/${profile.admin_gym_id}`;
        // Ako pokušava da pristupi tuđoj teretani ili opštem dashboardu
        if (!pathname.startsWith(targetPathStart)) {
          return NextResponse.redirect(new URL(`${targetPathStart}/dashboard`, req.url));
        }
      }

      // RECEPTIONIST LOGIKA
      if (profile.role === 'receptionist') {
        const targetPathStart = `/dashboard/gym/${profile.admin_gym_id}`;
        if (!pathname.startsWith(targetPathStart)) {
          return NextResponse.redirect(new URL(`${targetPathStart}/redemptions`, req.url));
        }
      }
      
      // SUPERADMIN LOGIKA
      if (profile.role === 'superadmin') {
        // Dozvoli sve, ali ako je gymId nepostojeći u URL-u, baci ga na listu teretana
        // Ovde možeš dodati proveru baze ako želiš, ali usporava middleware
      }
    }
  }

  return res;
}

export const config = {
  matcher: ['/dashboard/:path*', '/login'],
};