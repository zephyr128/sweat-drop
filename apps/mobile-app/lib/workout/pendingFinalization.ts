import AsyncStorage from '@react-native-async-storage/async-storage';
import { log } from '@/lib/logger';

const KEY = '@sweatdrop/pending_finalization';

export interface PendingFinalization {
  sessionId: string;
  savedAt: string; // ISO timestamp
}

/**
 * Persist a pending-finalization marker so the session-summary screen
 * (or a future app-start handler) can retry `award_drops` when network
 * is restored.
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
