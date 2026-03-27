'use server';

import { createClient } from '@/lib/supabase-server';

// ─── Types ────────────────────────────────────────────────────────

export type EconomyHealth = 'green' | 'yellow' | 'red' | 'gray';

export type DeskFeedKind = 'checkin' | 'redemption' | 'workout_finished' | 'workout_auto_finished';

export type ActivityKind =
  | 'checkin'
  | 'redemption'
  | 'workout_started'
  | 'workout_finished'
  | 'workout_auto_finished'
  | 'workout_cancelled';

export interface DashboardOverview {
  kpis: {
    members: { total: number; active7d: number; activeRatePct: number };
    checkins: { today: number; week: number };
    storeDesk: { pendingPickups: number; confirmedToday: number };
    economy: {
      burnMintRatio: number;
      top1SharePct: number;
      health: EconomyHealth;
      healthLabel: string;
      totalMembers: number;
    };
    dropsIssued7d: {
      total: number;
      prev7d: number;
      deltaPct: number | null;
      deltaAbsolute: number;
    };
    risk: { unresolved: number; critical: number };
  };
  machineOps: {
    liveSummary: { active: number; available: number; maintenance: number; offline: number; total: number };
    usageTrend7d: Array<{ date: string; sessions: number }>;
    typeSplit: Array<{ type: string; sessions: number; sharePct: number }>;
    peakHour: { hour: number; sessions: number } | null;
  };
  deskFeed: Array<{ id: string; kind: DeskFeedKind; title: string; at: string; status: string }>;
  challengeSnapshot: { active: number; completionRatePct: number; mostPopular: string | null };
  topPerformers: Array<{
    id: string;
    username: string;
    avatar_url: string | null;
    earnedDrops: number;
  }>;
  setupComplete: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function mapHealth(raw: string | null | undefined): EconomyHealth {
  if (raw === 'green' || raw === 'yellow' || raw === 'red' || raw === 'gray') return raw;
  return 'gray';
}

const VALID_DESK_KINDS = new Set<DeskFeedKind>(['checkin', 'redemption', 'workout_finished', 'workout_auto_finished']);

function mapDeskFeedKind(raw: string): DeskFeedKind {
  if (VALID_DESK_KINDS.has(raw as DeskFeedKind)) return raw as DeskFeedKind;
  if (raw.startsWith('workout')) return 'workout_finished';
  return 'checkin';
}

// ─── Main Action ──────────────────────────────────────────────────

export async function getGymDashboardOverview(
  gymId: string,
  windowDays: number = 7,
): Promise<{ success: boolean; data?: DashboardOverview; error?: string }> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase.rpc('get_gym_dashboard_overview', {
      p_gym_id: gymId,
      p_window_days: windowDays,
    });

    if (error) throw error;
    if (!data) return { success: false, error: 'No data returned from RPC' };

    const raw = data as Record<string, unknown>;
    const kpis = (raw.kpis || {}) as Record<string, unknown>;
    const members = (kpis.members || {}) as Record<string, unknown>;
    const checkins = (kpis.checkins || {}) as Record<string, unknown>;
    const storeDesk = (kpis.storeDesk || kpis.store_desk || {}) as Record<string, unknown>;
    const economy = (kpis.economy || {}) as Record<string, unknown>;
    const drops = (kpis.dropsIssued7d || kpis.drops_issued_7d || {}) as Record<string, unknown>;
    const risk = (kpis.risk || {}) as Record<string, unknown>;

    const machineOps = (raw.machineOps || raw.machine_ops || {}) as Record<string, unknown>;
    const liveSummary = (machineOps.liveSummary || machineOps.live_summary || {}) as Record<string, unknown>;
    const rawTrend = (machineOps.usageTrend7d || machineOps.usage_trend_7d || []) as Array<Record<string, unknown>>;
    const rawTypeSplit = (machineOps.typeSplit || machineOps.type_split || []) as Array<Record<string, unknown>>;
    const rawPeak = (machineOps.peakHour || machineOps.peak_hour || null) as Record<string, unknown> | null;

    const rawFeed = (raw.deskFeed || raw.desk_feed || []) as Array<Record<string, unknown>>;
    const rawChallenge = (raw.challengeSnapshot || raw.challenge_snapshot || {}) as Record<string, unknown>;
    const rawPerformers = (raw.topPerformers || raw.top_performers || []) as Array<Record<string, unknown>>;

    const deltaPctRaw = drops.deltaPct ?? drops.delta_pct;
    const deltaPct = deltaPctRaw === null || deltaPctRaw === undefined ? null : num(deltaPctRaw);
    const deltaAbsolute = num(drops.deltaAbsolute ?? drops.delta_absolute);

    const overview: DashboardOverview = {
      kpis: {
        members: {
          total: num(members.total),
          active7d: num(members.active7d ?? members.active_7d),
          activeRatePct: clamp(num(members.activeRatePct ?? members.active_rate_pct), 0, 100),
        },
        checkins: {
          today: num(checkins.today),
          week: num(checkins.week),
        },
        storeDesk: {
          pendingPickups: num(storeDesk.pendingPickups ?? storeDesk.pending_pickups),
          confirmedToday: num(storeDesk.confirmedToday ?? storeDesk.confirmed_today),
        },
        economy: {
          burnMintRatio: num(economy.burnMintRatio ?? economy.burn_mint_ratio),
          top1SharePct: num(economy.top1SharePct ?? economy.top1_share_pct),
          health: mapHealth(economy.health as string),
          healthLabel: (economy.healthLabel ?? economy.health_label ?? '') as string,
          totalMembers: num(economy.totalMembers ?? economy.total_members),
        },
        dropsIssued7d: {
          total: num(drops.total),
          prev7d: num(drops.prev7d ?? drops.prev_7d),
          deltaPct,
          deltaAbsolute,
        },
        risk: {
          unresolved: num(risk.unresolved),
          critical: num(risk.critical),
        },
      },
      machineOps: {
        liveSummary: {
          active: num(liveSummary.active),
          available: num(liveSummary.available),
          maintenance: num(liveSummary.maintenance),
          offline: num(liveSummary.offline),
          total: num(liveSummary.total),
        },
        usageTrend7d: rawTrend.map((t) => ({ date: String(t.date || ''), sessions: num(t.sessions) })),
        typeSplit: rawTypeSplit.map((t) => ({
          type: String(t.type || ''),
          sessions: num(t.sessions),
          sharePct: num(t.sharePct ?? t.share_pct),
        })),
        peakHour: rawPeak ? { hour: num(rawPeak.hour), sessions: num(rawPeak.sessions) } : null,
      },
      deskFeed: rawFeed.map((f) => ({
        id: String(f.id || ''),
        kind: mapDeskFeedKind(String(f.kind || '')),
        title: String(f.title || ''),
        at: String(f.at || f.created_at || f.checked_in_at || f.timestamp || ''),
        status: String(f.status || ''),
      })),
      challengeSnapshot: {
        active: num(rawChallenge.active),
        completionRatePct: num(rawChallenge.completionRatePct ?? rawChallenge.completion_rate_pct),
        mostPopular: (rawChallenge.mostPopular ?? rawChallenge.most_popular ?? null) as string | null,
      },
      topPerformers: rawPerformers.map((p) => ({
        id: String(p.id || ''),
        username: String(p.username || ''),
        avatar_url: (p.avatar_url ?? null) as string | null,
        earnedDrops: num(p.earnedDrops ?? p.earned_drops),
      })),
      setupComplete: Boolean(raw.setupComplete ?? raw.setup_complete),
    };

    return { success: true, data: overview };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Failed to fetch dashboard data';
    return { success: false, error: errMsg };
  }
}
