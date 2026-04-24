import { useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useGymStore, Gym } from '@/lib/stores/useGymStore';
import { useSession } from './useSession';
import { log } from '@/lib/logger';

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
      // Prefer hook session; fall back to Supabase session if hook is stale
      let userId = session?.user?.id;
      if (!userId) {
        const { data: { session: freshSession } } = await supabase.auth.getSession();
        userId = freshSession?.user?.id;
      }
      if (!userId) return;

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('home_gym_id')
        .eq('id', userId)
        .single();

      if (error) throw error;

      const dbGymId = profile?.home_gym_id ?? null;
      const currentStoreGymId = useGymStore.getState().homeGymId;

      if (dbGymId && dbGymId !== currentStoreGymId) {
        // DB has a value — update store to match
        setHomeGymId(dbGymId);
      } else if (!dbGymId && currentStoreGymId) {
        // DB says no home gym — clear the local store to match.
        // DB is the source of truth (user may have removed gym elsewhere).
        if (__DEV__) {
          log.debug('[useGymData] DB home_gym_id is null, clearing store (was:', currentStoreGymId, ')');
        }
        setHomeGymId(null);
      }
      // If both are null or both match — no action needed
    } catch (error) {
      log.error('Error loading user home gym:', error);
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
        background_overlay: 0.5 as number,
        background_gradient_start: '#080808' as string,
        background_gradient_end: '#0A0E1A' as string,
      };

      // Get owner_branding (global branding per owner)
      if (gymData.owner_id) {
        const { data: ownerBranding, error: brandingError } = await supabase
          .from('owner_branding')
          .select(
            'primary_color, logo_url, background_url, background_overlay, background_gradient_start, background_gradient_end',
          )
          .eq('owner_id', gymData.owner_id)
          .single();

        // PGRST116 = no row (expected when owner has no branding row yet)
        if (brandingError && brandingError.code !== 'PGRST116') {
          log.warn('[useGymData] owner_branding query failed:', brandingError);
        }

        if (ownerBranding) {
          const ob = ownerBranding as {
            primary_color?: string | null;
            logo_url?: string | null;
            background_url?: string | null;
            background_overlay?: number | null;
            background_gradient_start?: string | null;
            background_gradient_end?: string | null;
          };
          const rawOverlay = ob.background_overlay;
          const overlay =
            rawOverlay === null || rawOverlay === undefined || Number.isNaN(Number(rawOverlay))
              ? branding.background_overlay
              : Math.max(0, Math.min(1, Number(rawOverlay)));
          const hexRe = /^#[0-9a-fA-F]{6}$/;
          const gradStart =
            typeof ob.background_gradient_start === 'string' && hexRe.test(ob.background_gradient_start)
              ? ob.background_gradient_start
              : branding.background_gradient_start;
          const gradEnd =
            typeof ob.background_gradient_end === 'string' && hexRe.test(ob.background_gradient_end)
              ? ob.background_gradient_end
              : branding.background_gradient_end;
          branding = {
            primary_color: ob.primary_color || branding.primary_color,
            logo_url: ob.logo_url || branding.logo_url,
            background_url: ob.background_url || branding.background_url,
            background_overlay: overlay,
            background_gradient_start: gradStart,
            background_gradient_end: gradEnd,
          };
        } else {
          log.warn('[useGymData] No owner_branding found for owner_id:', gymData.owner_id);
        }
      } else {
        log.warn('[useGymData] Gym has no owner_id:', gymData.id);
      }

      // Merge gym data with branding
      const gymWithBranding: Gym = {
        ...gymData,
        primary_color: branding.primary_color,
        logo_url: branding.logo_url,
        background_url: branding.background_url,
        background_overlay: branding.background_overlay,
        background_gradient_start: branding.background_gradient_start,
        background_gradient_end: branding.background_gradient_end,
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
      log.error('Error loading active gym:', error);
      setActiveGym(null);
    } finally {
      setLoading(false);
    }
  }, [setLoading, setActiveGym, setGyms, gyms]);

  const updateHomeGym = async (gymId: string) => {
    // Prefer hook session; fall back to Supabase session if hook is stale
    let userId = session?.user?.id;
    if (!userId) {
      const { data: { session: freshSession } } = await supabase.auth.getSession();
      userId = freshSession?.user?.id;
    }
    if (!userId) {
      log.warn('[useGymData] updateHomeGym: No user ID available');
      return;
    }

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ home_gym_id: gymId })
        .eq('id', userId);

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
      log.error('Error updating home gym:', error);
      throw error;
    }
  };

  return {
    updateHomeGym,
    loadActiveGym,
  };
};
