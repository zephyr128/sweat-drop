import { useState, useEffect, useCallback, useRef } from 'react';
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
}

export function useUserBadges(userId?: string) {
  const { session } = useSession();
  const [badges, setBadges] = useState<UserBadge[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);
  const channelRef = useRef<any>(null);

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
        console.error('Error loading badges:', fetchError);
        if (isMountedRef.current) setError(fetchError.message);
        return;
      }

      if (isMountedRef.current) setBadges(data || []);
    } catch (err: any) {
      console.error('Error in loadBadges:', err);
      if (isMountedRef.current) setError(err.message);
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [targetUserId]);

  // Setup real-time subscription for new badges
  useEffect(() => {
    if (!targetUserId) return;

    // Load initial badges
    loadBadges();

    // Setup real-time subscription
    const channel = supabase
      .channel(`user_badges_${targetUserId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'user_badges',
          filter: `user_id=eq.${targetUserId}`,
        },
        async (payload) => {
          console.log('New badge earned:', payload.new);
          
          // Reload badges to get full badge data (name, image, etc.)
          await loadBadges();
          
          // Trigger callback for notification (if provided)
          // This will be handled by the notification system
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
  }, [targetUserId, loadBadges]);

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
