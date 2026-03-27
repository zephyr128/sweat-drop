// Edge Function: send-happy-hour-reminders
// Description: Scheduled push notification sender for upcoming Happy Hour windows.
//   Finds members whose preferred reminder offset (30/10/0 min) matches an
//   upcoming window, deduplicates via happy_hour_reminder_logs, and dispatches
//   via the shared send-push edge function.
//
// AGENT NOTE: [2026-03-27] - edge-function-agent
// Reference: docs/plans/happy_hour_visibility_and_reminders_plan.md — Step 2
//
// SCHEDULE: Every 5 minutes (cron-ready, idempotent)
// TRIGGER:  pg_cron or external scheduler POST to this endpoint.
//
// INTERFACE CONTRACT:
//   Input:  {} (no payload required; reads state from DB)
//   Output: { summary: RunSummary }
//
// DEDUPE KEY: (user_id, rule_id, window_start_at, offset_min)
//   — stored in happy_hour_reminder_logs with UNIQUE constraint
//
// RELIABILITY:
//   - Idempotent: dedupe prevents double-send across retries
//   - Batch-safe: individual send failures do not abort the run
//   - Time-window safe: uses server-side NOW() and gym timezone

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const OFFSETS = [30, 10, 0] as const;
const SCAN_WINDOW_MINUTES = 6;

interface RunSummary {
  gyms_scanned: number;
  candidates: number;
  sent: number;
  skipped_no_token: number;
  skipped_pref_disabled: number;
  skipped_deduped: number;
  failed: number;
  errors: string[];
}

interface BoostRule {
  id: string;
  gym_id: string;
  name: string;
  display_label: string | null;
  multiplier: number;
  start_time_local: string;
  end_time_local: string;
  timezone: string;
  days_of_week: number[];
  is_active: boolean;
  is_visible_to_members: boolean;
}

function maskId(id: string): string {
  if (!id || id.length < 8) return '***';
  return id.slice(0, 4) + '…' + id.slice(-4);
}

function buildPushBody(offsetMin: number, multiplier: number): string {
  const mult = `x${multiplier} drops`;
  if (offsetMin === 0) return `Happy Hour is LIVE now • ${mult}`;
  return `Happy Hour starts in ${offsetMin} min • ${mult}`;
}

function buildPushTitle(offsetMin: number): string {
  if (offsetMin === 0) return '🔥 Happy Hour is LIVE!';
  return '⏰ Happy Hour coming up!';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const summary: RunSummary = {
    gyms_scanned: 0,
    candidates: 0,
    sent: 0,
    skipped_no_token: 0,
    skipped_pref_disabled: 0,
    skipped_deduped: 0,
    failed: 0,
    errors: [],
  };

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ── 1. Load all active, visible boost rules ─────────────────────
    const { data: rules, error: rulesErr } = await supabase
      .from('gym_drop_boost_rules')
      .select('id, gym_id, name, display_label, multiplier, start_time_local, end_time_local, timezone, days_of_week, is_active, is_visible_to_members')
      .eq('is_active', true)
      .eq('is_visible_to_members', true);

    if (rulesErr) throw rulesErr;
    if (!rules || rules.length === 0) {
      console.log('send-happy-hour-reminders: no active visible rules');
      return jsonResponse({ summary }, 200);
    }

    const gymIds = [...new Set((rules as BoostRule[]).map((r) => r.gym_id))];
    summary.gyms_scanned = gymIds.length;

    const now = new Date();

    // ── 2. For each rule, compute upcoming windows and match offsets ──
    for (const rule of rules as BoostRule[]) {
      for (const offset of OFFSETS) {
        const windowStart = computeNextWindowStart(rule, now, offset);
        if (!windowStart) continue;

        // ── 3. Find eligible members for this gym + offset ──────────
        const { data: members, error: membersErr } = await supabase
          .from('gym_memberships')
          .select(`
            user_id,
            profiles!inner (
              expo_push_token,
              happy_hour_reminders_enabled,
              happy_hour_reminder_offset_min
            )
          `)
          .eq('gym_id', rule.gym_id);

        if (membersErr) {
          summary.errors.push(`members query gym=${maskId(rule.gym_id)}: ${membersErr.message}`);
          continue;
        }
        if (!members || members.length === 0) continue;

        for (const membership of members) {
          summary.candidates++;

          const profile = (membership as any).profiles;
          if (!profile) continue;

          const token: string | null = profile.expo_push_token;
          const remindersEnabled: boolean = profile.happy_hour_reminders_enabled ?? true;
          const userOffset: number = profile.happy_hour_reminder_offset_min ?? 30;

          if (!remindersEnabled) {
            summary.skipped_pref_disabled++;
            continue;
          }

          if (userOffset !== offset) continue;

          if (!token || !token.startsWith('ExponentPushToken')) {
            summary.skipped_no_token++;
            continue;
          }

          // ── 4. Dedupe check via INSERT … ON CONFLICT ──────────
          const windowStartIso = windowStart.toISOString();
          const { error: dedupeErr } = await supabase
            .from('happy_hour_reminder_logs')
            .insert({
              gym_id: rule.gym_id,
              user_id: membership.user_id,
              rule_id: rule.id,
              window_start_at: windowStartIso,
              offset_min: offset,
            });

          if (dedupeErr) {
            if (dedupeErr.code === '23505') {
              summary.skipped_deduped++;
              continue;
            }
            summary.errors.push(`dedupe insert user=${maskId(membership.user_id)}: ${dedupeErr.message}`);
            summary.failed++;
            continue;
          }

          // ── 5. Send push via send-push edge function ──────────
          try {
            const label = rule.display_label || rule.name;
            const pushRes = await fetch(
              `${supabaseUrl}/functions/v1/send-push`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${supabaseServiceKey}`,
                },
                body: JSON.stringify({
                  tokens: [token],
                  title: buildPushTitle(offset),
                  body: buildPushBody(offset, rule.multiplier),
                  data: {
                    type: 'happy_hour_reminder',
                    gym_id: rule.gym_id,
                    rule_id: rule.id,
                    label,
                    multiplier: rule.multiplier,
                    start_at: windowStartIso,
                    offset_min: offset,
                    deep_link: '/home',
                  },
                }),
              }
            );

            if (!pushRes.ok) {
              const errText = await pushRes.text();
              summary.errors.push(`push failed user=${maskId(membership.user_id)}: HTTP ${pushRes.status}`);
              summary.failed++;
              console.error(`send-push returned ${pushRes.status} for user ${maskId(membership.user_id)}: ${errText.slice(0, 200)}`);
            } else {
              summary.sent++;
            }
          } catch (pushErr: unknown) {
            const msg = pushErr instanceof Error ? pushErr.message : 'Unknown push error';
            summary.errors.push(`push exception user=${maskId(membership.user_id)}: ${msg}`);
            summary.failed++;
          }
        }
      }
    }

    console.log('send-happy-hour-reminders summary:', JSON.stringify({
      gyms_scanned: summary.gyms_scanned,
      candidates: summary.candidates,
      sent: summary.sent,
      skipped_no_token: summary.skipped_no_token,
      skipped_pref_disabled: summary.skipped_pref_disabled,
      skipped_deduped: summary.skipped_deduped,
      failed: summary.failed,
    }));

    return jsonResponse({ summary }, 200);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('send-happy-hour-reminders fatal:', message);
    summary.errors.push(`fatal: ${message}`);

    return jsonResponse({ error: 'Internal processing error', summary }, 500);
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────

/**
 * Compute the next window_start timestamp (UTC) for a given rule and offset.
 * Returns null if no window falls within the current scan interval for this
 * offset, meaning we don't need to fire this reminder right now.
 *
 * Logic:
 *   The reminder should fire when `window_start - offset` is approximately NOW.
 *   We check if NOW falls within [fire_time, fire_time + SCAN_WINDOW_MINUTES).
 *   We look at today and tomorrow (in the rule's local tz) to handle midnight
 *   boundary rules.
 */
function computeNextWindowStart(
  rule: BoostRule,
  now: Date,
  offsetMin: number,
): Date | null {
  const tz = rule.timezone || 'Europe/Belgrade';

  // We need today and tomorrow in the rule's local timezone
  const localNowStr = now.toLocaleString('sv-SE', { timeZone: tz });
  const localDate = localNowStr.split(' ')[0]; // YYYY-MM-DD
  const localTime = localNowStr.split(' ')[1]; // HH:MM:SS

  const localNowMinutes = timeToMinutes(localTime);

  const candidates = [localDate, nextDate(localDate)];

  for (const dateStr of candidates) {
    const dateParts = dateStr.split('-').map(Number);
    const dayOfWeek = getDayOfWeek(dateParts[0], dateParts[1], dateParts[2]);

    if (!rule.days_of_week.includes(dayOfWeek)) continue;

    const startMinutes = timeToMinutes(rule.start_time_local);

    // fire_time_minutes = startMinutes - offsetMin (in local tz)
    const fireMinutes = startMinutes - offsetMin;

    // How many minutes from local-now to fire time?
    // For today candidate: delta = fireMinutes - localNowMinutes
    // For tomorrow candidate: delta = (fireMinutes + 1440) - localNowMinutes
    let delta: number;
    if (dateStr === localDate) {
      delta = fireMinutes - localNowMinutes;
    } else {
      delta = (fireMinutes + 1440) - localNowMinutes;
    }

    // The reminder should fire when delta is in [0, SCAN_WINDOW_MINUTES)
    if (delta >= 0 && delta < SCAN_WINDOW_MINUTES) {
      // Build the window_start as a UTC timestamp
      // window_start_local = dateStr + T + rule.start_time_local
      const windowStartLocal = `${dateStr}T${padTime(rule.start_time_local)}`;
      return localToUtc(windowStartLocal, tz);
    }
  }

  return null;
}

function timeToMinutes(time: string): number {
  const parts = time.split(':').map(Number);
  return parts[0] * 60 + (parts[1] || 0);
}

function padTime(t: string): string {
  // Handles both "17:00" and "17:00:00" formats
  const parts = t.split(':');
  while (parts.length < 3) parts.push('00');
  return parts.map((p) => p.padStart(2, '0')).join(':');
}

function nextDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().split('T')[0];
}

function getDayOfWeek(year: number, month: number, day: number): number {
  // JS Date.getDay() returns 0=Sun which matches PG EXTRACT(DOW)
  return new Date(year, month - 1, day).getDay();
}

/**
 * Convert a local datetime string to UTC Date, given a timezone.
 * Uses the Intl API available in Deno.
 */
function localToUtc(localIso: string, tz: string): Date {
  // Strategy: create a date at the local time, then use formatter to find offset
  // Deno supports Temporal-like formatting via Intl.
  // Simpler approach: parse the local time, format it to get the UTC offset.
  const fakeUtc = new Date(localIso + 'Z');

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const utcFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  // Find the offset by comparing what `fakeUtc` looks like in the target tz vs UTC
  const inTz = formatter.format(fakeUtc);
  const inUtc = utcFormatter.format(fakeUtc);

  const tzDate = parseFormattedDate(inTz);
  const utcDate = parseFormattedDate(inUtc);

  const offsetMs = utcDate.getTime() - tzDate.getTime();

  // window_start_utc = fakeUtc + offsetMs
  return new Date(fakeUtc.getTime() + offsetMs);
}

function parseFormattedDate(formatted: string): Date {
  // Format: "MM/DD/YYYY, HH:MM:SS"
  const [datePart, timePart] = formatted.split(', ');
  const [month, day, year] = datePart.split('/').map(Number);
  const [hour, minute, second] = timePart.split(':').map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
}

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });
}
