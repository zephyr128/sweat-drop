// Edge Function: re-engagement
// Description: Sends push notifications to members who haven't visited
//              in 7 or 14 days.
//
// AGENT NOTE: [2026-05-11] - edge-function-agent (feature_multigym_notification_differentiation)
//   Restructured from one global bulk push to a per-gym loop (same pattern as
//   send-happy-hour-reminders / streak-reminder). Each notification now identifies
//   the originating gym:
//   title  → "💪 We miss you! — [Gym Name]"  (7d)
//            "📣 It's been 2 weeks! — [Gym Name]"  (14d)
//   data   → gym_id, gym_name, gym_logo_url
//   Uses the global profiles.last_visit_date field (per-gym visit tracking does
//   not exist in the data model). A user in multiple gyms who hasn't visited
//   any gym in 7 days will receive one reminder per gym — each gym legitimately
//   wants to re-engage them.
//
// AGENT NOTE: [2026-04-20] - supabase-dba (push_notifications_systemic_fix_plan Phase 2.2)
//   Added user_ids to both 7d and 14d send-push calls for inbox parity.
//
// AGENT NOTE: [2026-03-02] - supabase-dba (Phase 2, Task 2.8)
// Reference: docs/plans/mvp_full_audit_and_build_plan.md
//
// SCHEDULE: Daily at 10:00 UTC (11:00 Belgrade = morning nudge)
// TRIGGER:  cron.schedule OR external scheduler calling this endpoint.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  compactSendPushMetrics,
  deliveryCountFromSendPushBody,
} from '../_shared/expo-push.ts';
import { getEdgeInternalJwt } from '../_shared/edge-auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

interface GymRow {
  id: string;
  name: string;
  owner_id: string | null;
  logo_url: string | null;
}

interface GymWindowResult {
  gyms: number;
  users_found: number;
  sent: number;
  failed: number;
}

function maskId(id: string): string {
  if (!id || id.length < 8) return '***';
  return id.slice(0, 4) + '…' + id.slice(-4);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const internalJwt = getEdgeInternalJwt();
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ── Load all active gyms (shared across both windows) ─────────────
    // Schema note: gym logo lives in `owner_branding` keyed on owner_id
    // (legacy `gyms.logo_url` column was dropped — see
    // 20240101000034_unify_branding_and_cleanup). Hydrate logos via a second
    // query so each gym row carries both name + logo_url.
    const { data: gymsRaw, error: gymsErr } = await supabase
      .from('gyms')
      .select('id, name, owner_id')
      .eq('is_active', true);

    if (gymsErr) throw gymsErr;

    const ownerIds = [...new Set(
      (gymsRaw ?? [])
        .map((g: any) => g?.owner_id)
        .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
    )];
    const logoByOwnerId = new Map<string, string | null>();
    if (ownerIds.length > 0) {
      const { data: brandingRows, error: brandingErr } = await supabase
        .from('owner_branding')
        .select('owner_id, logo_url')
        .in('owner_id', ownerIds);
      if (brandingErr) {
        console.error(JSON.stringify({ event: 're-engagement:owner_branding_error', error: brandingErr.message }));
      }
      for (const b of brandingRows ?? []) {
        if (!b?.owner_id) continue;
        const url = typeof (b as any).logo_url === 'string' && (b as any).logo_url.length > 0
          ? (b as any).logo_url as string
          : null;
        logoByOwnerId.set(b.owner_id, url);
      }
    }
    const activeGyms: GymRow[] = (gymsRaw ?? []).map((g: any) => ({
      id: g.id,
      name: g.name,
      owner_id: g.owner_id ?? null,
      logo_url: g.owner_id ? (logoByOwnerId.get(g.owner_id) ?? null) : null,
    }));

    // ── Date targets ──────────────────────────────────────────────────
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDayDate = sevenDaysAgo.toISOString().split('T')[0];

    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const fourteenDayDate = fourteenDaysAgo.toISOString().split('T')[0];

    const results: {
      '7d': GymWindowResult | { skipped: true };
      '14d': GymWindowResult | { skipped: true };
    } = {
      '7d': { gyms: 0, users_found: 0, sent: 0, failed: 0 },
      '14d': { gyms: 0, users_found: 0, sent: 0, failed: 0 },
    };

    const errors: string[] = [];

    // ── Helper: process one re-engagement window across all gyms ──────
    async function processWindow(
      targetDate: string,
      windowKey: '7d' | '14d',
      titleFn: (gymName: string) => string,
      body: string,
      clientRef: string,
      notifType: string,
    ) {
      const windowResult: GymWindowResult = { gyms: 0, users_found: 0, sent: 0, failed: 0 };

      for (const gym of activeGyms) {
        try {
          // Find members of this gym whose last_visit_date equals the target date.
          const { data: members, error: membersErr } = await supabase
            .from('gym_memberships')
            .select(`
              user_id,
              profiles!inner (
                expo_push_token,
                last_visit_date
              )
            `)
            .eq('gym_id', gym.id);

          if (membersErr) {
            errors.push(`[${windowKey}] gym=${maskId(gym.id)}: ${membersErr.message}`);
            windowResult.failed++;
            continue;
          }

          const inactive = (members ?? []).filter((m: any) =>
            m.profiles?.last_visit_date === targetDate
          );

          if (inactive.length === 0) continue;

          windowResult.gyms++;
          windowResult.users_found += inactive.length;

          const userIds = inactive.map((m: any) => m.user_id);
          const tokens = inactive
            .map((m: any) => m.profiles?.expo_push_token)
            .filter((t: unknown): t is string => typeof t === 'string' && t.length > 0);

          const rawName = typeof gym.name === 'string' ? gym.name.trim() : '';
          const gymName = rawName.length > 0 ? rawName : null;
          const gymLogoUrl = gym.logo_url;
          const title = gymName ? titleFn(gymName) : titleFn('').replace(/ — $/, '').trim();
          const data: Record<string, unknown> = {
            type: notifType,
            gym_id: gym.id,
            ...(gymName ? { gym_name: gymName } : {}),
            ...(gymLogoUrl ? { gym_logo_url: gymLogoUrl } : {}),
          };

          const pushRes = await fetch(
            `${supabaseUrl}/functions/v1/send-push`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${internalJwt}`,
              },
              body: JSON.stringify({
                client_ref: clientRef,
                tokens,
                user_ids: userIds,
                title,
                body,
                data,
              }),
            }
          );

          const pushJson = await pushRes.json().catch(() => null);
          const delivered = deliveryCountFromSendPushBody(pushJson);

          if (pushRes.ok) {
            windowResult.sent += delivered;
          } else {
            errors.push(`[${windowKey}] gym=${maskId(gym.id)} push HTTP ${pushRes.status}`);
            windowResult.failed++;
          }

          console.log(JSON.stringify({
            event: `re-engagement:${windowKey}:gym`,
            gym_id: maskId(gym.id),
            gym_name: gymName ?? null,
            users: inactive.length,
            tokens_submitted: tokens.length,
            delivered,
            http_ok: pushRes.ok,
            ...compactSendPushMetrics(pushJson),
          }));
        } catch (gymErr: unknown) {
          const msg = gymErr instanceof Error ? gymErr.message : 'unknown';
          errors.push(`[${windowKey}] gym=${maskId(gym.id)} exception: ${msg}`);
          windowResult.failed++;
        }
      }

      return windowResult;
    }

    // ── 7-day window ──────────────────────────────────────────────────
    const result7 = await processWindow(
      sevenDayDate,
      '7d',
      (gymName) => `💪 We miss you! — ${gymName}`,
      'Come back and earn 2× drops this week.',
      'reengagement_7d',
      'reengagement_7d',
    );
    results['7d'] = result7.users_found > 0 ? result7 : { skipped: true };

    // ── 14-day window ─────────────────────────────────────────────────
    const result14 = await processWindow(
      fourteenDayDate,
      '14d',
      (gymName) => `📣 It's been 2 weeks! — ${gymName}`,
      'Your drops are waiting. Get back in the game.',
      'reengagement_14d',
      'reengagement_14d',
    );
    results['14d'] = result14.users_found > 0 ? result14 : { skipped: true };

    console.log(JSON.stringify({
      event: 're-engagement',
      gyms_available: activeGyms.length,
      summary: {
        '7d': results['7d'],
        '14d': results['14d'],
      },
      errors: errors.length > 0 ? errors : undefined,
    }));

    return new Response(
      JSON.stringify({ ...results, errors: errors.length > 0 ? errors : undefined }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('re-engagement error:', message);

    return new Response(
      JSON.stringify({ error: message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
