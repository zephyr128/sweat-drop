/**
 * useUnclaimedPrizeCount — returns the number of pending arena/leaderboard
 * prize redemptions for the current user.
 *
 * Used to display a badge on the Store icon in the home header.
 *
 * Refresh strategy mirrors useUnreadNotificationCount: refetch on screen
 * focus and when the app returns to foreground.
 */
import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { useForegroundRefresh } from '@/hooks/useForegroundRefresh';
import { log } from '@/lib/logger';

export function useUnclaimedPrizeCount(): number {
  const { session } = useSession();
  const userId = session?.user?.id;
  const [count, setCount] = useState(0);

  const fetchCount = useCallback(async () => {
    if (!userId) {
      setCount(0);
      return;
    }
    try {
      const { data } = await supabase.rpc('get_my_redemptions', {
        p_gym_id: undefined,
        p_statuses: ['pending', 'pending_verification'],
        p_limit: null,
      });
      if (data) {
        const prizeCount = (data as any[]).filter(
          (r) => r.source_type === 'arena_prize' || r.source_type === 'leaderboard_prize',
        ).length;
        setCount(prizeCount);
      }
    } catch (err) {
      log.error('[useUnclaimedPrizeCount] fetch error:', err);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      void fetchCount();
    }, [fetchCount]),
  );

  useForegroundRefresh({
    enabled: !!userId,
    onForeground: fetchCount,
  });

  return count;
}
