import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';

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
 */
export function useAvailableArenas() {
  const { session } = useSession();
  const [arenas, setArenas] = useState<AvailableArena[]>([]);
  const [loading, setLoading] = useState(false);

  const loadArenas = useCallback(async () => {
    if (!session?.user) return;
    setLoading(true);

    try {
      const { data, error } = await supabase.rpc('get_available_arenas', {
        p_user_id: session.user.id,
      });

      if (error) {
        console.error('[useAvailableArenas] Error:', error);
        setArenas([]);
      } else {
        const allArenas = (data as AvailableArena[]) || [];
        // Loaded arenas
        // Show all available arenas (not just opted-in ones) for home screen
        setArenas(allArenas);
      }
    } catch (err) {
      console.error('[useAvailableArenas] Exception:', err);
      setArenas([]);
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    loadArenas();
  }, [loadArenas]);

  return {
    arenas,
    loading,
    refresh: loadArenas,
  };
}
