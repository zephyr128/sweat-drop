/**
 * useNotifications — in-app notification inbox data layer.
 *
 * Fetches the authenticated user's notifications with pagination,
 * subscribes to Realtime INSERT events for live updates,
 * and exposes mark-read / mark-all-read helpers.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/stores/authStore';
import { log } from '@/lib/logger';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface AppNotification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

const PAGE_SIZE = 30;

export function useNotifications() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const userId = useAuthStore((s) => s.session?.user?.id);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const appStateRef = useRef(AppState.currentState);

  const fetchNotifications = useCallback(async (offset = 0, append = false) => {
    if (!userId) return;
    try {
      const { data, error } = await supabase
        .from('user_notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) {
        log.warn('[Notifications] fetch error:', error.message);
        return;
      }

      const rows = (data ?? []) as AppNotification[];
      setHasMore(rows.length === PAGE_SIZE);

      if (append) {
        setItems((prev) => [...prev, ...rows]);
      } else {
        setItems(rows);
      }
    } catch (e) {
      log.warn('[Notifications] fetch exception:', e);
    }
  }, [userId]);

  const fetchUnreadCount = useCallback(async () => {
    if (!userId) return;
    try {
      const { data, error } = await (supabase.rpc as any)(
        'get_unread_notification_count',
      );
      if (!error && typeof data === 'number') {
        setUnreadCount(data);
      }
    } catch {
      // non-critical
    }
  }, [userId]);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchNotifications(0, false), fetchUnreadCount()]);
    setLoading(false);
  }, [fetchNotifications, fetchUnreadCount]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchNotifications(0, false), fetchUnreadCount()]);
    setRefreshing(false);
  }, [fetchNotifications, fetchUnreadCount]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loading || refreshing) return;
    await fetchNotifications(items.length, true);
  }, [hasMore, loading, refreshing, items.length, fetchNotifications]);

  const markRead = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    setItems((prev) =>
      prev.map((n) =>
        ids.includes(n.id) ? { ...n, read_at: new Date().toISOString() } : n,
      ),
    );
    setUnreadCount((c) => Math.max(0, c - ids.length));

    try {
      await (supabase.rpc as any)('mark_notifications_read', { p_ids: ids });
    } catch (e) {
      log.warn('[Notifications] markRead error:', e);
    }
  }, []);

  const markAllRead = useCallback(async () => {
    setItems((prev) =>
      prev.map((n) =>
        n.read_at ? n : { ...n, read_at: new Date().toISOString() },
      ),
    );
    setUnreadCount(0);

    try {
      await (supabase.rpc as any)('mark_all_notifications_read');
    } catch (e) {
      log.warn('[Notifications] markAllRead error:', e);
    }
  }, []);

  // Re-fetch on screen focus
  useFocusEffect(
    useCallback(() => {
      void loadInitial();
    }, [loadInitial]),
  );

  // Realtime subscription for new inserts
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel('user-notifications-inbox')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'user_notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as AppNotification;
          setItems((prev) => [row, ...prev]);
          setUnreadCount((c) => c + 1);
        },
      )
      .subscribe();

    channelRef.current = channel;

    const appListener = AppState.addEventListener('change', (next: AppStateStatus) => {
      const wasBackground = appStateRef.current !== 'active';
      appStateRef.current = next;
      if (next === 'active' && wasBackground) {
        void onRefresh();
      }
    });

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      appListener.remove();
    };
  }, [userId, onRefresh]);

  return useMemo(
    () => ({
      items,
      unreadCount,
      loading,
      refreshing,
      hasMore,
      onRefresh,
      loadMore,
      markRead,
      markAllRead,
    }),
    [items, unreadCount, loading, refreshing, hasMore, onRefresh, loadMore, markRead, markAllRead],
  );
}

/**
 * Lightweight hook used only by the home screen bell badge.
 * Polls unread count on mount + focus, subscribes to realtime.
 */
export function useUnreadNotificationCount() {
  const [count, setCount] = useState(0);
  const userId = useAuthStore((s) => s.session?.user?.id);

  const fetch = useCallback(async () => {
    if (!userId) return;
    try {
      const { data, error } = await (supabase.rpc as any)(
        'get_unread_notification_count',
      );
      if (!error && typeof data === 'number') {
        setCount(data);
      }
    } catch {
      // silent
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      void fetch();
    }, [fetch]),
  );

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel('unread-notif-badge')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => { void fetch(); },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, fetch]);

  return count;
}
