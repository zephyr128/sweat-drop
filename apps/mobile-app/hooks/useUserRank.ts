import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useSession } from './useSession';

interface UserRankState {
  rank: number;
  totalMembers: number;
}

const DEFAULTS: UserRankState = { rank: 0, totalMembers: 0 };

function extractRank(entries: any[], userId: string): UserRankState | null {
  if (!entries || entries.length === 0) return null;
  const idx = entries.findIndex((e) => e.user_id === userId);
  if (idx < 0) return null;
  return { rank: idx + 1, totalMembers: entries.length };
}

/**
 * Fetches the current user's leaderboard rank for the given gym.
 * Tries weekly first, falls back to monthly, then returns 0/0 if not ranked.
 */
export function useUserRank(gymId: string | null | undefined): UserRankState & { refresh: () => void } {
  const { session } = useSession();
  const [state, setState] = useState<UserRankState>(DEFAULTS);

  const load = useCallback(async () => {
    if (!session?.user || !gymId) return;
    const userId = session.user.id;

    try {
      // Fire weekly + monthly in parallel
      const [weeklyRes, monthlyRes] = await Promise.all([
        supabase.rpc('get_leaderboard', {
          p_type: 'gym', p_scope_id: gymId, p_period: 'weekly', p_limit: 200, p_newcomer_only: false,
        }),
        supabase.rpc('get_leaderboard', {
          p_type: 'gym', p_scope_id: gymId, p_period: 'monthly', p_limit: 200, p_newcomer_only: false,
        }),
      ]);

      const weeklyRank = extractRank(weeklyRes.data as any[] ?? [], userId);
      if (weeklyRank) { setState(weeklyRank); return; }

      const monthlyRank = extractRank(monthlyRes.data as any[] ?? [], userId);
      if (monthlyRank) { setState(monthlyRank); return; }

      // Fallback: local leaderboard
      const { data: fallback } = await supabase.rpc('get_local_leaderboard', {
        p_gym_id: gymId, p_period: 'weekly', p_limit: 200, p_newcomer_only: false,
      });

      setState(extractRank(fallback as any[] ?? [], userId) ?? DEFAULTS);
    } catch {
      // Non-critical
    }
  }, [session?.user?.id, gymId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { ...state, refresh: load };
}
