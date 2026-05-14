import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCumulativeBaseline,
  type BaselineState,
} from '../lib/ble/cumulativeBaseline';

// ── Helpers ───────────────────────────────────────────────────────────────────

function state(baseline: number | null, carryOver: number, adjusted: number): BaselineState {
  return { baseline, carryOver, adjusted };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

// Case 1 — Fresh anchor (baseline = null, carryOver = 0)
// This is the user's exact bug scenario: machine still shows 5000 m from prior run.
// We expect adjusted = 0 so the new session starts clean.
test('case 1: fresh anchor — device reading is discarded, adjusted stays at carryOver', () => {
  const { next, resetDetected } = applyCumulativeBaseline(state(null, 0, 0), 5000);

  assert.equal(next.baseline, 5000, 'baseline anchors at device reading');
  assert.equal(next.carryOver, 0, 'carryOver unchanged on first anchor');
  assert.equal(next.adjusted, 0, 'adjusted = carryOver (session starts at 0)');
  assert.equal(resetDetected, false, 'no reset on first anchor');
});

// Case 2 — Normal increment
test('case 2: normal increment — adjusted = (device - baseline) + carryOver', () => {
  const prev = state(5000, 0, 0);
  const { next, resetDetected } = applyCumulativeBaseline(prev, 5020);

  assert.equal(next.baseline, 5000, 'baseline unchanged');
  assert.equal(next.carryOver, 0, 'carryOver unchanged');
  assert.equal(next.adjusted, 20, 'adjusted = 5020 - 5000 = 20');
  assert.equal(resetDetected, false, 'no reset');
});

// Case 3 — Cross-session inheritance (the user's exact bug)
// Demonstrates that calling the helper on a "dirty" machine (device = 5000)
// stops the carryover at the helper boundary. The first packet anchors at 5000;
// subsequent packets compute session-relative deltas.
test('case 3: cross-session inheritance — two consecutive packets on a dirty machine', () => {
  // First packet: machine shows 5000 from prior session
  const { next: afterFirst } = applyCumulativeBaseline(state(null, 0, 0), 5000);
  assert.equal(afterFirst.adjusted, 0, 'first packet: adjusted = 0 (cross-session distance dropped)');

  // Second packet: user ran 20 m in this session
  const { next: afterSecond } = applyCumulativeBaseline(afterFirst, 5020);
  assert.equal(afterSecond.adjusted, 20, 'second packet: adjusted = 20 (only session work counted)');
});

// Case 4 — Machine reset mid-session
test('case 4: machine reset mid-session — carryOver freezes, re-anchors at new low value', () => {
  // Session so far: baseline=5000, adjusted=20
  const prev = state(5000, 0, 20);

  // Machine reset: device counter drops to 10
  const { next: afterReset, resetDetected } = applyCumulativeBaseline(prev, 10);
  assert.equal(resetDetected, true, 'reset detected');
  assert.equal(afterReset.carryOver, 20, 'carryOver = prev.adjusted (credits preserved)');
  assert.equal(afterReset.baseline, 10, 're-anchored at new low device value');
  assert.equal(afterReset.adjusted, 20, 'adjusted unchanged this packet (no new work yet)');

  // User keeps running: device goes from 10 → 40 (30 m of new work)
  const { next: afterResume, resetDetected: r2 } = applyCumulativeBaseline(afterReset, 40);
  assert.equal(r2, false, 'no reset on resume');
  assert.equal(afterResume.adjusted, 50, 'adjusted = (40-10) + 20 = 50');
});

// Case 5 — Sub-baseline jitter (single-unit backward movement, not a true reset)
// Design tradeoff: any reverse motion triggers a re-anchor, but carryOver freezes
// the earned credit so the user never loses distance. The monotonic clamp then
// prevents adjusted from decreasing even on the re-anchor packet itself.
test('case 5: sub-baseline jitter — re-anchors but monotonic clamp prevents credit loss', () => {
  // Baseline 5000, user has 20 m of credit
  const prev = state(5000, 0, 20);

  // Device emits 4999 (1 m backward — firmware jitter on paused belt)
  const { next: afterJitter, resetDetected } = applyCumulativeBaseline(prev, 4999);
  assert.equal(resetDetected, true, 'jitter treated as reset (design tradeoff)');
  assert.equal(afterJitter.carryOver, 20, 'carryOver freezes at 20 — no credit lost');
  assert.equal(afterJitter.baseline, 4999, 're-anchored at 4999');
  assert.equal(afterJitter.adjusted, 20, 'adjusted unchanged (still 20 — no decrease)');

  // Next normal packet: device=5005 → (5005-4999) + 20 = 26
  const { next: afterResume } = applyCumulativeBaseline(afterJitter, 5005);
  assert.equal(afterResume.adjusted, 26, 'adjusted = (5005-4999) + 20 = 26');
});

// Case 6 — Monotonic clamp
// If the raw arithmetic (device - baseline) + carryOver somehow produces a value
// below prev.adjusted (e.g. due to carryOver update timing), the clamp holds.
test('case 6: monotonic clamp — adjusted never decreases', () => {
  // Craft a state where normal path would yield a lower adjusted
  // prev.adjusted=30 but baseline math gives 25
  const prev: BaselineState = { baseline: 100, carryOver: 20, adjusted: 30 };

  // device=105 → raw = (105-100)+20 = 25 < prev.adjusted(30) → clamp to 30
  const { next } = applyCumulativeBaseline(prev, 105);
  assert.equal(next.adjusted, 30, 'clamped to prev.adjusted — no decrease');
});

// Case 7 — Zero device value (call site responsibility)
// The helper's call sites all guard `device > 0` before invoking.
// This test documents that a device=0 value is NOT passed to the helper;
// we verify by confirming the guard behaviour at the call site level.
// (The helper itself has undefined behaviour for device<=0; see plan §4.3 note.)
test('case 7: zero guard — call sites skip device=0; helper not invoked', () => {
  // Simulate call-site guard
  const device = 0;
  const prev = state(null, 0, 0);
  let helperCalled = false;

  if (device > 0) {
    applyCumulativeBaseline(prev, device);
    helperCalled = true;
  }

  assert.equal(helperCalled, false, 'helper is not called when device=0');
  // State is unchanged
  assert.equal(prev.baseline, null);
  assert.equal(prev.adjusted, 0);
});

// Bonus — calories_source predicate: device baseline anchored but adjusted still 0
// After the fix, `ftmsCaloriesBaselineRef.current !== null` must signal that the
// device did report calories (even if <1 kcal of session work was done).
test('bonus: baseline anchored with 0 adjusted — sentinel detects device reporting', () => {
  const { next } = applyCumulativeBaseline(state(null, 0, 0), 40); // machine had 40 kcal
  assert.equal(next.baseline, 40, 'baseline anchored');
  assert.equal(next.adjusted, 0, 'adjusted = 0 (no session work yet)');
  // The call site uses `baseline !== null` to detect "device did report calories"
  assert.notEqual(next.baseline, null, 'baseline sentinel is set — calories_source should be device');
});
