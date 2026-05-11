/**
 * send-push request parsing (shared for Edge Function + unit tests).
 */
import { PUSH_BODY_LIMITS } from './expo-push.ts';

/**
 * Gym context fields — callers SHOULD include these in the `data` object for
 * every gym-scoped notification. They enable:
 *   1. In-app notification inbox: render gym logo thumbnail + gym name chip
 *      so multi-gym users can instantly identify the originating gym.
 *   2. OS banner differentiation: gym name is already in the title suffix
 *      ("Title — Gym Name") by convention; these fields are for the inbox.
 *
 * Standard pattern for all gym-scoped notification senders:
 * ```typescript
 * data: {
 *   type: 'notification_type',
 *   gym_id:       gymRow.id,          // UUID
 *   gym_name:     gymRow.name,        // Display name, e.g. "Vortex"
 *   gym_logo_url: gymRow.logo_url ?? null,  // CDN URL or null
 *   // ...other fields
 * }
 * ```
 *
 * Title convention (suffix pattern — actionable content first):
 * ```typescript
 * title = `🔥 Your streak is at risk! — ${gymName}`;
 * ```
 */
export interface GymPushContext {
  gym_id: string;
  gym_name: string;
  gym_logo_url: string | null;
}

export interface PushRequest {
  tokens: string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** Optional short id for structured logs (cron job name, etc.). Never log secrets. */
  client_ref?: string;
  /** If true, include legacy `result` array with raw Expo JSON per batch (large). Default false. */
  include_raw_batches?: boolean;
  /**
   * Optional user IDs matching each token 1:1. When provided, the notification
   * is persisted to user_notifications for the in-app inbox. Callers that batch
   * tokens from multiple users should pass the corresponding user_id for each.
   */
  user_ids?: string[];
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function parsePushRequest(raw: unknown):
  | { ok: true; value: PushRequest }
  | { ok: false; error: string } {
  if (!isPlainObject(raw)) {
    return { ok: false, error: 'JSON body must be an object' };
  }

  const tokens = raw.tokens;
  const title = raw.title;
  const body = raw.body;
  const data = raw.data;
  const client_ref = raw.client_ref;
  const include_raw_batches = raw.include_raw_batches;
  const user_ids = raw.user_ids;

  if (!Array.isArray(tokens)) {
    return { ok: false, error: 'tokens must be an array' };
  }
  if (typeof title !== 'string' || typeof body !== 'string') {
    return { ok: false, error: 'title and body must be strings' };
  }
  if (title.length > PUSH_BODY_LIMITS.maxTitleLen || body.length > PUSH_BODY_LIMITS.maxBodyLen) {
    return { ok: false, error: 'title or body exceeds max length' };
  }
  if (tokens.length > PUSH_BODY_LIMITS.maxTokensPerRequest) {
    return { ok: false, error: `tokens exceeds max (${PUSH_BODY_LIMITS.maxTokensPerRequest})` };
  }
  if (data !== undefined && !isPlainObject(data)) {
    return { ok: false, error: 'data must be a plain object when provided' };
  }
  if (client_ref !== undefined && typeof client_ref !== 'string') {
    return { ok: false, error: 'client_ref must be a string when provided' };
  }
  if (
    include_raw_batches !== undefined &&
    typeof include_raw_batches !== 'boolean'
  ) {
    return { ok: false, error: 'include_raw_batches must be boolean when provided' };
  }
  if (user_ids !== undefined && !Array.isArray(user_ids)) {
    return { ok: false, error: 'user_ids must be an array when provided' };
  }

  const coercedTokens = tokens.filter((t): t is string => typeof t === 'string');

  return {
    ok: true,
    value: {
      tokens: coercedTokens,
      title,
      body,
      data: data as Record<string, unknown> | undefined,
      client_ref: client_ref && client_ref.length > 64 ? client_ref.slice(0, 64) : client_ref,
      include_raw_batches: include_raw_batches === true,
      user_ids: Array.isArray(user_ids)
        ? user_ids.filter((id): id is string => typeof id === 'string')
        : undefined,
    },
  };
}
