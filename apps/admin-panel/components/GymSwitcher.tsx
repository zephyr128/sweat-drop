'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase-client';
import { useRouter } from 'next/navigation';
import { UserRole } from '@/lib/auth';
import { MapPin, ChevronDown } from 'lucide-react';

interface Gym {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  is_suspended?: boolean;
}

interface GymSwitcherProps {
  currentGymId?: string | null;
  onGymChange?: (gymId: string | null) => void;
  role?: UserRole;
}

export function GymSwitcher({ currentGymId, onGymChange, role }: GymSwitcherProps) {
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGymId, setSelectedGymId] = useState<string | null>(currentGymId || null);
  const [isOpen, setIsOpen] = useState(false);
  const _router = useRouter();

  const loadGyms = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      let query = supabase
        .from('gyms')
        .select('id, name, city, country, is_suspended, owner_id')
        .order('name');

      // If user is gym_owner, show only their owned gyms
      if (role === 'gym_owner') {
        query = query.eq('owner_id', user.id);
      }
      // Superadmin sees all gyms

      const { data, error } = await query;

      if (error) throw error;
      
      // Filter out suspended gyms for gym owners
      const filteredGyms = role === 'gym_owner' 
        ? (data || []).filter(g => !g.is_suspended)
        : (data || []);
      
      setGyms(filteredGyms);
      
      // Get current selected gym from state or props
      setSelectedGymId((prevSelected) => {
        const currentSelected = prevSelected || currentGymId;
        if (!currentSelected && filteredGyms.length > 0) {
          const firstGymId = filteredGyms[0].id;
          sessionStorage.setItem('selectedGymId', firstGymId);
          return firstGymId;
        } else if (currentSelected && !filteredGyms.find(g => g.id === currentSelected)) {
          // If selected gym is not in the list, select the first one
          if (filteredGyms.length > 0) {
            const firstGymId = filteredGyms[0].id;
            sessionStorage.setItem('selectedGymId', firstGymId);
            return firstGymId;
          }
        }
        return prevSelected;
      });
    } catch (error) {
      console.error('Error loading gyms:', error);
      // Error loading gyms - will show empty state
    } finally {
      setLoading(false);
    }
  }, [role, currentGymId]);

  useEffect(() => {
    // Load selected gym from sessionStorage first
    const stored = sessionStorage.getItem('selectedGymId');
    if (stored) {
      setSelectedGymId(stored);
    } else if (currentGymId) {
      setSelectedGymId(currentGymId);
      sessionStorage.setItem('selectedGymId', currentGymId);
    }
    // Then load gyms
    loadGyms();
  }, [role, currentGymId, loadGyms]);

  // Update selected gym when currentGymId changes
  useEffect(() => {
    if (currentGymId && currentGymId !== selectedGymId) {
      setSelectedGymId(currentGymId);
      sessionStorage.setItem('selectedGymId', currentGymId);
    }
  }, [currentGymId, selectedGymId]);

  const handleGymSelect = (gymId: string) => {
    if (gymId === selectedGymId) {
      setIsOpen(false);
      return; // Already on this gym
    }
    
    setSelectedGymId(gymId);
    setIsOpen(false);
    
    // Store in sessionStorage for persistence
    sessionStorage.setItem('selectedGymId', gymId);
    
    // Navigate to gym-specific dashboard using hard redirect to ensure full page reload
    window.location.href = `/dashboard/gym/${gymId}/dashboard`;

    if (onGymChange) {
      onGymChange(gymId);
    }
  };

  const selectedGym = gyms.find(g => g.id === selectedGymId) || gyms[0];
  const displayText = selectedGym 
    ? `${selectedGym.name}${selectedGym.city ? `, ${selectedGym.city}` : ''}`
    : 'Select Gym';

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full text-left px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white hover:bg-zinc-800 transition-colors flex items-center gap-2"
      >
        <MapPin className="w-4 h-4 text-zinc-500 flex-shrink-0" strokeWidth={1.5} />
        <span className="text-sm truncate flex-1">{displayText}</span>
        <ChevronDown
          className={`w-4 h-4 text-zinc-500 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`}
          strokeWidth={1.5}
        />
      </button>

      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-10" 
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute top-full left-0 right-0 mt-2 bg-zinc-950 border border-zinc-900 rounded-lg shadow-lg z-20 max-h-64 overflow-y-auto">
            {loading ? (
              <div className="px-4 py-3 text-sm text-zinc-500">Loading...</div>
            ) : gyms.length === 0 ? (
              <div className="px-4 py-3 text-sm text-zinc-500">No gyms available</div>
            ) : (
              gyms.map((gym) => (
                <button
                  key={gym.id}
                  onClick={() => handleGymSelect(gym.id)}
                  className={`w-full text-left px-4 py-2.5 text-sm hover:bg-zinc-900 transition-colors ${
                    selectedGymId === gym.id ? 'text-white bg-zinc-900' : 'text-zinc-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-zinc-500" strokeWidth={1.5} />
                      <span>
                        {gym.name}
                        {gym.city && <span className="text-zinc-500 ml-2">({gym.city})</span>}
                      </span>
                    </div>
                    {gym.is_suspended && role === 'superadmin' && (
                      <span className="text-xs text-red-400">Suspended</span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
