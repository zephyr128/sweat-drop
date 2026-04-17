/**
 * Redemption display state derivation — mobile app only.
 *
 * Maps backend `redemptions.status` + `fulfilled_at` to a richer
 * display state the UI can render without branching logic scattered
 * across components.
 *
 * State machine:
 *
 *   pending_verification  → amber/yellow badge — unverified member, code shown greyed
 *   pending_not_fulfilled → neutral/blue badge  — verified, prize not yet at gym (leaderboard/arena only)
 *   pending_ready         → green badge          — verified, prize at gym (or store reward always ready)
 *   confirmed             → grey/dimmed          — already collected
 *   cancelled             → red/dimmed           — self-cancelled or staff-cancelled
 *   expired               → slate                — past expires_at
 *
 * Source types whose prizes are "always on hand" at the gym (skip fulfillment phase):
 *   reward  — store rewards; staff has them in a drawer.
 * Source types that require physical delivery (go through not-fulfilled → ready):
 *   leaderboard_prize, arena_prize
 *
 * Related plan: docs/plans/exec_verification_gate_fulfillment_v1.md  (Phase 3)
 */

export type RedemptionDisplayState =
  | 'pending_verification'   // code shown greyed; "verify at reception" CTA
  | 'pending_not_fulfilled'  // prize on the way; "we'll notify you" message
  | 'pending_ready'          // show code at desk — collect now
  | 'confirmed'              // already collected
  | 'cancelled'
  | 'expired';

/** Source types that require physical delivery to the gym before pickup. */
const PRIZE_SOURCE_TYPES = new Set(['leaderboard_prize', 'arena_prize']);

/**
 * Derive the display state from a redemption row.
 *
 * Falls back to 'pending_ready' for any unrecognised status value so
 * the card degrades gracefully without crashing (plan acceptance §3).
 */
export function getRedemptionDisplayState(r: {
  status: string;
  fulfilled_at: string | null | undefined;
  source_type: string | null | undefined;
  expires_at?: string | null | undefined;
}): RedemptionDisplayState {
  const { status, fulfilled_at, source_type } = r;

  switch (status) {
    case 'pending_verification':
      return 'pending_verification';

    case 'pending': {
      // Store rewards are always on hand — skip the not-fulfilled phase.
      const isPrize = PRIZE_SOURCE_TYPES.has(source_type ?? '');
      if (isPrize && !fulfilled_at) return 'pending_not_fulfilled';
      return 'pending_ready';
    }

    case 'confirmed':
      return 'confirmed';

    case 'cancelled':
      return 'cancelled';

    case 'expired':
      return 'expired';

    default:
      // Graceful fallback for future status values from the backend.
      return 'pending_ready';
  }
}

/** Colour tokens per display state — keeps card rendering consistent. */
export const DISPLAY_STATE_COLOR: Record<RedemptionDisplayState, string> = {
  pending_verification: '#f59e0b',   // amber
  pending_not_fulfilled: '#60a5fa',  // blue
  pending_ready: '#4ade80',          // green
  confirmed: '#4ade80',              // green (dimmed via opacity on the card)
  cancelled: '#f87171',              // red
  expired: '#94a3b8',                // slate
};

/** Ionicons icon per display state. */
export const DISPLAY_STATE_ICON: Record<RedemptionDisplayState, string> = {
  pending_verification: 'shield-outline',
  pending_not_fulfilled: 'time-outline',
  pending_ready: 'checkmark-circle',
  confirmed: 'checkmark-circle',
  cancelled: 'close-circle',
  expired: 'alert-circle-outline',
};

/** i18n key for the status badge label per display state. */
export const DISPLAY_STATE_LABEL_KEY: Record<RedemptionDisplayState, string> = {
  pending_verification: 'states.pendingVerification.badge',
  pending_not_fulfilled: 'states.pendingNotFulfilled.badge',
  pending_ready: 'states.pendingReady.badge',
  confirmed: 'confirmed',
  cancelled: 'cancelled',
  expired: 'expired',
};
