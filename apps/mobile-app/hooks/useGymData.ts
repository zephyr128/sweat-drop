import { useEffect, useCallback } from 'react';
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
  // Also reload when screen comes into focus to get fresh branding
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

  const loadActiveGym = useCallback(async (gymId: string) => {
    setLoading(true);
    try {
      // Always fetch fresh data from database to get latest branding
      // Don't use cache for activeGym to ensure branding updates are reflected immediately
      
      // Fetch gym data
      const { data: gymData, error: gymError } = await supabase
        .from('gyms')
        .select('*')
        .eq('id', gymId)
        .single();

      if (gymError) throw gymError;
      if (!gymData) {
        setActiveGym(null);
        setLoading(false);
        return;
      }

      // Fetch branding from owner_branding (unified branding system)
      // Default branding if no owner_branding exists
      let branding = {
        primary_color: '#00E5FF', // Default cyan
        logo_url: null as string | null,
        background_url: null as string | null,
      };

      // Get owner_branding (global branding per owner)
      console.log('[useGymData] Gym owner_id:', gymData.owner_id);
      if (gymData.owner_id) {
        const { data: ownerBranding, error: brandingError } = await supabase
          .from('owner_branding')
          .select('primary_color, logo_url, background_url')
          .eq('owner_id', gymData.owner_id)
          .single();

        console.log('[useGymData] Owner branding query result:', { ownerBranding, brandingError });
        
        if (ownerBranding) {
          branding = {
            primary_color: ownerBranding.primary_color || branding.primary_color,
            logo_url: ownerBranding.logo_url || branding.logo_url,
            background_url: ownerBranding.background_url || branding.background_url,
          };
          console.log('[useGymData] Final branding:', branding);
        } else {
          console.warn('[useGymData] No owner_branding found for owner_id:', gymData.owner_id);
        }
      } else {
        console.warn('[useGymData] Gym has no owner_id:', gymData.id);
      }

      // Merge gym data with branding
      const gymWithBranding: Gym = {
        ...gymData,
        primary_color: branding.primary_color,
        logo_url: branding.logo_url,
        background_url: branding.background_url,
      };

      setActiveGym(gymWithBranding);
      
      // Update cache with fresh data (replace if exists, add if new)
      const existingIndex = gyms.findIndex((g) => g.id === gymWithBranding.id);
      if (existingIndex >= 0) {
        // Update existing gym in cache
        const updatedGyms = [...gyms];
        updatedGyms[existingIndex] = gymWithBranding;
        setGyms(updatedGyms);
      } else {
        // Add new gym to cache
        setGyms([...gyms, gymWithBranding]);
      }
    } catch (error) {
      console.error('Error loading active gym:', error);
      setActiveGym(null);
    } finally {
      setLoading(false);
    }
  }, [setLoading, setActiveGym, setGyms, gyms]);

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
