import {
  canFinalizeReward,
  createAntiPiggybackState,
  markCancelled,
  registerActivityProof,
  shouldAutoCancel,
  type AntiPiggybackState,
} from '@/lib/workout/anti-piggyback';
import { startWorkoutSimulator, type WorkoutSimulatorProfile } from '@/lib/workout/workout-simulator';

export type WorkoutHarnessResult =
  | { status: 'finalized'; rewardsAllowed: true; measurements: number; sawDisconnect: boolean }
  | { status: 'cancelled'; rewardsAllowed: false; measurements: number; sawDisconnect: boolean };

export interface WorkoutHarnessOptions {
  profile: WorkoutSimulatorProfile;
  thresholdMs?: number;
  runtimeMs?: number;
  reconnectAfterDisconnect?: boolean;
}

export async function runWorkoutHarness(options: WorkoutHarnessOptions): Promise<WorkoutHarnessResult> {
  const thresholdMs = options.thresholdMs ?? 1500;
  const runtimeMs = options.runtimeMs ?? 2600;
  const reconnectAfterDisconnect = options.reconnectAfterDisconnect ?? false;
  let state: AntiPiggybackState = createAntiPiggybackState(Date.now());
  let measurements = 0;
  let sawDisconnect = false;

  const runOnce = (profile: WorkoutSimulatorProfile, runMs: number) =>
    new Promise<void>((resolve) => {
      const handle = startWorkoutSimulator({
        profile,
        tickMs: 40,
        onMeasurement: (measurement) => {
          measurements += 1;
          if (measurement.rpm > 0) {
            state = registerActivityProof(state);
          }
          if (shouldAutoCancel(state, Date.now(), thresholdMs)) {
            state = markCancelled(state);
            handle.stop();
            resolve();
          }
        },
        onDisconnect: () => {
          sawDisconnect = true;
          resolve();
        },
      });

      setTimeout(() => {
        handle.stop();
        resolve();
      }, runMs);
    });

  await runOnce(options.profile, runtimeMs);

  if (sawDisconnect && reconnectAfterDisconnect) {
    await runOnce('normal_30min', 1200);
  }

  if (!state.hasProof && shouldAutoCancel(state, Date.now(), thresholdMs)) {
    state = markCancelled(state);
  }

  if (!canFinalizeReward(state)) {
    return { status: 'cancelled', rewardsAllowed: false, measurements, sawDisconnect };
  }

  return { status: 'finalized', rewardsAllowed: true, measurements, sawDisconnect };
}
