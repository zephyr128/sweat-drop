'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase-client';
import { toast } from 'sonner';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const dynamicParams = true;

function SignupPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailParam = searchParams?.get('email') || '';
  const inviteToken = searchParams?.get('invite') || null;
  
  const [email, setEmail] = useState(emailParam);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // If email is provided, generate username from it
    if (email && !username) {
      const usernameFromEmail = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
      setUsername(usernameFromEmail);
    }
  }, [email, username]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !password || !username) {
      setError('Please fill in all required fields');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      // Sign up the user
      const { data: authData, error: signupError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            username,
          },
          emailRedirectTo: inviteToken 
            ? `${window.location.origin}/accept-invitation/${inviteToken}`
            : `${window.location.origin}/dashboard`,
        },
      });

      if (signupError) {
        throw signupError;
      }

      if (!authData.user) {
        throw new Error('Failed to create user');
      }

      // Update profile with username
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ username })
        .eq('id', authData.user.id);

      if (profileError) {
        console.error('Error updating profile:', profileError);
        // Don't fail signup if profile update fails
      }

      toast.success('Account created successfully! Please check your email to confirm your account.');

      // If there's an invitation token, redirect to accept it after a delay
      if (inviteToken) {
        setTimeout(() => {
          router.push(`/accept-invitation/${inviteToken}`);
        }, 2000);
      } else {
        // Otherwise, redirect to login
        setTimeout(() => {
          router.push('/login');
        }, 2000);
      }
    } catch (err: any) {
      console.error('Signup error:', err);
      setError(err.message || 'Failed to create account');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#000000] flex items-center justify-center p-4">
      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-8 max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Create Account</h1>
          <p className="text-[#808080]">
            {inviteToken 
              ? 'Sign up to accept your staff invitation'
              : 'Sign up to get started'}
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-[#FF5252]/10 border border-[#FF5252]/30 rounded-lg">
            <p className="text-sm text-[#FF5252]">{error}</p>
          </div>
        )}

        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Email *
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={!!emailParam} // Disable if pre-filled from invitation
              className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="your@email.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Username *
            </label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
              placeholder="username"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Password *
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
              placeholder="••••••••"
              minLength={6}
            />
            <p className="mt-1 text-xs text-[#808080]">At least 6 characters</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Confirm Password *
            </label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
              placeholder="••••••••"
              minLength={6}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-6 py-3 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-[#808080] text-sm">
            Already have an account?{' '}
            <Link 
              href={inviteToken ? `/login?redirect=/accept-invitation/${inviteToken}&email=${encodeURIComponent(email)}` : '/login'}
              className="text-[#00E5FF] hover:underline"
            >
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#000000] flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    }>
      <SignupPageContent />
    </Suspense>
  );
}
