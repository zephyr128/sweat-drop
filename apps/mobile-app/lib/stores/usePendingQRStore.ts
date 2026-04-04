import { create } from 'zustand';

interface PendingQRState {
  pendingQR: string | null;
  setPendingQR: (url: string | null) => void;
  consumePendingQR: () => string | null;
}

/**
 * Stores a QR deep link URL (sweatdrop://checkin/... or sweatdrop://machine/...)
 * that arrived before auth was initialized (native camera cold-start).
 * index.tsx consumes it after routing and opens /scan with autoQR param.
 */
export const usePendingQRStore = create<PendingQRState>((set, get) => ({
  pendingQR: null,
  setPendingQR: (url) => set({ pendingQR: url }),
  consumePendingQR: () => {
    const url = get().pendingQR;
    set({ pendingQR: null });
    return url;
  },
}));
