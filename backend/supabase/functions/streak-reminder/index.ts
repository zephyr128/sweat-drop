// Edge Function: streak-reminder
// Description: Sends push notifications to members with active streaks
//              who haven't visited today. "🔥 Streak at risk!"
//
// AGENT NOTE: [2026-05-11] - edge-function-agent (feature_multigym_notification_differentiation)
//   Restructured from one global bulk push to a per-gym loop (same pattern as
//   send-happy-hour-reminders). Each notification now identifies the originating gym:
//   title  → "🔥 Streak at risk! — [Gym Name]"
//   data   → gym_id, gym_name, gym_logo_url
//   Users in multiple gyms receive one reminder per gym (visiting EITHER gym keeps
//   the streak, so each gym is a valid reminder source). Per-gym batching means one
//   send-push call per active gym per run — efficient and batch-safe.
//
// AGENT NOTE: [2026-04-20] - supabase-dba (push_notifications_systemic_fix_plan Phase 2.2)
//   Added user_ids to send-push call so inbox rows are written for all at-risk members.
//
// AGENT NOTE: [2026-03-02] - supabase-dba (Phase 2, Task 2.7)
// Reference: docs/plans/mvp_full_audit_and_build_plan.md
//
// SCHEDULE: Daily at 18:00 UTC (19:00 Belgrade = evening reminder)
// TRIGGER:  cron.schedule OR external scheduler calling this endpoint.
//
// INTERFACE CONTRACT:
//   Input:  {} (no payload required; reads state from DB)
//   Output: { gyms_scanned, total_at_risk, total_sent, failed, errors }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  deliveryCountFromSendPushBody,
} from '../_shared/expo-push.ts';
import { getEdgeInternalJwt } from '../_shared/edge-auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

function maskId(id: string): string {
  if (!id || id.length < 8) return '***';
  return id.slice(0, 4) + '…' + id.slice(-4);
}

interface GymRow {
  id: string;
  name: string;
  logo_url: string | null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const summary = {
    gyms_scanned: 0,
    total_at_risk: 0,
    total_sent: 0,
    failed: 0,
    errors: [] as string[],
  };

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const internalJwt = getEdgeInternalJwt();
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Today's date in Belgrade timezone (primary pilot timezone).
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Belgrade' });

    // ── 1. Load all active gyms ───────────────────────────────────────
    const { data: gyms, error: gymsErr } = await supabase
      .from('gyms')
      .select('id, name, logo_url')
      .eq('is_active', true);

    if (gymsErr) throw gymsErr;
    if (!gyms || gyms.length === 0) {
      console.log(JSON.stringify({ event: 'streak-reminder', skipped: 'no_active_gyms' }));
      return jsonResponse({ summary }, 200);
    }

    summary.gyms_scanned = gyms.length;

    // ── 2. Per-gym: find at-risk members and send gym-scoped push ─────
    for (const gym of gyms as GymRow[]) {
      try {
        // Fetch all members of this gym; filter at-risk in JS.
        // profiles!inner ensures only members who have a profile row.
        const { data: members, error: membersErr } = await supabase
          .from('gym_memberships')
          .select(`
            user_id,
            profiles!inner (
              expo_push_token,
              streak_days,
              last_visit_date
            )
          `)
          .eq('gym_id', gym.id);

        if (membersErr) {
          summary.errors.push(`gym=${maskId(gym.id)} members query: ${membersErr.message}`);
          summary.failed++;
          continue;
        }

        const atRisk = (members ?? []).filter((m: any) => {
          const p = m.profiles;
          return p && (p.streak_days ?? 0) > 0 && p.last_visit_date !== today;
        });

        if (atRisk.length === 0) continue;

        summary.total_at_risk += atRisk.length;

        const userIds = atRisk.map((m: any) => m.user_id);
        const tokens = atRisk
          .map((m: any) => m.profiles?.expo_push_token)
          .filter((t: unknown): t is string => typeof t === 'string' && t.length > 0);

        const gymName = gym.name ?? 'your gym';
        const gymLogoUrl = gym.logo_url ?? null;

        const pushRes = await fetch(
          `${supabaseUrl}/functions/v1/send-push`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${internalJwt}`,
            },
            body: JSON.stringify({
              client_ref: 'streak_reminder',
              tokens,
              user_ids: userIds,
              title: `🔥 Streak at risk! — ${gymName}`,
              body: 'Visit the gym today to keep your streak alive.',
              data: {
                type: 'streak_reminder',
                gym_id: gym.id,
                gym_name: gymName,
                gym_logo_url: gymLogoUrl,
              },
            }),
          }
        );

        const pushJson = await pushRes.json().catch(() => null);
        const delivered = deliveryCountFromSendPushBody(pushJson);

        if (pushRes.ok) {
          summary.total_sent += delivered;
        } else {
          summary.errors.push(`gym=${maskId(gym.id)} push HTTP ${pushRes.status}`);
          summary.failed++;
        }

        console.log(JSON.stringify({
          event: 'streak-reminder:gym',
          gym_id: maskId(gym.id),
          gym_name: gymName,
          at_risk: atRisk.length,
          tokens_submitted: tokens.length,
          delivered,
          http_ok: pushRes.ok,
        }));
      } catch (gymErr: unknown) {
        const msg = gymErr instanceof Error ? gymErr.message : 'unknown';
        summary.errors.push(`gym=${maskId(gym.id)} exception: ${msg}`);
        summary.failed++;
      }
    }

    console.log(JSON.stringify({
      event: 'streak-reminder',
      gyms_scanned: summary.gyms_scanned,
      total_at_risk: summary.total_at_risk,
      total_sent: summary.total_sent,
      failed: summary.failed,
    }));

    return jsonResponse({ summary }, 200);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(JSON.stringify({ event: 'streak-reminder', fatal: true, error: message.slice(0, 200) }));
    summary.errors.push(`fatal: ${message}`);
    return jsonResponse({ error: 'Internal processing error', summary }, 500);
  }
});

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });
}
