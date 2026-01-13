'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase-client';
import { useRouter } from 'next/navigation';

interface Gym {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
}

interface GymSwitcherProps {
  currentGymId?: string | null;
  onGymChange?: (gymId: string | null) => void;
}

export function GymSwitcher({ currentGymId, onGymChange }: GymSwitcherProps) {
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGymId, setSelectedGymId] = useState<string | null>(currentGymId || null);
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    loadGyms();
  }, []);

  useEffect(() => {
    // Load selected gym from sessionStorage
    const stored = sessionStorage.getItem('selectedGymId');
    if (stored) {
      setSelectedGymId(stored);
      if (onGymChange) {
        onGymChange(stored);
      }
    }
  }, [onGymChange]);

  const loadGyms = async () => {
    try {
      const { data, error } = await supabase
        .from('gyms')
        .select('id, name, city, country')
        .order('name');

      if (error) throw error;
      setGyms(data || []);
    } catch (error) {
      // Error loading gyms - will show empty state
    } finally {
      setLoading(false);
    }
  };

  const handleGymSelect = (gymId: string | null) => {
    setSelectedGymId(gymId);
    setIsOpen(false);
    
    // Store in sessionStorage for persistence
    if (gymId) {
      sessionStorage.setItem('selectedGymId', gymId);
      // Navigate to gym-specific dashboard using hard redirect
      window.location.href = `/dashboard/gym/${gymId}/dashboard`;
    } else {
      sessionStorage.removeItem('selectedGymId');
      // Navigate to global dashboard using hard redirect
      window.location.href = '/dashboard';
    }

    if (onGymChange) {
      onGymChange(gymId);
    }
  };

  const selectedGym = gyms.find(g => g.id === selectedGymId);
  const displayText = selectedGym 
    ? `${selectedGym.name}${selectedGym.city ? `, ${selectedGym.city}` : ''}`
    : 'All Gyms';

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full text-left px-4 py-2 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white hover:bg-[#2A2A2A] transition-colors flex items-center justify-between"
      >
        <span className="text-sm truncate">{displayText}</span>
        <svg
          className={`w-4 h-4 text-[#808080] transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-10" 
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute top-full left-0 right-0 mt-2 bg-[#0A0A0A] border border-[#1A1A1A] rounded-lg shadow-lg z-20 max-h-64 overflow-y-auto">
            <button
              onClick={() => handleGymSelect(null)}
              className={`w-full text-left px-4 py-2 text-sm hover:bg-[#1A1A1A] transition-colors ${
                selectedGymId === null ? 'text-[#00E5FF] bg-[#00E5FF]/10' : 'text-white'
              }`}
            >
              All Gyms
            </button>
            {loading ? (
              <div className="px-4 py-2 text-sm text-[#808080]">Loading...</div>
            ) : (
              gyms.map((gym) => (
                <button
                  key={gym.id}
                  onClick={() => handleGymSelect(gym.id)}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-[#1A1A1A] transition-colors ${
                    selectedGymId === gym.id ? 'text-[#00E5FF] bg-[#00E5FF]/10' : 'text-white'
                  }`}
                >
                  {gym.name}
                  {gym.city && <span className="text-[#808080] ml-2">({gym.city})</span>}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
