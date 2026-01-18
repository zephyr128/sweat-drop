'use server';

import { createClient } from '@/lib/supabase-server';
import { getAdminClient } from '@/lib/utils/supabase-admin';
import { logger } from '@/lib/utils/logger';

export interface LiveFeedItem {
  id: string;
  type: 'scan' | 'redemption';
  user_name: string;
  description: string;
  timestamp: string;
  drops?: number;
}

export async function getLiveFeed(gymId: string): Promise<LiveFeedItem[]> {
  try {
    const supabase = await createClient();
    // Use service role client to fetch profiles (bypasses RLS)
    let clientToUse = supabase;
    try {
      clientToUse = getAdminClient();
    } catch (error) {
      // Fallback to regular client if admin client unavailable
      logger.warn('Admin client unavailable, using regular client', { error });
    }

    // Fetch recent sessions (scans) - include both active and completed
    const { data: sessions, error: sessionsError } = await supabase
      .from('sessions')
      .select('id, user_id, drops_earned, created_at, started_at, is_active')
      .eq('gym_id', gymId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (sessionsError) {
      logger.error('Error fetching sessions for live feed', { error: sessionsError, gymId });
      throw sessionsError;
    }

    // Fetch recent redemptions
    const { data: redemptions, error: redemptionsError } = await supabase
      .from('redemptions')
      .select('id, user_id, drops_spent, created_at, reward_id')
      .eq('gym_id', gymId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (redemptionsError) {
      logger.error('Error fetching redemptions for live feed', { error: redemptionsError, gymId });
      throw redemptionsError;
    }

    // Get user profiles using service role client (bypasses RLS)
    const userIds = [
      ...(sessions?.map((s) => s.user_id) || []),
      ...(redemptions?.map((r) => r.user_id) || []),
    ].filter((id, index, self) => self.indexOf(id) === index);

    const { data: profiles } = userIds.length > 0
      ? await clientToUse
          .from('profiles')
          .select('id, username')
          .in('id', userIds)
      : { data: null };

    // Get reward names
    const rewardIds = redemptions?.map((r) => r.reward_id).filter(Boolean) || [];
    const { data: rewards } = rewardIds.length > 0
      ? await supabase
          .from('rewards')
          .select('id, name')
          .in('id', rewardIds)
      : { data: null };

    // Combine and format
    const items: LiveFeedItem[] = [];

    sessions?.forEach((session) => {
      const profile = profiles?.find((p) => p.id === session.user_id);
      const isActive = session.is_active;
      items.push({
        id: session.id,
        type: 'scan',
        user_name: profile?.username || 'Unknown',
        description: isActive ? 'Started workout session' : 'Completed workout session',
        timestamp: session.started_at || session.created_at,
        drops: session.drops_earned || 0,
      });
    });

    redemptions?.forEach((redemption) => {
      const profile = profiles?.find((p) => p.id === redemption.user_id);
      const reward = rewards?.find((r) => r.id === redemption.reward_id);
      items.push({
        id: redemption.id,
        type: 'redemption',
        user_name: profile?.username || 'Unknown',
        description: `Redeemed ${reward?.name || 'reward'}`,
        timestamp: redemption.created_at,
        drops: redemption.drops_spent,
      });
    });

    // Sort by timestamp (most recent first)
    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return items.slice(0, 10);
  } catch (error) {
    logger.error('Exception fetching live feed', { error, gymId });
    return [];
  }
}
