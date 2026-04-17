// Plain types file — no 'use server' directive.
// Client components import types from here; server actions import from activity-log-actions.ts.

import type { ActivityKind } from './dashboard-types';
export type { ActivityKind } from './dashboard-types';

export type ActivityFilterKind = 'all' | 'checkin' | 'redemption' | 'workout';

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
