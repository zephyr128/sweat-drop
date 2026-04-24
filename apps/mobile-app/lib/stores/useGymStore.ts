import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface GymDayHours {
  open: string;
  close: string;
}

export type GymWorkingHours = {
  [day in 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun']?: GymDayHours;
};

export interface Gym {
  id: string;
  name: string;
  city?: string;
  country?: string;
  address?: string;
  /** Present on full gym rows / RPC; used for owner_branding join */
  owner_id?: string | null;
  primary_color?: string;
  background_url?: string | null;
  /** 0..1 darken-layer strength applied over background_url. Default 0.5. */
  background_overlay?: number | null;
  /** Hex #RRGGBB — top of fallback gradient when background_url is null. */
  background_gradient_start?: string | null;
  /** Hex #RRGGBB — bottom of fallback gradient when background_url is null. */
  background_gradient_end?: string | null;
  logo_url?: string | null;
  smartcoach_enabled?: boolean;

  description?: string | null;
  working_hours?: GymWorkingHours | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  instagram?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  is_founding_partner?: boolean;

  created_at?: string;
  updated_at?: string;
  /** From gyms.lat / gyms.lng (check-in GPS); used for map preview */
  lat?: number | string | null;
  lng?: number | string | null;
  /** Pilot visibility flag used for staged rollout gym lists */
  is_pilot_enabled?: boolean;
}

interface GymState {
  homeGymId: string | null;
  previewGymId: string | null;
  gyms: Gym[];
  activeGym: Gym | null;
  isLoading: boolean;
  
  // Actions
  setHomeGymId: (gymId: string | null) => void;
  setPreviewGymId: (gymId: string | null) => void;
  setGyms: (gyms: Gym[]) => void;
  setActiveGym: (gym: Gym | null) => void;
  setLoading: (loading: boolean) => void;
  clearPreview: () => void;
  reset: () => void;
  
  // Computed
  getActiveGymId: () => string | null;
  isUnlocked: () => boolean;
}

export const useGymStore = create<GymState>()(
  persist(
    (set, get) => ({
      homeGymId: null,
      previewGymId: null,
      gyms: [],
      activeGym: null,
      isLoading: false,

      setHomeGymId: (gymId) => {
        set({ homeGymId: gymId });
        // Clear preview when setting home gym
        if (gymId) {
          set({ previewGymId: null });
        }
      },

      setPreviewGymId: (gymId) => {
        set({ previewGymId: gymId });
      },

      setGyms: (gyms) => {
        set({ gyms });
      },

      setActiveGym: (gym) => {
        set({ activeGym: gym });
      },

      setLoading: (loading) => {
        set({ isLoading: loading });
      },

      clearPreview: () => {
        set({ previewGymId: null });
      },

      reset: () => {
        set({
          homeGymId: null,
          previewGymId: null,
          gyms: [],
          activeGym: null,
          isLoading: false,
        });
      },

      // Computed: Returns previewGymId if set, otherwise homeGymId
      getActiveGymId: () => {
        const { previewGymId, homeGymId } = get();
        return previewGymId || homeGymId;
      },

      // Computed: Returns true if active gym is unlocked (matches home gym)
      isUnlocked: () => {
        const { previewGymId, homeGymId } = get();
        // If no preview, it's unlocked (using home gym)
        if (!previewGymId) return true;
        // If preview matches home, it's unlocked
        return previewGymId === homeGymId;
      },
    }),
    {
      name: 'gym-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        homeGymId: state.homeGymId,
        // Don't persist previewGymId - it's temporary
      }),
    }
  )
);
