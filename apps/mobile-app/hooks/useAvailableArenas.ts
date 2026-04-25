import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { log } from '@/lib/logger';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { withRetry } from '@/lib/workout/withRetry';

/**
 * Available arena from get_available_arenas() RPC.
 * Matches backend/types/sweatdrop.ts → AvailableArena
 */
export interface AvailableArena {
  arena_id: string;
  name: string;
  description: string | null;
  sponsor_name: string;
  sponsor_logo: string | null;
  scoring_model: string;
  start_date: string;
  end_date: string;
  participant_count: number;
  user_opted_in: boolean;
  user_rank: number | null;
  user_score: number | null;
  leader_score: number | null;
  prizes: Array<{ rank: number; prize: string; value?: string }>;
  // v2 fields — opt-in requirements, branding, status
  opt_in_type: string;         // 'free' | 'drops' | 'streak' | 'level'
  opt_in_value: number;
  card_color: string | null;
  card_text_color: string | null;
  card_gradient_end: string | null;
  arena_status: string;        // 'upcoming' | 'active' | 'ended'
  // v2.1 — cross-gym scoring breakdown
  gym_score_breakdown: Array<{
    gym_id: string;
    gym_name: string;
    score: number;
    sessions: number;
  }> | null;                   // Per-gym score breakdown (only for opted-in users)
}

/**
 * Hook to fetch available arenas for the current user.
 *
 * AGENT NOTE: [2026-03-03] - mobile-coder (Phase 3.2)
 * Calls get_available_arenas() RPC.
 * Related files:
 *  - backend/supabase/migrations/20260303100002_sweat_arenas_system.sql
 *  - apps/mobile-app/app/home.tsx (arena carousel)
 *  - apps/mobile-app/app/leaderboard.tsx (arenas tab)
 *
 * AGENT NOTE: [2026-04-25] - mobile-coder
 * Accepts an optional `gymId` so callers can scope the visible arenas to
 * the active gym. Local arenas linked to gym A must not appear when the
 * user is browsing gym B's arena tab. The backend (see
 * 20260425183000_arenas_visible_only_at_linked_gym.sql) enforces the same
 * predicate via arena_gyms when p_gym_id is provided.
 */
export function useAvailableArenas(gymId?: string | null) {
  const { session } = useSession();
  const [arenas, setArenas] = useState<AvailableArena[]>([]);
  const [loading, setLoading] = useState(false);
  // Prevent stale state updates after unmount
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const loadArenas = useCallback(async () => {
    if (!session?.user) return;
    if (!mountedRef.current) return;
    setLoading(true);

    try {
      const data = await withRetry(
        async () => {
          const { data: rpcData, error } = await supabase.rpc('get_available_arenas', {
            p_user_id: session.user.id,
            // When gymId is null/undefined the RPC falls back to the
            // legacy "any user-membership" eligibility check, which keeps
            // older callers working until they pass an explicit gym.
            p_gym_id: gymId ?? null,
          });
          if (error) throw error;
          return rpcData as AvailableArena[];
        },
        { attempts: 3, baseDelayMs: 1500, label: 'useAvailableArenas' },
      );

      if (mountedRef.current) {
        setArenas(data ?? []);
      }
    } catch (err) {
      log.warn('[useAvailableArenas] Failed to load arenas (will show empty):', err);
      if (mountedRef.current) {
        setArenas([]);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [session?.user?.id, gymId]);

  useEffect(() => {
    loadArenas();
  }, [loadArenas]);

  return useMemo(() => ({
    arenas,
    loading,
    refresh: loadArenas,
  }), [arenas, loading, loadArenas]);
}
