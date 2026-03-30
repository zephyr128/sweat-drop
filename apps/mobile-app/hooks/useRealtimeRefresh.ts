import { useEffect, useMemo, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface RealtimeRefreshOptions {
  /** Supabase table to subscribe to */
  table: string;
  /** Column filter (e.g. 'user_id') */
  filterColumn?: string;
  /** Value to match for filterColumn */
  filterValue?: string | null;
  /** Event types to listen for */
  events?: Array<'INSERT' | 'UPDATE' | 'DELETE'>;
  /** Callback when a matching event arrives */
  onEvent: () => void;
  /** Fallback poll interval in ms (default 30000) */
  pollIntervalMs?: number;
  /** Whether the subscription is enabled */
  enabled?: boolean;
}

const DEFAULT_EVENTS: Array<'INSERT' | 'UPDATE' | 'DELETE'> = ['INSERT', 'UPDATE'];

/**
 * Subscribe to Supabase Realtime changes on a table, with fallback polling.
 * When realtime delivers an event matching the filter, `onEvent` fires immediately.
 * As a safety net, the same callback also fires on a timer when the app is in foreground.
 */
export function useRealtimeRefresh({
  table,
  filterColumn,
  filterValue,
  events,
  onEvent,
  pollIntervalMs = 30_000,
  enabled = true,
}: RealtimeRefreshOptions) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  // Keep event list stable across renders so we do not constantly re-subscribe.
  const eventList = useMemo<Array<'INSERT' | 'UPDATE' | 'DELETE'>>(() => {
    const source = events?.length ? events : DEFAULT_EVENTS;
    return [...new Set(source)];
  }, [events?.join('|')]);

  useEffect(() => {
    if (!enabled || !filterValue) return;

    const channelName = `${table}:${filterColumn}:${filterValue}`;

    let channel: RealtimeChannel;
    try {
      const filter = filterColumn && filterValue
        ? `${filterColumn}=eq.${filterValue}`
        : undefined;

      channel = supabase.channel(channelName);
      for (const event of eventList) {
        channel = channel.on(
          'postgres_changes' as any,
          { event, schema: 'public', table, filter } as any,
          () => {
            log.debug(`[Realtime] ${table} ${event} received`);
            onEventRef.current();
          }
        );
      }

      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          log.debug(`[Realtime] subscribed to ${channelName}`);
        } else if (status === 'CHANNEL_ERROR') {
          log.warn(`[Realtime] channel error on ${channelName}, relying on polling`);
        }
      });
      channelRef.current = channel;
    } catch (err) {
      log.warn('[Realtime] subscription failed, using polling only:', err);
    }

    pollRef.current = setInterval(() => {
      if (appStateRef.current === 'active') {
        onEventRef.current();
      }
    }, pollIntervalMs);

    const appListener = AppState.addEventListener('change', (next: AppStateStatus) => {
      const wasBackground = appStateRef.current !== 'active';
      appStateRef.current = next;
      if (next === 'active' && wasBackground) {
        onEventRef.current();
      }
    });

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current).catch(() => {});
        channelRef.current = null;
      }
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      appListener.remove();
    };
  }, [table, filterColumn, filterValue, enabled, pollIntervalMs, eventList]);
}
