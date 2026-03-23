'use client';

import type { EngagementData } from './EngagementKPIs';
import type { StoreReportRow } from './StoreReportTable';
import type { ArenaReportRow } from './ArenaReportTable';
import type { ChallengeReportRow } from './ChallengeReportTable';

function csvEscape(val: string | number | boolean | null | undefined): string {
  const str = String(val ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function downloadCSV(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function buildEngagementCSV(data: EngagementData): string {
  const rows = [
    ['Metric', 'Value'],
    ['Total Sessions', data.total_sessions],
    ['Avg Duration (min)', data.avg_session_duration_min],
    ['Active Members', data.total_active_members],
    ['Registered Members', data.total_registered_members],
    ['Total Check-ins', data.total_checkins],
    ['Avg Visits per Member', data.avg_visits_per_member],
    ['Inactive 14d+', data.inactive_14d],
    ['Drops Earned', data.total_drops_earned],
    ['Drops Spent', data.total_drops_spent],
    ['Challenges Completed', data.challenges_completed],
    ['Active Challenges', data.active_challenges_count],
    ['Avg Streak Days', data.avg_streak_days],
  ];
  return rows.map(r => r.map(csvEscape).join(',')).join('\n');
}

function buildStoreCSV(data: StoreReportRow[]): string {
  const header = ['Name', 'Price (Drops)', 'Redemptions', 'Total Drops Spent', 'Pending', 'Confirmed', 'Active'];
  const rows = data.map(i => [
    i.item_name, i.price_drops, i.redemptions_count, i.total_drops_spent,
    i.pending_count, i.confirmed_count, i.is_active ? 'Yes' : 'No',
  ]);
  return [header, ...rows].map(r => r.map(csvEscape).join(',')).join('\n');
}

function buildArenasCSV(data: ArenaReportRow[]): string {
  const header = ['Arena', 'Sponsor', 'Your Participants', 'Total Participants', 'Start', 'End', 'Status', 'Revenue Share %'];
  const rows = data.map(a => [
    a.arena_name, a.sponsor_name || '', a.gym_participants_count, a.participants_count,
    a.arena_start, a.arena_end, a.derived_status, a.revenue_share_pct,
  ]);
  return [header, ...rows].map(r => r.map(csvEscape).join(',')).join('\n');
}

function buildChallengesCSV(data: ChallengeReportRow[]): string {
  const header = ['Challenge', 'Type', 'Participants', 'Completions', 'Completion Rate %'];
  const rows = data.map(c => [
    c.challenge_name, c.challenge_type, c.total_participants, c.completions, c.completion_rate,
  ]);
  return [header, ...rows].map(r => r.map(csvEscape).join(',')).join('\n');
}

interface ExportCSVParams {
  gymName: string;
  engagement: EngagementData;
  storeItems: StoreReportRow[];
  arenas: ArenaReportRow[];
  challenges: ChallengeReportRow[];
}

export function exportGymReportCSV(params: ExportCSVParams) {
  const prefix = params.gymName.replace(/\s+/g, '_').toLowerCase();

  downloadCSV(`${prefix}_engagement.csv`, buildEngagementCSV(params.engagement));

  if (params.storeItems.length > 0) {
    setTimeout(() => downloadCSV(`${prefix}_store.csv`, buildStoreCSV(params.storeItems)), 200);
  }

  if (params.arenas.length > 0) {
    setTimeout(() => downloadCSV(`${prefix}_arenas.csv`, buildArenasCSV(params.arenas)), 400);
  }

  if (params.challenges.length > 0) {
    setTimeout(() => downloadCSV(`${prefix}_challenges.csv`, buildChallengesCSV(params.challenges)), 600);
  }
}
