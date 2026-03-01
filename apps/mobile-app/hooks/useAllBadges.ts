import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useSession } from './useSession';
import { useGymStore } from '@/lib/stores/useGymStore';

export interface GlobalAchievement {
  id: string;
  code: string;
  name: string;
  description: string | null;
  badge_image_url: string;
  criteria: Record<string, any>;
  reward_drops: number;
  is_active: boolean;
  display_order: number;
}

export interface GymChallenge {
  id: string;
  gym_id: string;
  name: string;
  description: string | null;
  badge_image_url: string | null;
  criteria: Record<string, any>;
  reward_drops: number;
  is_active: boolean;
  start_date: string;
  end_date: string;
}

export interface BadgeWithProgress {
  id: string;
  name: string;
  description: string | null;
  badge_image_url: string | null;
  badge_type: 'global' | 'gym';
  gym_name: string | null;
  is_earned: boolean;
  earned_at: string | null;
  progress: number; // 0-100
  progress_data?: Record<string, any>;
}

export function useAllBadges() {
  const { session } = useSession();
  const { getActiveGymId } = useGymStore();
  const activeGymId = getActiveGymId();
  
  const [globalAchievements, setGlobalAchievements] = useState<GlobalAchievement[]>([]);
  const [gymChallenges, setGymChallenges] = useState<GymChallenge[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  const loadGlobalAchievements = useCallback(async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('global_achievements')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (fetchError) {
        console.error('Error loading global achievements:', fetchError);
        if (isMountedRef.current) setError(fetchError.message);
        return;
      }

      if (isMountedRef.current) setGlobalAchievements(data || []);
    } catch (err: any) {
      console.error('Error in loadGlobalAchievements:', err);
      if (isMountedRef.current) setError(err.message);
    }
  }, []);

  const loadGymChallenges = useCallback(async () => {
    if (!activeGymId) {
      if (isMountedRef.current) setGymChallenges([]);
      return;
    }

    try {
      const today = new Date().toISOString().split('T')[0];
      
      const { data, error: fetchError } = await supabase
        .from('gym_challenges')
        .select('*')
        .eq('gym_id', activeGymId)
        .eq('is_active', true)
        .lte('start_date', today)
        .gte('end_date', today)
        .order('created_at', { ascending: false });

      if (fetchError) {
        console.error('Error loading gym challenges:', fetchError);
        if (isMountedRef.current) setError(fetchError.message);
        return;
      }

      if (isMountedRef.current) setGymChallenges(data || []);
    } catch (err: any) {
      console.error('Error in loadGymChallenges:', err);
      if (isMountedRef.current) setError(err.message);
    }
  }, [activeGymId]);

  const loadAll = useCallback(async () => {
    if (!session?.user) return;

    if (isMountedRef.current) setLoading(true);
    if (isMountedRef.current) setError(null);

    await Promise.all([loadGlobalAchievements(), loadGymChallenges()]);

    if (isMountedRef.current) setLoading(false);
  }, [session?.user, loadGlobalAchievements, loadGymChallenges]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return {
    globalAchievements,
    gymChallenges,
    loading,
    error,
    refresh: loadAll,
  };
}
