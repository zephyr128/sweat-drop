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
          req.cookies.set({ name, value: value, ...options });
          res = NextResponse.next({
            request: { headers: req.headers },
          });
          res.cookies.set({ name, value: value, ...options });
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

  const { data: { user } } = await supabase.auth.getUser();
  const pathname = req.nextUrl.pathname;

  // 1. Redirect unauthenticated users from /dashboard to /login
  if (!user && pathname.startsWith('/dashboard')) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // 2. If user is authenticated
  if (user) {
    // Fetch profile with gym status check
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, assigned_gym_id, owner_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      console.error('Error fetching profile in middleware:', profileError);
      if (pathname.startsWith('/dashboard')) {
        return res; // Let page handle the error
      }
      return res;
    }

    // 3. GYM SUSPEND CHECK - Block login if gym is suspended
    if (profile.role === 'gym_admin' || profile.role === 'receptionist') {
      if (profile.assigned_gym_id) {
        const { data: gym } = await supabase
          .from('gyms')
          .select('id, status, is_suspended')
          .eq('id', profile.assigned_gym_id)
          .single();

        if (gym && (gym.status === 'suspended' || gym.is_suspended)) {
          // Gym is suspended - block access and sign out
          await supabase.auth.signOut();
          const redirectUrl = req.nextUrl.clone();
          redirectUrl.pathname = '/login';
          redirectUrl.searchParams.set('error', 'gym_suspended');
          return NextResponse.redirect(redirectUrl);
        }
      }
    } else if (profile.role === 'gym_owner') {
      // Check if any owned gym is active (at least one must be active)
      const { data: activeGyms } = await supabase
        .from('gyms')
        .select('id')
        .eq('owner_id', user.id)
        .eq('status', 'active')
        .eq('is_suspended', false)
        .limit(1);

      if (!activeGyms || activeGyms.length === 0) {
        // All gyms are suspended - block access
        await supabase.auth.signOut();
        const redirectUrl = req.nextUrl.clone();
        redirectUrl.pathname = '/login';
        redirectUrl.searchParams.set('error', 'all_gyms_suspended');
        return NextResponse.redirect(redirectUrl);
      }
    }

    // 4. REDIRECT FROM LOGIN PAGE (if already logged in)
    if (pathname === '/login') {
      const redirectUrl = req.nextUrl.clone();
      
      if (profile.role === 'superadmin') {
        redirectUrl.pathname = '/dashboard/super';
      } else if (profile.role === 'gym_owner') {
        redirectUrl.pathname = '/dashboard/owner';
      } else if (profile.role === 'receptionist' && profile.assigned_gym_id) {
        redirectUrl.pathname = `/dashboard/gym/${profile.assigned_gym_id}/redemptions`;
      } else if (profile.role === 'gym_admin' && profile.assigned_gym_id) {
        redirectUrl.pathname = `/dashboard/gym/${profile.assigned_gym_id}/dashboard`;
      } else {
        redirectUrl.pathname = '/dashboard';
      }
      return NextResponse.redirect(redirectUrl);
    }

    // 5. PROTECT DASHBOARD ROUTES BASED ON ROLE
    if (pathname.startsWith('/dashboard')) {
      const gymRouteMatch = pathname.match(/^\/dashboard\/gym\/([^/]+)/);
      const gymIdFromUrl = gymRouteMatch ? gymRouteMatch[1] : null;

      // SUPERADMIN LOGIC
      if (profile.role === 'superadmin') {
        if (pathname.startsWith('/dashboard/super')) {
          // Allow access
        } else if (pathname.startsWith('/dashboard/gym/')) {
          // SuperAdmin can access any gym dashboard
        } else if (pathname === '/dashboard' || pathname === '/dashboard/') {
          return NextResponse.redirect(new URL('/dashboard/super', req.url));
        }
      }
      // GYM OWNER LOGIC
      else if (profile.role === 'gym_owner') {
        // Block superadmin routes
        if (pathname.startsWith('/dashboard/super')) {
          return NextResponse.redirect(new URL('/dashboard/owner', req.url));
        }
        
        // Redirect /dashboard to /dashboard/owner
        if (pathname === '/dashboard' || pathname === '/dashboard/') {
          return NextResponse.redirect(new URL('/dashboard/owner', req.url));
        }
        
        // Check gym access for gym-specific routes
        if (gymIdFromUrl) {
          const { data: gym } = await supabase
            .from('gyms')
            .select('owner_id, status, is_suspended')
            .eq('id', gymIdFromUrl)
            .single();
          
          if (!gym || gym.owner_id !== user.id) {
            // Redirect to owner dashboard
            return NextResponse.redirect(new URL('/dashboard/owner', req.url));
          }
          if (gym.status === 'suspended' || gym.is_suspended) {
            // Gym is suspended - redirect to owner dashboard
            return NextResponse.redirect(new URL('/dashboard/owner', req.url));
          }
        }
      }
      // GYM ADMIN LOGIC
      else if (profile.role === 'gym_admin') {
        // Block superadmin routes
        if (pathname.startsWith('/dashboard/super')) {
          if (profile.assigned_gym_id) {
            return NextResponse.redirect(new URL(`/dashboard/gym/${profile.assigned_gym_id}/dashboard`, req.url));
          }
          return NextResponse.redirect(new URL('/404', req.url));
        }
        
        // Block owner routes
        if (pathname.startsWith('/dashboard/owner')) {
          if (profile.assigned_gym_id) {
            return NextResponse.redirect(new URL(`/dashboard/gym/${profile.assigned_gym_id}/dashboard`, req.url));
          }
          return NextResponse.redirect(new URL('/404', req.url));
        }
        
        // Must access their assigned gym only
        if (gymIdFromUrl) {
          if (profile.assigned_gym_id !== gymIdFromUrl) {
            return NextResponse.redirect(new URL(`/dashboard/gym/${profile.assigned_gym_id}/dashboard`, req.url));
          }
          
          // Check if gym is suspended
          const { data: gym } = await supabase
            .from('gyms')
            .select('id, status, is_suspended')
            .eq('id', gymIdFromUrl)
            .single();
          
          if (gym && (gym.status === 'suspended' || gym.is_suspended)) {
            // Gym is suspended - sign out and redirect
            await supabase.auth.signOut();
            const redirectUrl = req.nextUrl.clone();
            redirectUrl.pathname = '/login';
            redirectUrl.searchParams.set('error', 'gym_suspended');
            return NextResponse.redirect(redirectUrl);
          }
        } else if (pathname === '/dashboard' || pathname === '/dashboard/') {
          if (profile.assigned_gym_id) {
            return NextResponse.redirect(new URL(`/dashboard/gym/${profile.assigned_gym_id}/dashboard`, req.url));
          }
        }
      }
      // RECEPTIONIST LOGIC
      else if (profile.role === 'receptionist') {
        // Block superadmin routes
        if (pathname.startsWith('/dashboard/super')) {
          if (profile.assigned_gym_id) {
            return NextResponse.redirect(new URL(`/dashboard/gym/${profile.assigned_gym_id}/redemptions`, req.url));
          }
          return NextResponse.redirect(new URL('/404', req.url));
        }
        
        // Block owner routes
        if (pathname.startsWith('/dashboard/owner')) {
          if (profile.assigned_gym_id) {
            return NextResponse.redirect(new URL(`/dashboard/gym/${profile.assigned_gym_id}/redemptions`, req.url));
          }
          return NextResponse.redirect(new URL('/404', req.url));
        }
        
        // 403 FORBIDDEN for analytics and other restricted routes
        if (pathname.includes('/analytics') || pathname.includes('/dashboard/analytics')) {
          return NextResponse.redirect(new URL('/403', req.url));
        }
        
        // Can only access redemptions and dashboard (live feed)
        const allowedPaths = ['/redemptions', '/dashboard'];
        if (gymIdFromUrl) {
          if (profile.assigned_gym_id !== gymIdFromUrl) {
            return NextResponse.redirect(new URL(`/dashboard/gym/${profile.assigned_gym_id}/redemptions`, req.url));
          }
          // Check if path is allowed
          const pathAfterGym = pathname.replace(`/dashboard/gym/${gymIdFromUrl}`, '');
          if (!allowedPaths.some(p => pathAfterGym === p || pathAfterGym.startsWith(p + '/'))) {
            // Block access to restricted routes (like analytics)
            if (pathAfterGym.includes('/analytics')) {
              return NextResponse.redirect(new URL('/403', req.url));
            }
            return NextResponse.redirect(new URL(`/dashboard/gym/${profile.assigned_gym_id}/redemptions`, req.url));
          }
        } else if (pathname === '/dashboard' || pathname === '/dashboard/') {
          if (profile.assigned_gym_id) {
            return NextResponse.redirect(new URL(`/dashboard/gym/${profile.assigned_gym_id}/redemptions`, req.url));
          }
        }
      }
    }
  }

  return res;
}

export const config = {
  matcher: ['/dashboard/:path*', '/login'],
};
