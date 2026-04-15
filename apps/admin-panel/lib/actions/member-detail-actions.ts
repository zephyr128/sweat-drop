'use server';

import { getAdminClient } from '@/lib/utils/supabase-admin';
import { getCurrentProfile } from '../auth';

function getWeekStart(): string {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay() + (d.getDay() === 0 ? -6 : 1));
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function getMonthStart(): string {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

// Keep member detail lists large enough for client-side pagination.
const MEMBER_DETAIL_LIST_LIMIT = 500;

export interface MemberDetail {
  id: string;
  username: string;
  email: string;
  avatar_url: string | null;
  total_drops: number;
  available_drops: number;
  streak_days: number;
  last_visit_date: string | null;
  joined_at: string;
  role: string;
}

export interface MemberSession {
  id: string;
  started_at: string;
  duration_seconds: number | null;
  drops_earned: number;
  machine_name: string | null;
}

export interface MemberTransaction {
  id: string;
  created_at: string;
  transaction_type: string;
  amount: number;
  description: string | null;
}

export interface MemberBadge {
  badge_id: string;
  badge_name: string;
  badge_description: string;
  badge_image_url: string;
  badge_type: string;
  earned_at: string;
  gym_name: string;
}

export interface MemberRedemption {
  id: string;
  created_at: string;
  reward_name: string;
  status: string;
  redemption_code: string | null;
  drops_spent: number;
}

export interface MemberExpiryInfo {
  expiringIn7d: number;
  expiringIn30d: number;
  nextExpiryDate: string | null;
}

export interface MemberLedgerSummary {
  walletBalance: number;
  earnedScoreWeekly: number;
  earnedScoreMonthly: number;
  earnedScoreAllTime: number;
}

export interface MemberIdentityInfo {
  isVerified: boolean;
  fullNameVerified: string | null;
  externalMembershipId: string | null;
  verifiedByName: string | null;
  verifiedAt: string | null;
  notes: string | null;
}

export interface MemberDetailResult {
  profile: MemberDetail;
  sessions: MemberSession[];
  transactions: MemberTransaction[];
  badges: MemberBadge[];
  redemptions: MemberRedemption[];
  expiry: MemberExpiryInfo | null;
  ledger: MemberLedgerSummary | null;
  identity: MemberIdentityInfo | null;
}

export async function getMemberDetail(
  gymId: string,
  memberId: string
): Promise<{ success: boolean; data?: MemberDetailResult; error?: string }> {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return { success: false, error: 'Not authenticated' };
    }

    if (!['superadmin', 'gym_owner', 'gym_admin', 'receptionist'].includes(profile.role)) {
      return { success: false, error: 'Unauthorized' };
    }

    const supabase = getAdminClient();
    if (!supabase) {
      return { success: false, error: 'Admin client not available' };
    }

    // Verify gym access for non-superadmin
    if (profile.role !== 'superadmin') {
      if (profile.role === 'receptionist' || profile.role === 'gym_admin') {
        if (profile.assigned_gym_id !== gymId) {
          return { success: false, error: 'Unauthorized for this gym' };
        }
      } else {
        const { data: gym } = await supabase
          .from('gyms')
          .select('owner_id')
          .eq('id', gymId)
          .single();

        if (!gym) return { success: false, error: 'Gym not found' };
        const gymData = gym as { owner_id: string | null };
        if (gymData.owner_id !== profile.id && profile.assigned_gym_id !== gymId) {
          return { success: false, error: 'Unauthorized for this gym' };
        }
      }
    }

    // Verify member belongs to this gym
    const { data: membership } = await supabase
      .from('gym_memberships')
      .select('user_id, created_at')
      .eq('gym_id', gymId)
      .eq('user_id', memberId)
      .single();

    if (!membership) {
      return { success: false, error: 'Member not found in this gym' };
    }

    // Fetch profile
    const { data: memberProfile, error: profileError } = await supabase
      .from('profiles')
      .select('id, username, email, avatar_url, total_drops, available_drops, streak_days, last_visit_date, role')
      .eq('id', memberId)
      .single();

    if (profileError || !memberProfile) {
      return { success: false, error: 'Member profile not found' };
    }

    const mp = memberProfile as any;

    // Fetch recent sessions with machine name.
    const { data: sessionsRaw } = await supabase
      .from('sessions')
      .select('id, started_at, duration_seconds, drops_earned, machine_id')
      .eq('user_id', memberId)
      .eq('gym_id', gymId)
      .order('started_at', { ascending: false })
      .limit(MEMBER_DETAIL_LIST_LIMIT);

    // Resolve machine names
    const sessions: MemberSession[] = [];
    if (sessionsRaw && sessionsRaw.length > 0) {
      const machineIds = [...new Set((sessionsRaw as any[]).filter(s => s.machine_id).map(s => s.machine_id))];
      let machineMap: Record<string, string> = {};
      if (machineIds.length > 0) {
        const { data: machines } = await supabase
          .from('machines')
          .select('id, name')
          .in('id', machineIds);
        if (machines) {
          machineMap = Object.fromEntries((machines as any[]).map(m => [m.id, m.name]));
        }
      }
      for (const s of sessionsRaw as any[]) {
        sessions.push({
          id: s.id,
          started_at: s.started_at,
          duration_seconds: s.duration_seconds,
          drops_earned: s.drops_earned,
          machine_name: s.machine_id ? (machineMap[s.machine_id] || null) : null,
        });
      }
    }

    // Fetch recent drops transactions.
    const { data: transactionsRaw } = await supabase
      .from('drops_transactions')
      .select('id, created_at, transaction_type, amount, description')
      .eq('user_id', memberId)
      .eq('gym_id', gymId)
      .order('created_at', { ascending: false })
      .limit(MEMBER_DETAIL_LIST_LIMIT);

    const transactions: MemberTransaction[] = ((transactionsRaw as any[]) || []).map(t => ({
      id: t.id,
      created_at: t.created_at,
      transaction_type: t.transaction_type,
      amount: t.amount,
      description: t.description,
    }));

    // Fetch badges via RPC
    let badges: MemberBadge[] = [];
    try {
      const { data: badgesRaw } = await (supabase.rpc as any)('get_user_badges', { p_user_id: memberId });
      if (badgesRaw) {
        badges = (badgesRaw as any[]).map(b => ({
          badge_id: b.badge_id,
          badge_name: b.badge_name,
          badge_description: b.badge_description,
          badge_image_url: b.badge_image_url,
          badge_type: b.badge_type,
          earned_at: b.earned_at,
          gym_name: b.gym_name,
        }));
      }
    } catch {
      // Badge fetch failure is non-critical
    }

    // Fetch recent redemptions with reward name.
    const { data: redemptionsRaw } = await supabase
      .from('redemptions')
      .select('id, created_at, reward_id, status, redemption_code, drops_spent')
      .eq('user_id', memberId)
      .eq('gym_id', gymId)
      .order('created_at', { ascending: false })
      .limit(MEMBER_DETAIL_LIST_LIMIT);

    const redemptions: MemberRedemption[] = [];
    if (redemptionsRaw && redemptionsRaw.length > 0) {
      const rewardIds = [...new Set((redemptionsRaw as any[]).map(r => r.reward_id))];
      let rewardMap: Record<string, string> = {};
      if (rewardIds.length > 0) {
        const { data: rewards } = await supabase
          .from('rewards')
          .select('id, name')
          .in('id', rewardIds);
        if (rewards) {
          rewardMap = Object.fromEntries((rewards as any[]).map(r => [r.id, r.name]));
        }
      }
      for (const r of redemptionsRaw as any[]) {
        redemptions.push({
          id: r.id,
          created_at: r.created_at,
          reward_name: rewardMap[r.reward_id] || 'Unknown Reward',
          status: r.status,
          redemption_code: r.redemption_code,
          drops_spent: r.drops_spent,
        });
      }
    }

    // Fetch expiry info from drops_transactions
    let expiry: MemberExpiryInfo | null = null;
    try {
      const now = new Date().toISOString();
      const in7d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const in30d = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const earnTypes = ['session', 'checkin', 'workout'];

      const [exp7dRes, exp30dRes, nextRes] = await Promise.all([
        (supabase.from('drops_transactions') as any)
          .select('amount')
          .eq('user_id', memberId)
          .eq('gym_id', gymId)
          .gt('amount', 0)
          .not('expires_at', 'is', null)
          .gt('expires_at', now)
          .lte('expires_at', in7d)
          .in('transaction_type', earnTypes),
        (supabase.from('drops_transactions') as any)
          .select('amount')
          .eq('user_id', memberId)
          .eq('gym_id', gymId)
          .gt('amount', 0)
          .not('expires_at', 'is', null)
          .gt('expires_at', now)
          .lte('expires_at', in30d)
          .in('transaction_type', earnTypes),
        (supabase.from('drops_transactions') as any)
          .select('expires_at')
          .eq('user_id', memberId)
          .eq('gym_id', gymId)
          .gt('amount', 0)
          .not('expires_at', 'is', null)
          .gt('expires_at', now)
          .in('transaction_type', earnTypes)
          .order('expires_at', { ascending: true })
          .limit(1),
      ]);

      const sum7d = (exp7dRes.data as any[] || []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
      const sum30d = (exp30dRes.data as any[] || []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
      const nextDate = (nextRes.data as any[])?.[0]?.expires_at ?? null;

      expiry = { expiringIn7d: Math.round(sum7d), expiringIn30d: Math.round(sum30d), nextExpiryDate: nextDate };
    } catch {
      // Non-critical
    }

    // Fetch ledger summary
    let ledger: MemberLedgerSummary | null = null;
    try {
      const weekStart = getWeekStart();
      const monthStart = getMonthStart();

      const [walletRes, weeklyRes, monthlyRes, allTimeRes] = await Promise.all([
        (supabase.from('gym_memberships') as any)
          .select('local_drops_balance')
          .eq('user_id', memberId)
          .eq('gym_id', gymId)
          .single(),
        (supabase.from('drops_transactions') as any)
          .select('amount')
          .eq('user_id', memberId)
          .eq('gym_id', gymId)
          .gt('amount', 0)
          .in('transaction_type', ['session', 'checkin', 'workout', 'challenge'])
          .gte('created_at', weekStart),
        (supabase.from('drops_transactions') as any)
          .select('amount')
          .eq('user_id', memberId)
          .eq('gym_id', gymId)
          .gt('amount', 0)
          .in('transaction_type', ['session', 'checkin', 'workout', 'challenge'])
          .gte('created_at', monthStart),
        (supabase.from('drops_transactions') as any)
          .select('amount')
          .eq('user_id', memberId)
          .eq('gym_id', gymId)
          .gt('amount', 0)
          .in('transaction_type', ['session', 'checkin', 'workout', 'challenge']),
      ]);

      const walletBalance = Number(walletRes.data?.local_drops_balance || 0);
      const earnedWeekly = (weeklyRes.data as any[] || []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
      const earnedMonthly = (monthlyRes.data as any[] || []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
      const earnedAllTime = (allTimeRes.data as any[] || []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);

      ledger = {
        walletBalance: Math.round(walletBalance),
        earnedScoreWeekly: Math.round(earnedWeekly),
        earnedScoreMonthly: Math.round(earnedMonthly),
        earnedScoreAllTime: Math.round(earnedAllTime),
      };
    } catch {
      // Non-critical
    }

    // Fetch identity verification data
    let identity: MemberIdentityInfo | null = null;
    try {
      const { data: idRow } = await (supabase as any)
        .from('gym_member_identities')
        .select('is_verified, full_name_verified, external_membership_id, verified_by, verified_at, verification_notes')
        .eq('gym_id', gymId)
        .eq('user_id', memberId)
        .maybeSingle();

      if (idRow) {
        let verifiedByName: string | null = null;
        if (idRow.verified_by) {
          const { data: verifier } = await supabase
            .from('profiles')
            .select('username')
            .eq('id', idRow.verified_by)
            .single();
          verifiedByName = (verifier as any)?.username || null;
        }
        identity = {
          isVerified: idRow.is_verified === true,
          fullNameVerified: idRow.full_name_verified || null,
          externalMembershipId: idRow.external_membership_id || null,
          verifiedByName,
          verifiedAt: idRow.verified_at || null,
          notes: idRow.verification_notes || null,
        };
      }
    } catch {
      // Non-critical — identity table may not exist yet
    }

    return {
      success: true,
      data: {
        profile: {
          id: mp.id,
          username: mp.username || 'Unknown',
          email: mp.email || '',
          avatar_url:
            typeof mp.avatar_url === 'string' && mp.avatar_url.trim() ? mp.avatar_url.trim() : null,
          total_drops: mp.total_drops || 0,
          available_drops: mp.available_drops || 0,
          streak_days: mp.streak_days || 0,
          last_visit_date: mp.last_visit_date || null,
          joined_at: (membership as any).created_at,
          role: mp.role || 'user',
        },
        sessions,
        transactions,
        badges,
        redemptions,
        expiry,
        ledger,
        identity,
      },
    };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Failed to fetch member detail';
    console.error('[getMemberDetail] Error:', errMsg);
    return { success: false, error: errMsg };
  }
}

export interface GymExpiryPressure {
  dropsExpiring30d: number;
  membersAffected: number;
}

export async function getGymExpiryPressure(
  gymId: string
): Promise<{ success: boolean; data?: GymExpiryPressure; error?: string }> {
  try {
    const profile = await getCurrentProfile();
    if (!profile) return { success: false, error: 'Not authenticated' };
    if (!['superadmin', 'gym_owner', 'gym_admin'].includes(profile.role)) {
      return { success: false, error: 'Unauthorized' };
    }

    const supabase = getAdminClient();
    if (!supabase) return { success: false, error: 'Admin client not available' };

    const now = new Date().toISOString();
    const in30d = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const earnTypes = ['session', 'checkin', 'workout'];

    const { data: rows, error } = await (supabase.from('drops_transactions') as any)
      .select('user_id, amount')
      .eq('gym_id', gymId)
      .gt('amount', 0)
      .not('expires_at', 'is', null)
      .gt('expires_at', now)
      .lte('expires_at', in30d)
      .in('transaction_type', earnTypes)
      .limit(5000);

    if (error) return { success: false, error: error.message };

    const txRows = (rows as { user_id: string; amount: number }[]) || [];
    const dropsExpiring30d = txRows.reduce((s, r) => s + Number(r.amount || 0), 0);
    const uniqueUsers = new Set(txRows.map((r) => r.user_id));

    return {
      success: true,
      data: {
        dropsExpiring30d: Math.round(dropsExpiring30d),
        membersAffected: uniqueUsers.size,
      },
    };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Failed to fetch expiry pressure';
    return { success: false, error: errMsg };
  }
}
