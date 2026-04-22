// Edge Function: drops-expiry-warning
// Description: Sends push notifications to members whose drops are about
//              to expire (30 days and 7 days before expiry).
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
  total_expiring: number;
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

    // --- 30-day warning (expires in 29–31 days) ---
    const { data: expiring30d, error: err30 } = await supabase.rpc(
      'get_expiring_drops_by_window',
      { p_days_from: 29, p_days_to: 31 }
    );

    if (err30) {
      // Fallback if RPC doesn't exist yet — use direct query
      console.warn('RPC get_expiring_drops_by_window not found, using fallback query');
    }

    // Use direct query as primary approach (simpler, no extra RPC needed)
    const { data: warn30, error: qErr30 } = await supabase
      .from('drops_transactions')
      .select(`
        user_id,
        amount,
        profiles!inner(expo_push_token)
      `)
      .not('expires_at', 'is', null)
      .gt('expires_at', new Date(Date.now() + 29 * 86400000).toISOString())
      .lt('expires_at', new Date(Date.now() + 31 * 86400000).toISOString())
      .gt('amount', 0)
      .eq('transaction_type', 'session');

    if (qErr30) throw qErr30;

    if (warn30 && warn30.length > 0) {
      // Aggregate by user — include all users regardless of token presence
      const userMap = new Map<string, { total: number; token: string | null }>();
      for (const row of warn30) {
        const uid = row.user_id;
        const token = (row as any).profiles?.expo_push_token ?? null;

        const existing = userMap.get(uid);
        if (existing) {
          existing.total += row.amount;
          if (!existing.token && token) existing.token = token;
        } else {
          userMap.set(uid, { total: row.amount, token });
        }
      }

      const userIds30 = [...userMap.keys()];
      const tokens30: string[] = [];
      for (const [_uid, { token }] of userMap) {
        if (token && isExpoPushToken(token)) {
          tokens30.push(token);
        }
      }

      if (userIds30.length > 0) {
        const res30 = await fetch(
          `${supabaseUrl}/functions/v1/send-push`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${internalJwt}`,
            },
            body: JSON.stringify({
              client_ref: 'drops_expiry_30d',
              tokens: tokens30,
              user_ids: userIds30,
              title: '💧 Drops expiring soon',
              body: 'You have drops expiring in 30 days. Visit the reward store!',
              data: { type: 'drops_expiry_30d' },
            }),
          }
        );

        const body30 = await res30.json().catch(() => null);
        results['30d'] = {
          users: userIds30.length,
          tokens: tokens30.length,
          delivered: deliveryCountFromSendPushBody(body30),
          http_ok: res30.ok,
          push: compactSendPushMetrics(body30),
        };
      } else {
        results['30d'] = { users: 0, skipped: true };
      }
    } else {
      results['30d'] = { users: 0, skipped: true };
    }

    // --- 7-day warning (expires in 6–8 days) ---
    const { data: warn7, error: qErr7 } = await supabase
      .from('drops_transactions')
      .select(`
        user_id,
        amount,
        profiles!inner(expo_push_token)
      `)
      .not('expires_at', 'is', null)
      .gt('expires_at', new Date(Date.now() + 6 * 86400000).toISOString())
      .lt('expires_at', new Date(Date.now() + 8 * 86400000).toISOString())
      .gt('amount', 0)
      .eq('transaction_type', 'session');

    if (qErr7) throw qErr7;

    if (warn7 && warn7.length > 0) {
      // Aggregate by user — include all users regardless of token presence
      const userMap7 = new Map<string, { total: number; token: string | null }>();
      for (const row of warn7) {
        const uid = row.user_id;
        const token = (row as any).profiles?.expo_push_token ?? null;

        const existing = userMap7.get(uid);
        if (existing) {
          existing.total += row.amount;
          if (!existing.token && token) existing.token = token;
        } else {
          userMap7.set(uid, { total: row.amount, token });
        }
      }

      const userIds7 = [...userMap7.keys()];
      const tokens7: string[] = [];
      for (const [_uid, { token }] of userMap7) {
        if (token && isExpoPushToken(token)) {
          tokens7.push(token);
        }
      }

      if (userIds7.length > 0) {
        const res7 = await fetch(
          `${supabaseUrl}/functions/v1/send-push`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${internalJwt}`,
            },
            body: JSON.stringify({
              client_ref: 'drops_expiry_7d',
              tokens: tokens7,
              user_ids: userIds7,
              title: '⚠️ Drops expiring in 7 days',
              body: 'Spend them in the reward store before they expire!',
              data: { type: 'drops_expiry_7d' },
            }),
          }
        );

        const body7w = await res7.json().catch(() => null);
        results['7d'] = {
          users: userIds7.length,
          tokens: tokens7.length,
          delivered: deliveryCountFromSendPushBody(body7w),
          http_ok: res7.ok,
          push: compactSendPushMetrics(body7w),
        };
      } else {
        results['7d'] = { users: 0, skipped: true };
      }
    } else {
      results['7d'] = { users: 0, skipped: true };
    }

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
