// Edge Function: drops-expiry-warning
// Description: Sends push notifications to members whose drops are about
//              to expire (30 days and 7 days before expiry).
//
// AGENT NOTE: [2026-05-11] - edge-function-agent (feature_multigym_notification_differentiation)
//   Added gym_id to drops_transactions select; groups by user_id + gym_id instead of
//   user_id alone. Pre-fetches gym name + logo_url. Each notification now carries:
//   title  → "💧 Drops expiring soon — [Gym Name]"  (30d)
//            "⚠️ Drops expiring in 7 days — [Gym Name]"  (7d)
//   data   → gym_id, gym_name, gym_logo_url
//   Users with drops from multiple gyms receive one notification per gym so they know
//   exactly which gym's drops are expiring.
//
// AGENT NOTE: [2026-04-20] - supabase-dba (push_notifications_systemic_fix_plan Phase 2.2)
//   Added user_ids to both 30d and 7d send-push calls for inbox parity.
//   userMap now aggregates all users (with or without token) so every user gets an inbox row.
//
// AGENT NOTE: [2026-03-02] - supabase-dba (Phase 2, Task 2.9)
// Reference: docs/plans/mvp_full_audit_and_build_plan.md
//
// Q6 Resolution:
//   30 days before: "You have X drops expiring in 30 days → Visit the store"
//   7 days before:  "⚠️ X drops expire in 7 days"
//
// SCHEDULE: Daily at 11:00 UTC (12:00 Belgrade)
// TRIGGER:  cron.schedule OR external scheduler calling this endpoint.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  compactSendPushMetrics,
  deliveryCountFromSendPushBody,
  isExpoPushToken,
} from '../_shared/expo-push.ts';
import { getEdgeInternalJwt } from '../_shared/edge-auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

interface ExpiringDropsRow {
  user_id: string;
  gym_id: string | null;
  amount: number;
  expo_push_token: string | null;
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

    const results: Record<string, unknown> = {};

    // Helper: process one expiry window. Groups by user+gym for gym-differentiated pushes.
    async function processWindow(
      windowKey: string,
      daysFrom: number,
      daysTo: number,
      title: (gymName: string) => string,
      body: string,
      clientRef: string,
      notifType: string,
    ) {
      const { data: rawRows, error: queryErr } = await supabase
        .from('drops_transactions')
        .select(`
          user_id,
          gym_id,
          amount,
          profiles!inner(expo_push_token)
        `)
        .not('expires_at', 'is', null)
        .gt('expires_at', new Date(Date.now() + daysFrom * 86400000).toISOString())
        .lt('expires_at', new Date(Date.now() + daysTo * 86400000).toISOString())
        .gt('amount', 0)
        .eq('transaction_type', 'session');

      if (queryErr) throw queryErr;

      if (!rawRows || rawRows.length === 0) {
        return { users: 0, skipped: true };
      }

      // Aggregate by (user_id, gym_id) — a user may have drops from multiple gyms.
      const gymUserMap = new Map<
        string, // key: `${gym_id}|${user_id}`
        { user_id: string; gym_id: string | null; total: number; token: string | null }
      >();

      for (const row of rawRows) {
        const uid = row.user_id;
        const gid = (row as any).gym_id ?? null;
        const token = (row as any).profiles?.expo_push_token ?? null;
        const key = `${gid ?? 'null'}|${uid}`;

        const existing = gymUserMap.get(key);
        if (existing) {
          existing.total += (row as any).amount ?? 0;
          if (!existing.token && token) existing.token = token;
        } else {
          gymUserMap.set(key, { user_id: uid, gym_id: gid, total: (row as any).amount ?? 0, token });
        }
      }

      // Group entries by gym_id for batch send-push calls (one per gym).
      const byGym = new Map<
        string, // gym_id (or 'null' for rows without gym)
        Array<{ user_id: string; token: string | null }>
      >();
      for (const entry of gymUserMap.values()) {
        const gid = entry.gym_id ?? 'null';
        if (!byGym.has(gid)) byGym.set(gid, []);
        byGym.get(gid)!.push({ user_id: entry.user_id, token: entry.token });
      }

      // Pre-fetch gym names and logos for all non-null gym_ids.
      // Schema: logo lives in owner_branding keyed by owner_id (legacy
      // gyms.logo_url was dropped — see 20240101000034 migration).
      const gymIdList = [...byGym.keys()].filter((k) => k !== 'null');
      const gymInfoById = new Map<string, { name: string | null; logo_url: string | null }>();
      if (gymIdList.length > 0) {
        const { data: gymRows, error: gymErr } = await supabase
          .from('gyms')
          .select('id, name, owner_id')
          .in('id', gymIdList);
        if (gymErr) {
          console.error(JSON.stringify({ event: `drops-expiry-${windowKey}:gym_lookup_error`, error: gymErr.message }));
        } else {
          const ownerIds = [...new Set(
            (gymRows ?? [])
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
              console.error(JSON.stringify({ event: `drops-expiry-${windowKey}:owner_branding_error`, error: brandingErr.message }));
            }
            for (const b of brandingRows ?? []) {
              if (!b?.owner_id) continue;
              const url = typeof (b as any).logo_url === 'string' && (b as any).logo_url.length > 0
                ? (b as any).logo_url as string
                : null;
              logoByOwnerId.set(b.owner_id, url);
            }
          }
          for (const g of gymRows ?? []) {
            if (!g?.id) continue;
            const rawName = typeof g.name === 'string' ? g.name.trim() : '';
            const name = rawName.length > 0 ? rawName : null;
            const logoUrl = g.owner_id ? (logoByOwnerId.get(g.owner_id) ?? null) : null;
            gymInfoById.set(g.id, { name, logo_url: logoUrl });
          }
        }
      }

      let totalUsers = 0;
      let totalDelivered = 0;
      let windowFailed = 0;
      const windowMetrics: unknown[] = [];

      for (const [gid, users] of byGym) {
        const gymInfo = gid !== 'null' ? gymInfoById.get(gid) : undefined;
        const gymName = gymInfo?.name ?? null;
        const gymLogoUrl = gymInfo?.logo_url ?? null;
        const gymId = gid !== 'null' ? gid : null;

        const userIds = users.map((u) => u.user_id);
        const tokens = users
          .map((u) => u.token)
          .filter((t): t is string => isExpoPushToken(t));

        totalUsers += userIds.length;

        try {
          // Push title carries a gym suffix only when we know the gym name —
          // never inject "your gym" placeholder text into user-visible copy.
          const finalTitle = gymName ? title(gymName) : title('').replace(/ — $/, '').trim();
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
                title: finalTitle,
                body,
                data: {
                  type: notifType,
                  ...(gymId ? { gym_id: gymId } : {}),
                  ...(gymName ? { gym_name: gymName } : {}),
                  ...(gymLogoUrl ? { gym_logo_url: gymLogoUrl } : {}),
                },
              }),
            }
          );

          const pushJson = await pushRes.json().catch(() => null);
          const delivered = deliveryCountFromSendPushBody(pushJson);
          totalDelivered += delivered;
          if (!pushRes.ok) windowFailed++;
          windowMetrics.push({ gym_name: gymName, users: userIds.length, ...compactSendPushMetrics(pushJson) });
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : 'unknown';
          console.error(JSON.stringify({ event: `drops-expiry-${windowKey}:push_error`, gym: gymName, error: msg }));
          windowFailed++;
        }
      }

      return {
        users: totalUsers,
        delivered: totalDelivered,
        failed: windowFailed,
        gyms: byGym.size,
        metrics: windowMetrics,
      };
    }

    // ── 30-day warning ────────────────────────────────────────────────
    results['30d'] = await processWindow(
      '30d', 29, 31,
      (gymName) => `💧 Drops expiring soon — ${gymName}`,
      'You have drops expiring in 30 days. Visit the reward store!',
      'drops_expiry_30d',
      'drops_expiry_30d',
    );

    // ── 7-day warning ─────────────────────────────────────────────────
    results['7d'] = await processWindow(
      '7d', 6, 8,
      (gymName) => `⚠️ Drops expiring in 7 days — ${gymName}`,
      'Spend them in the reward store before they expire!',
      'drops_expiry_7d',
      'drops_expiry_7d',
    );

    console.log(JSON.stringify({
      event: 'drops-expiry-warning',
      window_30d: results['30d'],
      window_7d: results['7d'],
    }));

    return new Response(
      JSON.stringify(results),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('drops-expiry-warning error:', message);

    return new Response(
      JSON.stringify({ error: message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
