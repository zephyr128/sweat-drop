'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase-client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function GymsPage() {
  const router = useRouter();
  const [gyms, setGyms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadGyms();
  }, []);

  const loadGyms = async () => {
    try {
      const { data, error } = await supabase
        .from('gyms')
        .select('*')
        .order('name');

      if (error) {
        // Error loading gyms
      } else {
        setGyms(data || []);
      }
    } catch (error) {
      console.error('Error loading gyms:', error);
    } finally {
      setLoading(false);
    }
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#00E5FF]"></div>
          <p className="mt-4 text-[#808080]">Loading gyms...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8 pt-16 md:pt-0 flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2">Gym Management</h1>
          <p className="text-[#808080]">Create and manage gyms</p>
        </div>
        <Link
          href="/dashboard/gyms/new"
          className="px-6 py-3 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors"
        >
          + Create New Gym
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {gyms.length === 0 ? (
          <div className="col-span-full text-center py-12 bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl">
            <p className="text-[#808080] mb-4">No gyms yet</p>
            <Link
              href="/dashboard/gyms/new"
              className="inline-block px-6 py-3 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors"
            >
              + Create First Gym
            </Link>
          </div>
        ) : (
          gyms.map((gym) => (
            <div
              key={gym.id}
              className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6 hover:border-[#00E5FF]/30 transition-all"
            >
              <h3 className="text-xl font-bold text-white mb-2">{gym.name}</h3>
              <p className="text-[#808080] mb-4">
                {gym.city && `${gym.city}`}
                {gym.city && gym.country && ', '}
                {gym.country}
              </p>
              <div className="flex gap-3">
                <Link
                  href={`/dashboard/gyms/${gym.id}`}
                  className="flex-1 px-4 py-2 bg-[#00E5FF]/10 text-[#00E5FF] rounded-lg text-center font-medium hover:bg-[#00E5FF]/20 transition-colors"
                >
                  View Details
                </Link>
              <button
                onClick={() => {
                  window.location.href = `/dashboard/gym/${gym.id}/dashboard`;
                }}
                className="px-4 py-2 bg-[#1A1A1A] text-white rounded-lg font-medium hover:bg-[#2A2A2A] transition-colors"
              >
                View
              </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
