import { createCSCMeasurement, type BLEMeasurement } from '@/lib/ble-protocol';

export type WorkoutSimulatorProfile =
  | 'normal_30min'
  | 'interval_training'
  | 'suspicious_spike'
  | 'disconnect_mid_session';

export interface WorkoutSimulatorOptions {
  profile: WorkoutSimulatorProfile;
  tickMs?: number;
  onMeasurement: (measurement: BLEMeasurement) => void;
  onDisconnect?: () => void;
  onStatus?: (status: string) => void;
}

export interface WorkoutSimulatorHandle {
  stop: () => void;
}

const PROFILE_SET = new Set<WorkoutSimulatorProfile>([
  'normal_30min',
  'interval_training',
  'suspicious_spike',
  'disconnect_mid_session',
]);

export function isSimulatorSensorId(sensorId: string): boolean {
  return sensorId.startsWith('sim:');
}

export function parseSimulatorProfile(sensorId: string): WorkoutSimulatorProfile | null {
  if (!isSimulatorSensorId(sensorId)) return null;
  const profile = sensorId.replace('sim:', '').trim() as WorkoutSimulatorProfile;
  return PROFILE_SET.has(profile) ? profile : null;
}

function rpmForTick(profile: WorkoutSimulatorProfile, tick: number): number {
  if (profile === 'normal_30min') {
    const base = 68;
    const wave = Math.sin(tick / 20) * 6;
    return Math.max(40, Math.round(base + wave));
  }

  if (profile === 'interval_training') {
    const block = Math.floor(tick / 25) % 2;
    return block === 0 ? 58 : 112;
  }

  if (profile === 'suspicious_spike') {
    if (tick % 35 >= 26 && tick % 35 <= 30) {
      return 245;
    }
    return 64;
  }

  // disconnect_mid_session
  return 70;
}

export function startWorkoutSimulator(options: WorkoutSimulatorOptions): WorkoutSimulatorHandle {
  const tickMs = options.tickMs ?? 250;
  let tick = 0;
  let crankRevolutions = 0;
  let wheelRevolutions = 0;
  let disconnected = false;
  const startEpoch = Date.now();

  options.onStatus?.(`Simulator started (${options.profile})`);

  const interval = setInterval(() => {
    tick += 1;

    if (options.profile === 'disconnect_mid_session' && tick === 1) {
      disconnected = true;
      options.onStatus?.('Simulator forced disconnect');
      options.onDisconnect?.();
      clearInterval(interval);
      return;
    }

    if (disconnected) return;

    const rpm = rpmForTick(options.profile, tick);
    const revolutionsPerSecond = rpm / 60;
    crankRevolutions += revolutionsPerSecond;
    wheelRevolutions += revolutionsPerSecond;

    const secondsSinceStart = Math.max(1, Math.floor((Date.now() - startEpoch) / 1000));
    const eventTime1024 = secondsSinceStart * 1024;

    options.onMeasurement(
      createCSCMeasurement({
        wheelRevolutions: Math.round(wheelRevolutions),
        lastWheelEventTime: eventTime1024,
        crankRevolutions: Math.round(crankRevolutions),
        lastCrankEventTime: eventTime1024,
        rpm,
      })
    );
  }, tickMs);

  return {
    stop: () => {
      clearInterval(interval);
      options.onStatus?.('Simulator stopped');
    },
  };
}
