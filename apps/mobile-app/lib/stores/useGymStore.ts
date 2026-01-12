import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Gym {
  id: string;
  name: string;
  city?: string;
  country?: string;
  address?: string;
  primary_color?: string;
  background_url?: string;
  logo_url?: string;
  created_at?: string;
  updated_at?: string;
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
