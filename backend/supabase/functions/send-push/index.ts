// Edge Function: send-push
// Description: Sends Expo push notifications to an array of tokens.
// Called by other Edge Functions and pg_cron jobs.
//
// AGENT NOTE: [2026-03-02] - supabase-dba (Phase 2, Task 2.6)
// Reference: docs/plans/mvp_full_audit_and_build_plan.md
//
// INTERFACE CONTRACT:
//   Input:  { tokens: string[], title: string, body: string, data?: object }
//   Output: { sent: number, result: object }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

interface PushRequest {
  tokens: string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { tokens, title, body, data }: PushRequest = await req.json();

    if (!tokens || tokens.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, result: { skipped: 'no tokens' } }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Filter only valid Expo push tokens
    const messages = tokens
      .filter(
        (t: string) => t && typeof t === 'string' && t.startsWith('ExponentPushToken')
      )
      .map((token: string) => ({
        to: token,
        sound: 'default' as const,
        title,
        body,
        data: data || {},
      }));

    if (messages.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, result: { skipped: 'no valid tokens' } }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Expo push API supports batches of up to 100
    const BATCH_SIZE = 100;
    const results = [];

    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      const batch = messages.slice(i, i + BATCH_SIZE);

      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(batch),
      });

      const result = await response.json();
      results.push(result);
    }

    return new Response(
      JSON.stringify({ sent: messages.length, result: results }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('send-push error:', message);

    return new Response(
      JSON.stringify({ error: message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
