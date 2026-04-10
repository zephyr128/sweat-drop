import { useEffect, useMemo, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';
import type { RealtimeChannel } from '@supabase/supabase-js';

type RealtimeEventType = 'INSERT' | 'UPDATE' | 'DELETE';

interface RealtimeRefreshOptions {
  /** Supabase table to subscribe to */
  table: string;
  /** Column filter (e.g. 'user_id') */
  filterColumn?: string;
  /** Value to match for filterColumn */
  filterValue?: string | null;
  /** Event types to listen for */
  events?: RealtimeEventType[];
  /** Callback when a matching event arrives */
  onEvent: () => void;
  /** Whether the subscription is enabled */
  enabled?: boolean;
}

const DEFAULT_EVENTS: RealtimeEventType[] = ['INSERT', 'UPDATE'];

/**
 * Subscribe to Supabase Realtime changes on a table.
 * When realtime delivers an event matching the filter, `onEvent` fires immediately.
 * Also fires once when the app returns to foreground (background→active transition).
 * Polling is intentionally omitted — Realtime covers live updates and the focus
 * effect on the home screen covers navigation-triggered refreshes.
 */
export function useRealtimeRefresh({
  table,
  filterColumn,
  filterValue,
  events,
  onEvent,
  enabled = true,
}: RealtimeRefreshOptions) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  // Keep event list stable across renders so we do not constantly re-subscribe.
  const eventListKey = useMemo(() => {
    const source = events?.length ? events : DEFAULT_EVENTS;
    return [...new Set(source)].join('|');
  }, [events]);

  const eventList = useMemo(() => {
    return eventListKey.split('|').filter(Boolean) as RealtimeEventType[];
  }, [eventListKey]);

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
          log.warn(`[Realtime] channel error on ${channelName}`);
        }
      });
      channelRef.current = channel;
    } catch (err) {
      log.warn('[Realtime] subscription failed:', err);
    }

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
      appListener.remove();
    };
  }, [table, filterColumn, filterValue, enabled, eventList]);
}
