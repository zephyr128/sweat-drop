// AGENT NOTE: 2026-05-14 — mobile-coder
// Plan: docs/plans/bugfix_workout_metrics_baseline_carryover_from_prior_session.md
//
// User-reported scenario: "I trained on the treadmill for 1h… I then scan again while
// still on the treadmill, the app connects, the drops start from 0 but the other
// metrics like km, kcal are picked up from the machine and now I got a new workout
// with a couple of minutes but 5 km and 40 kcal."
//
// Root cause: FTMS fields `total_distance` and `total_energy` are machine-scoped
// cumulative totals (running since machine power-on). They do NOT reset when our
// app disconnects or starts a new session. This helper converts each raw device
// reading into a session-scoped adjusted total using a per-session baseline.
//
// This file is pure TS (no React, no Expo, no Supabase) so it can be exercised
// with `node:test` without a React Native runtime.

/**
 * Sanity ceiling for the first FTMS distance packet of a session (metres).
 * If the device's cumulative counter exceeds this, the first packet is discarded
 * and the next packet becomes the baseline anchor instead. This prevents a machine
 * left at "50 km from yesterday's gym day" from polluting the session.
 */
export const MAX_FTMS_DISTANCE_BASELINE_M = 100_000;

/**
 * Sanity ceiling for the first FTMS calories packet of a session (kcal).
 * Same rationale as MAX_FTMS_DISTANCE_BASELINE_M.
 */
export const MAX_FTMS_CALORIES_BASELINE_KCAL = 20_000;

/**
 * Per-session state for one cumulative FTMS scalar (distance or calories).
 *
 * - `baseline`: The device's reading on the first non-null/non-zero packet of
 *   this session, or immediately after a detected machine reset. `null` means
 *   "not yet anchored" — the next valid device reading will become the baseline.
 * - `carryOver`: Cumulative work already credited from earlier baseline epochs.
 *   Nonzero only when the machine reset its own counter mid-session.
 * - `adjusted`: The current session-scoped total (what the user sees and what
 *   gets written to `raw_metrics`). Always `≥` its previous value (monotonic).
 */
export interface BaselineState {
  baseline: number | null;
  carryOver: number;
  adjusted: number;
}

/**
 * Map a machine-cumulative FTMS reading to a session-scoped adjusted total.
 *
 * Pure function — the caller stores `next` back on its refs. Call sites must
 * already guard `device > 0` before invoking this function; behaviour for
 * `device ≤ 0` is undefined.
 *
 * Three cases:
 *
 * 1. **First packet (baseline not yet anchored):**
 *    `next.baseline = device`, `next.adjusted = carryOver`, `resetDetected = false`.
 *    The device's cumulative total from prior sessions is silently discarded.
 *
 * 2. **Machine reset detected (`device < baseline`):**
 *    The firmware zeroed (or wrapped) its counter. We freeze earned credit in
 *    `carryOver` and re-anchor at the new low value.
 *    `next.carryOver = prev.adjusted`, `next.baseline = device`,
 *    `next.adjusted = prev.adjusted`, `resetDetected = true`.
 *
 * 3. **Normal increment:**
 *    `next.adjusted = (device - baseline) + carryOver`, clamped to be
 *    monotonically non-decreasing (defends against single-packet firmware jitter
 *    where the counter decrements by a few units without a true reset).
 */
export function applyCumulativeBaseline(
  prev: BaselineState,
  device: number,
): { next: BaselineState; resetDetected: boolean } {
  // ── Case 1: Not yet anchored — first packet of this baseline epoch ──
  if (prev.baseline === null) {
    return {
      next: {
        baseline: device,
        carryOver: prev.carryOver,
        adjusted: prev.carryOver,
      },
      resetDetected: false,
    };
  }

  // ── Case 2: Machine reset (counter went backwards) ──
  if (device < prev.baseline) {
    return {
      next: {
        baseline: device,
        carryOver: prev.adjusted,
        adjusted: prev.adjusted,
      },
      resetDetected: true,
    };
  }

  // ── Case 3: Normal increment ──
  const rawAdjusted = (device - prev.baseline) + prev.carryOver;
  // Monotonic clamp: never let adjusted decrease (firmware jitter defence)
  const adjusted = Math.max(rawAdjusted, prev.adjusted);

  return {
    next: {
      baseline: prev.baseline,
      carryOver: prev.carryOver,
      adjusted,
    },
    resetDetected: false,
  };
}
