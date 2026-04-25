/**
 * useUserBadges — loads the authenticated user's earned badges.
 *
 * AGENT NOTE: [2026-04-23] - mobile-coder
 *
 * This hook no longer holds its own Realtime subscription on user_badges.
 * Reason: it duplicated the channel already held by useBadgeNotifications,
 * doubling realtime load per active user. Trim migration:
 * 20260423210000_trim_realtime_hot_tables.sql (kept user_badges in the
 * publication because badge awards are rare and drive a UX-important toast).
 *
 * Refresh strategy:
 *  - Initial load on mount / userId change.
 *  - useFocusEffect reloads when the screen regains focus.
 *  - When a badge is awarded, useBadgeNotifications (the single subscriber)
 *    fires its onBadgeEarned callback which screens wire to call refresh().
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { log } from '@/lib/logger';
import { supabase } from '@/lib/supabase';
import { useSession } from './useSession';

export interface UserBadge {
  badge_id: string;
  badge_name: string;
  badge_description: string | null;
  badge_image_url: string | null;
  earned_at: string;
  badge_type: 'global' | 'gym';
  gym_name: string | null;
  gym_id: string | null;
  // Surfaced by get_user_badges() RPC after migration
  // 20260425220000_get_user_badges_include_tier_category.sql so member
  // profile screens can render Trophy-Room-style tier rings + category
  // groupings without an extra fetch. Both NULL for gym challenges.
  tier?: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | null;
  category?: 'sessions' | 'total_drops' | 'streak' | 'multi_gym' | 'distance' | 'special' | null;
}

export function useUserBadges(userId?: string) {
  const { session } = useSession();
  const [badges, setBadges] = useState<UserBadge[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  const targetUserId = userId || session?.user?.id;

  const loadBadges = useCallback(async () => {
    if (!targetUserId) {
      if (isMountedRef.current) {
        setBadges([]);
        setLoading(false);
      }
      return;
    }

    if (isMountedRef.current) setLoading(true);
    if (isMountedRef.current) setError(null);

    try {
      const { data, error: fetchError } = await supabase.rpc('get_user_badges', {
        p_user_id: targetUserId,
      });

      if (fetchError) {
        log.error('Error loading badges:', fetchError);
        if (isMountedRef.current) setError(fetchError.message);
        return;
      }

      if (isMountedRef.current) setBadges(data || []);
    } catch (err: any) {
      log.error('Error in loadBadges:', err);
      if (isMountedRef.current) setError(err.message);
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [targetUserId]);

  // Initial load + reload when user changes
  useEffect(() => {
    if (!targetUserId) return;
    loadBadges();
  }, [targetUserId, loadBadges]);

  // Reload when the hosting screen regains focus — covers the case where a
  // new badge is earned while away from this screen (useBadgeNotifications
  // handles the toast; focus-reload picks up the data here).
  useFocusEffect(
    useCallback(() => {
      if (targetUserId) {
        void loadBadges();
      }
    }, [targetUserId, loadBadges]),
  );

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return {
    badges,
    loading,
    error,
    refresh: loadBadges,
  };
}
