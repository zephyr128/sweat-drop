import test from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeCustomSimulatorSensorId,
  parseSimulatorDescriptor,
  parseSimulatorProfile,
  startWorkoutSimulator,
  type WorkoutSimulatorProfile,
} from '../lib/workout/workout-simulator';

test('parse simulator profile from sensor id', () => {
  assert.equal(parseSimulatorProfile('sim:normal_30min'), 'normal_30min');
  assert.equal(parseSimulatorProfile('sim:interval_training'), 'interval_training');
  assert.equal(parseSimulatorProfile('sim:invalid'), null);
  assert.equal(parseSimulatorProfile('real-sensor-id'), null);
});

test('parse custom simulator descriptor from encoded sensor id', () => {
  const sensorId = encodeCustomSimulatorSensorId({
    durationMinutes: 15,
    baseRpm: 74,
    rpmAmplitude: 10,
    speedKmh: 9.2,
    inclinePct: 2.5,
    powerWatts: 180,
    intervalEnabled: true,
    intervalHighRpm: 116,
    intervalSeconds: 50,
    timeScale: 2,
  });
  const descriptor = parseSimulatorDescriptor(sensorId);
  assert.ok(descriptor);
  assert.equal(descriptor?.profile, 'custom');
  assert.equal(descriptor?.customConfig?.durationMinutes, 15);
  assert.equal(descriptor?.customConfig?.intervalEnabled, true);
});

const profiles: WorkoutSimulatorProfile[] = [
  'normal_30min',
  'interval_training',
  'suspicious_spike',
];

for (const profile of profiles) {
  test(`simulator emits measurements for ${profile}`, async () => {
    const rpms: number[] = [];

    await new Promise<void>((resolve) => {
      const handle = startWorkoutSimulator({
        profile,
        tickMs: 20,
        onMeasurement: (m) => {
          rpms.push(m.rpm);
          if (rpms.length >= 12) {
            handle.stop();
            resolve();
          }
        },
      });
    });

    assert.ok(rpms.length >= 12);
    assert.ok(rpms.every((rpm) => Number.isFinite(rpm)));
  });
}

test('disconnect_mid_session triggers disconnect callback', async () => {
  let disconnected = false;

  await new Promise<void>((resolve) => {
    const handle = startWorkoutSimulator({
      profile: 'disconnect_mid_session',
      tickMs: 10,
      onMeasurement: () => undefined,
      onDisconnect: () => {
        disconnected = true;
        resolve();
      },
    });

    setTimeout(() => {
      handle.stop();
      resolve();
    }, 1200);
  });

  assert.ok(disconnected);
});

test('suspicious_spike profile contains high-rpm spikes', async () => {
  const rpms: number[] = [];

  await new Promise<void>((resolve) => {
    const handle = startWorkoutSimulator({
      profile: 'suspicious_spike',
      tickMs: 10,
      onMeasurement: (m) => {
        rpms.push(m.rpm);
        if (rpms.length >= 60) {
          handle.stop();
          resolve();
        }
      },
    });
  });

  assert.ok(rpms.some((rpm) => rpm >= 220));
});

test('custom profile emits ftms-like measurements', async () => {
  const protocols: string[] = [];
  let speedSeen = false;
  let inclineSeen = false;

  await new Promise<void>((resolve) => {
    const handle = startWorkoutSimulator({
      profile: 'custom',
      customConfig: {
        durationMinutes: 5,
        baseRpm: 70,
        rpmAmplitude: 6,
        speedKmh: 8,
        inclinePct: 2,
        powerWatts: 170,
        intervalEnabled: false,
        intervalHighRpm: 110,
        intervalSeconds: 45,
        timeScale: 3,
      },
      tickMs: 10,
      onMeasurement: (m) => {
        protocols.push(m.protocol);
        speedSeen = speedSeen || (m.speed ?? 0) > 0;
        inclineSeen = inclineSeen || (m.incline ?? 0) >= 0;
        if (protocols.length >= 15) {
          handle.stop();
          resolve();
        }
      },
    });
  });

  assert.ok(protocols.every((protocol) => protocol === 'ftms'));
  assert.equal(speedSeen, true);
  assert.equal(inclineSeen, true);
});
