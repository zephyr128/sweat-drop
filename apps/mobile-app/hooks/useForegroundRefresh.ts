/**
 * useForegroundRefresh — fires a callback when the app returns to foreground.
 *
 * AGENT NOTE: [2026-04-23] - mobile-coder
 *
 * Replacement for the AppState half of useRealtimeRefresh. We dropped the
 * Supabase Realtime subscription on drops_transactions / user_notifications
 * (migration 20260423210000_trim_realtime_hot_tables.sql) to eliminate the
 * WAL-decoder stalls that were causing prod timeouts. Screens that relied on
 * realtime to refresh their data now refresh on focus (useFocusEffect) +
 * foreground transition (this hook).
 *
 * The hook only fires on background→active transitions — not on the initial
 * mount, and not on active→active transitions.
 */
import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

interface Options {
  onForeground: () => void;
  enabled?: boolean;
}

export function useForegroundRefresh({ onForeground, enabled = true }: Options) {
  const callbackRef = useRef(onForeground);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    callbackRef.current = onForeground;
  }, [onForeground]);

  useEffect(() => {
    if (!enabled) return;

    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const wasBackground = appStateRef.current !== 'active';
      appStateRef.current = next;
      if (next === 'active' && wasBackground) {
        callbackRef.current();
      }
    });

    return () => sub.remove();
  }, [enabled]);
}
