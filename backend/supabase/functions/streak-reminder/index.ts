// Edge Function: streak-reminder
// Description: Sends push notifications to members with active streaks
//              who haven't visited today. "🔥 Streak at risk!"
//
// AGENT NOTE: [2026-04-20] - supabase-dba (push_notifications_systemic_fix_plan Phase 2.2)
//   Added user_ids to send-push call so inbox rows are written for all at-risk members.
//
// AGENT NOTE: [2026-03-02] - supabase-dba (Phase 2, Task 2.7)
// Reference: docs/plans/mvp_full_audit_and_build_plan.md
//
// SCHEDULE: Daily at 18:00 UTC (19:00 Belgrade = evening reminder)
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const internalJwt = getEdgeInternalJwt();
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Today's date in Belgrade timezone
    const today = new Date()
      .toLocaleDateString('sv-SE', { timeZone: 'Europe/Belgrade' });

    // Members with active streak who haven't visited today.
    // Select id for user_ids (inbox parity) alongside push token.
    const { data: atRisk, error } = await supabase
      .from('profiles')
      .select('id, expo_push_token, username, streak_days')
      .gt('streak_days', 0)
      .neq('last_visit_date', today);

    if (error) throw error;

    if (!atRisk || atRisk.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, message: 'No at-risk members' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    const userIds = atRisk.map((m) => m.id);
    const tokens = atRisk
      .map((m) => m.expo_push_token)
      .filter((t): t is string => !!t);

    // Call send-push edge function
    const pushResponse = await fetch(
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
          title: '🔥 Streak at risk!',
          body: 'Visit the gym today to keep your streak alive.',
          data: { type: 'streak_reminder' },
        }),
      }
    );

    const pushResult = await pushResponse.json().catch(() => null);
    const delivered = deliveryCountFromSendPushBody(pushResult);

    console.log(JSON.stringify({
      event: 'streak-reminder',
      at_risk_count: atRisk.length,
      tokens_submitted: tokens.length,
      delivered,
      http_ok: pushResponse.ok,
    }));

    return new Response(
      JSON.stringify({
        at_risk_count: atRisk.length,
        tokens_submitted: tokens.length,
        delivered,
        http_ok: pushResponse.ok,
        push_metrics: compactSendPushMetrics(pushResult),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('streak-reminder error:', message);

    return new Response(
      JSON.stringify({ error: message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
