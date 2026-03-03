/**
 * SWEATDROP — FTMS (Fitness Machine Service) Protocol Parser
 *
 * AGENT NOTE: [2026-03-02] - mobile-coder (Task 3.4)
 * Reference: docs/plans/mvp_full_audit_and_build_plan.md
 *
 * Parses BLE FTMS characteristic data for:
 *   - Indoor Bike Data (0x2AD2)  — Life Fitness, Technogym, Matrix bikes
 *   - Treadmill Data (0x2ACD)    — Treadmills, running machines
 *   - Cross Trainer Data (0x2ACE) — Ellipticals, cross trainers
 *
 * Bluetooth SIG specification:
 *   https://www.bluetooth.com/specifications/specs/fitness-machine-service-1-0/
 *
 * Each parse function returns extracted fields; the caller (ble-service.ts)
 * wraps them into a BLEMeasurement via createFTMSMeasurement().
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  PARSED DATA TYPES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface FTMSIndoorBikeData {
  speed: number;            // km/h (instantaneous)
  averageSpeed: number | null;
  cadence: number;          // RPM (instantaneous, 0.5 resolution)
  averageCadence: number | null;
  distance: number | null;  // meters (total)
  resistance: number | null;
  power: number | null;     // watts (instantaneous)
  averagePower: number | null;
  totalEnergy: number | null;    // kcal
  energyPerHour: number | null;  // kcal/h
  energyPerMinute: number | null; // kcal/min
  heartRate: number | null;       // bpm
  elapsedTime: number | null;     // seconds
}

export interface FTMSTreadmillData {
  speed: number;            // km/h (instantaneous)
  averageSpeed: number | null;
  distance: number | null;  // meters (total)
  incline: number | null;   // percent (0.1% resolution)
  rampAngle: number | null; // degrees (0.1° resolution)
  positiveElevation: number | null;  // meters
  negativeElevation: number | null;  // meters
  pace: number | null;      // km/min (instantaneous)
  averagePace: number | null;
  totalEnergy: number | null;    // kcal
  energyPerHour: number | null;
  energyPerMinute: number | null;
  heartRate: number | null;
  elapsedTime: number | null;    // seconds
  power: number | null;     // watts (force on belt)
}

export interface FTMSCrossTrainerData {
  speed: number;            // km/h (instantaneous)
  averageSpeed: number | null;
  distance: number | null;  // meters (total)
  stepCount: number | null; // total steps per minute
  strideCount: number | null;
  incline: number | null;   // percent
  resistance: number | null;
  power: number | null;     // watts (instantaneous)
  averagePower: number | null;
  totalEnergy: number | null;    // kcal
  energyPerHour: number | null;
  energyPerMinute: number | null;
  heartRate: number | null;
  elapsedTime: number | null;    // seconds
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  INDOOR BIKE DATA PARSER (0x2AD2)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Parse FTMS Indoor Bike Data characteristic (0x2AD2).
 *
 * Flags field (16-bit):
 *   Bit 0:  More Data (0 = no more, 1 = more fields)
 *   Bit 1:  Average Speed Present (if 0, Instantaneous Speed is present)
 *   Bit 2:  Instantaneous Cadence Present
 *   Bit 3:  Average Cadence Present
 *   Bit 4:  Total Distance Present
 *   Bit 5:  Resistance Level Present
 *   Bit 6:  Instantaneous Power Present
 *   Bit 7:  Average Power Present
 *   Bit 8:  Expended Energy Present
 *   Bit 9:  Heart Rate Present
 *   Bit 10: Metabolic Equivalent Present
 *   Bit 11: Elapsed Time Present
 *   Bit 12: Remaining Time Present
 */
export function parseIndoorBikeData(data: ArrayBuffer): FTMSIndoorBikeData | null {
  const view = new DataView(data);
  if (view.byteLength < 2) return null;

  let offset = 0;

  // Flags (16-bit)
  const flags = view.getUint16(offset, true);
  offset += 2;

  const result: FTMSIndoorBikeData = {
    speed: 0,
    averageSpeed: null,
    cadence: 0,
    averageCadence: null,
    distance: null,
    resistance: null,
    power: null,
    averagePower: null,
    totalEnergy: null,
    energyPerHour: null,
    energyPerMinute: null,
    heartRate: null,
    elapsedTime: null,
  };

  // Instantaneous Speed — always present UNLESS bit 1 (Average Speed) is set
  // Per FTMS spec: bit 1 = 0 means Instantaneous Speed is present
  if (!(flags & 0x0002)) {
    if (view.byteLength < offset + 2) return result;
    result.speed = view.getUint16(offset, true) * 0.01; // Resolution: 0.01 km/h
    offset += 2;
  }

  // Average Speed (bit 1)
  if (flags & 0x0002) {
    if (view.byteLength < offset + 2) return result;
    result.averageSpeed = view.getUint16(offset, true) * 0.01;
    offset += 2;
  }

  // Instantaneous Cadence (bit 2) — this is the RPM we need
  if (flags & 0x0004) {
    if (view.byteLength < offset + 2) return result;
    result.cadence = view.getUint16(offset, true) * 0.5; // Resolution: 0.5 /min
    offset += 2;
  }

  // Average Cadence (bit 3)
  if (flags & 0x0008) {
    if (view.byteLength < offset + 2) return result;
    result.averageCadence = view.getUint16(offset, true) * 0.5;
    offset += 2;
  }

  // Total Distance (bit 4) — 24-bit unsigned (3 bytes)
  if (flags & 0x0010) {
    if (view.byteLength < offset + 3) return result;
    result.distance =
      view.getUint8(offset) |
      (view.getUint8(offset + 1) << 8) |
      (view.getUint8(offset + 2) << 16);
    offset += 3;
  }

  // Resistance Level (bit 5) — sint16
  if (flags & 0x0020) {
    if (view.byteLength < offset + 2) return result;
    result.resistance = view.getInt16(offset, true);
    offset += 2;
  }

  // Instantaneous Power (bit 6) — sint16 watts
  if (flags & 0x0040) {
    if (view.byteLength < offset + 2) return result;
    result.power = view.getInt16(offset, true);
    offset += 2;
  }

  // Average Power (bit 7) — sint16 watts
  if (flags & 0x0080) {
    if (view.byteLength < offset + 2) return result;
    result.averagePower = view.getInt16(offset, true);
    offset += 2;
  }

  // Expended Energy (bit 8) — uint16 total + uint16 per hour + uint8 per minute
  if (flags & 0x0100) {
    if (view.byteLength < offset + 5) return result;
    result.totalEnergy = view.getUint16(offset, true);
    offset += 2;
    result.energyPerHour = view.getUint16(offset, true);
    offset += 2;
    result.energyPerMinute = view.getUint8(offset);
    offset += 1;
  }

  // Heart Rate (bit 9) — uint8 bpm
  if (flags & 0x0200) {
    if (view.byteLength < offset + 1) return result;
    result.heartRate = view.getUint8(offset);
    offset += 1;
  }

  // Metabolic Equivalent (bit 10) — uint8, resolution 0.1
  if (flags & 0x0400) {
    if (view.byteLength < offset + 1) return result;
    // Skip — not used in SweatDrop
    offset += 1;
  }

  // Elapsed Time (bit 11) — uint16 seconds
  if (flags & 0x0800) {
    if (view.byteLength < offset + 2) return result;
    result.elapsedTime = view.getUint16(offset, true);
    offset += 2;
  }

  // Remaining Time (bit 12) — skip
  // if (flags & 0x1000) { offset += 2; }

  return result;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  TREADMILL DATA PARSER (0x2ACD)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Parse FTMS Treadmill Data characteristic (0x2ACD).
 *
 * Flags field (16-bit):
 *   Bit 0:  More Data
 *   Bit 1:  Average Speed Present (if 0, Instantaneous Speed present)
 *   Bit 2:  Total Distance Present
 *   Bit 3:  Inclination and Ramp Angle Present
 *   Bit 4:  Elevation Gain Present
 *   Bit 5:  Instantaneous Pace Present
 *   Bit 6:  Average Pace Present
 *   Bit 7:  Expended Energy Present
 *   Bit 8:  Heart Rate Present
 *   Bit 9:  Metabolic Equivalent Present
 *   Bit 10: Elapsed Time Present
 *   Bit 11: Remaining Time Present
 *   Bit 12: Force on Belt and Power Output Present
 */
export function parseTreadmillData(data: ArrayBuffer): FTMSTreadmillData | null {
  const view = new DataView(data);
  if (view.byteLength < 2) return null;

  let offset = 0;

  const flags = view.getUint16(offset, true);
  offset += 2;

  const result: FTMSTreadmillData = {
    speed: 0,
    averageSpeed: null,
    distance: null,
    incline: null,
    rampAngle: null,
    positiveElevation: null,
    negativeElevation: null,
    pace: null,
    averagePace: null,
    totalEnergy: null,
    energyPerHour: null,
    energyPerMinute: null,
    heartRate: null,
    elapsedTime: null,
    power: null,
  };

  // Instantaneous Speed — present if bit 1 = 0
  if (!(flags & 0x0002)) {
    if (view.byteLength < offset + 2) return result;
    result.speed = view.getUint16(offset, true) * 0.01; // 0.01 km/h
    offset += 2;
  }

  // Average Speed (bit 1)
  if (flags & 0x0002) {
    if (view.byteLength < offset + 2) return result;
    result.averageSpeed = view.getUint16(offset, true) * 0.01;
    offset += 2;
  }

  // Total Distance (bit 2) — 24-bit
  if (flags & 0x0004) {
    if (view.byteLength < offset + 3) return result;
    result.distance =
      view.getUint8(offset) |
      (view.getUint8(offset + 1) << 8) |
      (view.getUint8(offset + 2) << 16);
    offset += 3;
  }

  // Inclination + Ramp Angle (bit 3) — sint16 each, 0.1% / 0.1°
  if (flags & 0x0008) {
    if (view.byteLength < offset + 4) return result;
    result.incline = view.getInt16(offset, true) * 0.1;
    offset += 2;
    result.rampAngle = view.getInt16(offset, true) * 0.1;
    offset += 2;
  }

  // Elevation Gain (bit 4) — uint16 positive + uint16 negative, 0.1m
  if (flags & 0x0010) {
    if (view.byteLength < offset + 4) return result;
    result.positiveElevation = view.getUint16(offset, true) * 0.1;
    offset += 2;
    result.negativeElevation = view.getUint16(offset, true) * 0.1;
    offset += 2;
  }

  // Instantaneous Pace (bit 5) — uint8, 0.1 km/min
  if (flags & 0x0020) {
    if (view.byteLength < offset + 1) return result;
    result.pace = view.getUint8(offset) * 0.1;
    offset += 1;
  }

  // Average Pace (bit 6) — uint8, 0.1 km/min
  if (flags & 0x0040) {
    if (view.byteLength < offset + 1) return result;
    result.averagePace = view.getUint8(offset) * 0.1;
    offset += 1;
  }

  // Expended Energy (bit 7) — uint16 total + uint16/h + uint8/min
  if (flags & 0x0080) {
    if (view.byteLength < offset + 5) return result;
    result.totalEnergy = view.getUint16(offset, true);
    offset += 2;
    result.energyPerHour = view.getUint16(offset, true);
    offset += 2;
    result.energyPerMinute = view.getUint8(offset);
    offset += 1;
  }

  // Heart Rate (bit 8) — uint8 bpm
  if (flags & 0x0100) {
    if (view.byteLength < offset + 1) return result;
    result.heartRate = view.getUint8(offset);
    offset += 1;
  }

  // Metabolic Equivalent (bit 9) — skip
  if (flags & 0x0200) {
    offset += 1;
  }

  // Elapsed Time (bit 10) — uint16 seconds
  if (flags & 0x0400) {
    if (view.byteLength < offset + 2) return result;
    result.elapsedTime = view.getUint16(offset, true);
    offset += 2;
  }

  // Remaining Time (bit 11) — skip
  if (flags & 0x0800) {
    offset += 2;
  }

  // Force on Belt + Power Output (bit 12) — sint16 N + sint16 W
  if (flags & 0x1000) {
    if (view.byteLength < offset + 4) return result;
    offset += 2; // Skip force on belt
    result.power = view.getInt16(offset, true);
    offset += 2;
  }

  return result;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  CROSS TRAINER DATA PARSER (0x2ACE)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Parse FTMS Cross Trainer Data characteristic (0x2ACE).
 *
 * Flags field (24-bit — 3 bytes):
 *   Bit 0:  More Data
 *   Bit 1:  Average Speed Present
 *   Bit 2:  Total Distance Present
 *   Bit 3:  Step Count Present
 *   Bit 4:  Stride Count Present
 *   Bit 5:  Elevation Gain Present
 *   Bit 6:  Inclination and Ramp Angle Present
 *   Bit 7:  Resistance Level Present
 *   Bit 8:  Instantaneous Power Present
 *   Bit 9:  Average Power Present
 *   Bit 10: Expended Energy Present
 *   Bit 11: Heart Rate Present
 *   Bit 12: Metabolic Equivalent Present
 *   Bit 13: Elapsed Time Present
 *   Bit 14: Remaining Time Present
 *   Bit 15: Movement Direction (0 = Forward, 1 = Backward)
 */
export function parseCrossTrainerData(data: ArrayBuffer): FTMSCrossTrainerData | null {
  const view = new DataView(data);
  if (view.byteLength < 3) return null; // 24-bit flags

  let offset = 0;

  // Flags (24-bit — 3 bytes, little-endian)
  const flags =
    view.getUint8(offset) |
    (view.getUint8(offset + 1) << 8) |
    (view.getUint8(offset + 2) << 16);
  offset += 3;

  const result: FTMSCrossTrainerData = {
    speed: 0,
    averageSpeed: null,
    distance: null,
    stepCount: null,
    strideCount: null,
    incline: null,
    resistance: null,
    power: null,
    averagePower: null,
    totalEnergy: null,
    energyPerHour: null,
    energyPerMinute: null,
    heartRate: null,
    elapsedTime: null,
  };

  // Instantaneous Speed — present if bit 1 = 0
  if (!(flags & 0x0002)) {
    if (view.byteLength < offset + 2) return result;
    result.speed = view.getUint16(offset, true) * 0.01;
    offset += 2;
  }

  // Average Speed (bit 1)
  if (flags & 0x0002) {
    if (view.byteLength < offset + 2) return result;
    result.averageSpeed = view.getUint16(offset, true) * 0.01;
    offset += 2;
  }

  // Total Distance (bit 2) — 24-bit
  if (flags & 0x0004) {
    if (view.byteLength < offset + 3) return result;
    result.distance =
      view.getUint8(offset) |
      (view.getUint8(offset + 1) << 8) |
      (view.getUint8(offset + 2) << 16);
    offset += 3;
  }

  // Step Count (bit 3) — uint16 total steps per minute
  if (flags & 0x0008) {
    if (view.byteLength < offset + 2) return result;
    result.stepCount = view.getUint16(offset, true);
    offset += 2;
  }

  // Stride Count (bit 4) — uint16
  if (flags & 0x0010) {
    if (view.byteLength < offset + 2) return result;
    result.strideCount = view.getUint16(offset, true);
    offset += 2;
  }

  // Elevation Gain (bit 5) — uint16 positive + uint16 negative, 0.1m
  if (flags & 0x0020) {
    if (view.byteLength < offset + 4) return result;
    offset += 4; // Skip — not critical for MVP
  }

  // Inclination + Ramp Angle (bit 6) — sint16 each
  if (flags & 0x0040) {
    if (view.byteLength < offset + 4) return result;
    result.incline = view.getInt16(offset, true) * 0.1;
    offset += 4; // incline + ramp angle
  }

  // Resistance Level (bit 7) — sint16
  if (flags & 0x0080) {
    if (view.byteLength < offset + 2) return result;
    result.resistance = view.getInt16(offset, true);
    offset += 2;
  }

  // Instantaneous Power (bit 8) — sint16 watts
  if (flags & 0x0100) {
    if (view.byteLength < offset + 2) return result;
    result.power = view.getInt16(offset, true);
    offset += 2;
  }

  // Average Power (bit 9) — sint16 watts
  if (flags & 0x0200) {
    if (view.byteLength < offset + 2) return result;
    result.averagePower = view.getInt16(offset, true);
    offset += 2;
  }

  // Expended Energy (bit 10) — uint16 total + uint16/h + uint8/min
  if (flags & 0x0400) {
    if (view.byteLength < offset + 5) return result;
    result.totalEnergy = view.getUint16(offset, true);
    offset += 2;
    result.energyPerHour = view.getUint16(offset, true);
    offset += 2;
    result.energyPerMinute = view.getUint8(offset);
    offset += 1;
  }

  // Heart Rate (bit 11) — uint8 bpm
  if (flags & 0x0800) {
    if (view.byteLength < offset + 1) return result;
    result.heartRate = view.getUint8(offset);
    offset += 1;
  }

  // Metabolic Equivalent (bit 12) — skip
  if (flags & 0x1000) {
    offset += 1;
  }

  // Elapsed Time (bit 13) — uint16 seconds
  if (flags & 0x2000) {
    if (view.byteLength < offset + 2) return result;
    result.elapsedTime = view.getUint16(offset, true);
    offset += 2;
  }

  return result;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  UTILITY — Estimate cadence from speed for treadmill
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Estimate steps-per-minute from treadmill speed.
 * Used as a pseudo-RPM for the unified measurement interface.
 *
 * Average stride length:
 *   Walking (< 6 km/h): ~0.7m stride → steps/min ≈ speed_m_per_min / 0.7
 *   Jogging (6–10 km/h): ~1.0m stride
 *   Running (> 10 km/h): ~1.3m stride
 */
export function estimateStepsPerMinuteFromSpeed(speedKmH: number): number {
  if (speedKmH <= 0) return 0;

  const speedMPerMin = (speedKmH * 1000) / 60;
  let strideLength: number;

  if (speedKmH < 6) {
    strideLength = 0.7;
  } else if (speedKmH < 10) {
    strideLength = 1.0;
  } else {
    strideLength = 1.3;
  }

  return Math.round(speedMPerMin / strideLength);
}
