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
    const supabase = await createClient();
    
    console.log('[getGymAnalytics] Calling RPC with gymId:', gymId);
    const { data, error } = await supabase.rpc('get_gym_analytics', {
      p_gym_id: gymId,
    });

    console.log('[getGymAnalytics] RPC response:', { data, error, dataType: typeof data });

    if (error) {
      logger.error('Error fetching gym analytics', { error, gymId, errorMessage: error.message });
      console.error('[getGymAnalytics] RPC error:', error);
      return null;
    }

    if (!data) {
      logger.warn('No data returned from get_gym_analytics RPC', { gymId });
      console.warn('[getGymAnalytics] No data returned for gym:', gymId);
      return null;
    }

    // Parse JSON if it's a string
    let analytics: GymAnalytics;
    if (typeof data === 'string') {
      try {
        analytics = JSON.parse(data) as GymAnalytics;
        console.log('[getGymAnalytics] Parsed JSON string:', analytics);
      } catch (parseError) {
        console.error('[getGymAnalytics] Failed to parse JSON string:', parseError, 'Raw data:', data);
        return null;
      }
    } else if (typeof data === 'object' && data !== null) {
      // Check if it's already the expected structure
      analytics = data as GymAnalytics;
      console.log('[getGymAnalytics] Using data as object:', analytics);
    } else {
      console.error('[getGymAnalytics] Unexpected data type:', typeof data, data);
      return null;
    }

    console.log('[getGymAnalytics] Successfully fetched analytics:', {
      gymId,
      rawData: data,
      parsedAnalytics: analytics,
      machineUsageCount: analytics.machine_usage?.length || 0,
      machineUsage: analytics.machine_usage,
      hourlyTrafficCount: analytics.hourly_traffic?.length || 0,
      hourlyTraffic: analytics.hourly_traffic,
      economyStats: analytics.economy_stats,
    });

    // Ensure arrays exist even if empty
    if (!analytics.machine_usage) {
      analytics.machine_usage = [];
    }
    if (!analytics.hourly_traffic) {
      analytics.hourly_traffic = [];
    }
    if (!analytics.economy_stats) {
      analytics.economy_stats = {
        drops_issued: 0,
        drops_redeemed: 0,
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear(),
      };
    }

    return analytics;
  } catch (error) {
    logger.error('Exception fetching gym analytics', { error, gymId });
    console.error('[getGymAnalytics] Exception:', error);
    return null;
  }
}
