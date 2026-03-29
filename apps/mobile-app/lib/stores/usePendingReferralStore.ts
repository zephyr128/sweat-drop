import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'sweatdrop_pending_referral_code';

interface PendingReferralState {
  pendingCode: string | null;
  setPendingCode: (code: string | null) => void;
  clearPendingCode: () => void;
  hydrate: () => Promise<void>;
}

export const usePendingReferralStore = create<PendingReferralState>((set) => ({
  pendingCode: null,

  setPendingCode: (code) => {
    set({ pendingCode: code });
    if (code) {
      AsyncStorage.setItem(STORAGE_KEY, code).catch(() => {});
    } else {
      AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
    }
  },

  clearPendingCode: () => {
    set({ pendingCode: null });
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  },

  hydrate: async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) set({ pendingCode: stored });
    } catch {
      // ignore
    }
  },
}));
