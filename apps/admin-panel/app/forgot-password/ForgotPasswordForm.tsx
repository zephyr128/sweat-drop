'use client';

import { useState } from 'react';
import { sendAdminPasswordResetEmail } from '@/lib/actions/password-reset-actions';

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);
    setLoading(true);

    try {
      // SECURITY: we use a server action (not supabase.auth.resetPasswordForEmail)
      // so the email is sent directly via Resend with a URL that ALWAYS lives
      // on admin.sweat-drop.com. This fully bypasses Supabase's email template
      // and the consumer domain, which is bound to the mobile app via App Links.
      const result = await sendAdminPasswordResetEmail(email);

      if (!result.success) {
        setError(result.message);
        setLoading(false);
        return;
      }

      setInfoMessage(result.message);
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
                {infoMessage ?? 'Check your email for a password reset link. It may take a minute to arrive.'}
              </p>
              <p className="text-xs text-[#808080] text-center mt-3">
                The link opens at admin.sweat-drop.com — not the mobile app.
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
