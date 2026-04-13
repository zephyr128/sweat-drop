/**
 * useLeaderboardRewards
 * Fetches active leaderboard_rewards for a given gym and period.
 * Returns top-3 prize rows (rank_position 1/2/3) for motivational display.
 * Auto-refreshes on screen focus via useFocusEffect.
 */
import { useState, useCallback, useMemo } from 'react';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';

export interface LeaderboardReward {
  id: string;
  rank_position: number;
  reward_name: string;
  reward_description: string | null;
  reward_type: string;
  value: string | null;
}

export function useLeaderboardRewards(gymId: string | null | undefined, period: 'weekly' | 'monthly' = 'weekly'): {
  rewards: LeaderboardReward[];
  loading: boolean;
  refresh: () => void;
} {
  const [rewards, setRewards] = useState<LeaderboardReward[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!gymId) {
      setRewards([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('leaderboard_rewards')
        .select('id, rank_position, reward_name, reward_description, reward_type, value')
        .eq('gym_id', gymId)
        .eq('period', period)
        .eq('is_active', true)
        .order('rank_position', { ascending: true })
        .limit(3);

      if (!error && data) {
        setRewards(data as LeaderboardReward[]);
      } else {
        setRewards([]);
      }
    } catch {
      setRewards([]);
    } finally {
      setLoading(false);
    }
  }, [gymId, period]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  return useMemo(() => ({ rewards, loading, refresh: load }), [rewards, loading, load]);
}
