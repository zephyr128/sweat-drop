'use client';

// CRITICAL: Client components don't need dynamic flag, but we keep it for consistency
// Next.js will handle client components differently during build

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase-client';
import { Droplet } from 'lucide-react';

export default function DashboardPage() {
  const [_session, setSession] = useState<any>(null);
  const [gymStaff, setGymStaff] = useState<any>(null);
  const [stats, setStats] = useState({
    activeUsers: 0,
    totalDrops: 0,
    redeems: 0,
  });
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    loadSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (gymStaff?.gym_id) {
      loadStats();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    // Get gym staff info
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

  const loadStats = async () => {
    if (!gymStaff?.gym_id) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Active users today (users with active sessions)
    const { data: activeSessions } = await supabase
      .from('sessions')
      .select('user_id')
      .eq('gym_id', gymStaff.gym_id)
      .eq('is_active', true)
      .gte('started_at', today.toISOString());

    const uniqueUsers = new Set(activeSessions?.map((s) => s.user_id) || []);
    setStats((prev) => ({ ...prev, activeUsers: uniqueUsers.size }));

    // Total drops today
    const { data: dropsData } = await supabase
      .from('drops_transactions')
      .select('amount')
      .gte('created_at', today.toISOString())
      .gt('amount', 0)
      .in(
        'user_id',
        activeSessions?.map((s) => s.user_id) || []
      );

    const totalDrops =
      dropsData?.reduce((sum, t) => sum + (t.amount || 0), 0) || 0;
    setStats((prev) => ({ ...prev, totalDrops }));

    // Redeems today
    const { data: redeemsData } = await supabase
      .from('redemptions')
      .select('id')
      .eq('gym_id', gymStaff.gym_id)
      .eq('status', 'confirmed')
      .gte('confirmed_at', today.toISOString());

    setStats((prev) => ({ ...prev, redeems: redeemsData?.length || 0 }));
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div>Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-gray-900">SweatDrop Admin</h1>
              {gymStaff?.gym && (
                <span className="ml-4 text-gray-600">{gymStaff.gym.name}</span>
              )}
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={handleLogout}
                className="text-gray-600 hover:text-gray-900"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500">Active Users Today</h3>
            <p className="mt-2 text-3xl font-bold text-gray-900">{stats.activeUsers}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500">Total Drops Today</h3>
            <p className="mt-2 text-3xl font-bold text-blue-600 flex items-center gap-2">
              <Droplet className="w-8 h-8" strokeWidth={1.5} /> {stats.totalDrops}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500">Redeems Today</h3>
            <p className="mt-2 text-3xl font-bold text-green-600">{stats.redeems}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Link
            href="/dashboard/rewards"
            className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
          >
            <h2 className="text-xl font-bold text-gray-900 mb-2">Rewards Manager</h2>
            <p className="text-gray-600">Manage gym rewards and pricing</p>
          </Link>

          <Link
            href="/dashboard/challenges"
            className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
          >
            <h2 className="text-xl font-bold text-gray-900 mb-2">Challenges Manager</h2>
            <p className="text-gray-600">Create and manage challenges</p>
          </Link>

          <Link
            href="/dashboard/redeems"
            className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
          >
            <h2 className="text-xl font-bold text-gray-900 mb-2">Redeem Validation</h2>
            <p className="text-gray-600">Confirm reward redemptions</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
