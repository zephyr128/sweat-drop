/**
 * SWEATDROP — BLE Protocol Abstraction Layer
 *
 * AGENT NOTE: [2026-03-02] - mobile-coder (Task 3.4)
 * Reference: docs/plans/mvp_full_audit_and_build_plan.md
 *
 * Defines unified BLE measurement type and protocol constants.
 * Supports: CSC (Magene S3+), FTMS (Life Fitness, Technogym, Matrix, Horizon)
 *
 * The BLEMeasurement type extends the old CSCMeasurement with FTMS fields.
 * `CSCMeasurement` is kept as a backward-compatible alias.
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  PROTOCOL TYPES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Supported BLE protocols */
export type BLEProtocolType = 'csc' | 'ftms';

/** Machine types that FTMS supports */
export type FTMSMachineType = 'treadmill' | 'bike' | 'elliptical';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  SERVICE & CHARACTERISTIC UUIDS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// CSC (Cycling Speed and Cadence) — Magene S3+
export const CSC_SERVICE_UUID = '1816';
export const CSC_SPEED_SERVICE_UUID = '1818';
export const CSC_MEASUREMENT_CHAR_UUID = '2A5B';
export const CSC_FEATURE_CHAR_UUID = '2A5C';

// FTMS (Fitness Machine Service) — Life Fitness, Technogym, Matrix, Horizon
export const FTMS_SERVICE_UUID = '1826';
export const FTMS_FEATURE_CHAR_UUID = '2ACC';         // Fitness Machine Feature
export const FTMS_TREADMILL_DATA_CHAR_UUID = '2ACD';  // Treadmill Data
export const FTMS_CROSS_TRAINER_CHAR_UUID = '2ACE';   // Cross Trainer Data
export const FTMS_INDOOR_BIKE_CHAR_UUID = '2AD2';     // Indoor Bike Data
export const FTMS_CONTROL_POINT_CHAR_UUID = '2AD9';   // Fitness Machine Control Point
export const FTMS_STATUS_CHAR_UUID = '2ADA';          // Fitness Machine Status

/** All service UUIDs to scan for (any protocol) */
export const ALL_SCAN_SERVICE_UUIDS = [
  CSC_SERVICE_UUID,
  CSC_SPEED_SERVICE_UUID,
  FTMS_SERVICE_UUID,
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  UNIFIED MEASUREMENT TYPE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Unified BLE measurement from any protocol.
 *
 * CSC fields are always present (for backward compat with workout.tsx).
 * For FTMS, `crankRevolutions` and `lastCrankEventTime` are synthesized
 * as monotonically increasing counters so stale-data detection still works.
 */
export interface BLEMeasurement {
  // ── CSC fields (always present for backward compatibility) ──
  wheelRevolutions: number;
  lastWheelEventTime: number;   // 1/1024 seconds (CSC native)
  crankRevolutions: number;     // Cumulative counter (synthesized for FTMS)
  lastCrankEventTime: number;   // 1/1024 seconds (synthesized for FTMS)
  rpm: number;                  // Cadence RPM (CSC calculated, FTMS instantaneous)
  timestamp: number;            // JS Date.now()

  // ── Protocol indicator ──
  protocol: BLEProtocolType;

  // ── FTMS extended fields (null for CSC) ──
  speed: number | null;         // km/h (instantaneous)
  power: number | null;         // watts (instantaneous)
  distance: number | null;      // meters (total accumulated)
  incline: number | null;       // percent
  calories: number | null;      // kcal (total from machine)
  heartRate: number | null;     // bpm
  resistance: number | null;    // resistance level
  steps: number | null;         // step count (cross trainer)
  elapsedTime: number | null;   // seconds (from machine)
}

/**
 * Backward-compatible type alias.
 * Existing code that uses `CSCMeasurement` will continue to work.
 */
export type CSCMeasurement = BLEMeasurement;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  FACTORY HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Create a CSC-style measurement (used by existing handleMeasurement in ble-service.ts) */
export function createCSCMeasurement(fields: {
  wheelRevolutions: number;
  lastWheelEventTime: number;
  crankRevolutions: number;
  lastCrankEventTime: number;
  rpm: number;
}): BLEMeasurement {
  return {
    ...fields,
    timestamp: Date.now(),
    protocol: 'csc',
    speed: null,
    power: null,
    distance: null,
    incline: null,
    calories: null,
    heartRate: null,
    resistance: null,
    steps: null,
    elapsedTime: null,
  };
}

/** Create an FTMS measurement with synthesized CSC fields */
export function createFTMSMeasurement(
  fields: {
    rpm: number;
    speed?: number | null;
    power?: number | null;
    distance?: number | null;
    incline?: number | null;
    calories?: number | null;
    heartRate?: number | null;
    resistance?: number | null;
    steps?: number | null;
    elapsedTime?: number | null;
  },
  syntheticCrankCounter: number,
): BLEMeasurement {
  // Synthesize CSC-compatible fields so workout.tsx stale-data detection works
  // crankRevolutions increases with each packet
  // lastCrankEventTime is synthesized from Date.now() in 1/1024 second units
  const now = Date.now();
  const syntheticCrankEventTime = (now % 64000) * 1.024; // Wraps at ~64s like real CSC

  return {
    // Synthesized CSC fields
    wheelRevolutions: 0,
    lastWheelEventTime: 0,
    crankRevolutions: syntheticCrankCounter,
    lastCrankEventTime: Math.round(syntheticCrankEventTime),
    rpm: fields.rpm,
    timestamp: now,

    // Protocol
    protocol: 'ftms',

    // FTMS fields
    speed: fields.speed ?? null,
    power: fields.power ?? null,
    distance: fields.distance ?? null,
    incline: fields.incline ?? null,
    calories: fields.calories ?? null,
    heartRate: fields.heartRate ?? null,
    resistance: fields.resistance ?? null,
    steps: fields.steps ?? null,
    elapsedTime: fields.elapsedTime ?? null,
  };
}
