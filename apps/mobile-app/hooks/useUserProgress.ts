import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useSession } from './useSession';

export interface UserProgress {
  id: string;
  user_id: string;
  global_achievement_id: string | null;
  gym_challenge_id: string | null;
  progress_data: Record<string, any>;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useUserProgress(userId?: string) {
  const { session } = useSession();
  const [progress, setProgress] = useState<UserProgress[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);
  const channelRef = useRef<any>(null);

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
      const { data, error: fetchError } = await supabase
        .from('user_progress')
        .select('*')
        .eq('user_id', targetUserId);

      if (fetchError) {
        console.error('Error loading user progress:', fetchError);
        if (isMountedRef.current) setError(fetchError.message);
        return;
      }

      if (isMountedRef.current) setProgress(data || []);
    } catch (err: any) {
      console.error('Error in loadProgress:', err);
      if (isMountedRef.current) setError(err.message);
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [targetUserId]);

  // Setup real-time subscription for progress updates
  useEffect(() => {
    if (!targetUserId) return;

    // Load initial progress
    loadProgress();

    // Setup real-time subscription
    const channel = supabase
      .channel(`user_progress_${targetUserId}`)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all changes (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'user_progress',
          filter: `user_id=eq.${targetUserId}`,
        },
        async (payload) => {
          console.log('User progress changed:', payload);
          
          // Reload progress to get updated data
          await loadProgress();
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [targetUserId, loadProgress]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

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
