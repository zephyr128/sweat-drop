/**
 * useMyLeaderboardPrizes
 *
 * Fetches the authenticated user's leaderboard prize redemptions via the
 * get_my_leaderboard_prizes RPC (added in migration 20260413000001).
 *
 * Auto-refreshes on:
 *   - screen focus (useFocusEffect)
 *   - realtime status changes (Supabase channel on redemptions table)
 *   - imperative refresh() call
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';

export interface LeaderboardPrize {
  id: string;
  gym_id: string;
  gym_name: string | null;
  status: string;
  redemption_code: string | null;
  description: string | null;
  expires_at: string | null;
  created_at: string;
  confirmed_at: string | null;
  source_type: string;
}

export function useMyLeaderboardPrizes(gymId?: string | null): {
  prizes: LeaderboardPrize[];
  pending: LeaderboardPrize[];
  loading: boolean;
  refresh: () => void;
} {
  const [prizes, setPrizes] = useState<LeaderboardPrize[]>([]);
  const [loading, setLoading] = useState(true);
  const { session } = useSession();
  const userId = session?.user?.id;
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase.rpc as any)(
        'get_my_leaderboard_prizes',
        {
          p_gym_id: gymId ?? null,
          p_limit: 20,
        }
      );
      if (!error && data) {
        setPrizes(data as LeaderboardPrize[]);
      } else {
        setPrizes([]);
      }
    } catch {
      setPrizes([]);
    } finally {
      setLoading(false);
    }
  }, [gymId]);

  // Re-fetch whenever the screen comes into focus
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  // Realtime subscription: re-fetch when any of this user's leaderboard
  // prize redemptions are inserted/updated/deleted.
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel('my-leaderboard-prizes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'redemptions',
          filter: `user_id=eq.${userId}`,
        },
        () => { void load(); }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [userId, load]);

  const pending = useMemo(
    () => prizes.filter((p) => p.status === 'pending'),
    [prizes]
  );

  return useMemo(
    () => ({ prizes, pending, loading, refresh: load }),
    [prizes, pending, loading, load]
  );
}
