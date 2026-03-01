import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useSession } from './useSession';
import { UserBadge } from './useUserBadges';

interface BadgeNotificationCallback {
  onBadgeEarned?: (badge: UserBadge) => void;
}

export function useBadgeNotifications(callbacks: BadgeNotificationCallback = {}) {
  const { session } = useSession();
  const channelRef = useRef<any>(null);
  const [newBadge, setNewBadge] = useState<UserBadge | null>(null);
  const callbacksRef = useRef(callbacks);

  // Keep callbacks ref updated
  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  useEffect(() => {
    if (!session?.user?.id) return;

    // Setup real-time subscription for user_badges INSERT (when badge is awarded)
    const channel = supabase
      .channel(`badge_notifications_${session.user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'user_badges',
          filter: `user_id=eq.${session.user.id}`,
        },
        async (payload) => {
          console.log('New badge earned!', payload.new);

          const newRecord = payload.new as any;

          // Fetch the badge details using RPC function
          const { data: badgeData, error } = await supabase.rpc('get_user_badges', {
            p_user_id: session.user.id,
          });

          if (error) {
            console.error('Error fetching badge details:', error);
            return;
          }

          // Find the newly earned badge
          const earnedBadge = badgeData?.find(
            (b: UserBadge) =>
              (newRecord.global_achievement_id && b.badge_type === 'global') ||
              (newRecord.gym_challenge_id && b.badge_type === 'gym')
          );

          if (earnedBadge) {
            setNewBadge(earnedBadge);
            callbacksRef.current.onBadgeEarned?.(earnedBadge);
          }
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
  }, [session?.user?.id]);

  const clearNewBadge = useCallback(() => {
    setNewBadge(null);
  }, []);

  return {
    newBadge,
    clearNewBadge,
  };
}
