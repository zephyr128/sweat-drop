'use client';

import { useEffect, useState, useRef } from 'react';
import type { EmailOtpType } from '@supabase/supabase-js';
import { hasSupabasePublicEnv, supabase } from '@/lib/supabase';

type ConfirmState = 'loading' | 'success' | 'error' | 'admin_surface';
type OtpType = EmailOtpType;

const ADMIN_PANEL_URL = 'https://admin.sweat-drop.com';

// Elevated (non-consumer) roles. These exist ONLY in profiles.role — they are
// NOT mirrored into auth.users.app_metadata / user_metadata in this codebase.
const ELEVATED_ROLES = new Set([
  'superadmin',
  'gym_owner',
  'gym_admin',
  'receptionist',
]);

/**
 * Fetch the current user's role from `profiles` via RLS (self-read policy
 * `profiles_select_own` allows this). Falls back to false (consumer) on
 * any error or missing data — we'd rather let a rare admin through than
 * block the common consumer flow. Admin leakage to this domain is already
 * prevented upstream (admin resets are sent via Resend with admin-domain
 * URLs), so this check is only a safety net for stale pre-fix emails.
 */
async function detectElevatedRole(): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return false;

    const { data, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();

    if (error || !data) return false;
    const role = (data as { role: string | null }).role;
    if (!role) return false;
    return ELEVATED_ROLES.has(role);
  } catch {
    return false;
  }
}

async function signOutAndReturnIsElevated(): Promise<boolean> {
  if (!supabase) return false;
  const isElevated = await detectElevatedRole();
  if (isElevated) {
    await supabase.auth.signOut();
  }
  return isElevated;
}

function buildAppDeepLink(accessToken: string | null, refreshToken: string | null, type: string = 'signup'): string {
  if (accessToken && refreshToken) {
    const params = `access_token=${encodeURIComponent(accessToken)}&refresh_token=${encodeURIComponent(refreshToken)}&type=${encodeURIComponent(type)}`;
    return `sweatdrop://auth/confirm?${params}`;
  }
  return 'sweatdrop://';
}

export default function EmailConfirmPage() {
  const [confirmState, setConfirmState] = useState<ConfirmState>('loading');
  const [countdown, setCountdown] = useState(5);
  const tokensRef = useRef<{ access: string | null; refresh: string | null }>({ access: null, refresh: null });
  const authTypeRef = useRef<string>('signup');

  useEffect(() => {
    if (!hasSupabasePublicEnv || !supabase) {
      setConfirmState('error');
      return;
    }

    // Flow 1: token_hash in query params (new email template format)
    const searchParams = new URLSearchParams(window.location.search);
    const tokenHash = searchParams.get('token_hash');
    const tokenType = searchParams.get('type') as OtpType | null;

    if (tokenHash && tokenType) {
      authTypeRef.current = tokenType;
      supabase.auth
        .verifyOtp({ token_hash: tokenHash, type: tokenType })
        .then(async ({ data, error }) => {
          if (error) {
            setConfirmState('error');
            return;
          }

          const s = data.session;

          // Recovery flow: check role before redirecting — admin resets must never
          // reach the mobile app deep-link path (belt-and-suspenders for stale emails).
          if (tokenType === 'recovery' && s) {
            const isElevated = await signOutAndReturnIsElevated();
            if (isElevated) {
              setConfirmState('admin_surface');
              return;
            }
            window.location.href = `/auth/reset#access_token=${encodeURIComponent(s.access_token)}&refresh_token=${encodeURIComponent(s.refresh_token)}&type=recovery`;
            return;
          }

          tokensRef.current = {
            access: s?.access_token ?? null,
            refresh: s?.refresh_token ?? null,
          };
          setConfirmState('success');
        });
      return;
    }

    // Flow 2 (legacy): access_token + refresh_token in hash fragment
    const hash = window.location.hash.slice(1);
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const type = params.get('type');
    if (type) authTypeRef.current = type;

    // Recovery via hash fragment: check role before redirecting to reset page.
    if (accessToken && type === 'recovery') {
      supabase.auth
        .setSession({ access_token: accessToken, refresh_token: refreshToken ?? '' })
        .then(async ({ error }) => {
          if (error) {
            setConfirmState('error');
            return;
          }
          const isElevated = await signOutAndReturnIsElevated();
          if (isElevated) {
            setConfirmState('admin_surface');
            return;
          }
          window.location.href = `/auth/reset#${hash}`;
        });
      return;
    }

    const isConfirmationType = type === 'signup' || type === 'email_change' || type === 'magiclink';

    if (accessToken && isConfirmationType) {
      supabase.auth
        .setSession({ access_token: accessToken, refresh_token: refreshToken ?? '' })
        .then(({ data, error }) => {
          if (error) {
            setConfirmState('error');
          } else {
            const s = data.session;
            tokensRef.current = {
              access: s?.access_token ?? accessToken,
              refresh: s?.refresh_token ?? refreshToken,
            };
            setConfirmState('success');
          }
        });
    } else if (accessToken) {
      tokensRef.current = { access: accessToken, refresh: refreshToken };
      setConfirmState('success');
    } else {
      setConfirmState('success');
    }
  }, []);

  useEffect(() => {
    if (confirmState !== 'success') return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          window.location.href = buildAppDeepLink(
            tokensRef.current.access,
            tokensRef.current.refresh,
            authTypeRef.current,
          );
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [confirmState]);

  const handleOpenApp = () => {
    window.location.href = buildAppDeepLink(
      tokensRef.current.access,
      tokensRef.current.refresh,
      authTypeRef.current,
    );
  };

  if (confirmState === 'admin_surface') {
    // This branch only fires for STALE pre-fix reset emails that still pointed
    // at www.sweat-drop.com. The token has already been consumed by
    // verifyOtp/setSession above — it cannot be reused. We must not send the
    // user to /login (they may have a live admin cookie session that would
    // land them on /dashboard, masking the fact that their password was NEVER
    // updated). Send them to /forgot-password for a fresh link instead.
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

  if (confirmState === 'loading') {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-6">
        <div className="max-w-md w-full text-center">
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
          <p className="text-gray-400">Confirming your email…</p>
        </div>
      </div>
    );
  }

  if (confirmState === 'error') {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-6">
        <div className="max-w-md w-full text-center">
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

          <p className="text-gray-400 text-base leading-relaxed mb-8">
            This confirmation link is invalid or has expired.
            <br />
            Please request a new one from the app.
          </p>

          <button
            onClick={handleOpenApp}
            className="w-full py-4 rounded-full bg-white/10 text-white font-bold text-lg tracking-wide uppercase transition-all hover:bg-white/15 active:scale-[0.98] border border-white/10"
            style={{ fontFamily: 'var(--font-display), sans-serif' }}
          >
            OPEN SWEATDROP
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        {/* Icon */}
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

        {/* Title */}
        <h1
          className="text-3xl tracking-wider text-white mb-3"
          style={{ fontFamily: 'var(--font-display), sans-serif' }}
        >
          EMAIL CONFIRMED
        </h1>

        <p className="text-gray-400 text-base leading-relaxed mb-8">
          Your email has been verified successfully.
          <br />
          You can now continue in the SweatDrop app.
        </p>

        {/* CTA */}
        <button
          onClick={handleOpenApp}
          className="w-full py-4 rounded-full bg-cyan-400 text-black font-bold text-lg tracking-wide uppercase transition-all hover:bg-cyan-300 hover:shadow-[0_0_30px_rgba(0,229,255,0.4)] active:scale-[0.98]"
          style={{ fontFamily: 'var(--font-display), sans-serif' }}
        >
          OPEN SWEATDROP
        </button>

        <p className="text-gray-500 text-sm mt-4">
          Redirecting automatically in {countdown}s…
        </p>

        {/* Subtle footer */}
        <p className="text-gray-600 text-xs mt-12">
          If the app doesn&apos;t open, make sure SweatDrop is installed on your device.
        </p>
      </div>
    </div>
  );
}
