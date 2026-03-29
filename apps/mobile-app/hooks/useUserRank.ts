import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useSession } from './useSession';

interface UserRankState {
  rank: number;
  totalMembers: number;
}

const DEFAULTS: UserRankState = { rank: 0, totalMembers: 0 };

/**
 * Lightweight hook that fetches just the current user's weekly leaderboard
 * rank and total member count for the given gym.
 */
export function useUserRank(gymId: string | null | undefined): UserRankState & { refresh: () => void } {
  const { session } = useSession();
  const [state, setState] = useState<UserRankState>(DEFAULTS);

  const load = useCallback(async () => {
    if (!session?.user || !gymId) return;
    const userId = session.user.id;

    try {
      const { data, error } = await supabase.rpc('get_leaderboard', {
        p_type: 'gym',
        p_scope_id: gymId,
        p_period: 'weekly',
        p_limit: 200,
        p_newcomer_only: false,
      });

      if (error || !data) {
        const { data: fallback } = await supabase.rpc('get_local_leaderboard', {
          p_gym_id: gymId,
          p_period: 'weekly',
          p_limit: 200,
          p_newcomer_only: false,
        });

        if (fallback && Array.isArray(fallback)) {
          const idx = fallback.findIndex((e: any) => e.user_id === userId);
          setState({
            rank: idx >= 0 ? idx + 1 : fallback.length + 1,
            totalMembers: Math.max(fallback.length, 1),
          });
        }
        return;
      }

      const entries = data as any[];
      const idx = entries.findIndex((e) => e.user_id === userId);
      setState({
        rank: idx >= 0 ? idx + 1 : entries.length + 1,
        totalMembers: Math.max(entries.length, 1),
      });
    } catch {
      // Non-critical
    }
  }, [session?.user?.id, gymId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { ...state, refresh: load };
}
