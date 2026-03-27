'use server';

import { createClient } from '@/lib/supabase-server';
import { getAdminClient } from '@/lib/utils/supabase-admin';
import { logger } from '@/lib/utils/logger';

export interface TopPerformer {
  id: string;
  username: string;
  avatar_url: string | null;
  earnedDrops: number;
}

export async function getTopPerformers(gymId: string): Promise<TopPerformer[]> {
  try {
    const supabase = await createClient();
    const adminClient = getAdminClient();
    const clientToUse = adminClient || supabase;

    // Get members who are regular users (not staff/owner)
    const { data: memberships, error: memError } = await supabase
      .from('gym_memberships')
      .select('user_id')
      .eq('gym_id', gymId);

    if (memError) {
      logger.error('Error fetching gym memberships for top performers', { error: memError, gymId });
      throw memError;
    }

    if (!memberships || memberships.length === 0) return [];

    const userIds = memberships.map((m) => m.user_id);

    // Filter to only regular users (exclude staff roles)
    const { data: profiles, error: profileError } = await clientToUse
      .from('profiles')
      .select('id, username, avatar_url, role')
      .in('id', userIds)
      .eq('role', 'user');

    if (profileError) {
      logger.error('Error fetching profiles for top performers', { error: profileError, gymId });
      throw profileError;
    }

    if (!profiles || profiles.length === 0) return [];

    const regularUserIds = profiles.map((p) => p.id);

    // Sum earned drops from sessions for these users at this gym
    const { data: sessions, error: sessionError } = await supabase
      .from('sessions')
      .select('user_id, drops_earned')
      .eq('gym_id', gymId)
      .in('user_id', regularUserIds)
      .not('drops_earned', 'is', null);

    if (sessionError) {
      logger.error('Error fetching sessions for top performers', { error: sessionError, gymId });
      throw sessionError;
    }

    // Aggregate drops per user
    const dropsByUser: Record<string, number> = {};
    (sessions || []).forEach((s) => {
      const uid = s.user_id;
      dropsByUser[uid] = (dropsByUser[uid] || 0) + (Number(s.drops_earned) || 0);
    });

    const combined = profiles
      .map((profile) => {
        const rawAv = profile.avatar_url;
        return {
          id: profile.id,
          username: profile.username,
          avatar_url: typeof rawAv === 'string' && rawAv.trim() ? rawAv.trim() : null,
          earnedDrops: dropsByUser[profile.id] || 0,
        };
      })
      .sort((a, b) => b.earnedDrops - a.earnedDrops)
      .slice(0, 3);

    return combined;
  } catch (error) {
    logger.error('Exception fetching top performers', { error, gymId });
    return [];
  }
}
