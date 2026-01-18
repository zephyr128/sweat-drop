'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-client';
import { toast } from 'sonner';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

export default function InvitationHandler({ token }: { token: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [invitation, setInvitation] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    checkAuthAndLoadInvitation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const checkAuthAndLoadInvitation = async () => {
    try {
      // Check if user is authenticated
      const { data: { user } } = await supabase.auth.getUser();
      setIsAuthenticated(!!user);

      if (!token) {
        setError('Invalid invitation link');
        setLoading(false);
        return;
      }

      // Load invitation details
      // Note: After running migration 20240101000021 and 20240101000024, this will work for unauthenticated users
      // Use a more permissive query that works with RLS
      const { data, error: fetchError } = await supabase
        .from('staff_invitations')
        .select(`
          *,
          gyms:gym_id (
            id,
            name,
            city,
            country
          )
        `)
        .eq('token', token)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .single();

      if (fetchError || !data) {
        setError('Invitation not found or invalid');
        setLoading(false);
        return;
      }

      // Check if invitation is valid
      if (data.status !== 'pending') {
        setError(`This invitation has been ${data.status}`);
        setLoading(false);
        return;
      }

      if (new Date(data.expires_at) < new Date()) {
        setError('This invitation has expired');
        setLoading(false);
        return;
      }

      setInvitation(data);
      setLoading(false);
    } catch (err: any) {
      console.error('Error loading invitation:', err);
      setError('Failed to load invitation');
      setLoading(false);
    }
  };

  const handleAccept = async () => {
    if (!isAuthenticated) {
      // Redirect to login with return URL
      router.push(`/login?redirect=/accept-invitation/${token}&email=${encodeURIComponent(invitation.email)}`);
      return;
    }

    setAccepting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('Please log in to accept this invitation');
        setAccepting(false);
        return;
      }

      // Verify email matches
      const { data: profile } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', user.id)
        .single();

      if (!profile || profile.email?.toLowerCase() !== invitation.email.toLowerCase()) {
        setError(`This invitation is for ${invitation.email}. Please log in with that email address.`);
        setAccepting(false);
        return;
      }

      // Accept invitation via RPC (works for both staff and owner invitations)
      let gymId: string | null = null;
      
      // Check if it's an owner invitation
      if (invitation.role === 'gym_owner') {
        const { data: acceptedGymId, error: acceptError } = await supabase.rpc('accept_owner_invitation', {
          p_token: token,
        });

        if (acceptError) {
          throw acceptError;
        }

        gymId = acceptedGymId;
      } else {
        // Staff invitation
        const { data: acceptedGymId, error: acceptError } = await supabase.rpc('accept_staff_invitation', {
          p_token: token,
        });

        if (acceptError) {
          throw acceptError;
        }

        gymId = acceptedGymId;
      }

      toast.success('Invitation accepted! Redirecting to dashboard...');
      
      // Redirect based on role
      if (invitation.role === 'gym_owner') {
        // Owner: redirect to first owned gym or general dashboard
        if (gymId) {
          setTimeout(() => {
            router.push(`/dashboard/gym/${gymId}/dashboard`);
          }, 1500);
        } else {
          setTimeout(() => {
            router.push('/dashboard');
          }, 1500);
        }
      } else {
        // Staff: redirect to assigned gym
        setTimeout(() => {
          router.push(`/dashboard/gym/${gymId}/dashboard`);
        }, 1500);
      }
    } catch (err: any) {
      console.error('Error accepting invitation:', err);
      setError(err.message || 'Failed to accept invitation');
      setAccepting(false);
    }
  };

  const handleSignUp = () => {
    // Redirect to sign up with email pre-filled
    router.push(`/signup?email=${encodeURIComponent(invitation.email)}&invite=${token}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#000000] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-[#00E5FF] animate-spin mx-auto mb-4" />
          <p className="text-[#808080]">Loading invitation...</p>
        </div>
      </div>
    );
  }

  if (error && !invitation) {
    return (
      <div className="min-h-screen bg-[#000000] flex items-center justify-center p-4">
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-8 max-w-md w-full text-center">
          <XCircle className="w-16 h-16 text-[#FF5252] mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Invalid Invitation</h1>
          <p className="text-[#808080] mb-6">{error}</p>
          <button
            onClick={() => router.push('/login')}
            className="px-6 py-3 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#000000] flex items-center justify-center p-4">
      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <CheckCircle className="w-16 h-16 text-[#00E5FF] mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">
            {invitation?.role === 'gym_owner' ? 'Owner Invitation' : 'Staff Invitation'}
          </h1>
          <p className="text-[#808080]">
            {invitation?.role === 'gym_owner' 
              ? "You've been invited to become a gym owner"
              : "You've been invited to join as staff"}
          </p>
        </div>

        <div className="space-y-4 mb-6">
          {invitation?.gyms && (
            <div className="bg-[#1A1A1A] rounded-lg p-4">
              <p className="text-sm text-[#808080] mb-1">Gym</p>
              <p className="text-white font-medium">
                {invitation.gyms.name || 'Unknown Gym'}
                {invitation.gyms.city && ` - ${invitation.gyms.city}`}
              </p>
            </div>
          )}

          <div className="bg-[#1A1A1A] rounded-lg p-4">
            <p className="text-sm text-[#808080] mb-1">Role</p>
            <p className="text-white font-medium">
              {invitation?.role === 'gym_owner' 
                ? 'Gym Owner' 
                : invitation?.role === 'gym_admin' 
                ? 'Gym Admin' 
                : 'Receptionist'}
            </p>
            <p className="text-xs text-[#808080] mt-1">
              {invitation?.role === 'gym_owner'
                ? 'Full access to manage all your gym locations'
                : invitation?.role === 'gym_admin'
                ? 'Full access to manage this gym'
                : 'Access to redemptions and live feed'}
            </p>
          </div>

          <div className="bg-[#1A1A1A] rounded-lg p-4">
            <p className="text-sm text-[#808080] mb-1">Email</p>
            <p className="text-white font-medium">{invitation?.email}</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-[#FF5252]/10 border border-[#FF5252]/30 rounded-lg">
            <p className="text-sm text-[#FF5252]">{error}</p>
          </div>
        )}

        <div className="space-y-3">
          {isAuthenticated ? (
            <button
              onClick={handleAccept}
              disabled={accepting}
              className="w-full px-6 py-3 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {accepting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Accepting...
                </>
              ) : (
                'Accept Invitation'
              )}
            </button>
          ) : (
            <>
              <button
                onClick={() => router.push(`/login?redirect=/accept-invitation/${token}&email=${encodeURIComponent(invitation.email)}`)}
                className="w-full px-6 py-3 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors"
              >
                Log In to Accept
              </button>
              <button
                onClick={handleSignUp}
                className="w-full px-6 py-3 bg-[#1A1A1A] text-white rounded-lg font-medium hover:bg-[#2A2A2A] transition-colors"
              >
                Create Account
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
