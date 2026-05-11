// Edge Function: send-prize-ready-push
// Description: After staff marks a redemption fulfilled, notify the user that the prize is at the desk.
// Invoked server-to-server from admin (Authorization: Bearer service_role only).
//
// AGENT NOTE: [2026-05-11] - edge-function-agent (feature_multigym_notification_differentiation)
//   Added logo_url to gym query. Push data now includes gym_name + gym_logo_url.
//   Title suffixed: "🎁 Your prize is ready! — [Gym Name]".
//
// Reference: docs/plans/exec_verification_gate_fulfillment_v1.md — Phase 2c
//
// INTERFACE CONTRACT:
//   Input:  POST JSON { redemption_id: string }
//   Auth:   Bearer SUPABASE_SERVICE_ROLE_KEY
//   Output: { success: true, delivered: number } | { skipped: true, reason: 'not_pending' } | { error: string }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  deliveryCountFromSendPushBody,
  isExpoPushToken,
} from '../_shared/expo-push.ts';
import { getEdgeInternalJwt } from '../_shared/edge-auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s
  );
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const internalJwt = getEdgeInternalJwt();
  const authHeader = req.headers.get('Authorization') ?? '';
  const bearer = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : '';

  // Accept either the platform-injected service role key or the custom
  // JWT-format internal key (used for cross-function calls).
  const authorized = !!bearer && (bearer === serviceKey || bearer === internalJwt);
  if (!authorized) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const redemptionId =
    raw && typeof raw === 'object' && 'redemption_id' in raw
      ? (raw as { redemption_id: unknown }).redemption_id
      : undefined;

  if (typeof redemptionId !== 'string' || !isUuid(redemptionId)) {
    return new Response(JSON.stringify({ error: 'redemption_id_required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const { data: row, error: loadError } = await supabase
    .from('redemptions')
    .select('id, user_id, gym_id, source_type, redemption_code, description, status')
    .eq('id', redemptionId)
    .single();

  if (loadError || !row) {
    console.error(
      JSON.stringify({
        event: 'send-prize-ready-push-load',
        redemption_id: redemptionId,
        message: loadError?.message ?? 'not_found',
      })
    );
    return new Response(JSON.stringify({ error: 'not_found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (row.status !== 'pending') {
    return new Response(
      JSON.stringify({ skipped: true, reason: 'not_pending' }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('expo_push_token')
    .eq('id', row.user_id)
    .maybeSingle();

  const token = profile?.expo_push_token;
  if (!token || !isExpoPushToken(token)) {
    console.log(
      JSON.stringify({
        event: 'send-prize-ready-push',
        redemption_id: redemptionId,
        delivered: 0,
        skip_reason: 'no_push_token',
      })
    );
    return new Response(JSON.stringify({ success: true, delivered: 0 }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let gymName = 'your gym';
  let gymLogoUrl: string | null = null;
  if (row.gym_id) {
    const { data: gym } = await supabase
      .from('gyms')
      .select('name, logo_url')
      .eq('id', row.gym_id)
      .maybeSingle();
    if (gym?.name) gymName = gym.name;
    gymLogoUrl = (gym as any)?.logo_url ?? null;
  }

  const code = row.redemption_code ?? '—';

  const pushRes = await fetch(`${supabaseUrl}/functions/v1/send-push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${internalJwt}`,
    },
    body: JSON.stringify({
      client_ref: 'prize_ready',
      tokens: [token],
      user_ids: [row.user_id],
      title: `🎁 Your prize is ready! — ${gymName}`,
      body: `Your prize is ready at ${gymName}. Show code ${code} to collect it.`,
      data: {
        type: 'prize_ready',
        redemption_id: row.id,
        gym_id: row.gym_id ?? '',
        gym_name: gymName,
        ...(gymLogoUrl ? { gym_logo_url: gymLogoUrl } : {}),
      },
    }),
  });

  const pushJson = await pushRes.json().catch(() => null);
  const delivered = deliveryCountFromSendPushBody(pushJson);

  console.log(
    JSON.stringify({
      event: 'send-prize-ready-push',
      redemption_id: redemptionId,
      delivered,
      http_ok: pushRes.ok,
    })
  );

  if (!pushRes.ok) {
    return new Response(JSON.stringify({ success: false, error: 'send_push_failed' }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ success: true, delivered }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
