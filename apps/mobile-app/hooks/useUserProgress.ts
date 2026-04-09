import { useState, useEffect, useCallback, useRef } from 'react';
import { log } from '@/lib/logger';
import { supabase } from '@/lib/supabase';
import { useSession } from './useSession';

// AGENT NOTE: [2026-03-03] - mobile-coder
// This hook was rewritten to compute badge progress from actual user data
// (profiles, sessions, gym_memberships) instead of reading from the empty
// user_progress table. The evaluate_badges() function on the server uses
// the same data sources, so this stays in sync.

export interface UserProgress {
  id: string;
  user_id: string;
  global_achievement_id: string | null;
  gym_challenge_id: string | null;
  progress_data: { current: number; target: number; type: string };
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  progress_percent: number; // 0-100
}

interface UserStats {
  session_count: number;
  total_drops: number;
  streak_days: number;
  gym_count: number;
  distance_km: number;
}

export function useUserProgress(userId?: string) {
  const { session } = useSession();
  const [progress, setProgress] = useState<UserProgress[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  const targetUserId = userId || session?.user?.id;

  const loadProgress = useCallback(async () => {
    if (!targetUserId) {
      if (isMountedRef.current) {
        setProgress([]);
        setLoading(false);
      }
      return;
    }

    if (isMountedRef.current) setLoading(true);
    if (isMountedRef.current) setError(null);

    try {
      // Fetch user stats from the same sources evaluate_badges() uses
      const [profileResult, sessionCountResult, gymCountResult, distanceResult, achievementsResult, badgesResult] =
        await Promise.all([
          supabase
            .from('profiles')
            .select('total_drops, streak_days')
            .eq('id', targetUserId)
            .single(),
          supabase
            .from('sessions')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', targetUserId)
            .gt('drops_earned', 0),
          supabase
            .from('gym_memberships')
            .select('gym_id')
            .eq('user_id', targetUserId),
          supabase
            .from('sessions')
            .select('raw_metrics')
            .eq('user_id', targetUserId)
            .gt('drops_earned', 0),
          supabase
            .from('global_achievements')
            .select('*')
            .eq('is_active', true)
            .order('display_order', { ascending: true }),
          supabase
            .from('user_badges')
            .select('global_achievement_id')
            .eq('user_id', targetUserId)
            .not('global_achievement_id', 'is', null),
        ]);

      const totalDistanceM = (distanceResult.data || []).reduce(
        (sum: number, s: any) => sum + (parseFloat(s.raw_metrics?.total_distance) || 0),
        0
      );

      const stats: UserStats = {
        total_drops: profileResult.data?.total_drops || 0,
        streak_days: profileResult.data?.streak_days || 0,
        session_count: sessionCountResult.count || 0,
        gym_count: new Set((gymCountResult.data || []).map((g: any) => g.gym_id)).size,
        distance_km: totalDistanceM / 1000,
      };

      const achievements = achievementsResult.data || [];
      const earnedIds = new Set(
        (badgesResult.data || []).map((b: any) => b.global_achievement_id)
      );

      // Compute progress for each achievement based on criteria type
      const progressItems: UserProgress[] = achievements.map((achievement: any) => {
        const criteria = achievement.criteria as { type: string; value: number };
        const isEarned = earnedIds.has(achievement.id);

        let currentValue: number = 0;
        switch (criteria.type) {
          case 'session_count':
            currentValue = stats.session_count;
            break;
          case 'total_drops':
            currentValue = stats.total_drops;
            break;
          case 'streak_days':
            currentValue = stats.streak_days;
            break;
          case 'gym_count':
            currentValue = stats.gym_count;
            break;
          case 'distance_km':
            currentValue = stats.distance_km;
            break;
          default:
            currentValue = 0;
        }

        const targetValue = criteria.value || 1;
        // Show 100% when criteria is met OR badge is earned
        const criteriaMet = currentValue >= targetValue;
        const percent = isEarned || criteriaMet
          ? 100
          : Math.min(Math.round((currentValue / targetValue) * 100), 99);

        return {
          id: achievement.id,
          user_id: targetUserId,
          global_achievement_id: achievement.id,
          gym_challenge_id: null,
          progress_data: {
            current: currentValue,
            target: targetValue,
            type: criteria.type,
          },
          is_completed: isEarned || criteriaMet,
          completed_at: null,
          created_at: '',
          updated_at: '',
          progress_percent: percent,
        };
      });

      // ========================================
      // PART 2: Gym challenge progress (via RPC)
      // ========================================
      const [rpcChallengesResult, gymBadgesResult] = await Promise.all([
        supabase.rpc('get_my_challenges', { p_gym_id: null }),
        supabase
          .from('user_badges')
          .select('gym_challenge_id')
          .eq('user_id', targetUserId)
          .not('gym_challenge_id', 'is', null),
      ]);

      const rpcChallenges = rpcChallengesResult.data || [];
      const earnedGymChallengeIds = new Set(
        (gymBadgesResult.data || []).map((b: any) => b.gym_challenge_id)
      );

      const challengeItems: UserProgress[] = rpcChallenges
        .map((c: any) => {
          const isEarned = earnedGymChallengeIds.has(c.challenge_id);
          const cType = c.challenge_type || '';
          const isStreak = cType === 'streak' || cType === 'checkin_streak';
          const isMilestone = cType === 'milestone';

          let target: number;
          let current: number;

          if (isStreak) {
            target = c.streak_days || c.target_drops || 1;
            current = c.current_streak_days ?? 0;
          } else if (isMilestone) {
            target = c.milestone_threshold || c.target_drops || 1;
            current = c.current_drops ?? 0;
          } else {
            target = c.target_drops || 1;
            current = c.current_drops ?? 0;
          }

          const criteriaMet = target > 0 && current >= target;
          const completed = isEarned || criteriaMet || (c.is_completed ?? false);
          const percent = completed
            ? 100
            : target > 0 ? Math.min(Math.round((current / target) * 100), 99) : 0;

          return {
            id: c.challenge_id,
            user_id: targetUserId,
            global_achievement_id: null,
            gym_challenge_id: c.challenge_id,
            progress_data: {
              current,
              target,
              type: c.scoring_model || (isStreak ? 'streak_days' : 'total_drops'),
            },
            is_completed: completed,
            completed_at: c.completed_at ?? null,
            created_at: '',
            updated_at: '',
            progress_percent: percent,
          } as UserProgress;
        });

      // Merge global + gym challenge progress
      if (isMountedRef.current) setProgress([...progressItems, ...challengeItems]);
    } catch (err: any) {
      log.error('Error in loadProgress:', err);
      if (isMountedRef.current) setError(err.message);
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [targetUserId]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    loadProgress();
  }, [loadProgress]);

  // Helper function to get progress for a specific achievement/challenge
  const getProgress = useCallback(
    (achievementId?: string, challengeId?: string): UserProgress | null => {
      if (achievementId) {
        return progress.find((p) => p.global_achievement_id === achievementId) || null;
      }
      if (challengeId) {
        return progress.find((p) => p.gym_challenge_id === challengeId) || null;
      }
      return null;
    },
    [progress]
  );

  // Helper function to check if achievement/challenge is completed
  const isCompleted = useCallback(
    (achievementId?: string, challengeId?: string): boolean => {
      const prog = getProgress(achievementId, challengeId);
      return prog?.is_completed || false;
    },
    [getProgress]
  );

  return {
    progress,
    loading,
    error,
    refresh: loadProgress,
    getProgress,
    isCompleted,
  };
}
