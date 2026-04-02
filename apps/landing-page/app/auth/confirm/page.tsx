'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';

type ConfirmState = 'loading' | 'success' | 'error';

function buildAppDeepLink(accessToken: string | null, refreshToken: string | null): string {
  if (accessToken && refreshToken) {
    return `sweatdrop://auth/confirm#access_token=${encodeURIComponent(accessToken)}&refresh_token=${encodeURIComponent(refreshToken)}&type=signup`;
  }
  return 'sweatdrop://';
}

export default function EmailConfirmPage() {
  const [confirmState, setConfirmState] = useState<ConfirmState>('loading');
  const [countdown, setCountdown] = useState(5);
  const tokensRef = useRef<{ access: string | null; refresh: string | null }>({ access: null, refresh: null });

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const type = params.get('type');

    const isConfirmationType = type === 'signup' || type === 'email_change' || type === 'magiclink';

    if (accessToken && isConfirmationType) {
      supabase.auth
        .setSession({ access_token: accessToken, refresh_token: refreshToken ?? '' })
        .then(({ data, error }) => {
          if (error) {
            setConfirmState('error');
          } else {
            // Store fresh tokens from the established session so the deep link
            // carries a valid (non-expired) pair to the mobile app.
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
          window.location.href = buildAppDeepLink(tokensRef.current.access, tokensRef.current.refresh);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [confirmState]);

  const handleOpenApp = () => {
    window.location.href = buildAppDeepLink(tokensRef.current.access, tokensRef.current.refresh);
  };

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
