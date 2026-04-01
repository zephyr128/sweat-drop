'use server';

import { createClient } from '@/lib/supabase-server';
import type { ActivityKind } from './dashboard-actions';

export { type ActivityKind } from './dashboard-actions';

export interface ActivityLogItem {
  id: string;
  kind: ActivityKind;
  title: string;
  memberId: string | null;
  memberName: string;
  memberAvatarUrl: string | null;
  at: string;
  status: string;
  details: string;
}

export interface ActivityLogResult {
  items: ActivityLogItem[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

export type ActivityFilterKind = 'all' | 'checkin' | 'redemption' | 'workout';

const VALID_ACTIVITY_KINDS = new Set<ActivityKind>([
  'checkin', 'redemption',
  'workout_started', 'workout_finished', 'workout_auto_finished', 'workout_cancelled',
]);

function mapActivityKind(raw: string): ActivityKind {
  if (VALID_ACTIVITY_KINDS.has(raw as ActivityKind)) return raw as ActivityKind;
  if (raw.startsWith('workout')) return 'workout_finished';
  return 'checkin';
}

export async function getGymActivityLog(
  gymId: string,
  kind: ActivityFilterKind = 'all',
  search: string | null = null,
  page: number = 1,
  perPage: number = 20,
): Promise<{ success: boolean; data?: ActivityLogResult; error?: string }> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase.rpc('get_gym_activity_log', {
      p_gym_id: gymId,
      p_kind: kind,
      p_search: search || null,
      p_page: page,
      p_per_page: perPage,
    });

    if (error) throw error;

    const raw = (data || {}) as Record<string, unknown>;
    const rawItems = (raw.items || []) as Array<Record<string, unknown>>;

    const items: ActivityLogItem[] = rawItems.map((item) => ({
      id: String(item.id || ''),
      kind: mapActivityKind(String(item.kind || '')),
      title: String(item.title || ''),
      memberId: (item.member_id || item.user_id || null) as string | null,
      memberName: String(item.member_name || item.memberName || 'Member'),
      memberAvatarUrl: (item.member_avatar_url || item.memberAvatarUrl || item.member_avatar || null) as string | null,
      at: String(item.at || item.created_at || item.checked_in_at || item.started_at || item.timestamp || ''),
      status: String(item.status || ''),
      details: String(item.details || ''),
    }));

    // The RPC may not return user_id — resolve from source tables
    const missing = items.filter((i) => !i.memberId);
    if (missing.length > 0) {
      const checkinIds = missing.filter((i) => i.kind === 'checkin').map((i) => i.id);
      const redemptionIds = missing.filter((i) => i.kind === 'redemption').map((i) => i.id);
      const sessionIds = missing.filter((i) => i.kind.startsWith('workout')).map((i) => i.id);

      const idMap: Record<string, string> = {};

      if (checkinIds.length > 0) {
        const { data: rows } = await supabase.from('gym_checkins').select('id, user_id').in('id', checkinIds);
        for (const r of (rows ?? []) as Array<{ id: string; user_id: string }>) idMap[r.id] = r.user_id;
      }
      if (redemptionIds.length > 0) {
        const { data: rows } = await supabase.from('redemptions').select('id, user_id').in('id', redemptionIds);
        for (const r of (rows ?? []) as Array<{ id: string; user_id: string }>) idMap[r.id] = r.user_id;
      }
      if (sessionIds.length > 0) {
        const { data: rows } = await supabase.from('sessions').select('id, user_id').in('id', sessionIds);
        for (const r of (rows ?? []) as Array<{ id: string; user_id: string }>) idMap[r.id] = r.user_id;
      }

      for (const item of items) {
        if (!item.memberId && idMap[item.id]) {
          item.memberId = idMap[item.id];
        }
      }
    }

    const total = Number(raw.total || raw.total_count || 0);
    const resultPage = Number(raw.page || page);
    const resultPerPage = Number(raw.per_page || raw.perPage || perPage);
    const totalPages = Math.max(1, Math.ceil(total / resultPerPage));

    return {
      success: true,
      data: { items, total, page: resultPage, perPage: resultPerPage, totalPages },
    };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Failed to fetch activity log';
    return { success: false, error: errMsg };
  }
}
