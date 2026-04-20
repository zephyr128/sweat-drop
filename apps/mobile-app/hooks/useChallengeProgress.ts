import { useState, useEffect, useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { log } from '@/lib/logger';
import { supabase } from '@/lib/supabase';
import { useSession } from './useSession';

export interface ChallengeProgress {
  challenge_id: string;
  challenge_name: string;
  badge_image_url: string | null;
  description: string | null;
  challenge_type: 'daily' | 'weekly' | 'monthly' | 'streak' | 'milestone' | 'checkin_streak' | 'checkin_count';
  target_drops: number;
  milestone_threshold: number | null; // Only for milestone challenges
  reward_drops: number;
  current_drops: number;
  current_streak_days: number; // Only for streak challenges
  is_completed: boolean;
  progress_percentage: number;
  start_date: string | null;
  end_date: string | null;
}

export function useChallengeProgress(gymId: string | null, machineType: string | null) {
  const { session } = useSession();
  const [challenges, setChallenges] = useState<ChallengeProgress[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // Reset loaded flag when gym changes (to show skeleton on gym switch)
  useEffect(() => {
    hasLoadedRef.current = false;
  }, [gymId]);

  const loadChallenges = useCallback(async () => {
    if (!session?.user?.id || !gymId) {
      if (isMountedRef.current) {
        setChallenges([]);
        setLoading(false);
      }
      return;
    }

    // Only show loading skeleton on initial load, not on subsequent refreshes
    if (!hasLoadedRef.current && isMountedRef.current) setLoading(true);
    if (isMountedRef.current) setError(null);

    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_my_challenges', {
        p_gym_id: gymId,
      });

      if (rpcError) {
        log.error('Error loading challenges:', rpcError);
        if (isMountedRef.current) setError(rpcError.message);
        return;
      }

      if (!rpcData || rpcData.length === 0) {
        if (isMountedRef.current) setChallenges([]);
        return;
      }

      const toNumber = (value: unknown): number => {
        const parsed = typeof value === 'number' ? value : Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
      };

      const challengesWithProgress: ChallengeProgress[] = rpcData.map((c: any) => {
        const cType = c.challenge_type;
        let target = 0;
        if (cType === 'milestone') {
          target = toNumber(c.milestone_threshold);
        } else if (cType === 'streak' || cType === 'checkin_streak') {
          target = toNumber(c.streak_days || c.target_drops);
        } else {
          target = toNumber(c.target_drops);
        }

        let current = 0;
        if (cType === 'streak' || cType === 'checkin_streak') {
          current = toNumber(c.current_streak_days);
        } else {
          current = toNumber(c.current_drops);
        }

        const progressPercent = target > 0
          ? Math.min((current / target) * 100, 100)
          : 0;

        // Treat as completed when the backend flag is true OR when progress has
        // already reached/exceeded the target. The latter guards against rows
        // where the DB trigger hasn't flipped is_completed yet (e.g. legacy
        // checkin_streak rows — see migration 20260420140000).
        const dbCompleted = c.is_completed || false;
        const effectivelyCompleted = dbCompleted || (target > 0 && current >= target);

        return {
          challenge_id: c.challenge_id,
          challenge_name: c.challenge_name,
          badge_image_url: c.badge_image_url ?? null,
          description: null,
          challenge_type: cType as ChallengeProgress['challenge_type'],
          target_drops: target,
          milestone_threshold: c.milestone_threshold === null ? null : toNumber(c.milestone_threshold),
          reward_drops: toNumber(c.reward_drops),
          current_drops: current,
          current_streak_days: toNumber(c.current_streak_days),
          is_completed: effectivelyCompleted,
          progress_percentage: Number(progressPercent.toFixed(2)),
          start_date: c.start_date,
          end_date: c.end_date,
        };
      });

      if (isMountedRef.current) {
        setChallenges(challengesWithProgress);
        hasLoadedRef.current = true;
      }
    } catch (err: any) {
      log.error('Error in loadChallenges:', err);
      if (isMountedRef.current) setError(err.message);
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [session?.user?.id, gymId, machineType]);

  // Note: updateProgress is no longer needed as challenge progress is automatically
  // updated via award_drops() function when drops are earned during workout.
  // This function is kept for backward compatibility but does nothing.
  const updateProgress = useCallback(
    async (minutes: number) => {
      // Challenge progress is now automatically updated via award_drops() function
      // when drops are earned. This function is deprecated but kept for compatibility.
      log.debug('[useChallengeProgress] updateProgress called but challenge progress is now automatic via award_drops()');
      
      // Reload challenges to get updated progress
      await loadChallenges();
      
      return {
        success: true,
        completedChallenges: [],
        totalDropsAwarded: 0,
      };
    },
    [loadChallenges]
  );

  // Initial load + reload when gym/user changes
  useEffect(() => {
    loadChallenges();
  }, [loadChallenges]);

  // Refresh when screen comes back into focus (e.g. returning from session summary)
  useFocusEffect(
    useCallback(() => {
      void loadChallenges();
    }, [loadChallenges])
  );

  // Realtime subscription: re-fetch whenever this user's challenge_progress changes.
  // award_drops() updates challenge_progress rows, so this fires immediately after
  // a workout without needing a manual pull-to-refresh.
  useEffect(() => {
    if (!session?.user?.id) return;

    const channel = supabase
      .channel(`challenge_progress_${session.user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'challenge_progress',
          filter: `user_id=eq.${session.user.id}`,
        },
        () => { void loadChallenges(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [session?.user?.id, loadChallenges]);

  return {
    challenges,
    loading,
    error,
    refresh: loadChallenges,
    updateProgress,
  };
}
