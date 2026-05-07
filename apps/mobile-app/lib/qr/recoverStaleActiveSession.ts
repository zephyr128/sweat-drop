/**
 * Recover the caller's most recent stale `is_active = true` session.
 *
 * Used by both `ScannerScreen.tsx` and `handleQrDeepLink.ts` when
 * `start_session_safely()` returns `user_active_session_conflict`, by
 * `useActiveSessionRecovery` for the home-screen recovery banner, and by the
 * background auto-finalize timer in `workout.tsx`.
 *
 * Behaviour:
 *   1. Query `sessions` for the caller's most recent `is_active = true` row.
 *      RLS already permits a user to read their own session rows.
 *   2. If none found → return `{ closed: false, sessionId: null, dropsRecovered: 0 }`.
 *   3. Call `finalize_inactive_session(<id>, 'user_initiated_recovery')`.
 *      That RPC is `SECURITY DEFINER` and gated to `auth.uid() = session.user_id`
 *      (see `backend/supabase/migrations/20260325000002_inactivity_autofinish_and_lock_starvation.sql`).
 *   4. If the RPC errors, fall back to a direct UPDATE of `sessions` so
 *      recovery cannot fail silently — mirrors the simulator-bypass path used
 *      in `ScannerScreen.tsx` and the `cancel_for_no_activity` path in
 *      `workout.tsx`.
 *
 *      Drops trade-off on the fallback path: setting `is_active = false`
 *      removes this session from the `cleanup_abandoned_sessions()` cron's
 *      candidate set (it filters `WHERE s.is_active = true`), so any drops
 *      that would have been credited by `award_drops()` inside
 *      `finalize_inactive_session()` are forfeited. We accept this because
 *      the fallback only fires when the RPC has already failed (transient
 *      network/server outage that has likely also blocked award_drops), and
 *      the alternative — leaving the user trapped behind a permanent
 *      `user_active_session_conflict` — is strictly worse UX.
 *
 * AGENT NOTE: [2026-05-07] - mobile-coder (Bug 1 / Bug 4 helper)
 * Returned `dropsRecovered` is whatever the RPC reports; on the fallback path
 * we always return 0 because award_drops was never invoked.
 */

import { log } from '@/lib/logger';

export interface RecoverStaleActiveSessionResult {
  closed: boolean;
  sessionId: string | null;
  dropsRecovered: number;
  reason: 'no_active_session' | 'rpc_finalized' | 'fallback_update' | 'failed';
  error?: string;
}

const RECOVERY_REASON = 'user_initiated_recovery';

interface FinalizeRpcRow {
  success?: boolean;
  already_finalized?: boolean;
  drops_earned?: number;
  message?: string;
}

/**
 * Minimal subset of the Supabase client surface this helper actually uses.
 * Exported so unit tests can supply a fake without dragging in the full
 * `@supabase/supabase-js` types (which would also pull in browser/RN globals).
 */
export interface RecoverStaleActiveSessionClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (fn: string, args?: Record<string, unknown>) => any;
}

/**
 * Lazy-loaded default supabase client. Kept lazy (and out of the static
 * import graph) so this module can be required from `node:test` runners
 * without dragging in `react-native-url-polyfill`, `expo-constants`,
 * `react-native-mmkv`, etc. Tests pass an explicit `client` argument and
 * never trigger this branch.
 */
let _cachedDefaultClient: RecoverStaleActiveSessionClient | null = null;
function getDefaultClient(): RecoverStaleActiveSessionClient {
  if (!_cachedDefaultClient) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _cachedDefaultClient = require('../supabase').supabase as RecoverStaleActiveSessionClient;
  }
  return _cachedDefaultClient;
}

export async function recoverStaleActiveSession(
  userId: string,
  clientOverride?: RecoverStaleActiveSessionClient,
): Promise<RecoverStaleActiveSessionResult> {
  const client = clientOverride ?? getDefaultClient();
  if (!userId) {
    log.warn('[Recovery] recoverStaleActiveSession called without userId');
    return {
      closed: false,
      sessionId: null,
      dropsRecovered: 0,
      reason: 'no_active_session',
    };
  }

  let sessionId: string | null = null;

  try {
    const { data: stale, error: queryError } = await client
      .from('sessions')
      .select('id, machine_id, gym_id, started_at')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (queryError) {
      log.warn('[Recovery] Stale session lookup failed:', queryError.message);
      return {
        closed: false,
        sessionId: null,
        dropsRecovered: 0,
        reason: 'failed',
        error: queryError.message,
      };
    }

    if (!stale?.id) {
      log.debug('[Recovery] No stale active session found for user');
      return {
        closed: false,
        sessionId: null,
        dropsRecovered: 0,
        reason: 'no_active_session',
      };
    }

    sessionId = stale.id;
    log.debug('[Recovery] Stale active session found, finalising:', sessionId);
  } catch (lookupError) {
    const msg = lookupError instanceof Error ? lookupError.message : String(lookupError);
    log.warn('[Recovery] Stale session lookup threw:', msg);
    return {
      closed: false,
      sessionId: null,
      dropsRecovered: 0,
      reason: 'failed',
      error: msg,
    };
  }

  try {
    const { data, error } = await client.rpc('finalize_inactive_session', {
      p_session_id: sessionId,
      p_reason: RECOVERY_REASON,
    });

    if (error) {
      throw new Error(error.message || 'finalize_inactive_session failed');
    }

    const row = (Array.isArray(data) ? data[0] : data) as FinalizeRpcRow | null;
    const dropsRecovered = typeof row?.drops_earned === 'number' ? row.drops_earned : 0;

    log.debug('[Recovery] Stale session finalised via RPC', {
      sessionId,
      dropsRecovered,
      alreadyFinalized: row?.already_finalized,
    });

    return {
      closed: true,
      sessionId,
      dropsRecovered,
      reason: 'rpc_finalized',
    };
  } catch (rpcError) {
    const msg = rpcError instanceof Error ? rpcError.message : String(rpcError);
    log.warn('[Recovery] finalize_inactive_session RPC failed, falling back to direct update:', msg);

    try {
      const { error: updateError } = await client
        .from('sessions')
        .update({
          is_active: false,
          ended_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId)
        .eq('user_id', userId)
        .eq('is_active', true);

      if (updateError) {
        log.error('[Recovery] Fallback update failed:', updateError.message);
        return {
          closed: false,
          sessionId,
          dropsRecovered: 0,
          reason: 'failed',
          error: updateError.message,
        };
      }

      // NOTE: setting is_active = false removes this session from the
      // cleanup_abandoned_sessions() cron candidate set, so any drops that
      // would have been credited by award_drops() inside the failed RPC are
      // forfeited. See module-level JSDoc for the trade-off rationale.
      log.warn('[Recovery] Stale session closed via fallback UPDATE (drops forfeited; RPC was unreachable):', sessionId);

      return {
        closed: true,
        sessionId,
        dropsRecovered: 0,
        reason: 'fallback_update',
      };
    } catch (fallbackError) {
      const fallbackMsg =
        fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      log.error('[Recovery] Fallback update threw:', fallbackMsg);
      return {
        closed: false,
        sessionId,
        dropsRecovered: 0,
        reason: 'failed',
        error: fallbackMsg,
      };
    }
  }
}
