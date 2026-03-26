'use server';

import { getAdminClient } from '@/lib/utils/supabase-admin';
import { getCurrentProfile } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

type PriceBandMap = Record<string, { min: number; max: number }>;

export interface RiskSummary {
  unresolvedEvents: number;
  flaggedUsers: number;
  suspiciousSessions: number;
  suspiciousRedemptions: number;
}

export interface RiskUser {
  userId: string;
  username: string;
  email: string | null;
  riskScore: number;
  reasons: string[];
  severity: 'warn' | 'review' | 'critical';
  minted7d: number;
  sessions7d: number;
}

export interface FraudEventItem {
  id: string;
  user_id: string | null;
  gym_id: string | null;
  event_type: string;
  severity: string;
  metadata: Record<string, unknown>;
  created_at: string;
  resolved_at: string | null;
}

export interface SuspiciousSession {
  id: string;
  user_id: string;
  username: string;
  drops_earned: number;
  duration_seconds: number;
  started_at: string;
}

export interface SuspiciousRedemption {
  id: string;
  user_id: string;
  username: string;
  drops_spent: number;
  status: string;
  created_at: string;
  redemption_code: string | null;
}

export interface EconomySummary {
  burnMintRatio: number;
  top1SharePct: number;
  minted30d: number;
  burned30d: number;
  health: 'green' | 'yellow' | 'red';
  healthLabel: string;
}

export interface EconomyConfigData {
  maxDropsPerSession: number;
  maxDropsPerDay: number;
  maxDropsPerWeek: number;
  maxRewardedSessionsPerDay: number;
  maxCheckinDropsPerDay: number;
  priceBandJson: PriceBandMap;
}

export interface EconomyRewardGuardrail {
  id: string;
  name: string;
  rewardType: string;
  priceDrops: number;
  minRecommended: number | null;
  maxRecommended: number | null;
  inBand: boolean;
}

async function verifyGymAccess(gymId: string) {
  const profile = await getCurrentProfile();
  if (!profile) return { authorized: false, error: 'Not authenticated' } as const;

  if (profile.role === 'superadmin') return { authorized: true, profile } as const;
  if (profile.role !== 'gym_owner' && profile.role !== 'gym_admin') {
    return { authorized: false, error: 'Unauthorized role' } as const;
  }

  const supabase = getAdminClient();
  if (!supabase) return { authorized: false, error: 'Admin client not available' } as const;

  const { data: gym } = await supabase.from('gyms').select('owner_id').eq('id', gymId).single();
  if (!gym) return { authorized: false, error: 'Gym not found' } as const;

  const ownsGym = (gym as { owner_id: string | null }).owner_id === profile.id;
  const isAssignedGym = profile.assigned_gym_id === gymId;
  if (!ownsGym && !isAssignedGym) {
    return { authorized: false, error: 'Unauthorized' } as const;
  }

  return { authorized: true, profile } as const;
}

function toBelgradeDateKey(iso: string) {
  const d = new Date(iso);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Belgrade',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(d);
}

function parsePriceBands(raw: unknown): PriceBandMap {
  if (!raw || typeof raw !== 'object') return {};
  const result: PriceBandMap = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const min = Number((value as Record<string, unknown>).min);
    const max = Number((value as Record<string, unknown>).max);
    if (Number.isFinite(min) && Number.isFinite(max)) {
      result[key] = { min, max };
    }
  }
  return result;
}

function healthFromEconomy(burnMintRatio: number, top1SharePct: number): EconomySummary['health'] {
  const ratioPct = burnMintRatio * 100;
  const ratioBad = ratioPct < 10 || ratioPct > 60;
  const ratioWarn = (ratioPct >= 10 && ratioPct < 20) || (ratioPct > 45 && ratioPct <= 60);

  if (ratioBad || top1SharePct > 35) return 'red';
  if (ratioWarn || top1SharePct > 20) return 'yellow';
  return 'green';
}

function healthLabel(health: EconomySummary['health']) {
  if (health === 'green') return 'Healthy zone';
  if (health === 'yellow') return 'Watch closely';
  return 'Immediate action';
}

export async function getGymRiskDashboard(gymId: string) {
  const auth = await verifyGymAccess(gymId);
  if (!auth.authorized) return { success: false, error: auth.error };

  const supabase = getAdminClient();
  if (!supabase) return { success: false, error: 'Admin client not available' };

  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [eventsRes, sessionsRes, redemptionsRes] = await Promise.all([
    (supabase.from('fraud_events') as any)
      .select('id, user_id, gym_id, event_type, severity, metadata, created_at, resolved_at')
      .eq('gym_id', gymId)
      .order('created_at', { ascending: false })
      .limit(150),
    (supabase.from('sessions') as any)
      .select('id, user_id, gym_id, drops_earned, duration_seconds, started_at, is_active')
      .eq('gym_id', gymId)
      .gte('started_at', d30)
      .order('started_at', { ascending: false })
      .limit(1000),
    (supabase.from('redemptions') as any)
      .select('id, user_id, gym_id, drops_spent, status, created_at, redemption_code')
      .eq('gym_id', gymId)
      .gte('created_at', d30)
      .order('created_at', { ascending: false })
      .limit(1000),
  ]);

  if (sessionsRes.error) return { success: false, error: sessionsRes.error.message };
  if (redemptionsRes.error) return { success: false, error: redemptionsRes.error.message };

  const events = ((eventsRes.data || []) as FraudEventItem[]) || [];
  const sessions = (sessionsRes.data || []) as Array<{
    id: string;
    user_id: string;
    drops_earned: number | null;
    duration_seconds: number | null;
    started_at: string;
    is_active: boolean | null;
  }>;
  const redemptions = (redemptionsRes.data || []) as Array<{
    id: string;
    user_id: string;
    drops_spent: number;
    status: string;
    created_at: string;
    redemption_code: string | null;
  }>;

  const userIds = Array.from(
    new Set([
      ...sessions.map((s) => s.user_id),
      ...redemptions.map((r) => r.user_id),
      ...events.map((e) => e.user_id).filter(Boolean) as string[],
    ]),
  );

  const usersMap = new Map<string, { username: string; email: string | null }>();
  if (userIds.length > 0) {
    const { data: usersData } = await (supabase.from('profiles') as any)
      .select('id, username, email')
      .in('id', userIds);
    for (const u of (usersData || []) as Array<{ id: string; username: string; email: string | null }>) {
      usersMap.set(u.id, { username: u.username || 'Unknown', email: u.email || null });
    }
  }

  const scores = new Map<string, { score: number; reasons: string[]; minted7d: number; sessions7d: number }>();
  const ensure = (uid: string) => {
    if (!scores.has(uid)) scores.set(uid, { score: 0, reasons: [], minted7d: 0, sessions7d: 0 });
    return scores.get(uid)!;
  };

  // Session based heuristics
  const perUserDaySessions = new Map<string, number>();
  const perUserDayMinted = new Map<string, number>();

  for (const s of sessions) {
    const uid = s.user_id;
    const score = ensure(uid);
    const drops = Number(s.drops_earned || 0);
    const duration = Number(s.duration_seconds || 0);
    const in7d = new Date(s.started_at).getTime() >= new Date(d7).getTime();
    if (in7d) {
      score.minted7d += drops;
      score.sessions7d += 1;
    }

    if (duration > 0 && duration < 120 && drops > 0) {
      score.score += 25;
      score.reasons.push('Rewarded short sessions');
    }
    if (duration > 7200) {
      score.score += 15;
      score.reasons.push('Very long session duration');
    }
    if (drops > 120) {
      score.score += 20;
      score.reasons.push('Session drops over cap');
    }

    const dayKey = `${uid}:${toBelgradeDateKey(s.started_at)}`;
    perUserDaySessions.set(dayKey, (perUserDaySessions.get(dayKey) || 0) + (drops > 0 ? 1 : 0));
    perUserDayMinted.set(dayKey, (perUserDayMinted.get(dayKey) || 0) + drops);
  }

  for (const [dayKey, count] of perUserDaySessions.entries()) {
    if (count > 4) {
      const uid = dayKey.split(':')[0];
      const score = ensure(uid);
      score.score += 40;
      score.reasons.push('Too many rewarded sessions in one day');
    }
  }

  for (const [dayKey, minted] of perUserDayMinted.entries()) {
    if (minted > 300) {
      const uid = dayKey.split(':')[0];
      const score = ensure(uid);
      score.score += 25;
      score.reasons.push('Daily minted drops exceeds cap');
    }
  }

  // Redemption heuristics
  const cancelledByUser7d = new Map<string, number>();
  for (const r of redemptions) {
    if (r.status === 'cancelled' && new Date(r.created_at).getTime() >= new Date(d7).getTime()) {
      cancelledByUser7d.set(r.user_id, (cancelledByUser7d.get(r.user_id) || 0) + 1);
    }
  }
  for (const [uid, c] of cancelledByUser7d.entries()) {
    if (c >= 2) {
      const score = ensure(uid);
      score.score += 10;
      score.reasons.push('Frequent cancelled redemptions');
    }
  }

  // Fraud events boost
  for (const e of events.filter((e) => !e.resolved_at && e.user_id)) {
    const score = ensure(e.user_id as string);
    if (e.severity === 'critical') score.score += 40;
    else if (e.severity === 'high') score.score += 25;
    else if (e.severity === 'medium') score.score += 10;
    else score.score += 5;
    score.reasons.push(`Event: ${e.event_type}`);
  }

  const flaggedUsers: RiskUser[] = [];
  for (const [uid, s] of scores.entries()) {
    if (s.score < 40) continue;
    const severity: RiskUser['severity'] = s.score >= 80 ? 'critical' : s.score >= 60 ? 'review' : 'warn';
    const user = usersMap.get(uid) || { username: 'Unknown', email: null };
    flaggedUsers.push({
      userId: uid,
      username: user.username,
      email: user.email,
      riskScore: s.score,
      reasons: Array.from(new Set(s.reasons)).slice(0, 5),
      severity,
      minted7d: s.minted7d,
      sessions7d: s.sessions7d,
    });
  }
  flaggedUsers.sort((a, b) => b.riskScore - a.riskScore);

  const flaggedSet = new Set(flaggedUsers.map((u) => u.userId));
  const suspiciousSessions: SuspiciousSession[] = sessions
    .filter((s) => Number(s.drops_earned || 0) > 120 || Number(s.duration_seconds || 0) < 120)
    .slice(0, 30)
    .map((s) => ({
      id: s.id,
      user_id: s.user_id,
      username: usersMap.get(s.user_id)?.username || 'Unknown',
      drops_earned: Number(s.drops_earned || 0),
      duration_seconds: Number(s.duration_seconds || 0),
      started_at: s.started_at,
    }));

  const suspiciousRedemptions: SuspiciousRedemption[] = redemptions
    .filter((r) => r.status === 'pending' && (r.drops_spent >= 500 || flaggedSet.has(r.user_id)))
    .slice(0, 30)
    .map((r) => ({
      id: r.id,
      user_id: r.user_id,
      username: usersMap.get(r.user_id)?.username || 'Unknown',
      drops_spent: r.drops_spent,
      status: r.status,
      created_at: r.created_at,
      redemption_code: r.redemption_code,
    }));

  const summary: RiskSummary = {
    unresolvedEvents: events.filter((e) => !e.resolved_at).length,
    flaggedUsers: flaggedUsers.length,
    suspiciousSessions: suspiciousSessions.length,
    suspiciousRedemptions: suspiciousRedemptions.length,
  };

  return {
    success: true,
    data: {
      summary,
      flaggedUsers,
      events: events.slice(0, 80),
      suspiciousSessions,
      suspiciousRedemptions,
      backendNotes: eventsRes.error ? 'fraud_events table unavailable in current environment' : null,
    },
  };
}

export async function getSuperRiskDashboard() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== 'superadmin') return { success: false, error: 'Superadmin only' };

  const supabase = getAdminClient();
  if (!supabase) return { success: false, error: 'Admin client not available' };

  const { data: gyms, error: gymsError } = await (supabase.from('gyms') as any)
    .select('id, name, city, country, is_suspended')
    .order('name', { ascending: true });
  if (gymsError) return { success: false, error: gymsError.message };

  const gymRows = (gyms || []) as Array<{ id: string; name: string; city: string | null; country: string | null; is_suspended: boolean }>;
  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [eventsRes, sessionsRes] = await Promise.all([
    (supabase.from('fraud_events') as any)
      .select('id, gym_id, severity, resolved_at, created_at')
      .gte('created_at', d30)
      .limit(5000),
    (supabase.from('sessions') as any)
      .select('id, gym_id, drops_earned, started_at')
      .gte('started_at', d30)
      .limit(5000),
  ]);

  const events = (eventsRes.data || []) as Array<{ gym_id: string | null; severity: string; resolved_at: string | null }>;
  const sessions = (sessionsRes.data || []) as Array<{ gym_id: string; drops_earned: number | null }>;

  const perGym: Array<{
    gymId: string;
    gymName: string;
    location: string;
    unresolvedEvents: number;
    criticalEvents: number;
    avgDropsPerSession: number;
    suspended: boolean;
  }> = [];

  for (const g of gymRows) {
    const ev = events.filter((e) => e.gym_id === g.id);
    const unresolved = ev.filter((e) => !e.resolved_at).length;
    const critical = ev.filter((e) => e.severity === 'critical').length;
    const ss = sessions.filter((s) => s.gym_id === g.id);
    const avg = ss.length ? ss.reduce((sum, s) => sum + Number(s.drops_earned || 0), 0) / ss.length : 0;
    perGym.push({
      gymId: g.id,
      gymName: g.name,
      location: [g.city, g.country].filter(Boolean).join(', '),
      unresolvedEvents: unresolved,
      criticalEvents: critical,
      avgDropsPerSession: Math.round(avg * 10) / 10,
      suspended: Boolean(g.is_suspended),
    });
  }

  perGym.sort((a, b) => (b.criticalEvents * 3 + b.unresolvedEvents) - (a.criticalEvents * 3 + a.unresolvedEvents));

  return {
    success: true,
    data: {
      totalGyms: gymRows.length,
      gymsAtRisk: perGym.filter((g) => g.criticalEvents > 0 || g.unresolvedEvents >= 5).length,
      totalUnresolvedEvents: perGym.reduce((s, g) => s + g.unresolvedEvents, 0),
      gyms: perGym,
    },
  };
}

export async function getGymEconomyData(gymId: string) {
  const auth = await verifyGymAccess(gymId);
  if (!auth.authorized) return { success: false, error: auth.error };

  const supabase = getAdminClient();
  if (!supabase) return { success: false, error: 'Admin client not available' };

  const [cfgGym, cfgGlobal, snapshotsRes, rewardsRes] = await Promise.all([
    (supabase.from('tokenomics_config') as any).select('*').eq('gym_id', gymId).maybeSingle(),
    (supabase.from('tokenomics_config') as any).select('*').is('gym_id', null).maybeSingle(),
    (supabase.from('economy_snapshots_daily') as any)
      .select('snapshot_date, minted_drops, burned_drops, burn_mint_ratio, top1_share_pct')
      .eq('gym_id', gymId)
      .order('snapshot_date', { ascending: false })
      .limit(30),
    (supabase.from('rewards') as any)
      .select('id, name, reward_type, price_drops, is_active')
      .eq('gym_id', gymId)
      .eq('is_active', true)
      .order('price_drops', { ascending: false })
      .limit(300),
  ]);

  const cfg = (cfgGym.data || cfgGlobal.data) as any;
  if (!cfg) {
    return { success: false, error: 'tokenomics_config not found (run tokenomics migration)' };
  }
  if (snapshotsRes.error && snapshotsRes.error.code !== 'PGRST116') {
    return { success: false, error: snapshotsRes.error.message };
  }
  if (rewardsRes.error) return { success: false, error: rewardsRes.error.message };

  const priceBandJson = parsePriceBands(cfg.price_band_json);
  const snapshots = (snapshotsRes.data || []) as Array<{
    snapshot_date: string;
    minted_drops: number;
    burned_drops: number;
    burn_mint_ratio: number;
    top1_share_pct: number;
  }>;
  const rewards = (rewardsRes.data || []) as Array<{
    id: string;
    name: string;
    reward_type: string;
    price_drops: number;
  }>;

  const minted30d = snapshots.reduce((sum, s) => sum + Number(s.minted_drops || 0), 0);
  const burned30d = snapshots.reduce((sum, s) => sum + Number(s.burned_drops || 0), 0);
  const burnMintRatio = minted30d > 0 ? burned30d / minted30d : 0;
  const top1SharePct =
    snapshots.length > 0
      ? snapshots.reduce((sum, s) => sum + Number(s.top1_share_pct || 0), 0) / snapshots.length
      : 0;
  const health = healthFromEconomy(burnMintRatio, top1SharePct);

  const summary: EconomySummary = {
    burnMintRatio: Math.round(burnMintRatio * 1000) / 1000,
    top1SharePct: Math.round(top1SharePct * 10) / 10,
    minted30d,
    burned30d,
    health,
    healthLabel: healthLabel(health),
  };

  const guardrails: EconomyRewardGuardrail[] = rewards.map((r) => {
    const band = priceBandJson[r.reward_type] || priceBandJson.physical || null;
    const minRecommended = band ? band.min : null;
    const maxRecommended = band ? band.max : null;
    const inBand =
      minRecommended == null || maxRecommended == null
        ? true
        : r.price_drops >= minRecommended && r.price_drops <= maxRecommended;
    return {
      id: r.id,
      name: r.name,
      rewardType: r.reward_type || 'physical',
      priceDrops: Number(r.price_drops || 0),
      minRecommended,
      maxRecommended,
      inBand,
    };
  });

  return {
    success: true,
    data: {
      config: {
        maxDropsPerSession: Number(cfg.max_drops_per_session || 120),
        maxDropsPerDay: Number(cfg.max_drops_per_day || 300),
        maxDropsPerWeek: Number(cfg.max_drops_per_week || 1500),
        maxRewardedSessionsPerDay: Number(cfg.max_rewarded_sessions_per_day || 4),
        maxCheckinDropsPerDay: Number(cfg.max_checkin_drops_per_day || 1),
        priceBandJson,
      } as EconomyConfigData,
      summary,
      snapshots,
      guardrails,
    },
  };
}

export async function updateGymEconomyConfig(gymId: string, input: EconomyConfigData) {
  const auth = await verifyGymAccess(gymId);
  if (!auth.authorized) return { success: false, error: auth.error };

  const supabase = getAdminClient();
  if (!supabase) return { success: false, error: 'Admin client not available' };

  const payload = {
    gym_id: gymId,
    max_drops_per_session: Math.max(0, Math.round(input.maxDropsPerSession)),
    max_drops_per_day: Math.max(0, Math.round(input.maxDropsPerDay)),
    max_drops_per_week: Math.max(0, Math.round(input.maxDropsPerWeek)),
    max_rewarded_sessions_per_day: Math.max(0, Math.round(input.maxRewardedSessionsPerDay)),
    max_checkin_drops_per_day: Math.max(0, Math.round(input.maxCheckinDropsPerDay)),
    price_band_json: input.priceBandJson,
    updated_at: new Date().toISOString(),
  };

  const { error } = await (supabase.from('tokenomics_config') as any)
    .upsert(payload, { onConflict: 'gym_id' });
  if (error) return { success: false, error: error.message };

  revalidatePath(`/dashboard/gym/${gymId}/economy`);
  revalidatePath(`/dashboard/gym/${gymId}/dashboard`);
  revalidatePath(`/dashboard/gym/${gymId}/store`);
  return { success: true };
}

export async function freezeUserDrops(gymId: string, userId: string, reason: string) {
  const auth = await verifyGymAccess(gymId);
  if (!auth.authorized) return { success: false, error: auth.error };

  const supabase = getAdminClient();
  if (!supabase) return { success: false, error: 'Admin client not available' };

  // Current backend doesn't expose a hard freeze table/function yet.
  // We still create a critical fraud event so operations can act immediately.
  const { error } = await (supabase.from('fraud_events') as any).insert({
    user_id: userId,
    gym_id: gymId,
    event_type: 'manual_freeze_account',
    severity: 'critical',
    metadata: {
      reason: reason || 'Manual freeze from Risk Console',
      actor_id: auth.profile.id,
      source: 'admin_panel',
      hard_enforcement: false,
    },
  });
  if (error) return { success: false, error: error.message };

  revalidatePath(`/dashboard/gym/${gymId}/risk`);
  return {
    success: true,
    warning: 'Soft freeze logged. Hard enforcement requires backend freeze RPC/table.',
  };
}

export async function rollbackSessionDrops(gymId: string, sessionId: string, reason: string) {
  const auth = await verifyGymAccess(gymId);
  if (!auth.authorized) return { success: false, error: auth.error };

  const supabase = getAdminClient();
  if (!supabase) return { success: false, error: 'Admin client not available' };

  const { data: session, error: sessionError } = await (supabase.from('sessions') as any)
    .select('id, user_id, gym_id, drops_earned')
    .eq('id', sessionId)
    .eq('gym_id', gymId)
    .single();
  if (sessionError || !session) return { success: false, error: sessionError?.message || 'Session not found' };

  const amount = Number(session.drops_earned || 0);
  if (amount <= 0) return { success: false, error: 'Session has no awarded drops to rollback' };

  const [{ data: profile }, { data: membership }] = await Promise.all([
    (supabase.from('profiles') as any)
      .select('total_drops, available_drops, weekly_drops, monthly_drops')
      .eq('id', session.user_id)
      .single(),
    (supabase.from('gym_memberships') as any)
      .select('local_drops_balance')
      .eq('user_id', session.user_id)
      .eq('gym_id', gymId)
      .single(),
  ]);

  const nextProfile = {
    total_drops: Math.max(0, Number((profile as any)?.total_drops || 0) - amount),
    available_drops: Math.max(0, Number((profile as any)?.available_drops || 0) - amount),
    weekly_drops: Math.max(0, Number((profile as any)?.weekly_drops || 0) - amount),
    monthly_drops: Math.max(0, Number((profile as any)?.monthly_drops || 0) - amount),
    updated_at: new Date().toISOString(),
  };
  const nextLocal = Math.max(0, Number((membership as any)?.local_drops_balance || 0) - amount);

  const [{ error: sessionUpdError }, { error: profileUpdError }, { error: membershipUpdError }] = await Promise.all([
    (supabase.from('sessions') as any)
      .update({ drops_earned: 0, updated_at: new Date().toISOString() })
      .eq('id', sessionId),
    (supabase.from('profiles') as any).update(nextProfile).eq('id', session.user_id),
    (supabase.from('gym_memberships') as any)
      .update({ local_drops_balance: nextLocal, updated_at: new Date().toISOString() })
      .eq('user_id', session.user_id)
      .eq('gym_id', gymId),
  ]);
  if (sessionUpdError || profileUpdError || membershipUpdError) {
    return { success: false, error: sessionUpdError?.message || profileUpdError?.message || membershipUpdError?.message || 'Rollback failed' };
  }

  const [{ error: txError }, { error: evError }] = await Promise.all([
    (supabase.from('drops_transactions') as any).insert({
      user_id: session.user_id,
      gym_id: gymId,
      amount: -amount,
      transaction_type: 'moderation_rollback',
      reference_id: sessionId,
      balance_after: nextProfile.available_drops,
      description: `Risk rollback for session ${sessionId}. ${reason || 'No reason provided.'}`,
    }),
    (supabase.from('fraud_events') as any).insert({
      user_id: session.user_id,
      gym_id: gymId,
      event_type: 'manual_session_rollback',
      severity: 'high',
      metadata: {
        session_id: sessionId,
        rollback_amount: amount,
        reason: reason || null,
        actor_id: auth.profile.id,
      },
      resolved_at: new Date().toISOString(),
      resolved_by: auth.profile.id,
    }),
  ]);

  if (txError || evError) {
    return { success: false, error: txError?.message || evError?.message || 'Rollback logged with errors' };
  }

  revalidatePath(`/dashboard/gym/${gymId}/risk`);
  revalidatePath(`/dashboard/gym/${gymId}/dashboard`);
  return { success: true };
}

export async function quarantineRedemption(gymId: string, redemptionId: string, reason: string) {
  const auth = await verifyGymAccess(gymId);
  if (!auth.authorized) return { success: false, error: auth.error };

  const supabase = getAdminClient();
  if (!supabase) return { success: false, error: 'Admin client not available' };

  // Uses existing cancellation RPC so refunds are processed in one place.
  const { data, error } = await (supabase.rpc('cancel_redemption', {
    p_redemption_id: redemptionId,
    p_cancelled_by: auth.profile.id,
    p_reason: reason || 'Quarantined by Risk Console',
  } as any) as any);
  if (error) return { success: false, error: error.message };

  const rpcResult = (data as any)?.[0] as { success?: boolean; error_message?: string } | null;
  if (!rpcResult?.success) {
    return { success: false, error: rpcResult?.error_message || 'Failed to quarantine redemption' };
  }

  const { data: red } = await (supabase.from('redemptions') as any)
    .select('user_id')
    .eq('id', redemptionId)
    .single();

  await (supabase.from('fraud_events') as any).insert({
    user_id: (red as any)?.user_id || null,
    gym_id: gymId,
    event_type: 'manual_redemption_quarantine',
    severity: 'high',
    metadata: {
      redemption_id: redemptionId,
      reason: reason || null,
      actor_id: auth.profile.id,
    },
    resolved_at: new Date().toISOString(),
    resolved_by: auth.profile.id,
  });

  revalidatePath(`/dashboard/gym/${gymId}/risk`);
  revalidatePath(`/dashboard/gym/${gymId}/store`);
  return { success: true };
}

export async function resolveFraudEvent(gymId: string, eventId: string) {
  const auth = await verifyGymAccess(gymId);
  if (!auth.authorized) return { success: false, error: auth.error };

  const supabase = getAdminClient();
  if (!supabase) return { success: false, error: 'Admin client not available' };

  const { error } = await (supabase.from('fraud_events') as any)
    .update({
      resolved_at: new Date().toISOString(),
      resolved_by: auth.profile.id,
    })
    .eq('id', eventId)
    .eq('gym_id', gymId);
  if (error) return { success: false, error: error.message };

  revalidatePath(`/dashboard/gym/${gymId}/risk`);
  return { success: true };
}
