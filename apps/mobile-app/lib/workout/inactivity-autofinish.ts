export interface InactivityPolicy {
  warningAfterSec: number;
  autoFinishAfterSec: number;
}

export interface InactivityState {
  inactivityStartedAtMs: number | null;
  warningVisible: boolean;
  finalized: boolean;
}

export interface InactivitySnapshot {
  inactivitySeconds: number;
  warningVisible: boolean;
  countdownSeconds: number;
  heartbeatAllowed: boolean;
  shouldAutoFinish: boolean;
}

export function createInactivityState(): InactivityState {
  return {
    inactivityStartedAtMs: null,
    warningVisible: false,
    finalized: false,
  };
}

export function createInactivityPolicy(
  warningAfterSec?: number | null,
  autoFinishAfterSec?: number | null
): InactivityPolicy {
  const warning = Math.max(10, Math.round(warningAfterSec ?? 60));
  const autoFinish = Math.max(warning + 10, Math.round(autoFinishAfterSec ?? 180));
  return {
    warningAfterSec: warning,
    autoFinishAfterSec: autoFinish,
  };
}

export function evaluateInactivity(
  state: InactivityState,
  rpm: number,
  nowMs: number,
  policy: InactivityPolicy
): { nextState: InactivityState; snapshot: InactivitySnapshot } {
  if (state.finalized) {
    return {
      nextState: state,
      snapshot: {
        inactivitySeconds: policy.autoFinishAfterSec,
        warningVisible: false,
        countdownSeconds: 0,
        heartbeatAllowed: false,
        shouldAutoFinish: false,
      },
    };
  }

  if (rpm > 0) {
    return {
      nextState: {
        inactivityStartedAtMs: null,
        warningVisible: false,
        finalized: false,
      },
      snapshot: {
        inactivitySeconds: 0,
        warningVisible: false,
        countdownSeconds: policy.autoFinishAfterSec,
        heartbeatAllowed: true,
        shouldAutoFinish: false,
      },
    };
  }

  const startedAt = state.inactivityStartedAtMs ?? nowMs;
  const inactivitySeconds = Math.max(0, Math.floor((nowMs - startedAt) / 1000));
  const shouldAutoFinish = inactivitySeconds >= policy.autoFinishAfterSec;
  const warningVisible =
    inactivitySeconds >= policy.warningAfterSec && inactivitySeconds < policy.autoFinishAfterSec;
  const countdownSeconds = Math.max(0, policy.autoFinishAfterSec - inactivitySeconds);

  return {
    nextState: {
      inactivityStartedAtMs: startedAt,
      warningVisible,
      finalized: state.finalized,
    },
    snapshot: {
      inactivitySeconds,
      warningVisible,
      countdownSeconds,
      heartbeatAllowed: inactivitySeconds < policy.warningAfterSec,
      shouldAutoFinish,
    },
  };
}

export function markInactivityFinalized(state: InactivityState): InactivityState {
  return {
    ...state,
    warningVisible: false,
    finalized: true,
  };
}

export class InactivityFinalizeCoordinator {
  private started = false;

  tryStart(): boolean {
    if (this.started) return false;
    this.started = true;
    return true;
  }
}
