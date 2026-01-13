'use server';

import { createClient } from '@/lib/supabase-server';
import { logger } from '@/lib/utils/logger';

export interface GymAnalytics {
  machine_usage: Array<{
    machine_id: string;
    machine_name: string;
    machine_type: 'treadmill' | 'bike';
    scan_count: number;
  }>;
  hourly_traffic: Array<{
    hour: number;
    scan_count: number;
  }>;
  economy_stats: {
    drops_issued: number;
    drops_redeemed: number;
    month: number;
    year: number;
  };
}

export async function getGymAnalytics(gymId: string): Promise<GymAnalytics | null> {
  try {
    const supabase = createClient();
    
    const { data, error } = await supabase.rpc('get_gym_analytics', {
      p_gym_id: gymId,
    });

    if (error) {
      logger.error('Error fetching gym analytics', { error, gymId });
      return null;
    }

    return data as GymAnalytics;
  } catch (error) {
    logger.error('Exception fetching gym analytics', { error, gymId });
    return null;
  }
}
