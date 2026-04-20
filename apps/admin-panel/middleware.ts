import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({
    request: { headers: req.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: Record<string, unknown>) {
          req.cookies.set({ name, value, ...options });
          res = NextResponse.next({ request: { headers: req.headers } });
          res.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: Record<string, unknown>) {
          req.cookies.set({ name, value: '', ...options });
          res = NextResponse.next({ request: { headers: req.headers } });
          res.cookies.set({ name, value: '', ...options });
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  const pathname = req.nextUrl.pathname;

  // 1. Unauthenticated → login
  if (!user && pathname.startsWith('/dashboard')) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (!user) return res;

  // 2. Hoist gym ID extraction so we can fire the gym query in parallel with profile
  const gymRouteMatch = pathname.match(/^\/dashboard\/gym\/([^/]+)/);
  const gymIdFromUrl = gymRouteMatch ? gymRouteMatch[1] : null;

  // 3. Kick off profile + gym query in parallel
  const profilePromise = supabase
    .from('profiles')
    .select('role, assigned_gym_id, owner_id')
    .eq('id', user.id)
    .single();

  // Only fetch gym row when the URL actually has a gym segment — saves a
  // round-trip on all non-gym routes (super, owner, desk, etc.)
  const gymPromise = gymIdFromUrl
    ? supabase
        .from('gyms')
        .select('owner_id, status, is_suspended')
        .eq('id', gymIdFromUrl)
        .single()
    : Promise.resolve({ data: null, error: null });

  const [{ data: profile, error: profileError }, { data: gym }] = await Promise.all([
    profilePromise,
    gymPromise,
  ]);

  if (profileError || !profile) {
    console.error('Error fetching profile in middleware:', profileError);
    if (pathname.startsWith('/dashboard')) {
      const redirectUrl = req.nextUrl.clone();
      redirectUrl.pathname = '/login';
      redirectUrl.searchParams.set('error', 'profile_not_found');
      return NextResponse.redirect(redirectUrl);
    }
    return res;
  }

  // 4. Gym suspend check (gym_admin / receptionist)
  if (profile.role === 'gym_admin' || profile.role === 'receptionist') {
    if (profile.assigned_gym_id) {
      // If we already fetched this gym above, reuse; otherwise fetch it now
      const suspendedGym = gymIdFromUrl === profile.assigned_gym_id
        ? gym
        : await supabase
            .from('gyms')
            .select('id, status, is_suspended')
            .eq('id', profile.assigned_gym_id)
            .single()
            .then((r) => r.data);

      if (suspendedGym && (suspendedGym.status === 'suspended' || suspendedGym.is_suspended)) {
        await supabase.auth.signOut();
        const redirectUrl = req.nextUrl.clone();
        redirectUrl.pathname = '/login';
        redirectUrl.searchParams.set('error', 'gym_suspended');
        return NextResponse.redirect(redirectUrl);
      }
    }
  } else if (profile.role === 'gym_owner') {
    const { data: activeGyms } = await supabase
      .from('gyms')
      .select('id')
      .eq('owner_id', user.id)
      .eq('status', 'active')
      .eq('is_suspended', false)
      .limit(1);

    if (!activeGyms || activeGyms.length === 0) {
      await supabase.auth.signOut();
      const redirectUrl = req.nextUrl.clone();
      redirectUrl.pathname = '/login';
      redirectUrl.searchParams.set('error', 'all_gyms_suspended');
      return NextResponse.redirect(redirectUrl);
    }
  }

  // 5. Redirect from /login when already authenticated
  if (pathname === '/login' && profile) {
    const redirectUrl = req.nextUrl.clone();
    if (profile.role === 'superadmin') {
      redirectUrl.pathname = '/dashboard/super';
    } else if (profile.role === 'gym_owner') {
      redirectUrl.pathname = '/dashboard/owner';
    } else if (profile.role === 'receptionist' && profile.assigned_gym_id) {
      redirectUrl.pathname = `/dashboard/gym/${profile.assigned_gym_id}/desk`;
    } else if (profile.role === 'gym_admin' && profile.assigned_gym_id) {
      redirectUrl.pathname = `/dashboard/gym/${profile.assigned_gym_id}/dashboard`;
    } else {
      redirectUrl.pathname = '/dashboard';
    }
    return NextResponse.redirect(redirectUrl);
  }

  // 6. RBAC route protection
  if (pathname.startsWith('/dashboard')) {
    // ── SUPERADMIN ────────────────────────────────────────────────────────────
    if (profile.role === 'superadmin') {
      if (pathname === '/dashboard' || pathname === '/dashboard/') {
        return NextResponse.redirect(new URL('/dashboard/super', req.url));
      }
      // Superadmin can access any route (super/*, gym/*, arenas/*, etc.)
    }

    // ── GYM OWNER ─────────────────────────────────────────────────────────────
    else if (profile.role === 'gym_owner') {
      if (pathname.startsWith('/dashboard/super')) {
        return NextResponse.redirect(new URL('/dashboard/owner', req.url));
      }
      if (pathname === '/dashboard' || pathname === '/dashboard/') {
        return NextResponse.redirect(new URL('/dashboard/owner', req.url));
      }
      if (gymIdFromUrl) {
        if (!gym || (gym as { owner_id: string | null }).owner_id !== user.id) {
          return NextResponse.redirect(new URL('/dashboard/owner', req.url));
        }
        if ((gym as { status: string; is_suspended: boolean }).status === 'suspended' ||
            (gym as { status: string; is_suspended: boolean }).is_suspended) {
          return NextResponse.redirect(new URL('/dashboard/owner', req.url));
        }
      }
    }

    // ── GYM ADMIN ─────────────────────────────────────────────────────────────
    else if (profile.role === 'gym_admin') {
      if (pathname.startsWith('/dashboard/super') || pathname.startsWith('/dashboard/owner')) {
        const dest = profile.assigned_gym_id
          ? `/dashboard/gym/${profile.assigned_gym_id}/dashboard`
          : '/404';
        return NextResponse.redirect(new URL(dest, req.url));
      }
      if (gymIdFromUrl) {
        if (profile.assigned_gym_id !== gymIdFromUrl) {
          return NextResponse.redirect(
            new URL(`/dashboard/gym/${profile.assigned_gym_id}/dashboard`, req.url),
          );
        }
        if (gym && ((gym as { status: string; is_suspended: boolean }).status === 'suspended' ||
                    (gym as { status: string; is_suspended: boolean }).is_suspended)) {
          await supabase.auth.signOut();
          const redirectUrl = req.nextUrl.clone();
          redirectUrl.pathname = '/login';
          redirectUrl.searchParams.set('error', 'gym_suspended');
          return NextResponse.redirect(redirectUrl);
        }
      } else if (pathname === '/dashboard' || pathname === '/dashboard/') {
        if (profile.assigned_gym_id) {
          return NextResponse.redirect(
            new URL(`/dashboard/gym/${profile.assigned_gym_id}/dashboard`, req.url),
          );
        }
      }
    }

    // ── RECEPTIONIST ──────────────────────────────────────────────────────────
    else if (profile.role === 'receptionist') {
      const deskUrl = profile.assigned_gym_id
        ? `/dashboard/gym/${profile.assigned_gym_id}/desk`
        : '/404';

      if (pathname.startsWith('/dashboard/super') || pathname.startsWith('/dashboard/owner')) {
        return NextResponse.redirect(new URL(deskUrl, req.url));
      }

      const RECEPTIONIST_ALLOWED = ['/desk', '/checkin', '/activity', '/members'];

      // Receptionist may access the global arenas list and individual arena
      // fulfillment pages — RLS on get_arena_fulfillment_manifest already
      // scopes results to their assigned gym via _admin_check_gym_access.
      const isArenasAllowed =
        pathname === '/dashboard/arenas' ||
        pathname.startsWith('/dashboard/arenas/');

      if (isArenasAllowed) {
        // Allow through — no gym-id in URL for arena routes
        return res;
      }

      if (gymIdFromUrl) {
        if (profile.assigned_gym_id !== gymIdFromUrl) {
          return NextResponse.redirect(new URL(deskUrl, req.url));
        }
        if (gym && ((gym as { status: string; is_suspended: boolean }).status === 'suspended' ||
                    (gym as { status: string; is_suspended: boolean }).is_suspended)) {
          await supabase.auth.signOut();
          const redirectUrl = req.nextUrl.clone();
          redirectUrl.pathname = '/login';
          redirectUrl.searchParams.set('error', 'gym_suspended');
          return NextResponse.redirect(redirectUrl);
        }
        const pathAfterGym = pathname.replace(`/dashboard/gym/${gymIdFromUrl}`, '');
        const isAllowed = RECEPTIONIST_ALLOWED.some(
          (p) =>
            pathAfterGym === p ||
            pathAfterGym.startsWith(`${p}/`) ||
            pathAfterGym.startsWith(`${p}?`),
        );
        if (!isAllowed) {
          return NextResponse.redirect(new URL(deskUrl, req.url));
        }
      } else if (pathname === '/dashboard' || pathname === '/dashboard/') {
        return NextResponse.redirect(new URL(deskUrl, req.url));
      } else {
        return NextResponse.redirect(new URL(deskUrl, req.url));
      }
    }
  }

  return res;
}

export const config = {
  matcher: ['/dashboard/:path*', '/login'],
};
