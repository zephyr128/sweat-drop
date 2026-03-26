import test from 'node:test';
import assert from 'node:assert/strict';
import { runWorkoutHarness } from '../lib/workout/workout-flow-harness';

test('start session -> workout -> finalize -> summary path is allowed (simulated)', async () => {
  const result = await runWorkoutHarness({
    profile: 'normal_30min',
    thresholdMs: 1200,
    runtimeMs: 2200,
  });

  assert.equal(result.status, 'finalized');
  assert.equal(result.rewardsAllowed, true);
  assert.ok(result.measurements > 0);
});

test('no signal after start -> cancel / no reward', async () => {
  const result = await runWorkoutHarness({
    profile: 'disconnect_mid_session',
    thresholdMs: 200,
    runtimeMs: 500,
    reconnectAfterDisconnect: false,
  });

  assert.equal(result.status, 'cancelled');
  assert.equal(result.rewardsAllowed, false);
});

test('reconnect path does not block finalization', async () => {
  const result = await runWorkoutHarness({
    profile: 'disconnect_mid_session',
    thresholdMs: 1300,
    runtimeMs: 900,
    reconnectAfterDisconnect: true,
  });

  assert.equal(result.sawDisconnect, true);
  assert.equal(result.status, 'finalized');
  assert.equal(result.rewardsAllowed, true);
});

test('suspicious spike profile still goes through guarded finalize path', async () => {
  const result = await runWorkoutHarness({
    profile: 'suspicious_spike',
    thresholdMs: 1200,
    runtimeMs: 1800,
  });

  assert.equal(result.status, 'finalized');
  assert.equal(result.rewardsAllowed, true);
});
