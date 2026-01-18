import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useSession } from './useSession';

export interface ChallengeProgress {
  challenge_id: string;
  challenge_name: string;
  description: string | null;
  frequency: string;
  required_minutes: number;
  machine_type: string;
  drops_bounty: number;
  current_minutes: number;
  is_completed: boolean;
  progress_percentage: number;
}

export function useChallengeProgress(gymId: string | null, machineType: string | null) {
  const { session } = useSession();
  const [challenges, setChallenges] = useState<ChallengeProgress[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const loadChallenges = useCallback(async () => {
    if (!session?.user?.id || !gymId) {
      if (isMountedRef.current) setChallenges([]);
      return;
    }

    if (isMountedRef.current) setLoading(true);
    if (isMountedRef.current) setError(null);

    try {
      const { data, error: rpcError } = await supabase.rpc('get_active_challenges_for_user', {
        p_user_id: session.user.id,
        p_gym_id: gymId,
        p_machine_type: machineType || null,
      });

      if (rpcError) {
        console.error('Error loading challenges:', rpcError);
        if (isMountedRef.current) setError(rpcError.message);
        return;
      }

      if (isMountedRef.current) setChallenges(data || []);
    } catch (err: any) {
      console.error('Error in loadChallenges:', err);
      if (isMountedRef.current) setError(err.message);
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [session?.user?.id, gymId, machineType]);

  const updateProgress = useCallback(
    async (minutes: number) => {
      if (!session?.user?.id || !gymId || !machineType || minutes <= 0) {
        console.log('[useChallengeProgress] Missing required data for update:', {
          hasUserId: !!session?.user?.id,
          hasGymId: !!gymId,
          hasMachineType: !!machineType,
          minutes,
        });
        return { success: false, error: 'Missing required data' };
      }

      console.log('[useChallengeProgress] Updating challenge progress:', {
        userId: session.user.id,
        gymId,
        machineType,
        minutes,
      });

      try {
        const { data, error: rpcError } = await supabase.rpc('update_challenge_progress_minutes', {
          p_user_id: session.user.id,
          p_gym_id: gymId,
          p_minutes: minutes,
          p_machine_type: machineType,
        });

        console.log('[useChallengeProgress] RPC result:', { data, error: rpcError });

        if (rpcError) {
          console.error('[useChallengeProgress] Error updating challenge progress:', rpcError);
          return { success: false, error: rpcError.message };
        }

        // Reload challenges to get updated progress
        await loadChallenges();

        // Check if any challenges were completed
        const completedChallenges = data?.filter((c: any) => c.completed_now) || [];
        const totalDropsAwarded = completedChallenges.reduce(
          (sum: number, c: any) => sum + (c.drops_awarded || 0),
          0
        );

        console.log('[useChallengeProgress] Update complete:', {
          completedChallenges: completedChallenges.length,
          totalDropsAwarded,
        });

        return {
          success: true,
          completedChallenges,
          totalDropsAwarded,
        };
      } catch (err: any) {
        console.error('[useChallengeProgress] Error in updateProgress:', err);
        return { success: false, error: err.message };
      }
    },
    [session?.user?.id, gymId, machineType, loadChallenges]
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
