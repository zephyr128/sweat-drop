/**
 * Pure helpers for the active-session recovery banner.
 *
 * Extracted from `useActiveSessionRecovery.ts` so they can be unit-tested
 * with `node:test` (the hook itself imports `expo-router`, AsyncStorage,
 * `@/lib/supabase`, etc. — all RN-only modules that crash a Node runner).
 *
 * AGENT NOTE: [2026-05-07] - mobile-coder (Bug 4b)
 * If you change any of these constants or thresholds, update both this file
 * AND `tests/active-session-recovery.test.ts`.
 */

/** Sessions younger than this are NOT eligible for the recovery banner. */
export const RACE_PROTECTION_MS = 60_000;

/** Routes that own the workout flow — do not surface the banner here. */
export const GATED_ROUTE_PREFIXES = new Set<string>([
  'scan',
  'workout',
  'workout-sim',
  'checkin-result',
  'session-summary',
  'm', // /m/[uuid]
  'c', // /c/[gymId]
  'machine', // /machine/[uuid]
  'checkin', // /checkin/[gymId]
  'gym-welcome',
]);

/** Auto-finalize flags older than this are treated as stale and ignored. */
export const AUTO_FINALIZE_FLAG_TTL_MS = 60 * 60 * 1000;

export interface AutoFinalizeFlag {
  sessionId: string;
  drops: number;
  finalizedAt: number;
}

/** Match the `machineType` whitelist used by the recovery store. */
export function normaliseMachineType(
  raw: unknown,
): 'treadmill' | 'bike' | 'elliptical' | 'stepper' | 'generic' {
  if (
    raw === 'treadmill' ||
    raw === 'bike' ||
    raw === 'elliptical' ||
    raw === 'stepper'
  ) {
    return raw;
  }
  return 'generic';
}

/**
 * `true` when the top-level Expo Router segment puts the user inside the
 * workout flow and the recovery banner must stay hidden. The hook calls this
 * with `useSegments()[0]`.
 */
export function isGatedRoute(topSegment: string | undefined): boolean {
  if (!topSegment) return false;
  return GATED_ROUTE_PREFIXES.has(topSegment);
}

/**
 * `true` when an active session is too young to be considered "abandoned"
 * — i.e. the user just hit "Start" and we shouldn't yank them out with a
 * recovery banner.
 */
export function isFreshSession(startedAtIso: string, nowMs = Date.now()): boolean {
  const startedAtMs = new Date(startedAtIso).getTime();
  if (Number.isNaN(startedAtMs)) return false;
  return nowMs - startedAtMs < RACE_PROTECTION_MS;
}

/**
 * `true` when the parsed flag should drive an auto-finalize banner. Used to
 * gate the AsyncStorage drain path.
 */
export function isFreshAutoFinalizeFlag(
  flag: AutoFinalizeFlag | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!flag) return false;
  if (typeof flag.sessionId !== 'string' || !flag.sessionId) return false;
  if (typeof flag.drops !== 'number') return false;
  if (typeof flag.finalizedAt !== 'number') return false;
  return nowMs - flag.finalizedAt < AUTO_FINALIZE_FLAG_TTL_MS;
}
