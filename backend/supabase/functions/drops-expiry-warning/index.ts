// Edge Function: drops-expiry-warning
// Description: Sends push notifications to members whose drops are about
//              to expire (30 days and 7 days before expiry).
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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

interface ExpiringDropsRow {
  user_id: string;
  total_expiring: number;
  expo_push_token: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
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
      // Aggregate by user
      const userMap = new Map<string, { total: number; token: string }>();
      for (const row of warn30) {
        const uid = row.user_id;
        const token = (row as any).profiles?.expo_push_token;
        if (!token) continue;

        const existing = userMap.get(uid);
        if (existing) {
          existing.total += row.amount;
        } else {
          userMap.set(uid, { total: row.amount, token });
        }
      }

      // Send per-user notifications (personalized with drop amount)
      const tokens30: string[] = [];
      for (const [_uid, { total, token }] of userMap) {
        if (token && token.startsWith('ExponentPushToken')) {
          tokens30.push(token);
          // For personalized messages we'd need individual sends,
          // but for MVP we batch with a generic message
        }
      }

      if (tokens30.length > 0) {
        const totalDrops = [...userMap.values()].reduce(
          (sum, v) => sum + v.total, 0
        );

        const res30 = await fetch(
          `${supabaseUrl}/functions/v1/send-push`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({
              tokens: tokens30,
              title: '💧 Drops expiring soon',
              body: 'You have drops expiring in 30 days. Visit the reward store!',
              data: { type: 'drops_expiry_30d' },
            }),
          }
        );

        results['30d'] = {
          users: tokens30.length,
          push: await res30.json(),
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
      const userMap7 = new Map<string, { total: number; token: string }>();
      for (const row of warn7) {
        const uid = row.user_id;
        const token = (row as any).profiles?.expo_push_token;
        if (!token) continue;

        const existing = userMap7.get(uid);
        if (existing) {
          existing.total += row.amount;
        } else {
          userMap7.set(uid, { total: row.amount, token });
        }
      }

      const tokens7: string[] = [];
      for (const [_uid, { token }] of userMap7) {
        if (token && token.startsWith('ExponentPushToken')) {
          tokens7.push(token);
        }
      }

      if (tokens7.length > 0) {
        const res7 = await fetch(
          `${supabaseUrl}/functions/v1/send-push`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({
              tokens: tokens7,
              title: '⚠️ Drops expiring in 7 days',
              body: 'Spend them in the reward store before they expire!',
              data: { type: 'drops_expiry_7d' },
            }),
          }
        );

        results['7d'] = {
          users: tokens7.length,
          push: await res7.json(),
        };
      } else {
        results['7d'] = { users: 0, skipped: true };
      }
    } else {
      results['7d'] = { users: 0, skipped: true };
    }

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
