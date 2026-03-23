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

export interface DailyCalendarCell {
  date: string;
  sessions: number;
  drops: number;
  unique_users: number;
}

export async function getDailyCalendarData(
  gymId: string,
  days: number = 30
): Promise<{ success: boolean; data?: DailyCalendarCell[]; error?: string }> {
  const supabase = getAdminClient();
  if (!supabase) return { success: false, error: 'Admin client not available' };

  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await (supabase
    .from('sessions') as any)
    .select('started_at, drops_earned, user_id')
    .eq('gym_id', gymId)
    .gte('started_at', since.toISOString());

  if (error) return { success: false, error: error.message };

  const rows = (data || []) as Array<{ started_at: string; drops_earned: number | null; user_id: string | null }>;
  const byDate: Record<string, { sessions: number; drops: number; users: Set<string> }> = {};

  for (const row of rows) {
    const date = row.started_at.slice(0, 10);
    if (!byDate[date]) byDate[date] = { sessions: 0, drops: 0, users: new Set() };
    byDate[date].sessions++;
    byDate[date].drops += Number(row.drops_earned) || 0;
    if (row.user_id) byDate[date].users.add(row.user_id);
  }

  const result: DailyCalendarCell[] = Object.entries(byDate)
    .map(([date, v]) => ({ date, sessions: v.sessions, drops: v.drops, unique_users: v.users.size }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return { success: true, data: result };
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
  qr_uuid: string | null;
  unique_qr_code: string | null;
  sensor_id: string | null;
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
