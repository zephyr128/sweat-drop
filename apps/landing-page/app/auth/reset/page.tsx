'use client';

import { useEffect, useState, useRef } from 'react';
import { hasSupabasePublicEnv, supabase } from '@/lib/supabase';

type ResetState = 'loading' | 'form' | 'success' | 'error' | 'admin_surface';

const ADMIN_PANEL_URL = 'https://admin.sweat-drop.com';

// Elevated (non-consumer) roles. These exist ONLY in profiles.role — they are
// NOT mirrored into auth.users.app_metadata / user_metadata in this codebase.
const ELEVATED_ROLES = new Set([
  'superadmin',
  'gym_owner',
  'gym_admin',
  'receptionist',
]);

function buildAppDeepLink(accessToken: string | null, refreshToken: string | null): string {
  if (accessToken && refreshToken) {
    const params = `access_token=${encodeURIComponent(accessToken)}&refresh_token=${encodeURIComponent(refreshToken)}&type=recovery&password_updated=1`;
    return `sweatdrop://auth/confirm?${params}`;
  }
  return 'sweatdrop://';
}

export default function PasswordResetPage() {
  const [state, setState] = useState<ResetState>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState('');
  const [isConsumer, setIsConsumer] = useState(false);
  const tokensRef = useRef<{ access: string | null; refresh: string | null }>({ access: null, refresh: null });

  useEffect(() => {
    if (!hasSupabasePublicEnv || !supabase) {
      setErrorMessage('Auth service is temporarily unavailable. Please try again later.');
      setState('error');
      return;
    }

    // Supabase password reset links use a hash fragment:
    // #access_token=...&refresh_token=...&type=recovery
    const hash = window.location.hash.slice(1);
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const type = params.get('type');

    if (!accessToken || type !== 'recovery') {
      setErrorMessage('This reset link is invalid or has expired. Please request a new password reset.');
      setState('error');
      return;
    }

    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken ?? '' })
      .then(async ({ error }) => {
        if (error) {
          setErrorMessage('This reset link has expired or is no longer valid. Please request a new one.');
          setState('error');
          return;
        }

        // Check role from the profiles table (NOT app_metadata/user_metadata,
        // which are not populated in this codebase — role lives only in
        // public.profiles.role). We default to consumer on any error so that
        // the common mobile reset flow is never blocked by a transient DB
        // issue. Admin leakage to this surface is prevented upstream (admin
        // panel sends its own email via Resend with an admin-domain URL).
        let isElevated = false;
        try {
          const { data: userData } = await supabase!.auth.getUser();
          const userId = userData.user?.id;
          if (userId) {
            const { data: profileRow } = await supabase!
              .from('profiles')
              .select('role')
              .eq('id', userId)
              .maybeSingle();
            const role = (profileRow as { role: string | null } | null)?.role ?? null;
            isElevated = !!role && ELEVATED_ROLES.has(role);
          }
        } catch {
          // Ignore — default to consumer (safer for UX).
          isElevated = false;
        }

        if (isElevated) {
          await supabase!.auth.signOut();
          setState('admin_surface');
          return;
        }

        setIsConsumer(true);
        setState('form');
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    if (!hasSupabasePublicEnv || !supabase) {
      setFieldError('Auth service is temporarily unavailable. Please try again later.');
      return;
    }

    e.preventDefault();
    setFieldError('');

    if (password.length < 8) {
      setFieldError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setFieldError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });

    if (!error) {
      const { data } = await supabase.auth.getSession();
      tokensRef.current = {
        access: data.session?.access_token ?? null,
        refresh: data.session?.refresh_token ?? null,
      };
    }

    setIsSubmitting(false);

    if (error) {
      setFieldError(error.message || 'Failed to update password. Please try again.');
    } else {
      setState('success');
    }
  };

  if (state === 'admin_surface') {
    // Stale admin email landed on the consumer reset page. The setSession call
    // above already consumed the recovery token — there is no way to forward
    // it to the admin panel. Route the user to /forgot-password on the admin
    // domain to request a fresh link rather than /login (which could silently
    // drop them on /dashboard via a pre-existing admin cookie, hiding the fact
    // that their password was never updated).
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-6">
        <div className="max-w-md w-full text-center">
          <div className="mx-auto w-20 h-20 rounded-full bg-yellow-500/20 flex items-center justify-center mb-8">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-10 h-10 text-yellow-400"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>

          <h1
            className="text-3xl tracking-wider text-white mb-3"
            style={{ fontFamily: 'var(--font-display), sans-serif' }}
          >
            LINK NOT VALID HERE
          </h1>

          <p className="text-gray-400 text-base leading-relaxed mb-8">
            This reset link was issued for an admin account and cannot be used on
            this page.
            <br />
            Please request a fresh reset link from the admin panel.
          </p>

          <a
            href={`${ADMIN_PANEL_URL}/forgot-password`}
            className="block w-full py-4 rounded-full bg-white/10 text-white font-bold text-lg tracking-wide uppercase transition-all hover:bg-white/15 active:scale-[0.98] border border-white/10"
            style={{ fontFamily: 'var(--font-display), sans-serif' }}
          >
            REQUEST NEW RESET LINK
          </a>

          <p className="text-gray-600 text-xs mt-8">
            The SweatDrop mobile app is for gym members only.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        {state === 'loading' && (
          <>
            <div className="mx-auto w-20 h-20 rounded-full bg-cyan-500/10 flex items-center justify-center mb-8">
              <svg
                className="w-8 h-8 text-cyan-400 animate-spin"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            </div>
            <p className="text-gray-400">Verifying reset link…</p>
          </>
        )}

        {state === 'form' && (
          <>
            <div className="mx-auto w-20 h-20 rounded-full bg-cyan-500/20 flex items-center justify-center mb-8">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-10 h-10 text-cyan-400"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>

            <h1
              className="text-3xl tracking-wider text-white mb-3"
              style={{ fontFamily: 'var(--font-display), sans-serif' }}
            >
              SET NEW PASSWORD
            </h1>

            <p className="text-gray-400 text-base leading-relaxed mb-8">
              Choose a strong password for your SweatDrop account.
            </p>

            <form onSubmit={handleSubmit} className="text-left space-y-4">
              <div>
                <label className="block text-gray-400 text-sm mb-2 tracking-wide uppercase" htmlFor="password">
                  New Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  required
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 focus:outline-none focus:border-cyan-400/60 focus:bg-white/8 transition-colors"
                />
              </div>

              <div>
                <label
                  className="block text-gray-400 text-sm mb-2 tracking-wide uppercase"
                  htmlFor="confirm-password"
                >
                  Confirm Password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat your password"
                  autoComplete="new-password"
                  required
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 focus:outline-none focus:border-cyan-400/60 focus:bg-white/8 transition-colors"
                />
              </div>

              {fieldError && (
                <p className="text-red-400 text-sm text-center">{fieldError}</p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-4 rounded-full bg-cyan-400 text-black font-bold text-lg tracking-wide uppercase transition-all hover:bg-cyan-300 hover:shadow-[0_0_30px_rgba(0,229,255,0.4)] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                style={{ fontFamily: 'var(--font-display), sans-serif' }}
              >
                {isSubmitting ? 'UPDATING…' : 'UPDATE PASSWORD'}
              </button>
            </form>
          </>
        )}

        {state === 'success' && (
          <>
            <div className="mx-auto w-20 h-20 rounded-full bg-cyan-500/20 flex items-center justify-center mb-8">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-10 h-10 text-cyan-400"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>

            <h1
              className="text-3xl tracking-wider text-white mb-3"
              style={{ fontFamily: 'var(--font-display), sans-serif' }}
            >
              PASSWORD UPDATED
            </h1>

            {isConsumer ? (
              <>
                <p className="text-gray-400 text-base leading-relaxed mb-8">
                  Your password has been changed successfully.
                  <br />
                  You can now sign in to the SweatDrop app.
                </p>

                <button
                  onClick={() => { window.location.href = buildAppDeepLink(tokensRef.current.access, tokensRef.current.refresh); }}
                  className="w-full py-4 rounded-full bg-cyan-400 text-black font-bold text-lg tracking-wide uppercase transition-all hover:bg-cyan-300 hover:shadow-[0_0_30px_rgba(0,229,255,0.4)] active:scale-[0.98]"
                  style={{ fontFamily: 'var(--font-display), sans-serif' }}
                >
                  OPEN SWEATDROP
                </button>

                <p className="text-gray-600 text-xs mt-8">
                  If the app doesn&apos;t open, make sure SweatDrop is installed on your device.
                </p>
              </>
            ) : (
              <>
                <p className="text-gray-400 text-base leading-relaxed mb-8">
                  Your password has been changed successfully.
                  <br />
                  You can now sign in to the admin panel.
                </p>

                <a
                  href={`${ADMIN_PANEL_URL}/login`}
                  className="block w-full py-4 rounded-full bg-white/10 text-white font-bold text-lg tracking-wide uppercase transition-all hover:bg-white/15 active:scale-[0.98] border border-white/10"
                  style={{ fontFamily: 'var(--font-display), sans-serif' }}
                >
                  GO TO ADMIN PANEL
                </a>
              </>
            )}
          </>
        )}

        {state === 'error' && (
          <>
            <div className="mx-auto w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center mb-8">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-10 h-10 text-red-400"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>

            <h1
              className="text-3xl tracking-wider text-white mb-3"
              style={{ fontFamily: 'var(--font-display), sans-serif' }}
            >
              LINK EXPIRED
            </h1>

            <p className="text-gray-400 text-base leading-relaxed mb-8">{errorMessage}</p>

            <button
              onClick={() => { window.location.href = 'sweatdrop://'; }}
              className="w-full py-4 rounded-full bg-white/10 text-white font-bold text-lg tracking-wide uppercase transition-all hover:bg-white/15 active:scale-[0.98] border border-white/10"
              style={{ fontFamily: 'var(--font-display), sans-serif' }}
            >
              OPEN SWEATDROP
            </button>

            <p className="text-gray-500 text-sm mt-4">
              Request a new reset link from the app&apos;s sign-in screen.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
