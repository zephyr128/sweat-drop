/**
 * useCompeteStats
 * Fetches leaderboard data for all three periods (weekly / monthly / all_time)
 * in parallel and derives the "drops to #1" delta for each period.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useSession } from './useSession';

export interface RivalEntry {
  username: string;
  drops: number;
  rank: number;
  isMe: boolean;
}

export interface PeriodRankInfo {
  rank: number;
  totalMembers: number;
  /** Drops the #1 user has this period (0 if unknown) */
  leaderDrops: number;
  /** User's own drops this period (0 if not ranked) */
  myDrops: number;
  /** How many drops away from #1 (positive = behind, 0 = tied/leading) */
  dropsToFirst: number;
  /** Rank change vs. the same period 7 days ago (positive = improved) */
  rankDelta: number | null;
  /** Up to 3 surrounding entries: one above, me, one below */
  neighbors: RivalEntry[];
}

export interface CompeteStats {
  weekly: PeriodRankInfo;
  monthly: PeriodRankInfo;
  allTime: PeriodRankInfo;
  /** Rank of the user's gym in the global gym leaderboard (weekly) */
  gymRank: number | null;
}

const DEFAULT_PERIOD: PeriodRankInfo = {
  rank: 0,
  totalMembers: 0,
  leaderDrops: 0,
  myDrops: 0,
  dropsToFirst: 0,
  rankDelta: null,
  neighbors: [],
};

const DEFAULT: CompeteStats = {
  weekly: { ...DEFAULT_PERIOD },
  monthly: { ...DEFAULT_PERIOD },
  allTime: { ...DEFAULT_PERIOD },
  gymRank: null,
};

function extractNeighbors(entries: any[], idx: number): RivalEntry[] {
  const result: RivalEntry[] = [];
  const above = idx > 0 ? idx - 1 : -1;
  const below = idx < entries.length - 1 ? idx + 1 : -1;
  if (above >= 0) {
    const e = entries[above];
    result.push({ username: e.username ?? '?', drops: e.drops ?? e.score ?? 0, rank: above + 1, isMe: false });
  }
  const me = entries[idx];
  result.push({ username: me.username ?? '?', drops: me.drops ?? me.score ?? 0, rank: idx + 1, isMe: true });
  if (below >= 0) {
    const e = entries[below];
    result.push({ username: e.username ?? '?', drops: e.drops ?? e.score ?? 0, rank: below + 1, isMe: false });
  }
  return result;
}

function extractPeriodInfo(entries: any[], userId: string): PeriodRankInfo {
  if (!entries || entries.length === 0) return { ...DEFAULT_PERIOD };
  const idx = entries.findIndex((e) => e.user_id === userId);
  const leaderEntry = entries[0];
  const leaderDrops: number = leaderEntry?.drops ?? leaderEntry?.score ?? 0;
  if (idx < 0) {
    return {
      rank: 0,
      totalMembers: entries.length,
      leaderDrops,
      myDrops: 0,
      dropsToFirst: leaderDrops,
      rankDelta: null,
      neighbors: [],
    };
  }
  const myEntry = entries[idx];
  const myDrops: number = myEntry?.drops ?? myEntry?.score ?? 0;
  return {
    rank: idx + 1,
    totalMembers: entries.length,
    leaderDrops,
    myDrops,
    dropsToFirst: Math.max(0, leaderDrops - myDrops),
    rankDelta: null,
    neighbors: extractNeighbors(entries, idx),
  };
}

export function useCompeteStats(gymId: string | null | undefined): {
  stats: CompeteStats;
  loading: boolean;
  refresh: () => void;
} {
  const { session } = useSession();
  const [stats, setStats] = useState<CompeteStats>(DEFAULT);
  const [loading, setLoading] = useState(true);

  // Sentinel — discard responses whose gymId no longer matches the active
  // gym so leaderboard ranks from gym1 don't bleed into gym2's compete card.
  const activeGymRef = useRef<string | null>(gymId ?? null);

  const load = useCallback(async () => {
    if (!session?.user || !gymId) {
      setLoading(false);
      return;
    }
    const userId = session.user.id;
    const requestedGymId = gymId;
    setLoading(true);

    try {
      const rpc = (period: string) =>
        supabase
          .rpc('get_leaderboard', {
            p_type: 'gym',
            p_scope_id: requestedGymId,
            p_period: period,
            p_limit: 200,
            p_newcomer_only: false,
          })
          .then(({ data, error }) => {
            if (error || !data) {
              return supabase
                .rpc('get_local_leaderboard', {
                  p_gym_id: requestedGymId,
                  p_period: period,
                  p_limit: 200,
                  p_newcomer_only: false,
                })
                .then(({ data: fb }) => (fb as any[]) ?? []);
            }
            return (data as any[]) ?? [];
          });

      const [weeklyEntries, monthlyEntries, allTimeEntries] = await Promise.all([
        rpc('weekly'),
        rpc('monthly'),
        rpc('all_time'),
      ]);

      if (activeGymRef.current !== requestedGymId) {
        return;
      }

      setStats({
        weekly: extractPeriodInfo(weeklyEntries, userId),
        monthly: extractPeriodInfo(monthlyEntries, userId),
        allTime: extractPeriodInfo(allTimeEntries, userId),
        gymRank: null,
      });
    } catch {
      // Non-critical — leave previous state
    } finally {
      if (activeGymRef.current === requestedGymId) {
        setLoading(false);
      }
    }
  }, [session?.user?.id, gymId]);

  useEffect(() => {
    activeGymRef.current = gymId ?? null;
    setStats(DEFAULT);
    setLoading(true);
    void load();
  }, [load, gymId]);

  return useMemo(() => ({ stats, loading, refresh: load }), [stats, loading, load]);
}
