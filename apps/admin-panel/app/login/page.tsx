'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase-client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const dynamicParams = true;

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams?.get('redirect') || null;
  const emailParam = searchParams?.get('email') || '';
  
  const [email, setEmail] = useState(emailParam);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Check for error query params (from middleware redirects)
  useEffect(() => {
    const errorParam = searchParams?.get('error');
    if (errorParam === 'gym_suspended') {
      setError('This gym\'s subscription has been suspended. Please contact support.');
    } else if (errorParam === 'all_gyms_suspended') {
      setError('All your gyms have been suspended. Please contact support.');
    }
  }, [searchParams]);
  const hasCheckedSession = useRef(false);
  const hasRedirected = useRef(false);

  useEffect(() => {
    // Only check session once on mount
    if (hasCheckedSession.current) return;
    hasCheckedSession.current = true;

    let mounted = true;

    const checkSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (mounted && !error && session && !hasRedirected.current) {
          hasRedirected.current = true;
          router.replace('/dashboard');
        }
      } catch (error) {
        console.error('Error checking session:', error);
      }
    };

    // Check session immediately
    checkSession();

    // Listen for auth state changes (backup redirect)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // Auth state changed
      if (mounted && session && !hasRedirected.current && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
        try {
          hasRedirected.current = true;
          
          // Get profile to determine redirect
          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('role, assigned_gym_id, owner_id')
            .eq('id', session.user.id)
            .single();

          if (profileError || !profileData) {
            console.error('Error fetching profile in auth state change:', profileError);
            return;
          }

          let redirectPath = '/dashboard';
          if (profileData.role === 'gym_admin' && profileData.assigned_gym_id) {
            redirectPath = `/dashboard/gym/${profileData.assigned_gym_id}/dashboard`;
          } else if (profileData.role === 'gym_owner') {
            redirectPath = '/dashboard';
          } else if (profileData.role === 'superadmin') {
            redirectPath = '/dashboard/super';
          } else if (profileData.role === 'receptionist' && profileData.assigned_gym_id) {
            redirectPath = `/dashboard/gym/${profileData.assigned_gym_id}/redemptions`;
          }

          // Redirecting based on auth state change
          window.location.replace(redirectPath);
        } catch (error) {
          console.error('Error in auth state change handler:', error);
          hasRedirected.current = false;
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - only run once on mount

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || hasRedirected.current) return;
    
    setError(null);
    setLoading(true);

    try {
      // Attempting login
      
      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      // Login response received

      if (loginError) {
        console.error('Login error:', loginError);
        setError(loginError.message);
        setLoading(false);
        return;
      }

      if (!data?.session) {
        console.error('No session in response');
        setError('Login failed: No session received. Please check your credentials.');
        setLoading(false);
        return;
      }

      // Login successful
      
      // Refresh the session to ensure cookies are set
      // This is important for @supabase/ssr to sync with middleware
      await supabase.auth.refreshSession();
      
      // Wait a moment for cookies to be set
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Verify session is accessible
      const { data: { session: verifySession }, error: sessionError } = await supabase.auth.getSession();
      // Session verified

      if (!verifySession) {
        console.error('Session not accessible after login');
        setError('Session not persisted. Please try again.');
        setLoading(false);
        return;
      }

      // Get profile to determine redirect destination
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('role, assigned_gym_id, owner_id')
        .eq('id', verifySession.user.id)
        .single();

      // Profile data loaded

      if (profileError || !profileData) {
        console.error('Error fetching profile:', profileError);
        console.error('Profile error details:', {
          code: profileError?.code,
          message: profileError?.message,
          details: profileError?.details,
          hint: profileError?.hint
        });
        setError(`Failed to load user profile: ${profileError?.message || 'Unknown error'}. Please check console for details.`);
        setLoading(false);
        return;
      }

      // Check if there's a redirect URL (e.g., from invitation acceptance)
      if (redirectUrl) {
        hasRedirected.current = true;
        window.location.replace(redirectUrl);
        return;
      }

      // Determine redirect based on role
      let redirectPath = '/dashboard';
      if (profileData.role === 'gym_admin' && profileData.assigned_gym_id) {
        redirectPath = `/dashboard/gym/${profileData.assigned_gym_id}/dashboard`;
      } else if (profileData.role === 'gym_owner') {
        // For gym_owner, middleware will handle redirect to first owned gym
        redirectPath = '/dashboard';
      } else if (profileData.role === 'superadmin') {
        redirectPath = '/dashboard/super';
      } else if (profileData.role === 'receptionist' && profileData.assigned_gym_id) {
        redirectPath = `/dashboard/gym/${profileData.assigned_gym_id}/redemptions`;
      }

      // Set flag to prevent multiple redirects
      hasRedirected.current = true;
      
      // Force hard redirect - this will trigger middleware
      // Use replace instead of href to avoid adding to history
      window.location.replace(redirectPath);
    } catch (error: any) {
      console.error('Login exception:', error);
      setError(error.message || 'An unexpected error occurred. Please check the console.');
      setLoading(false);
      hasRedirected.current = false; // Reset on error
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#000000] py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-white">
            SweatDrop Admin
          </h2>
          <p className="mt-2 text-center text-sm text-[#808080]">
            Sign in to manage your gym
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleLogin}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="email-address" className="sr-only">
                Email address
              </label>
              <input
                id="email-address"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 bg-[#1A1A1A] border border-[#1A1A1A] placeholder-[#808080] text-white rounded-t-md focus:outline-none focus:ring-[#00E5FF] focus:border-[#00E5FF] focus:z-10 sm:text-sm"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 bg-[#1A1A1A] border border-[#1A1A1A] placeholder-[#808080] text-white rounded-b-md focus:outline-none focus:ring-[#00E5FF] focus:border-[#00E5FF] focus:z-10 sm:text-sm"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <div className="rounded-md bg-[#FF5252]/10 border border-[#FF5252]/30 p-3">
              <p className="text-sm text-[#FF5252]">{error}</p>
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-black bg-[#00E5FF] hover:bg-[#00B8CC] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#00E5FF] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>
        </form>
        
        {/* Debug info in development */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-4 p-3 bg-[#1A1A1A] rounded-lg text-xs text-[#808080]">
            <p>Debug: Supabase URL is {process.env.NEXT_PUBLIC_SUPABASE_URL ? '✅ Set' : '❌ Missing'}</p>
            <p>Check browser console for detailed logs</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#000000]">
        <div className="text-white">Loading...</div>
      </div>
    }>
      <LoginPageContent />
    </Suspense>
  );
}
