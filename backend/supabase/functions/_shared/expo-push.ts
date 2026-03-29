/**
 * Shared Expo Push API helpers (Deno).
 * AGENT NOTE: [2026-03-27] - edge-function-agent — parse receipts, no token leakage.
 */

export const EXPO_PUSH_BATCH_SIZE = 100;

export const PUSH_BODY_LIMITS = {
  maxTokensPerRequest: 2000,
  maxTitleLen: 256,
  maxBodyLen: 4000,
} as const;

export function isExpoPushToken(token: unknown): token is string {
  return (
    typeof token === 'string' &&
    (token.startsWith('ExponentPushToken') || token.startsWith('ExpoPushToken'))
  );
}

export interface ExpoTicket {
  status?: string;
  id?: string;
  message?: string;
  details?: { error?: string };
}

export interface ExpoPushApiResponse {
  data?: ExpoTicket[];
  errors?: unknown;
}

/** Redact long strings for logs (never log push tokens). */
export function truncateForLog(s: string, max = 120): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

/**
 * Parse Expo `/push/send` JSON body and count ok vs error tickets.
 */
export function summarizeExpoTickets(parsed: unknown): {
  receipt_ok: number;
  receipt_error: number;
  error_messages: string[];
} {
  const error_messages: string[] = [];
  const maxSamples = 5;

  if (!parsed || typeof parsed !== 'object') {
    return { receipt_ok: 0, receipt_error: 0, error_messages: ['invalid_expo_response_shape'] };
  }

  const data = (parsed as ExpoPushApiResponse).data;
  if (!Array.isArray(data)) {
    const errs = (parsed as ExpoPushApiResponse).errors;
    if (errs !== undefined) {
      error_messages.push(truncateForLog(String(JSON.stringify(errs)), 200));
    } else {
      error_messages.push('missing_data_array');
    }
    return { receipt_ok: 0, receipt_error: 0, error_messages };
  }

  let ok = 0;
  let err = 0;
  for (const ticket of data) {
    if (!ticket || typeof ticket !== 'object') {
      err++;
      if (error_messages.length < maxSamples) {
        error_messages.push('invalid_ticket');
      }
      continue;
    }
    const t = ticket as ExpoTicket;
    if (t.status === 'ok') {
      ok++;
    } else {
      err++;
      if (error_messages.length < maxSamples) {
        const msg =
          typeof t.message === 'string'
            ? t.message
            : typeof t.details?.error === 'string'
              ? t.details.error
              : 'error';
        error_messages.push(truncateForLog(msg, 160));
      }
    }
  }

  return { receipt_ok: ok, receipt_error: err, error_messages };
}

/**
 * Merge send-push JSON response into a compact shape safe to return from schedulers.
 */
/** Prefer Expo ticket successes; fall back to legacy `sent` (submitted count). */
export function deliveryCountFromSendPushBody(body: unknown): number {
  if (!body || typeof body !== 'object') return 0;
  const o = body as Record<string, unknown>;
  if (typeof o.receipt_ok === 'number') return o.receipt_ok;
  if (typeof o.sent === 'number') return o.sent;
  return 0;
}

export function compactSendPushMetrics(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object') {
    return { parse_error: true };
  }
  const o = body as Record<string, unknown>;
  const out: Record<string, unknown> = {
    ok: o.ok,
    version: o.version,
    requested: o.requested,
    valid_tokens: o.valid_tokens,
    skipped_invalid: o.skipped_invalid,
    deduped_in_request: o.deduped_in_request,
    receipt_ok: o.receipt_ok,
    receipt_error: o.receipt_error,
    batches_attempted: o.batches_attempted,
    batches_failed: o.batches_failed,
  };
  if (Array.isArray(o.batch_summaries)) {
    out.batch_summaries = o.batch_summaries;
  }
  if (typeof o.error === 'string') {
    out.error = truncateForLog(o.error, 200);
  }
  return out;
}
