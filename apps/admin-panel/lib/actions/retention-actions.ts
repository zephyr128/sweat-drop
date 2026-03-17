'use server';

import { getAdminClient } from '@/lib/utils/supabase-admin';
import { getCurrentProfile } from '../auth';

export interface RetentionKPIs {
  activeMembers7d: number;
  totalMembers: number;
  visitsThisMonth: number;
  visitsLastMonth: number;
  avgSessionsPerMember: number;
  churnRate: number;
  atRiskCount: number;
}

export interface DailyVisitors {
  date: string;
  unique_visitors: number;
}

export interface AtRiskMember {
  id: string;
  username: string;
  email: string;
  avatar_url: string | null;
  total_drops: number;
  streak_days: number;
  last_visit_date: string | null;
  days_inactive: number;
  status: 'active' | 'at_risk' | 'churned';
}

export async function getRetentionData(gymId: string) {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return { success: false, error: 'Not authenticated' };
    }

    // Only gym_owner, gym_admin, superadmin can view retention
    const allowedRoles = ['superadmin', 'gym_owner', 'gym_admin'];
    if (!allowedRoles.includes(profile.role)) {
      return { success: false, error: 'Unauthorized' };
    }

    const supabase = getAdminClient();
    if (!supabase) {
      return { success: false, error: 'Admin client not available' };
    }

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const lastOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString();

    // Fetch all data in parallel
    const [
      totalMembersResult,
      activeMembers7dResult,
      visitsThisMonthResult,
      visitsLastMonthResult,
      dailyVisitorsResult,
      membersWithProfilesResult,
    ] = await Promise.all([
      // Total members
      supabase
        .from('gym_memberships')
        .select('*', { count: 'exact', head: true })
        .eq('gym_id', gymId),

      // Active members (had session in last 7 days)
      supabase
        .from('sessions')
        .select('user_id')
        .eq('gym_id', gymId)
        .gte('created_at', sevenDaysAgo),

      // Sessions this month
      supabase
        .from('sessions')
        .select('user_id')
        .eq('gym_id', gymId)
        .gte('created_at', firstOfThisMonth),

      // Sessions last month
      supabase
        .from('sessions')
        .select('user_id')
        .eq('gym_id', gymId)
        .gte('created_at', firstOfLastMonth)
        .lte('created_at', lastOfLastMonth),

      // Daily unique visitors over 30 days (using sessions)
      supabase
        .from('sessions')
        .select('user_id, created_at')
        .eq('gym_id', gymId)
        .gte('created_at', thirtyDaysAgo)
        .order('created_at', { ascending: true }),

      // Members with their profile data for at-risk list
      supabase
        .from('gym_memberships')
        .select(`
          user_id,
          created_at,
          profiles:user_id (
            id,
            username,
            email,
            avatar_url,
            total_drops,
            streak_days,
            last_visit_date
          )
        `)
        .eq('gym_id', gymId),
    ]);

    // Calculate KPIs
    const totalMembers = totalMembersResult.count || 0;

    // Active 7d = unique users with sessions in last 7 days
    const activeUserIds7d = new Set(
      (activeMembers7dResult.data || []).map((s: any) => s.user_id)
    );
    const activeMembers7d = activeUserIds7d.size;

    // Visits this month / last month = total session count
    const visitsThisMonth = (visitsThisMonthResult.data || []).length;
    const visitsLastMonth = (visitsLastMonthResult.data || []).length;

    // Avg sessions per member this month
    const uniqueVisitorsThisMonth = new Set(
      (visitsThisMonthResult.data || []).map((s: any) => s.user_id)
    ).size;
    const avgSessionsPerMember = uniqueVisitorsThisMonth > 0
      ? Math.round((visitsThisMonth / uniqueVisitorsThisMonth) * 10) / 10
      : 0;

    // Daily unique visitors
    const dailyMap = new Map<string, Set<string>>();
    for (const session of (dailyVisitorsResult.data || []) as any[]) {
      const date = new Date(session.created_at).toISOString().split('T')[0];
      if (!dailyMap.has(date)) {
        dailyMap.set(date, new Set());
      }
      dailyMap.get(date)!.add(session.user_id);
    }

    // Fill in all 30 days
    const dailyVisitors: DailyVisitors[] = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split('T')[0];
      dailyVisitors.push({
        date: dateStr,
        unique_visitors: dailyMap.get(dateStr)?.size || 0,
      });
    }

    // At-risk members list
    const atRiskMembers: AtRiskMember[] = [];
    let atRiskCount = 0;
    let churnedCount = 0;

    for (const membership of (membersWithProfilesResult.data || []) as any[]) {
      const profileData = membership.profiles;
      if (!profileData) continue;

      const lastVisit = profileData.last_visit_date;
      let daysInactive = 999;
      if (lastVisit) {
        const lastDate = new Date(lastVisit);
        daysInactive = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
      }

      let status: 'active' | 'at_risk' | 'churned' = 'active';
      if (daysInactive >= 30) {
        status = 'churned';
        churnedCount++;
      } else if (daysInactive >= 7) {
        status = 'at_risk';
        atRiskCount++;
      }

      // Include at-risk and churned in the list
      if (status !== 'active') {
        atRiskMembers.push({
          id: profileData.id,
          username: profileData.username || 'Unknown',
          email: profileData.email || '',
          avatar_url: profileData.avatar_url || null,
          total_drops: profileData.total_drops || 0,
          streak_days: profileData.streak_days || 0,
          last_visit_date: lastVisit,
          days_inactive: daysInactive,
          status,
        });
      }
    }

    // Sort: at-risk first, then by days inactive
    atRiskMembers.sort((a, b) => {
      if (a.status === 'at_risk' && b.status !== 'at_risk') return -1;
      if (a.status !== 'at_risk' && b.status === 'at_risk') return 1;
      return a.days_inactive - b.days_inactive;
    });

    // Churn rate = churned / total
    const churnRate = totalMembers > 0
      ? Math.round((churnedCount / totalMembers) * 1000) / 10
      : 0;

    const kpis: RetentionKPIs = {
      activeMembers7d,
      totalMembers,
      visitsThisMonth,
      visitsLastMonth,
      avgSessionsPerMember,
      churnRate,
      atRiskCount,
    };

    return {
      success: true,
      kpis,
      dailyVisitors,
      atRiskMembers: atRiskMembers.slice(0, 50), // Limit to 50
    };
  } catch (error: any) {
    console.error('[getRetentionData] Error:', error);
    return { success: false, error: error.message };
  }
}
