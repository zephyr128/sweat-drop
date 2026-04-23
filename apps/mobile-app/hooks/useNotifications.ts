/**
 * useNotifications — in-app notification inbox data layer.
 *
 * Fetches the authenticated user's notifications with pagination and exposes
 * mark-read / mark-all-read helpers. Refreshes on screen focus and on
 * background→foreground transition. Push notifications (APNS/FCM) deliver
 * real-time banners; this hook no longer holds a Realtime subscription
 * because user_notifications was removed from supabase_realtime in
 * 20260423210000_trim_realtime_hot_tables.sql.
 */
import { useState, useCallback, useMemo } from 'react';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/stores/authStore';
import { useForegroundRefresh } from '@/hooks/useForegroundRefresh';
import { log } from '@/lib/logger';

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
  const [error, setError] = useState(false);

  const userId = useAuthStore((s) => s.session?.user?.id);

  const fetchNotifications = useCallback(async (offset = 0, append = false) => {
    if (!userId) return;
    try {
      const { data, error: fetchError } = await supabase
        .from('user_notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (fetchError) {
        log.warn('[Notifications] fetch error:', fetchError.message);
        setError(true);
        return;
      }

      setError(false);
      const rows = (data ?? []) as AppNotification[];
      setHasMore(rows.length === PAGE_SIZE);

      if (append) {
        setItems((prev) => [...prev, ...rows]);
      } else {
        setItems(rows);
      }
    } catch (e) {
      log.warn('[Notifications] fetch exception:', e);
      setError(true);
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

  // AGENT NOTE: [2026-04-23] - mobile-coder
  // Removed Realtime subscription on user_notifications (see migration
  // 20260423210000_trim_realtime_hot_tables.sql). Push notifications already
  // deliver the banner/badge for new rows; the inbox refreshes on screen focus
  // and on background→foreground transition via useForegroundRefresh below.
  useForegroundRefresh({
    enabled: !!userId,
    onForeground: onRefresh,
  });

  return useMemo(
    () => ({
      items,
      unreadCount,
      loading,
      error,
      refreshing,
      hasMore,
      onRefresh,
      loadMore,
      markRead,
      markAllRead,
    }),
    [items, unreadCount, loading, error, refreshing, hasMore, onRefresh, loadMore, markRead, markAllRead],
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

  // AGENT NOTE: [2026-04-23] - mobile-coder
  // Removed Realtime subscription on user_notifications (see migration
  // 20260423210000_trim_realtime_hot_tables.sql). The badge count refreshes
  // on screen focus (useFocusEffect above) and on foreground resume.
  useForegroundRefresh({
    enabled: !!userId,
    onForeground: fetch,
  });

  return count;
}
