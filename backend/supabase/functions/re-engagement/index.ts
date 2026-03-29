// Edge Function: re-engagement
// Description: Sends push notifications to members who haven't visited
//              in 7 or 14 days.
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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const results: Record<string, unknown> = {};
    const logSummary: Record<string, unknown> = {};

    // --- 7-day inactive members ---
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDayDate = sevenDaysAgo.toISOString().split('T')[0];

    const { data: inactive7d, error: err7 } = await supabase
      .from('profiles')
      .select('expo_push_token, username')
      .not('expo_push_token', 'is', null)
      .eq('last_visit_date', sevenDayDate);

    if (err7) throw err7;

    if (inactive7d && inactive7d.length > 0) {
      const tokens7 = inactive7d
        .map((m) => m.expo_push_token)
        .filter((t): t is string => !!t);

      const res7 = await fetch(
        `${supabaseUrl}/functions/v1/send-push`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            client_ref: 'reengagement_7d',
            tokens: tokens7,
            title: '💪 We miss you!',
            body: 'Come back and earn 2× drops this week.',
            data: { type: 'reengagement_7d' },
          }),
        }
      );

      const body7 = await res7.json().catch(() => null);
      results['7d'] = {
        count: tokens7.length,
        push: compactSendPushMetrics(body7),
        http_ok: res7.ok,
      };
      logSummary['7d'] = {
        tokens: tokens7.length,
        delivered: deliveryCountFromSendPushBody(body7),
        http_ok: res7.ok,
      };
    } else {
      results['7d'] = { count: 0, skipped: true };
      logSummary['7d'] = { skipped: true };
    }

    // --- 14-day inactive members ---
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const fourteenDayDate = fourteenDaysAgo.toISOString().split('T')[0];

    const { data: inactive14d, error: err14 } = await supabase
      .from('profiles')
      .select('expo_push_token, username')
      .not('expo_push_token', 'is', null)
      .eq('last_visit_date', fourteenDayDate);

    if (err14) throw err14;

    if (inactive14d && inactive14d.length > 0) {
      const tokens14 = inactive14d
        .map((m) => m.expo_push_token)
        .filter((t): t is string => !!t);

      const res14 = await fetch(
        `${supabaseUrl}/functions/v1/send-push`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            client_ref: 'reengagement_14d',
            tokens: tokens14,
            title: "📣 It's been 2 weeks!",
            body: 'Your drops are waiting. Get back in the game.',
            data: { type: 'reengagement_14d' },
          }),
        }
      );

      const body14 = await res14.json().catch(() => null);
      results['14d'] = {
        count: tokens14.length,
        push: compactSendPushMetrics(body14),
        http_ok: res14.ok,
      };
      logSummary['14d'] = {
        tokens: tokens14.length,
        delivered: deliveryCountFromSendPushBody(body14),
        http_ok: res14.ok,
      };
    } else {
      results['14d'] = { count: 0, skipped: true };
      logSummary['14d'] = { skipped: true };
    }

    console.log(JSON.stringify({ event: 're-engagement', summary: logSummary }));

    return new Response(
      JSON.stringify(results),
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
