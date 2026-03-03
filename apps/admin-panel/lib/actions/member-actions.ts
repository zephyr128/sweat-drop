'use server';

import { getAdminClient } from '@/lib/utils/supabase-admin';
import { getCurrentProfile } from '../auth';

export type MemberSortField = 'username' | 'total_drops' | 'last_visit_date' | 'joined_at' | 'streak_days';
export type MemberStatusFilter = 'all' | 'active' | 'at_risk' | 'churned';

export interface GymMember {
  id: string;
  username: string;
  email: string;
  avatar_url: string | null;
  total_drops: number;
  streak_days: number;
  last_visit_date: string | null;
  joined_at: string;
  days_inactive: number;
  status: 'active' | 'at_risk' | 'churned';
}

export interface MemberListResult {
  members: GymMember[];
  total: number;
}

export async function getGymMembers(
  gymId: string,
  options?: {
    search?: string;
    statusFilter?: MemberStatusFilter;
    sortBy?: MemberSortField;
    sortDir?: 'asc' | 'desc';
    page?: number;
    pageSize?: number;
  }
): Promise<{ success: boolean; data?: MemberListResult; error?: string }> {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return { success: false, error: 'Not authenticated' };
    }

    const allowedRoles = ['superadmin', 'gym_owner', 'gym_admin'];
    if (!allowedRoles.includes(profile.role)) {
      return { success: false, error: 'Unauthorized' };
    }

    const supabase = getAdminClient();
    if (!supabase) {
      return { success: false, error: 'Admin client not available' };
    }

    const {
      search = '',
      statusFilter = 'all',
      sortBy = 'joined_at',
      sortDir = 'desc',
      page = 1,
      pageSize = 25,
    } = options || {};

    // Fetch memberships with profile data
    const { data: memberships, error: fetchError } = await supabase
      .from('gym_memberships')
      .select(`
        user_id,
        joined_at,
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
      .eq('gym_id', gymId);

    if (fetchError) throw fetchError;

    const now = new Date();

    // Transform and enrich data
    let members: GymMember[] = ((memberships || []) as any[])
      .filter((m) => m.profiles)
      .map((m) => {
        const p = m.profiles;
        const lastVisit = p.last_visit_date;
        let daysInactive = 999;
        if (lastVisit) {
          daysInactive = Math.floor(
            (now.getTime() - new Date(lastVisit).getTime()) / (1000 * 60 * 60 * 24)
          );
        }

        let status: 'active' | 'at_risk' | 'churned' = 'active';
        if (daysInactive >= 30) status = 'churned';
        else if (daysInactive >= 7) status = 'at_risk';

        return {
          id: p.id,
          username: p.username || 'Unknown',
          email: p.email || '',
          avatar_url: p.avatar_url || null,
          total_drops: p.total_drops || 0,
          streak_days: p.streak_days || 0,
          last_visit_date: lastVisit,
          joined_at: m.joined_at,
          days_inactive: daysInactive,
          status,
        };
      });

    // Search filter
    if (search) {
      const q = search.toLowerCase();
      members = members.filter(
        (m) =>
          m.username.toLowerCase().includes(q) ||
          m.email.toLowerCase().includes(q)
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      members = members.filter((m) => m.status === statusFilter);
    }

    // Sort
    members.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'username':
          cmp = a.username.localeCompare(b.username);
          break;
        case 'total_drops':
          cmp = a.total_drops - b.total_drops;
          break;
        case 'streak_days':
          cmp = a.streak_days - b.streak_days;
          break;
        case 'last_visit_date':
          cmp = (a.days_inactive || 999) - (b.days_inactive || 999);
          break;
        case 'joined_at':
        default:
          cmp = new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime();
          break;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });

    const total = members.length;

    // Paginate
    const start = (page - 1) * pageSize;
    const paged = members.slice(start, start + pageSize);

    return {
      success: true,
      data: { members: paged, total },
    };
  } catch (error: any) {
    console.error('[getGymMembers] Error:', error);
    return { success: false, error: error.message };
  }
}
