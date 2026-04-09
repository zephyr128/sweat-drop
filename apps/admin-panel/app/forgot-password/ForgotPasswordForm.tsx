'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase-client';

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        { redirectTo: appUrl },
      );

      if (resetError) {
        setError(resetError.message);
        setLoading(false);
        return;
      }

      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#000000] py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-white">
            Reset Password
          </h2>
          <p className="mt-2 text-center text-sm text-[#808080]">
            Enter your email and we&apos;ll send you a reset link
          </p>
        </div>

        {sent ? (
          <div className="space-y-6">
            <div className="rounded-md bg-[#00E5FF]/10 border border-[#00E5FF]/30 p-4">
              <p className="text-sm text-[#00E5FF] text-center">
                Check your email for a password reset link. It may take a minute to arrive.
              </p>
            </div>
            <div className="text-center">
              <a
                href="/login"
                className="text-sm text-[#808080] hover:text-[#00E5FF] transition-colors"
              >
                Back to login
              </a>
            </div>
          </div>
        ) : (
          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="reset-email" className="sr-only">
                Email address
              </label>
              <input
                id="reset-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="appearance-none rounded-md relative block w-full px-3 py-2 bg-[#1A1A1A] border border-[#1A1A1A] placeholder-[#808080] text-white focus:outline-none focus:ring-[#00E5FF] focus:border-[#00E5FF] focus:z-10 sm:text-sm"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
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
                {loading ? 'Sending...' : 'Send Reset Link'}
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
