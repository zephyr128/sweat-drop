'use server';

import { createClient } from '@/lib/supabase-server';
import { getAdminClient } from '@/lib/utils/supabase-admin';
import { logger } from '@/lib/utils/logger';

export interface TopPerformer {
  id: string;
  username: string;
  avatar_url: string | null;
  total_drops: number;
}

export async function getTopPerformers(gymId: string): Promise<TopPerformer[]> {
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

    // Get top 3 users by local_drops_balance for this gym
    const { data: memberships, error } = await supabase
      .from('gym_memberships')
      .select('user_id, local_drops_balance')
      .eq('gym_id', gymId)
      .order('local_drops_balance', { ascending: false })
      .limit(3);

    if (error) {
      logger.error('Error fetching gym memberships for top performers', { error, gymId });
      throw error;
    }

    if (!memberships || memberships.length === 0) {
      return [];
    }

    // Get user profiles using service role client (bypasses RLS)
    const userIds = memberships.map((m) => m.user_id);
    const { data: profiles, error: profileError } = await clientToUse
      .from('profiles')
      .select('id, username, avatar_url, total_drops')
      .in('id', userIds);

    if (profileError) {
      logger.error('Error fetching profiles for top performers', { error: profileError, gymId });
      throw profileError;
    }

    // Combine data and sort by local_drops_balance
    const combined = memberships
      .map((membership) => {
        const profile = profiles?.find((p) => p.id === membership.user_id);
        if (!profile) return null;
        return {
          id: profile.id,
          username: profile.username,
          avatar_url: profile.avatar_url,
          total_drops: membership.local_drops_balance || 0,
        };
      })
      .filter((p): p is TopPerformer => p !== null)
      .sort((a, b) => b.total_drops - a.total_drops);

    return combined;
  } catch (error) {
    logger.error('Exception fetching top performers', { error, gymId });
    return [];
  }
}
