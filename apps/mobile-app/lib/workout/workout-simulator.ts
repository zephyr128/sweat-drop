import {
  createCSCMeasurement,
  createFTMSMeasurement,
  type BLEMeasurement,
} from '@/lib/ble-protocol';

export type WorkoutSimulatorProfile =
  | 'normal_30min'
  | 'interval_training'
  | 'suspicious_spike'
  | 'disconnect_mid_session'
  | 'custom';

export type SimMachineType = 'bike' | 'elliptical' | 'treadmill' | 'stepper';

export interface CustomWorkoutSimulatorConfig {
  machineType: SimMachineType;
  durationMinutes: number;
  baseRpm: number;
  rpmAmplitude: number;
  speedKmh: number;
  inclinePct: number;
  powerWatts: number;
  resistanceLevel: number;
  stepsPerMin: number;
  intervalEnabled: boolean;
  intervalHighRpm: number;
  intervalSeconds: number;
  timeScale: number;
}

export interface WorkoutSimulatorDescriptor {
  profile: WorkoutSimulatorProfile;
  customConfig?: CustomWorkoutSimulatorConfig;
}

export interface WorkoutSimulatorOptions {
  profile: WorkoutSimulatorProfile;
  customConfig?: CustomWorkoutSimulatorConfig;
  tickMs?: number;
  onMeasurement: (measurement: BLEMeasurement) => void;
  onDisconnect?: () => void;
  onComplete?: () => void;
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
  'custom',
]);

export function isSimulatorSensorId(sensorId: string): boolean {
  return sensorId.startsWith('sim:');
}

export function parseSimulatorProfile(sensorId: string): WorkoutSimulatorProfile | null {
  if (!isSimulatorSensorId(sensorId)) return null;
  const profileRaw = sensorId.replace('sim:', '').trim();
  if (profileRaw.startsWith('custom:')) return 'custom';
  const profile = profileRaw as WorkoutSimulatorProfile;
  return PROFILE_SET.has(profile) ? profile : null;
}

export function parseSimulatorDescriptor(sensorId: string): WorkoutSimulatorDescriptor | null {
  if (!isSimulatorSensorId(sensorId)) return null;

  if (sensorId.startsWith('sim:custom:')) {
    try {
      const encoded = sensorId.replace('sim:custom:', '');
      const parsed = JSON.parse(decodeURIComponent(encoded)) as Partial<CustomWorkoutSimulatorConfig>;
      const config: CustomWorkoutSimulatorConfig = {
        machineType: (['bike', 'elliptical', 'treadmill', 'stepper'].includes(parsed.machineType as string)
          ? parsed.machineType as SimMachineType
          : 'bike'),
        durationMinutes: Math.max(1, Math.round(Number(parsed.durationMinutes ?? 30))),
        baseRpm: Math.max(0, Math.round(Number(parsed.baseRpm ?? 70))),
        rpmAmplitude: Math.max(0, Math.round(Number(parsed.rpmAmplitude ?? 8))),
        speedKmh: Math.max(0, Number(parsed.speedKmh ?? 8)),
        inclinePct: Math.max(0, Number(parsed.inclinePct ?? 1.5)),
        powerWatts: Math.max(0, Number(parsed.powerWatts ?? 160)),
        resistanceLevel: Math.max(0, Math.min(20, Number(parsed.resistanceLevel ?? 5))),
        stepsPerMin: Math.max(0, Math.round(Number(parsed.stepsPerMin ?? 60))),
        intervalEnabled: Boolean(parsed.intervalEnabled ?? false),
        intervalHighRpm: Math.max(0, Math.round(Number(parsed.intervalHighRpm ?? 110))),
        intervalSeconds: Math.max(5, Math.round(Number(parsed.intervalSeconds ?? 45))),
        timeScale: Math.max(1, Number(parsed.timeScale ?? 1)),
      };
      return { profile: 'custom', customConfig: config };
    } catch {
      return null;
    }
  }

  const profile = parseSimulatorProfile(sensorId);
  if (!profile) return null;
  return { profile };
}

export function encodeCustomSimulatorSensorId(config: CustomWorkoutSimulatorConfig): string {
  return `sim:custom:${encodeURIComponent(JSON.stringify(config))}`;
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
  let syntheticCrankCounter = 0;
  let simulatedSeconds = 0;
  let totalDistanceM = 0;
  let totalCalories = 0;
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

    const simulationDeltaSeconds = (tickMs / 1000) * (options.customConfig?.timeScale ?? 1);
    simulatedSeconds += simulationDeltaSeconds;
    const rpm = options.profile === 'custom' && options.customConfig
      ? (() => {
          const cfg = options.customConfig!;
          if (cfg.intervalEnabled) {
            const intervalBlock = Math.floor(simulatedSeconds / cfg.intervalSeconds) % 2;
            const target = intervalBlock === 0 ? cfg.baseRpm : cfg.intervalHighRpm;
            return Math.max(0, Math.round(target + Math.sin(simulatedSeconds / 6) * cfg.rpmAmplitude));
          }
          return Math.max(0, Math.round(cfg.baseRpm + Math.sin(simulatedSeconds / 8) * cfg.rpmAmplitude));
        })()
      : rpmForTick(options.profile, tick);

    if (options.profile === 'custom' && options.customConfig) {
      const cfg = options.customConfig;
      const simulatedDurationSeconds = cfg.durationMinutes * 60;
      if (simulatedSeconds >= simulatedDurationSeconds) {
        options.onStatus?.('Simulator duration reached');
        clearInterval(interval);
        options.onComplete?.();
        return;
      }
    }

    const revolutionsPerSecond = rpm / 60;
    crankRevolutions += revolutionsPerSecond;
    wheelRevolutions += revolutionsPerSecond;

    const secondsSinceStart = options.profile === 'custom'
      ? Math.max(1, Math.floor(simulatedSeconds))
      : Math.max(1, Math.floor((Date.now() - startEpoch) / 1000));
    const eventTime1024 = secondsSinceStart * 1024;

    if (options.profile === 'custom' && options.customConfig) {
      const cfg = options.customConfig;
      syntheticCrankCounter += 1;
      const mt = cfg.machineType;

      let dynamicSpeed: number;
      let dynamicPower: number;
      let incline = cfg.inclinePct;

      if (mt === 'treadmill') {
        dynamicSpeed = Math.max(0, cfg.speedKmh + (rpm - cfg.baseRpm) * 0.04);
        const inclineBoost = 1 + incline * 0.05;
        dynamicPower = Math.max(0, (cfg.powerWatts + (dynamicSpeed - cfg.speedKmh) * 8) * inclineBoost);
      } else if (mt === 'stepper') {
        const spm = cfg.stepsPerMin + (rpm - cfg.baseRpm) * 0.5;
        dynamicSpeed = Math.max(0, spm * 0.025);
        dynamicPower = Math.max(0, cfg.powerWatts + (spm - cfg.stepsPerMin) * 2.2 + cfg.resistanceLevel * 6);
      } else if (mt === 'elliptical') {
        dynamicSpeed = Math.max(0, cfg.speedKmh + (rpm - cfg.baseRpm) * 0.03);
        dynamicPower = Math.max(0, cfg.powerWatts + (rpm - cfg.baseRpm) * 2.0 + cfg.resistanceLevel * 5);
      } else {
        dynamicSpeed = Math.max(0, cfg.speedKmh + (rpm - cfg.baseRpm) * 0.025);
        dynamicPower = Math.max(0, cfg.powerWatts + (rpm - cfg.baseRpm) * 1.8);
      }

      totalDistanceM += (dynamicSpeed / 3.6) * simulationDeltaSeconds;
      totalCalories += Math.max(0, dynamicPower / 1000) * simulationDeltaSeconds * 0.9;
      options.onMeasurement(
        createFTMSMeasurement(
          {
            rpm,
            speed: Math.round(dynamicSpeed * 10) / 10,
            incline,
            power: Math.round(dynamicPower),
            distance: Math.round(totalDistanceM * 10) / 10,
            calories: Math.round(totalCalories),
            elapsedTime: Math.floor(simulatedSeconds),
          },
          syntheticCrankCounter,
        ),
      );
      return;
    }

    options.onMeasurement(
      createCSCMeasurement({
        wheelRevolutions: Math.round(wheelRevolutions),
        lastWheelEventTime: eventTime1024,
        crankRevolutions: Math.round(crankRevolutions),
        lastCrankEventTime: eventTime1024,
        rpm,
      }),
    );
  }, tickMs);

  return {
    stop: () => {
      clearInterval(interval);
      options.onStatus?.('Simulator stopped');
    },
  };
}
