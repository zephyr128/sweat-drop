/**
 * Client-side best-streak (longest historical run of consecutive days with
 * at least one rewarded session or check-in) for the *current* user only.
 *
 * Mirrors the SQL in `get_user_best_streak` (migration 20260425230000) so
 * results are identical regardless of which path is taken (RPC vs JS
 * fallback). Both paths group by **Europe/Belgrade** calendar day —
 * matching the unique index on `gym_checkins (user_id, gym_id, DATE(...
 * AT TIME ZONE 'Europe/Belgrade'))` and all other day-bucketed business
 * logic in the app (daily quotas, streak awards, etc).
 *
 * Why a shared helper:
 * Naive `Date.toISOString().slice(0,10)` returns a UTC date, which can
 * drift by ±1 day relative to the Belgrade calendar around midnight. Two
 * surfaces using different bucketings produced an off-by-one discrepancy
 * (My Stats vs Profile screen). Centralising the conversion here ensures
 * we never disagree on the answer.
 */

const BELGRADE_TZ = 'Europe/Belgrade';

/**
 * Converts a TIMESTAMPTZ ISO string to its YYYY-MM-DD key in
 * Europe/Belgrade. `'sv-SE'` locale is used purely because it formats as
 * `YYYY-MM-DD` natively (sortable lex == sortable chrono); the timezone
 * is what actually drives correctness.
 */
export function toBelgradeDayKey(ts: string | Date): string {
  const d = typeof ts === 'string' ? new Date(ts) : ts;
  return d.toLocaleDateString('sv-SE', { timeZone: BELGRADE_TZ });
}

interface SessionLike {
  started_at?: string | null;
  is_active?: boolean | null;
  drops_earned?: number | null;
}

interface CheckinLike {
  checked_in_at?: string | null;
}

/**
 * Returns the longest run of consecutive Belgrade days that contain at
 * least one closed session with drops_earned > 0 OR at least one
 * check-in. Returns 0 when the user has no qualifying activity.
 */
export function computeBestStreak(
  sessions: SessionLike[] | null | undefined,
  checkins: CheckinLike[] | null | undefined,
): number {
  const dayKeys = new Set<string>();

  for (const s of sessions ?? []) {
    if (s.is_active) continue;
    if ((s.drops_earned ?? 0) <= 0) continue;
    if (!s.started_at) continue;
    dayKeys.add(toBelgradeDayKey(s.started_at));
  }

  for (const c of checkins ?? []) {
    if (!c.checked_in_at) continue;
    dayKeys.add(toBelgradeDayKey(c.checked_in_at));
  }

  if (dayKeys.size === 0) return 0;

  // Sorted YYYY-MM-DD strings sort chronologically.
  const sorted = [...dayKeys].sort();

  let max = 1;
  let cur = 1;
  for (let i = 1; i < sorted.length; i++) {
    // Compute the gap in days using UTC midnight for both dates — both
    // strings are bare YYYY-MM-DD with no TZ component, so any TZ used
    // consistently produces the same delta.
    const prev = new Date(sorted[i - 1] + 'T00:00:00Z').getTime();
    const curr = new Date(sorted[i] + 'T00:00:00Z').getTime();
    const diffDays = Math.round((curr - prev) / 86400000);

    if (diffDays === 1) {
      cur += 1;
    } else if (diffDays > 1) {
      if (cur > max) max = cur;
      cur = 1;
    }
  }
  if (cur > max) max = cur;
  return max;
}
