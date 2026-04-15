'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase-client';

export default function ResetPasswordForm() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        if (updateError.message.toLowerCase().includes('session')) {
          setError('Your reset link has expired. Please request a new one.');
        } else {
          setError(updateError.message);
        }
        setLoading(false);
        return;
      }

      // Grab the fresh session tokens so the mobile app can authenticate
      // without requiring the user to log in again.
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const refreshToken = sessionData.session?.refresh_token;

      setSuccess(true);

      if (accessToken && refreshToken) {
        const deepLink =
          `sweatdrop://auth/confirm` +
          `?access_token=${encodeURIComponent(accessToken)}` +
          `&refresh_token=${encodeURIComponent(refreshToken)}` +
          `&type=recovery` +
          `&password_updated=1`;

        setTimeout(() => {
          window.location.href = deepLink;
        }, 800);
      }
      // If no session (edge case), just stay on the success screen — user can open app manually.
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#000000] py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-white">
            Set New Password
          </h2>
          <p className="mt-2 text-center text-sm text-[#808080]">
            Choose a strong password for your SweatDrop account
          </p>
        </div>

        {success ? (
          <SuccessState />
        ) : (
          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            <div className="rounded-md shadow-sm -space-y-px">
              <div>
                <label htmlFor="new-password" className="sr-only">
                  New Password
                </label>
                <input
                  id="new-password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={6}
                  className="appearance-none rounded-none relative block w-full px-3 py-2 bg-[#1A1A1A] border border-[#1A1A1A] placeholder-[#808080] text-white rounded-t-md focus:outline-none focus:ring-[#00E5FF] focus:border-[#00E5FF] focus:z-10 sm:text-sm"
                  placeholder="New password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="confirm-password" className="sr-only">
                  Confirm Password
                </label>
                <input
                  id="confirm-password"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={6}
                  className="appearance-none rounded-none relative block w-full px-3 py-2 bg-[#1A1A1A] border border-[#1A1A1A] placeholder-[#808080] text-white rounded-b-md focus:outline-none focus:ring-[#00E5FF] focus:border-[#00E5FF] focus:z-10 sm:text-sm"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
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
                {loading ? 'Updating...' : 'Update Password'}
              </button>
            </div>

            <div className="text-center">
              <a
                href="/login"
                className="text-sm text-[#808080] hover:text-[#00E5FF] transition-colors"
              >
                Back to login
              </a>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function SuccessState() {
  const handleOpenApp = () => {
    supabase.auth.getSession().then(({ data }) => {
      const at = data.session?.access_token;
      const rt = data.session?.refresh_token;
      if (at && rt) {
        window.location.href =
          `sweatdrop://auth/confirm` +
          `?access_token=${encodeURIComponent(at)}` +
          `&refresh_token=${encodeURIComponent(rt)}` +
          `&type=recovery` +
          `&password_updated=1`;
      }
    });
  };

  return (
    <div className="space-y-6 text-center">
      <div className="rounded-md bg-[#00E5FF]/10 border border-[#00E5FF]/30 p-6 space-y-3">
        <p className="text-2xl">✅</p>
        <p className="text-lg font-bold text-white">Password Updated!</p>
        <p className="text-sm text-[#808080]">
          Your password has been changed. Opening SweatDrop…
        </p>
      </div>
      <button
        onClick={handleOpenApp}
        className="w-full py-3 px-4 rounded-md text-black bg-[#00E5FF] hover:bg-[#00B8CC] font-semibold text-sm transition-colors"
      >
        Open SweatDrop →
      </button>
      <a
        href="/login"
        className="block text-sm text-[#808080] hover:text-[#00E5FF] transition-colors"
      >
        Back to login
      </a>
    </div>
  );
}
