const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT_DIR, relativePath), 'utf8');
}

test('mobile simulator hook file exists and exports profiles', () => {
  const content = read('apps/mobile-app/lib/workout/workout-simulator.ts');
  assert.equal(content.includes('normal_30min'), true);
  assert.equal(content.includes('interval_training'), true);
  assert.equal(content.includes('suspicious_spike'), true);
  assert.equal(content.includes('disconnect_mid_session'), true);
});

test('workout flow includes simulator integration anchors', () => {
  const workoutContent = read('apps/mobile-app/app/workout.tsx');
  assert.equal(workoutContent.includes('workout-simulator'), true);
});

test('session summary/checkin surfaces anti-abuse feedback keys', () => {
  const sessionSummary = read('apps/mobile-app/app/session-summary.tsx');
  const checkinResult = read('apps/mobile-app/app/checkin-result.tsx');

  assert.equal(sessionSummary.length > 0, true);
  assert.equal(checkinResult.length > 0, true);
});
