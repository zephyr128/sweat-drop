import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInactivityPolicy,
  createInactivityState,
  evaluateInactivity,
  InactivityFinalizeCoordinator,
} from '../lib/workout/inactivity-autofinish';

test('inactivity warning is shown after warning threshold', () => {
  const policy = createInactivityPolicy(10, 20);
  let state = createInactivityState();
  const start = 1_000;
  let warningVisible = false;

  for (let sec = 0; sec <= 12; sec += 1) {
    const next = evaluateInactivity(state, 0, start + sec * 1000, policy);
    state = next.nextState;
    warningVisible = next.snapshot.warningVisible;
  }

  assert.equal(warningVisible, true);
});

test('resume before timeout cancels warning and auto-finish', () => {
  const policy = createInactivityPolicy(10, 20);
  let state = createInactivityState();
  const start = 5_000;

  for (let sec = 0; sec <= 12; sec += 1) {
    state = evaluateInactivity(state, 0, start + sec * 1000, policy).nextState;
  }

  const resumed = evaluateInactivity(state, 72, start + 13_000, policy).snapshot;
  assert.equal(resumed.warningVisible, false);
  assert.equal(resumed.shouldAutoFinish, false);
  assert.equal(resumed.heartbeatAllowed, true);
});

test('timeout triggers auto-finish state and heartbeat gating', () => {
  const policy = createInactivityPolicy(10, 20);
  let state = createInactivityState();
  const start = 10_000;
  let lastSnapshot = evaluateInactivity(state, 0, start, policy).snapshot;

  for (let sec = 1; sec <= 21; sec += 1) {
    const next = evaluateInactivity(state, 0, start + sec * 1000, policy);
    state = next.nextState;
    lastSnapshot = next.snapshot;
  }

  assert.equal(lastSnapshot.heartbeatAllowed, false);
  assert.equal(lastSnapshot.shouldAutoFinish, true);
});

test('no duplicate finalize calls through coordinator', () => {
  const coordinator = new InactivityFinalizeCoordinator();
  assert.equal(coordinator.tryStart(), true);
  assert.equal(coordinator.tryStart(), false);
});

test('next user can start after auto-finish unlock flow', async () => {
  let machineLocked = true;
  let finalizeCalls = 0;
  let unlockCalls = 0;
  const coordinator = new InactivityFinalizeCoordinator();

  const finalizeRpc = async () => {
    finalizeCalls += 1;
    return { ok: true };
  };
  const unlock = async () => {
    unlockCalls += 1;
    machineLocked = false;
  };

  const maybeFinalize = async () => {
    if (!coordinator.tryStart()) return;
    await finalizeRpc();
    await unlock();
  };

  await maybeFinalize();
  await maybeFinalize(); // duplicate call ignored

  const nextUserCanStart = !machineLocked;
  assert.equal(finalizeCalls, 1);
  assert.equal(unlockCalls, 1);
  assert.equal(nextUserCanStart, true);
});

test('normal active workout remains unaffected', () => {
  const policy = createInactivityPolicy(8, 20);
  let state = createInactivityState();
  const start = 3_000;

  for (let sec = 0; sec <= 30; sec += 1) {
    const evaluation = evaluateInactivity(state, 88, start + sec * 1000, policy);
    const snapshot = evaluation.snapshot;
    state = evaluation.nextState;
    assert.equal(snapshot.warningVisible, false);
    assert.equal(snapshot.shouldAutoFinish, false);
    assert.equal(snapshot.heartbeatAllowed, true);
  }
});
