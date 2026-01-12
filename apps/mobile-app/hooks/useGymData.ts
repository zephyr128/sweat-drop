import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useGymStore, Gym } from '@/lib/stores/useGymStore';
import { useSession } from './useSession';

export const useGymData = () => {
  const { session } = useSession();
  const {
    homeGymId,
    previewGymId,
    setHomeGymId,
    setPreviewGymId,
    setActiveGym,
    setGyms,
    setLoading,
    getActiveGymId,
    gyms,
    clearPreview,
  } = useGymStore();

  // Load user's home gym from profile
  useEffect(() => {
    if (session?.user) {
      loadUserHomeGym();
    }
  }, [session]);

  // Load active gym when homeGymId or previewGymId changes
  useEffect(() => {
    const activeGymId = getActiveGymId();
    if (activeGymId) {
      loadActiveGym(activeGymId);
    } else {
      setActiveGym(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeGymId, previewGymId]);

  const loadUserHomeGym = async () => {
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('home_gym_id')
        .eq('id', session?.user.id)
        .single();

      if (error) throw error;

      if (profile?.home_gym_id && profile.home_gym_id !== homeGymId) {
        setHomeGymId(profile.home_gym_id);
      }
    } catch (error) {
      console.error('Error loading user home gym:', error);
    }
  };

  const loadActiveGym = async (gymId: string) => {
    setLoading(true);
    try {
      // First check if gym is already in store
      const cachedGym = gyms.find((g) => g.id === gymId);
      if (cachedGym) {
        setActiveGym(cachedGym);
        setLoading(false);
        return;
      }

      // Otherwise fetch from database
      const { data, error } = await supabase
        .from('gyms')
        .select('*')
        .eq('id', gymId)
        .single();

      if (error) throw error;

      if (data) {
        setActiveGym(data);
        // Add to gyms cache if not already there
        if (!gyms.find((g) => g.id === data.id)) {
          setGyms([...gyms, data]);
        }
      }
    } catch (error) {
      console.error('Error loading active gym:', error);
      setActiveGym(null);
    } finally {
      setLoading(false);
    }
  };

  const updateHomeGym = async (gymId: string) => {
    if (!session?.user) return;

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ home_gym_id: gymId })
        .eq('id', session.user.id);

      if (error) throw error;

      // Update home gym ID and clear preview to unlock the gym
      setHomeGymId(gymId);
      clearPreview(); // Clear preview so the gym becomes unlocked
      
      // If the new home gym is the currently active gym, ensure it's set as active
      const currentActiveGymId = getActiveGymId();
      if (currentActiveGymId === gymId) {
        // Reload active gym to ensure state is fresh
        await loadActiveGym(gymId);
      }
    } catch (error) {
      console.error('Error updating home gym:', error);
      throw error;
    }
  };

  return {
    updateHomeGym,
    loadActiveGym,
  };
};
