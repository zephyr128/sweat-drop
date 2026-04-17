/**
 * Motion constants for SWEATDROP brand animations (drop system).
 *
 * Keep this file as the single source of truth so every place that draws a
 * "drop" or uses drop-physics shares the same feel.
 */

export const DROP_PHYSICS = {
  /** Distance (px) past which releasing the pull triggers a refresh. */
  PULL_THRESHOLD: 70,
  /**
   * Distance (px) at which the drop reaches its full visual size.
   * Tuned so the user sees the drop go from tiny → full well before they
   * release, giving clear feedback that "pulling further does something".
   */
  MAX_STRETCH: 110,
  /**
   * Damping factor applied to Android pan translations. iOS already has
   * natural bounce resistance; on Android we fake it so both feel alike.
   */
  ANDROID_PAN_DAMPING: 0.7,
  /** Canvas total height available for the drop to render in. */
  CANVAS_HEIGHT: 140,
  /** Full "breathing" cycle duration (ms) used while refreshing. */
  REFRESH_CYCLE_MS: 1000,
} as const;

export type DropPhysics = typeof DROP_PHYSICS;
