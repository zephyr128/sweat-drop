import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';

const KEY = '@sweatdrop/pending_finalization';

export interface PendingFinalization {
  sessionId: string;
  savedAt: string; // ISO timestamp
}

/**
 * Persist a pending-finalization marker so the session-summary screen,
 * app-start recovery, or network-change listener can retry `award_drops`
 * when connectivity is restored.
 */
export async function savePendingFinalization(sessionId: string): Promise<void> {
  try {
    const record: PendingFinalization = {
      sessionId,
      savedAt: new Date().toISOString(),
    };
    await AsyncStorage.setItem(KEY, JSON.stringify(record));
    log.warn('[pendingFinalization] Saved pending finalization for session:', sessionId);
  } catch (e) {
    log.error('[pendingFinalization] Failed to save:', e);
  }
}

export async function loadPendingFinalization(): Promise<PendingFinalization | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingFinalization;
    if (!parsed.sessionId) return null;

    // Discard stale records (> 24 hours old — the backend won't accept them anyway)
    const ageMs = Date.now() - new Date(parsed.savedAt).getTime();
    if (ageMs > 24 * 60 * 60 * 1000) {
      await clearPendingFinalization();
      return null;
    }
    return parsed;
  } catch (e) {
    log.error('[pendingFinalization] Failed to load:', e);
    return null;
  }
}

export async function clearPendingFinalization(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch (e) {
    log.error('[pendingFinalization] Failed to clear:', e);
  }
}

/**
 * Attempt to finalize a pending session by calling `award_drops`.
 * Safe to call from any context (app startup, network-change listener, etc.)
 * since `award_drops` is idempotent — if drops were already awarded it
 * returns the existing result without re-computing.
 *
 * Returns `true` if the session was successfully finalized (or no pending
 * record existed). Returns `false` if the call failed (network down, etc.).
 */
export async function drainPendingFinalization(): Promise<boolean> {
  const pending = await loadPendingFinalization();
  if (!pending) return true;

  log.debug('[pendingFinalization] Draining pending session:', pending.sessionId);

  try {
    const { data, error } = await supabase.rpc('award_drops', {
      p_session_id: pending.sessionId,
    });

    if (error) {
      log.warn('[pendingFinalization] award_drops failed:', error.message);
      return false;
    }

    const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
    log.debug('[pendingFinalization] Recovered:', {
      sessionId: pending.sessionId,
      drops_earned: row?.drops_earned ?? 0,
    });
    await clearPendingFinalization();
    return true;
  } catch (e) {
    log.warn('[pendingFinalization] drain threw:', e);
    return false;
  }
}
