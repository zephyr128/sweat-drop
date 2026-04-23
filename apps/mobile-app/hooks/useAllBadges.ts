import { useState, useEffect, useCallback, useRef } from 'react';
import { log } from '@/lib/logger';
import { supabase } from '@/lib/supabase';
import { useSession } from './useSession';
import { useGymStore } from '@/lib/stores/useGymStore';

export type AchievementCategory = 'sessions' | 'total_drops' | 'streak' | 'multi_gym' | 'distance' | 'special';
export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';

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
  category: AchievementCategory | null;
  tier: AchievementTier | null;
}

export interface GymChallenge {
  id: string;
  gym_id: string;
  gym_name: string | null;
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
  gym_id: string | null;
  is_earned: boolean;
  earned_at: string | null;
  progress: number; // 0-100
  progress_data?: Record<string, any>;
  category?: AchievementCategory | null;
  tier?: AchievementTier | null;
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
        log.error('Error loading global achievements:', fetchError);
        if (isMountedRef.current) setError(fetchError.message);
        return;
      }

      if (isMountedRef.current) setGlobalAchievements(data || []);
    } catch (err: any) {
      log.error('Error in loadGlobalAchievements:', err);
      if (isMountedRef.current) setError(err.message);
    }
  }, []);

  const loadGymChallenges = useCallback(async () => {
    if (!activeGymId) {
      if (isMountedRef.current) setGymChallenges([]);
      return;
    }

    try {
      // Only fetch challenges for the active (home) gym
      // No date filter — show all challenges including expired for trophy context
      const { data, error: fetchError } = await supabase
        .from('gym_challenges')
        .select('*, gyms:gym_id(name)')
        .eq('gym_id', activeGymId)
        .order('created_at', { ascending: false });

      if (fetchError) {
        log.error('Error loading gym challenges:', fetchError);
        if (isMountedRef.current) setError(fetchError.message);
        return;
      }

      // Map gym name from the joined gyms relation
      const challenges: GymChallenge[] = (data || []).map((c: any) => ({
        id: c.id,
        gym_id: c.gym_id,
        gym_name: c.gyms?.name || null,
        name: c.name,
        description: c.description,
        badge_image_url: c.badge_image_url,
        criteria: c.criteria,
        reward_drops: c.reward_drops,
        is_active: c.is_active,
        start_date: c.start_date,
        end_date: c.end_date,
      }));

      if (isMountedRef.current) setGymChallenges(challenges);
    } catch (err: any) {
      log.error('Error in loadGymChallenges:', err);
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
