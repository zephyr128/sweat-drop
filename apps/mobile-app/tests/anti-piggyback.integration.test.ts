import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canFinalizeReward,
  createAntiPiggybackState,
  markCancelled,
  registerActivityProof,
  shouldAutoCancel,
} from '../lib/workout/anti-piggyback';

test('auto-cancel triggers when no activity proof exists', () => {
  const started = 1_000;
  const state = createAntiPiggybackState(started);
  assert.equal(shouldAutoCancel(state, 2_200, 1_000), true);
});

test('activity proof allows reward path', () => {
  let state = createAntiPiggybackState(1_000);
  state = registerActivityProof(state);
  assert.equal(shouldAutoCancel(state, 5_000, 1_000), false);
  assert.equal(canFinalizeReward(state), true);
});

test('cancelled state blocks reward finalization', () => {
  let state = createAntiPiggybackState(1_000);
  state = markCancelled(state);
  assert.equal(canFinalizeReward(state), false);
});
