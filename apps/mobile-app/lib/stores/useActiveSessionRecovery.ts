/**
 * Zustand store that surfaces an "unfinished workout" recovery banner on
 * /home when the user has an `is_active = true` session left over from a
 * previous app run. The hook `useActiveSessionRecovery` populates this
 * store; the UI component `ActiveSessionRecoveryBanner` renders from it.
 *
 * AGENT NOTE: [2026-05-07] - mobile-coder (Bug 4b)
 *
 * Why a store (and not just a hook): the banner is rendered on /home but
 * the detection logic must run as soon as auth is ready (in `_layout.tsx`)
 * so the user sees the banner the instant /home mounts. Decoupling state
 * from where it's read also keeps the banner re-renderable on dismiss
 * without re-running the Supabase query.
 */

import { create } from 'zustand';

export interface PendingActiveSession {
  sessionId: string;
  machineId: string | null;
  machineType: 'treadmill' | 'bike' | 'elliptical' | 'stepper' | 'generic';
  gymId: string | null;
  gymName: string;
  sensorId: string | null;
  bleProtocol: string | null;
  startedAt: string; // ISO
  durationSeconds: number;
}

/**
 * One-shot post-auto-finalize message displayed by the same banner. Set
 * by `workout.tsx` (Step 10) when the background-finalize fires while the
 * app is backgrounded; consumed once on next foreground.
 */
export interface AutoFinalizedNotice {
  sessionId: string;
  drops: number;
  finalizedAt: number; // epoch ms
}

interface ActiveSessionRecoveryState {
  pendingSession: PendingActiveSession | null;
  isRecovering: boolean;
  autoFinalizedNotice: AutoFinalizedNotice | null;

  setPendingSession: (s: PendingActiveSession | null) => void;
  clearPendingSession: () => void;
  setRecovering: (v: boolean) => void;
  setAutoFinalizedNotice: (n: AutoFinalizedNotice | null) => void;
  clearAutoFinalizedNotice: () => void;
}

export const useActiveSessionRecovery = create<ActiveSessionRecoveryState>((set) => ({
  pendingSession: null,
  isRecovering: false,
  autoFinalizedNotice: null,

  setPendingSession: (pendingSession) => set({ pendingSession }),
  clearPendingSession: () => set({ pendingSession: null, isRecovering: false }),
  setRecovering: (isRecovering) => set({ isRecovering }),
  setAutoFinalizedNotice: (autoFinalizedNotice) => set({ autoFinalizedNotice }),
  clearAutoFinalizedNotice: () => set({ autoFinalizedNotice: null }),
}));
