import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useSession } from './useSession';

export interface ChallengeProgress {
  challenge_id: string;
  challenge_name: string;
  description: string | null;
  challenge_type: 'daily' | 'weekly' | 'monthly' | 'streak' | 'milestone';
  target_drops: number;
  milestone_threshold: number | null; // Only for milestone challenges
  reward_drops: number;
  current_drops: number;
  current_streak_days: number; // Only for streak challenges
  is_completed: boolean;
  progress_percentage: number;
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
      // Query challenges directly with new schema (challenge_type, target_drops, current_drops)
      const today = new Date().toISOString().split('T')[0];
      
      const { data: challengesData, error: challengesError } = await supabase
        .from('gym_challenges')
        .select(`
          id,
          name,
          description,
          challenge_type,
          target_drops,
          milestone_threshold,
          reward_drops,
          streak_days,
          start_date,
          end_date
        `)
        .eq('gym_id', gymId)
        .eq('is_active', true)
        .lte('start_date', today)
        .gte('end_date', today);

      if (challengesError) {
        console.error('Error loading challenges:', challengesError);
        if (isMountedRef.current) setError(challengesError.message);
        return;
      }

      if (!challengesData || challengesData.length === 0) {
        if (isMountedRef.current) setChallenges([]);
        return;
      }

      // Get challenge progress for user
      const challengeIds = challengesData.map((c) => c.id);
      const { data: progressData, error: progressError } = await supabase
        .from('challenge_progress')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('gym_id', gymId)
        .in('challenge_id', challengeIds);

      if (progressError) {
        console.error('Error loading challenge progress:', progressError);
        if (isMountedRef.current) setError(progressError.message);
        return;
      }

      // Merge challenges with progress
      const challengesWithProgress: ChallengeProgress[] = challengesData.map((challenge) => {
        const progress = progressData?.find((p) => p.challenge_id === challenge.id);
        
        // Calculate target based on challenge type
        let target = 0;
        if (challenge.challenge_type === 'milestone') {
          target = challenge.milestone_threshold || 0;
        } else if (challenge.challenge_type === 'streak') {
          // For streak, target is streak_days from challenge
          target = challenge.streak_days || challenge.target_drops || 0;
        } else {
          target = challenge.target_drops || 0;
        }
        
        // Calculate current progress based on challenge type
        let current = 0;
        if (challenge.challenge_type === 'streak') {
          current = progress?.current_streak_days || 0;
        } else if (challenge.challenge_type === 'milestone') {
          // For milestone, we need to query gym_memberships.local_drops_balance
          // This will be handled separately below
          current = progress?.current_drops || 0; // Fallback for now
        } else {
          current = progress?.current_drops || 0;
        }

        // Calculate progress percentage
        const progressPercent = target > 0 
          ? Math.min((current / target) * 100, 100)
          : 0;

        return {
          challenge_id: challenge.id,
          challenge_name: challenge.name,
          description: challenge.description,
          challenge_type: challenge.challenge_type as 'daily' | 'weekly' | 'monthly' | 'streak' | 'milestone',
          target_drops: target,
          milestone_threshold: challenge.milestone_threshold,
          reward_drops: challenge.reward_drops,
          current_drops: current,
          current_streak_days: progress?.current_streak_days || 0,
          is_completed: progress?.is_completed || false,
          progress_percentage: progressPercent,
        };
      });

      // For milestone challenges, fetch actual local_drops_balance
      const milestoneChallenges = challengesWithProgress.filter((c) => c.challenge_type === 'milestone');
      if (milestoneChallenges.length > 0) {
        const { data: membershipData } = await supabase
          .from('gym_memberships')
          .select('local_drops_balance')
          .eq('user_id', session.user.id)
          .eq('gym_id', gymId)
          .single();

        if (membershipData) {
          milestoneChallenges.forEach((challenge) => {
            challenge.current_drops = membershipData.local_drops_balance || 0;
            challenge.progress_percentage = challenge.target_drops > 0
              ? Math.min((challenge.current_drops / challenge.target_drops) * 100, 100)
              : 0;
            // If actual balance >= target, mark as completed on client side
            if (!challenge.is_completed && challenge.target_drops > 0 && challenge.current_drops >= challenge.target_drops) {
              challenge.is_completed = true;
            }
          });
        }
      }

      if (isMountedRef.current) {
        setChallenges(challengesWithProgress);
        hasLoadedRef.current = true;
      }
    } catch (err: any) {
      console.error('Error in loadChallenges:', err);
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
      console.log('[useChallengeProgress] updateProgress called but challenge progress is now automatic via award_drops()');
      
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

  useEffect(() => {
    loadChallenges();
  }, [loadChallenges]);

  return {
    challenges,
    loading,
    error,
    refresh: loadChallenges,
    updateProgress,
  };
}
