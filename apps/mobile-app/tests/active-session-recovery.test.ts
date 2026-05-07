import test from 'node:test';
import assert from 'node:assert/strict';

// We can't import the hook itself from a Node test (it transitively imports
// `expo-router`, `@react-native-async-storage/async-storage`, `@/lib/supabase`,
// etc.), so we test the *exported pure helpers* the hook uses for its
// gating decisions. Each helper has a 1:1 contract with a behaviour the
// recovery banner depends on:
//
//   - isGatedRoute     → "don't surface the banner inside the workout flow"
//   - isFreshSession   → "don't show banner for sessions <60s old (race guard)"
//   - normaliseMachineType → safely maps unknown DB values to UI labels
//   - isFreshAutoFinalizeFlag → drains stale background-finalize flags
//
// To keep this Node-runnable we deliberately avoid importing the hook
// module's full path; we instead import the helper barrel below. If a
// future change moves these helpers, update this single import.

import {
  GATED_ROUTE_PREFIXES,
  RACE_PROTECTION_MS,
  AUTO_FINALIZE_FLAG_TTL_MS,
  normaliseMachineType,
  isGatedRoute,
  isFreshSession,
  isFreshAutoFinalizeFlag,
} from '../lib/workout/useActiveSessionRecovery.helpers';

// ── isGatedRoute ──────────────────────────────────────────────────────────────

test('isGatedRoute: returns false for undefined segment (root /)', () => {
  assert.equal(isGatedRoute(undefined), false);
});

test('isGatedRoute: returns false on /home (banner allowed)', () => {
  assert.equal(isGatedRoute('home'), false);
});

test('isGatedRoute: returns true on every gated workout-flow route', () => {
  for (const seg of GATED_ROUTE_PREFIXES) {
    assert.equal(
      isGatedRoute(seg),
      true,
      `Expected '${seg}' to be gated`,
    );
  }
});

test('isGatedRoute: gates deep-link entry points (/m/[uuid], /c/[gymId])', () => {
  // These are the QR/NFC deep-link entries: while the user is being routed
  // into a workout we must not surface the recovery banner.
  assert.equal(isGatedRoute('m'), true);
  assert.equal(isGatedRoute('c'), true);
  assert.equal(isGatedRoute('machine'), true);
  assert.equal(isGatedRoute('checkin'), true);
});

// ── isFreshSession ────────────────────────────────────────────────────────────

test('isFreshSession: <60s old session is fresh (banner suppressed)', () => {
  const now = Date.parse('2026-05-07T10:00:00Z');
  const startedAt = new Date(now - 30_000).toISOString(); // 30s ago
  assert.equal(isFreshSession(startedAt, now), true);
});

test('isFreshSession: exactly RACE_PROTECTION_MS-1 ago counts as fresh', () => {
  const now = Date.parse('2026-05-07T10:00:00Z');
  const startedAt = new Date(now - (RACE_PROTECTION_MS - 1)).toISOString();
  assert.equal(isFreshSession(startedAt, now), true);
});

test('isFreshSession: >60s old session is NOT fresh (banner shows)', () => {
  const now = Date.parse('2026-05-07T10:00:00Z');
  const startedAt = new Date(now - 5 * 60_000).toISOString(); // 5min ago
  assert.equal(isFreshSession(startedAt, now), false);
});

test('isFreshSession: malformed ISO string defaults to NOT fresh', () => {
  // Defensive: don't suppress recovery on parse failure — better to show
  // the banner than to silently swallow it.
  assert.equal(isFreshSession('not-a-date', Date.now()), false);
});

// ── normaliseMachineType ──────────────────────────────────────────────────────

test('normaliseMachineType: passes through known types unchanged', () => {
  assert.equal(normaliseMachineType('treadmill'), 'treadmill');
  assert.equal(normaliseMachineType('bike'), 'bike');
  assert.equal(normaliseMachineType('elliptical'), 'elliptical');
  assert.equal(normaliseMachineType('stepper'), 'stepper');
});

test('normaliseMachineType: unknown / null / number maps to generic', () => {
  assert.equal(normaliseMachineType('rowing'), 'generic');
  assert.equal(normaliseMachineType(null), 'generic');
  assert.equal(normaliseMachineType(undefined), 'generic');
  assert.equal(normaliseMachineType(42), 'generic');
});

// ── isFreshAutoFinalizeFlag ───────────────────────────────────────────────────

test('isFreshAutoFinalizeFlag: rejects null/undefined/missing fields', () => {
  assert.equal(isFreshAutoFinalizeFlag(null), false);
  assert.equal(isFreshAutoFinalizeFlag(undefined), false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assert.equal(isFreshAutoFinalizeFlag({} as any), false);
  assert.equal(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    isFreshAutoFinalizeFlag({ sessionId: 's', drops: 3 } as any),
    false,
  );
});

test('isFreshAutoFinalizeFlag: <1 hour old is fresh', () => {
  const now = Date.now();
  const flag = {
    sessionId: 'sess-1',
    drops: 5,
    finalizedAt: now - 30 * 60_000, // 30min ago
  };
  assert.equal(isFreshAutoFinalizeFlag(flag, now), true);
});

test('isFreshAutoFinalizeFlag: >1 hour old is stale (drained-but-ignored)', () => {
  const now = Date.now();
  const flag = {
    sessionId: 'sess-1',
    drops: 5,
    finalizedAt: now - (AUTO_FINALIZE_FLAG_TTL_MS + 60_000),
  };
  assert.equal(isFreshAutoFinalizeFlag(flag, now), false);
});
