/**
 * useUnclaimedPrizeCount — returns the number of pending arena/leaderboard
 * prize redemptions for the current user, SCOPED to the active gym.
 *
 * AGENT NOTE: [2026-04-25] - mobile-coder
 * Prizes are physically collected at a specific gym (the redemptions
 * screen / store list filters by active gym), so the home-header badge
 * must do the same. Otherwise users see a red dot for a prize they
 * cannot redeem here, tap it, and land on an empty /redemptions screen.
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

export function useUnclaimedPrizeCount(gymId?: string | null): number {
  const { session } = useSession();
  const userId = session?.user?.id;
  const [count, setCount] = useState(0);

  const fetchCount = useCallback(async () => {
    if (!userId) {
      setCount(0);
      return;
    }
    // Without a gym we cannot decide where the prize is collected, so
    // default to zero rather than counting cross-gym noise.
    if (!gymId) {
      setCount(0);
      return;
    }
    try {
      const { data } = await supabase.rpc('get_my_redemptions', {
        p_gym_id: gymId,
        p_statuses: ['pending', 'pending_verification'],
        p_limit: null,
      });
      if (data) {
        const prizeCount = (data as any[]).filter(
          (r) => r.source_type === 'arena_prize' || r.source_type === 'leaderboard_prize',
        ).length;
        setCount(prizeCount);
      } else {
        setCount(0);
      }
    } catch (err) {
      log.error('[useUnclaimedPrizeCount] fetch error:', err);
    }
  }, [userId, gymId]);

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
