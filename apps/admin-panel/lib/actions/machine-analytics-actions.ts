'use server';

import { getAdminClient } from '@/lib/utils/supabase-admin';

export interface MachineAnalyticsData {
  kpi: {
    total_sessions: number;
    total_drops: number;
    avg_duration_min: number;
    unique_users: number;
    avg_sessions_per_day: number;
  };
  hourly_heatmap: Array<{
    dow: number;
    hour: number;
    sessions: number;
    drops: number;
    avg_min: number;
  }>;
  machine_stats: Array<{
    id: string;
    name: string;
    type: string;
    zone: string | null;
    is_active: boolean;
    is_busy: boolean;
    is_under_maintenance: boolean;
    sessions: number;
    unique_users: number;
    total_drops: number;
    avg_duration_min: number;
    total_hours: number;
    utilization_pct: number;
    sparkline: number[];
  }>;
  zone_stats: Array<{
    zone: string;
    machine_count: number;
    sessions: number;
    total_drops: number;
    avg_duration_min: number;
  }>;
  type_stats: Array<{
    type: string;
    machine_count: number;
    sessions: number;
    total_drops: number;
    avg_duration_min: number;
  }>;
  peak_hour: { hour: number; sessions: number } | null;
  busiest_machine: { name: string; type: string; sessions: number } | null;
}

export async function getMachineAnalytics(
  gymId: string,
  days: number = 30
): Promise<{ success: boolean; data?: MachineAnalyticsData; error?: string }> {
  const supabase = getAdminClient();
  if (!supabase) return { success: false, error: 'Admin client not available' };

  // RPC created by DBA agent migration — cast needed until types are regenerated
  const { data, error } = await (supabase.rpc as any)('get_machine_analytics_dashboard', {
    p_gym_id: gymId,
    p_days: days,
  });

  if (error) return { success: false, error: error.message };
  return { success: true, data: data as MachineAnalyticsData };
}

export interface LiveMachineSummary {
  total_machines: number;
  active_now: number;
  available: number;
  maintenance: number;
  inactive: number;
}

export interface LiveMachineUser {
  id: string;
  username: string;
  avatar_url: string | null;
  full_name: string | null;
}

export interface LiveMachineSession {
  id: string;
  started_at: string;
  duration_seconds: number;
  calories: number;
  drops_earned: number;
  elapsed_seconds: number;
}

export interface LiveMachine {
  id: string;
  name: string;
  type: string;
  zone: string | null;
  is_active: boolean;
  is_busy: boolean;
  is_under_maintenance: boolean;
  last_heartbeat: string | null;
  last_rpm: number | null;
  current_user: LiveMachineUser | null;
  active_session: LiveMachineSession | null;
}

export interface LiveMachineData {
  timestamp: string;
  summary: LiveMachineSummary;
  machines: LiveMachine[];
}

export async function getLiveMachineStatus(
  gymId: string
): Promise<{ success: boolean; data?: LiveMachineData; error?: string }> {
  const supabase = getAdminClient();
  if (!supabase) return { success: false, error: 'Admin client not available' };

  const { data, error } = await (supabase.rpc as any)('get_live_machine_status', {
    p_gym_id: gymId,
  });

  if (error) return { success: false, error: error.message };
  return { success: true, data: data as LiveMachineData };
}
