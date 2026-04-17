// Plain types file — no 'use server' directive.
// Client components import types from here; the actual server actions stay in dashboard-actions.ts.

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
