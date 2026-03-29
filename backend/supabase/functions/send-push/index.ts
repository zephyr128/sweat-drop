// Edge Function: send-push
// Description: Sends Expo push notifications to an array of tokens.
// Called by other Edge Functions and pg_cron jobs.
//
// AGENT NOTE: [2026-03-27] - edge-function-agent — batch resilience, structured metrics, no secrets in logs.
// AGENT NOTE: [2026-03-02] - supabase-dba (Phase 2, Task 2.6)
//
// INTERFACE CONTRACT (v2 response; backward-compatible fields):
//   Input:  { tokens: string[], title: string, body: string, data?: object, client_ref?: string }
//   Output: {
//     ok: boolean,
//     version: '2',
//     sent: number,              // valid tokens submitted to Expo (same meaning as legacy)
//     receipt_ok: number,       // Expo tickets with status "ok"
//     receipt_error: number,    // Expo tickets with status "error"
//     requested, valid_tokens, skipped_invalid, deduped_in_request,
//     batches_attempted, batches_failed,
//     batch_summaries: [...],
//     result?: legacy raw batch payloads (omitted by default for size)
//   }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  EXPO_PUSH_BATCH_SIZE,
  isExpoPushToken,
  summarizeExpoTickets,
} from '../_shared/expo-push.ts';
import { parsePushRequest } from '../_shared/send-push-request.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const started = Date.now();

  try {
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ ok: false, version: '2', error: 'invalid_json' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const parsed = parsePushRequest(rawBody);
    if (!parsed.ok) {
      return new Response(
        JSON.stringify({ ok: false, version: '2', error: parsed.error }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { tokens, title, body, data, client_ref, include_raw_batches } = parsed.value;
    const requested = tokens.length;

    if (requested === 0) {
      const payload = {
        ok: true,
        version: '2' as const,
        sent: 0,
        receipt_ok: 0,
        receipt_error: 0,
        requested: 0,
        valid_tokens: 0,
        skipped_invalid: 0,
        deduped_in_request: 0,
        batches_attempted: 0,
        batches_failed: 0,
        batch_summaries: [] as Array<Record<string, unknown>>,
        skip_reason: 'no_tokens' as const,
        result: { skipped: 'no tokens' },
      };
      console.log(JSON.stringify({
        event: 'send-push',
        client_ref: client_ref ?? null,
        ...payload,
      }));
      return new Response(JSON.stringify(payload), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    const validRaw = tokens.filter((t) => isExpoPushToken(t));
    const skipped_invalid = requested - validRaw.length;

    const seen = new Set<string>();
    const messages: Array<{
      to: string;
      sound: 'default';
      title: string;
      body: string;
      data: Record<string, unknown>;
    }> = [];
    let deduped_in_request = 0;
    for (const token of validRaw) {
      if (seen.has(token)) {
        deduped_in_request++;
        continue;
      }
      seen.add(token);
      messages.push({
        to: token,
        sound: 'default',
        title,
        body,
        data: data ?? {},
      });
    }

    const valid_tokens = messages.length;

    if (valid_tokens === 0) {
      const payload = {
        ok: true,
        version: '2' as const,
        sent: 0,
        receipt_ok: 0,
        receipt_error: 0,
        requested,
        valid_tokens: 0,
        skipped_invalid,
        deduped_in_request,
        batches_attempted: 0,
        batches_failed: 0,
        batch_summaries: [],
        skip_reason: 'no_valid_tokens' as const,
        result: { skipped: 'no valid tokens' },
      };
      console.log(JSON.stringify({
        event: 'send-push',
        client_ref: client_ref ?? null,
        ...payload,
      }));
      return new Response(JSON.stringify(payload), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    const batch_summaries: Array<Record<string, unknown>> = [];
    const rawResults: unknown[] = [];
    let receipt_ok = 0;
    let receipt_error = 0;
    let batches_failed = 0;

    for (let i = 0; i < messages.length; i += EXPO_PUSH_BATCH_SIZE) {
      const batch = messages.slice(i, i + EXPO_PUSH_BATCH_SIZE);
      const batchIndex = Math.floor(i / EXPO_PUSH_BATCH_SIZE);

      try {
        const response = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(batch),
        });

        const httpStatus = response.status;
        const text = await response.text();
        let expoJson: unknown;
        try {
          expoJson = JSON.parse(text);
        } catch {
          batches_failed++;
          batch_summaries.push({
            batch_index: batchIndex,
            batch_size: batch.length,
            http_status: httpStatus,
            parse_error: true,
            receipt_ok: 0,
            receipt_error: batch.length,
          });
          receipt_error += batch.length;
          continue;
        }

        if (include_raw_batches) {
          rawResults.push(expoJson);
        }

        const ticketSummary = summarizeExpoTickets(expoJson);
        const batchOk = ticketSummary.receipt_ok;
        let batchErr = ticketSummary.receipt_error;
        const unaccounted = batch.length - batchOk - batchErr;
        if (unaccounted > 0) {
          batchErr += unaccounted;
        }

        receipt_ok += batchOk;
        receipt_error += batchErr;

        if (!response.ok) {
          batches_failed++;
        }

        batch_summaries.push({
          batch_index: batchIndex,
          batch_size: batch.length,
          http_status: httpStatus,
          receipt_ok: batchOk,
          receipt_error: batchErr,
          expo_errors_sample: ticketSummary.error_messages,
          batch_failed_http: !response.ok,
        });
      } catch (e: unknown) {
        batches_failed++;
        const msg = e instanceof Error ? e.message : 'network_error';
        batch_summaries.push({
          batch_index: batchIndex,
          batch_size: batch.length,
          fetch_exception: msg.slice(0, 160),
          receipt_ok: 0,
          receipt_error: batch.length,
        });
        receipt_error += batch.length;
      }
    }

    const batches_attempted = batch_summaries.length;
    const sent = valid_tokens;
    const ok = valid_tokens === 0 || receipt_ok > 0;

    const payload: Record<string, unknown> = {
      ok,
      version: '2',
      sent,
      receipt_ok,
      receipt_error,
      requested,
      valid_tokens,
      skipped_invalid,
      deduped_in_request,
      batches_attempted,
      batches_failed,
      batch_summaries,
    };

    if (include_raw_batches) {
      payload.result = rawResults;
    }

    console.log(JSON.stringify({
      event: 'send-push',
      client_ref: client_ref ?? null,
      duration_ms: Date.now() - started,
      ok,
      requested,
      valid_tokens,
      skipped_invalid,
      deduped_in_request,
      sent,
      receipt_ok,
      receipt_error,
      batches_attempted,
      batches_failed,
    }));

    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(JSON.stringify({
      event: 'send-push',
      fatal: true,
      error: message.slice(0, 200),
    }));

    return new Response(
      JSON.stringify({ ok: false, version: '2', error: 'internal_error' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
