export interface AntiPiggybackState {
  startedAtMs: number;
  hasProof: boolean;
  cancelled: boolean;
}

export function createAntiPiggybackState(nowMs: number): AntiPiggybackState {
  return {
    startedAtMs: nowMs,
    hasProof: false,
    cancelled: false,
  };
}

export function registerActivityProof(state: AntiPiggybackState): AntiPiggybackState {
  return {
    ...state,
    hasProof: true,
  };
}

export function shouldAutoCancel(
  state: AntiPiggybackState,
  nowMs: number,
  thresholdMs: number
): boolean {
  if (state.cancelled || state.hasProof) return false;
  return nowMs - state.startedAtMs >= thresholdMs;
}

export function markCancelled(state: AntiPiggybackState): AntiPiggybackState {
  return {
    ...state,
    cancelled: true,
  };
}

export function canFinalizeReward(state: AntiPiggybackState): boolean {
  return state.hasProof && !state.cancelled;
}
