'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-client';

type LoginFormProps = {
  redirectUrl: string | null;
  emailParam: string;
  errorParam: string | null;
  resetSuccess?: boolean;
  emailConfirmed?: boolean;
};

export default function LoginForm({ redirectUrl, emailParam, errorParam, resetSuccess, emailConfirmed }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState(emailParam);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasCheckedSession = useRef(false);
  const hasRedirected = useRef(false);

  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (errorParam === 'gym_suspended') {
      setError('This gym\'s subscription has been suspended. Please contact support.');
    } else if (errorParam === 'all_gyms_suspended') {
      setError('All your gyms have been suspended. Please contact support.');
    } else if (errorParam === 'link_expired') {
      setError('This link has expired. Please request a new one.');
    } else if (errorParam === 'confirmation_failed') {
      setError('Email confirmation failed. The link may be invalid or expired.');
    } else if (errorParam === 'invalid_link') {
      setError('Invalid link. Please check the URL and try again.');
    }

    if (resetSuccess) {
      setSuccessMessage('Password updated successfully! You can now sign in with your new password.');
    } else if (emailConfirmed) {
      setSuccessMessage('Email confirmed! You can now sign in.');
    }
  }, [errorParam, resetSuccess, emailConfirmed]);

  // Check environment variables on mount and log to console
  // NOTE: This is just for debugging - actual validation happens in supabase-client.ts
  useEffect(() => {
    const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const rawKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    // Extract as strings (don't wrap in objects)
    const supabaseUrl = typeof rawUrl === 'string' ? rawUrl.trim() : String(rawUrl || '').trim();
    const supabaseAnonKey = typeof rawKey === 'string' ? rawKey.trim() : String(rawKey || '').trim();
    
    const hasValidUrl = supabaseUrl.length > 0 && supabaseUrl !== 'undefined' && supabaseUrl.startsWith('http');
    const hasValidKey = supabaseAnonKey.length > 0 && supabaseAnonKey !== 'undefined';
    
    // Log raw types to debug object wrapping
    console.log('🔍 Environment Variables Check (LoginForm):');
    console.log('URL type:', typeof rawUrl, '| Key type:', typeof rawKey);
    console.log('URL is string:', typeof rawUrl === 'string', '| Key is string:', typeof rawKey === 'string');
    console.log('URL length:', supabaseUrl.length, '| Key length:', supabaseAnonKey.length);
    console.log('URL valid:', hasValidUrl, '| Key valid:', hasValidKey);
    
    if (!hasValidUrl || !hasValidKey) {
      console.error('❌ Missing environment variables - check supabase-client.ts logs for details');
    } else {
      console.log('✅ Environment variables validated in LoginForm');
    }
  }, []);

  useEffect(() => {
    if (hasCheckedSession.current) return;
    hasCheckedSession.current = true;
    let mounted = true;

    const checkSession = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (mounted && !sessionError && session && !hasRedirected.current) {
          hasRedirected.current = true;
          router.replace('/dashboard');
        }
      } catch (err) {
        console.error('Error checking session:', err);
      }
    };

    checkSession();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (mounted && session && !hasRedirected.current && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
        try {
          hasRedirected.current = true;
          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('role, assigned_gym_id, owner_id')
            .eq('id', session.user.id)
            .single();

          if (profileError || !profileData) return;

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
          window.location.replace(redirectPath);
        } catch (err) {
          console.error('Error in auth state change handler:', err);
          hasRedirected.current = false;
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || hasRedirected.current) return;

    // Check environment variables before attempting login
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
    
    if (!supabaseUrl || !supabaseAnonKey || supabaseUrl === 'undefined' || supabaseAnonKey === 'undefined') {
      const missing = [];
      if (!supabaseUrl || supabaseUrl === 'undefined') missing.push('NEXT_PUBLIC_SUPABASE_URL');
      if (!supabaseAnonKey || supabaseAnonKey === 'undefined') missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
      
      console.error('❌ ==========================================');
      console.error('❌ MISSING ENVIRONMENT VARIABLES!');
      console.error('❌ ==========================================');
      console.error(`Missing: ${missing.join(', ')}`);
      console.error('💡 SOLUTION:');
      console.error('1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables');
      console.error('2. Add these variables and redeploy');
      console.error('❌ ==========================================');
      
      setError(`Configuration error: Missing environment variables (${missing.join(', ')}). Please check console for details.`);
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (loginError) {
        setError(loginError.message);
        setLoading(false);
        return;
      }

      if (!data?.session) {
        setError('Login failed: No session received. Please check your credentials.');
        setLoading(false);
        return;
      }

      await supabase.auth.refreshSession();
      await new Promise((resolve) => setTimeout(resolve, 300));

      const { data: { session: verifySession }, error: _sessionError } = await supabase.auth.getSession();
      if (!verifySession) {
        setError('Session not persisted. Please try again.');
        setLoading(false);
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('role, assigned_gym_id, owner_id')
        .eq('id', verifySession.user.id)
        .single();

      if (profileError || !profileData) {
        setError(`Failed to load user profile: ${profileError?.message || 'Unknown error'}. Please check console for details.`);
        setLoading(false);
        return;
      }

      if (redirectUrl) {
        hasRedirected.current = true;
        window.location.replace(redirectUrl);
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

      hasRedirected.current = true;
      window.location.replace(redirectPath);
    } catch (err: unknown) {
      console.error('Login exception:', err);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred. Please check the console.');
      setLoading(false);
      hasRedirected.current = false;
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#000000] py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-white">SweatDrop Admin</h2>
          <p className="mt-2 text-center text-sm text-[#808080]">Sign in to manage your gym</p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleLogin}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="email-address" className="sr-only">Email address</label>
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
              <label htmlFor="password" className="sr-only">Password</label>
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

          {successMessage && (
            <div className="rounded-md bg-[#00E5FF]/10 border border-[#00E5FF]/30 p-3">
              <p className="text-sm text-[#00E5FF]">{successMessage}</p>
            </div>
          )}

          {error && (
            <div className="rounded-md bg-[#FF5252]/10 border border-[#FF5252]/30 p-3">
              <p className="text-sm text-[#FF5252]">{error}</p>
            </div>
          )}

          <div className="flex items-center justify-end">
            <a
              href="/forgot-password"
              className="text-sm text-[#808080] hover:text-[#00E5FF] transition-colors"
            >
              Forgot password?
            </a>
          </div>

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
