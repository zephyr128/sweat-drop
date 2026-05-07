'use server';

import { createClient } from '@/lib/supabase-server';
import { logger } from '@/lib/utils/logger';

export interface GymAnalytics {
  machine_usage: Array<{
    machine_id: string;
    machine_name: string;
    machine_type: string;
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

export async function getGymAnalytics(gymId: string, timeFilter: 'today' | '7days' | '30days' = '30days'): Promise<GymAnalytics | null> {
  try {
    const supabase = await createClient();
    
    // Validate gymId
    if (!gymId || typeof gymId !== 'string') {
      logger.error('Invalid gymId provided to getGymAnalytics', { gymId });
      console.error('[getGymAnalytics] Invalid gymId:', gymId);
      return null;
    }
    
    console.log('[getGymAnalytics] Calling RPC with gymId:', gymId, 'timeFilter:', timeFilter);
    const { data, error } = await supabase.rpc('get_gym_analytics', {
      p_gym_id: gymId,
      p_time_filter: timeFilter,
    } as any);

    console.log('[getGymAnalytics] RPC response:', { data, error, dataType: typeof data, isArray: Array.isArray(data) });

    if (error) {
      logger.error('Error fetching gym analytics', { error, gymId, errorMessage: error.message, errorCode: error.code, errorDetails: error.details });
      console.error('[getGymAnalytics] RPC error:', error);
      
      // If function doesn't exist, return empty structure instead of null
      if (error.code === '42883' || error.message?.includes('does not exist')) {
        console.warn('[getGymAnalytics] RPC function does not exist, returning empty analytics');
        return {
          machine_usage: [],
          hourly_traffic: Array.from({ length: 24 }, (_, i) => ({ hour: i, scan_count: 0 })),
          economy_stats: {
            drops_issued: 0,
            drops_redeemed: 0,
            month: new Date().getMonth() + 1,
            year: new Date().getFullYear(),
          },
        };
      }
      
      return null;
    }

    if (!data) {
      logger.warn('No data returned from get_gym_analytics RPC', { gymId });
      console.warn('[getGymAnalytics] No data returned for gym:', gymId);
      // Return empty analytics structure instead of null
      return {
        machine_usage: [],
        hourly_traffic: Array.from({ length: 24 }, (_, i) => ({ hour: i, scan_count: 0 })),
        economy_stats: {
          drops_issued: 0,
          drops_redeemed: 0,
          month: new Date().getMonth() + 1,
          year: new Date().getFullYear(),
        },
      };
    }

    // Handle different response formats
    let analytics: GymAnalytics;
    
    // If data is an array (Supabase sometimes wraps single JSON returns in arrays)
    if (Array.isArray(data)) {
      if (data.length === 0) {
        console.warn('[getGymAnalytics] Empty array returned');
        return null;
      }
      // Take first element if it's an array
      const firstItem = data[0];
      if (typeof firstItem === 'string') {
        try {
          analytics = JSON.parse(firstItem) as GymAnalytics;
          console.log('[getGymAnalytics] Parsed JSON string from array:', analytics);
        } catch (parseError) {
          console.error('[getGymAnalytics] Failed to parse JSON string from array:', parseError, 'Raw data:', firstItem);
          return null;
        }
      } else if (typeof firstItem === 'object' && firstItem !== null) {
        analytics = firstItem as GymAnalytics;
        console.log('[getGymAnalytics] Using first array element as object:', analytics);
      } else {
        console.error('[getGymAnalytics] Unexpected array element type:', typeof firstItem, firstItem);
        return null;
      }
    } else if (typeof data === 'string') {
      // Parse JSON if it's a string
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
    if (!analytics.machine_usage || !Array.isArray(analytics.machine_usage)) {
      analytics.machine_usage = [];
    }
    if (!analytics.hourly_traffic || !Array.isArray(analytics.hourly_traffic)) {
      // Ensure all 24 hours are represented
      analytics.hourly_traffic = Array.from({ length: 24 }, (_, i) => ({ hour: i, scan_count: 0 }));
    }
    if (!analytics.economy_stats || typeof analytics.economy_stats !== 'object') {
      analytics.economy_stats = {
        drops_issued: 0,
        drops_redeemed: 0,
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear(),
      };
    }
    
    // Ensure economy_stats has all required fields
    if (typeof analytics.economy_stats.drops_issued !== 'number') {
      analytics.economy_stats.drops_issued = 0;
    }
    if (typeof analytics.economy_stats.drops_redeemed !== 'number') {
      analytics.economy_stats.drops_redeemed = 0;
    }

    return analytics;
  } catch (error) {
    logger.error('Exception fetching gym analytics', { error, gymId });
    console.error('[getGymAnalytics] Exception:', error);
    return null;
  }
}
