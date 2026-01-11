'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function RedeemsPage() {
  const [session, setSession] = useState<any>(null);
  const [gymStaff, setGymStaff] = useState<any>(null);
  const [redeems, setRedeems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    loadSession();
  }, []);

  useEffect(() => {
    if (gymStaff?.gym_id) {
      loadRedeems();
      // Refresh every 5 seconds
      const interval = setInterval(loadRedeems, 5000);
      return () => clearInterval(interval);
    }
  }, [gymStaff]);

  const loadSession = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      router.push('/login');
      return;
    }

    setSession(session);

    const { data: staffData } = await supabase
      .from('gym_staff')
      .select('*, gym:gym_id(*)')
      .eq('user_id', session.user.id)
      .single();

    if (staffData) {
      setGymStaff(staffData);
    } else {
      router.push('/login');
    }

    setLoading(false);
  };

  const loadRedeems = async () => {
    if (!gymStaff?.gym_id) return;

    const { data } = await supabase
      .from('redemptions')
      .select('*, reward:reward_id(*), profiles:user_id(username)')
      .eq('gym_id', gymStaff.gym_id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (data) {
      setRedeems(data);
    }
  };

  const handleConfirm = async (redeemId: string) => {
    if (!session?.user) return;

    if (!confirm('Confirm this redemption?')) return;

    const { error } = await supabase
      .from('redemptions')
      .update({
        status: 'confirmed',
        confirmed_by: session.user.id,
        confirmed_at: new Date().toISOString(),
      })
      .eq('id', redeemId);

    if (error) {
      alert(error.message);
    } else {
      loadRedeems();
    }
  };

  const handleCancel = async (redeemId: string) => {
    if (!confirm('Cancel this redemption? Drops will be refunded.')) return;

    const redeem = redeems.find((r) => r.id === redeemId);
    if (!redeem) return;

    // Refund drops
    await supabase.rpc('add_drops', {
      p_user_id: redeem.user_id,
      p_amount: redeem.drops_spent,
      p_transaction_type: 'reward',
      p_reference_id: redeem.reward_id,
      p_description: `Refund: ${redeem.reward?.name || 'Reward'}`,
    });

    const { error } = await supabase
      .from('redemptions')
      .update({
        status: 'cancelled',
        confirmed_by: session?.user?.id,
        confirmed_at: new Date().toISOString(),
      })
      .eq('id', redeemId);

    if (error) {
      alert(error.message);
    } else {
      loadRedeems();
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <Link href="/dashboard" className="text-gray-600 hover:text-gray-900">
              ← Back to Dashboard
            </Link>
            <h1 className="text-xl font-bold text-gray-900">Redeem Validation</h1>
            <div></div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {redeems.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <p className="text-gray-500 text-lg">No pending redemptions</p>
          </div>
        ) : (
          <div className="space-y-4">
            {redeems.map((redeem) => (
              <div key={redeem.id} className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-4 mb-2">
                      <h3 className="text-lg font-bold text-gray-900">
                        {redeem.profiles?.username || 'Unknown User'}
                      </h3>
                      <span className="px-3 py-1 bg-yellow-100 text-yellow-800 text-sm font-semibold rounded-full">
                        Pending
                      </span>
                    </div>
                    <div className="text-gray-600 mb-2">
                      <p className="font-medium">{redeem.reward?.name || 'Unknown Reward'}</p>
                      <p className="text-sm">
                        💧 {redeem.drops_spent} drops •{' '}
                        {new Date(redeem.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleConfirm(redeem.id)}
                      className="bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700 font-medium"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => handleCancel(redeem.id)}
                      className="bg-red-600 text-white px-6 py-2 rounded-md hover:bg-red-700 font-medium"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
