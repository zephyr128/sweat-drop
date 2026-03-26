import test from 'node:test';
import assert from 'node:assert/strict';
import {
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
