/**
 * Motion constants for SWEATDROP brand animations (drop system).
 *
 * Keep this file as the single source of truth so every place that draws a
 * "drop" or uses drop-physics shares the same feel.
 */

export const DROP_PHYSICS = {
  /** Distance (px) past which releasing the pull triggers a refresh. */
  PULL_THRESHOLD: 80,
  /** Distance (px) used to clamp progress 0..1 for visual scaling. */
  MAX_STRETCH: 140,
  /** Head radius of the drop when at rest (progress=0). */
  HEAD_RADIUS_MIN: 10,
  /** Head radius at full stretch (progress=1). */
  HEAD_RADIUS_MAX: 16,
  /** Anchor (top) radius at rest — visually the "tap" the drop hangs from. */
  TOP_RADIUS_MIN: 9,
  /** Anchor radius at full stretch (surface tension thins). */
  TOP_RADIUS_MAX: 2,
  /** Damping factor applied to Android pan translations to mimic iOS bounce feel. */
  ANDROID_PAN_DAMPING: 0.55,
  /** Canvas total height available for the drop to render in. */
  CANVAS_HEIGHT: 140,
  /** Duration (ms) for springback when the pull is released below threshold. */
  SPRINGBACK_MS: 220,
  /** Full fall + reform cycle duration (ms) used while refreshing. */
  REFRESH_CYCLE_MS: 1100,
} as const;

export type DropPhysics = typeof DROP_PHYSICS;
