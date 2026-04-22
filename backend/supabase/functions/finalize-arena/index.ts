// Edge Function: finalize-arena
// Description: Finalizes ended arenas by calling finalize_arena() RPC and sending push notifications.
// Called by cron job: Daily at 00:30 UTC
//
// AGENT NOTE: [2026-04-20] - supabase-dba (push_notifications_systemic_fix_plan Phase 1.1)
//   Winners loop: token check removed — send-push called with tokens:[] when no token, user_ids always present.
//   Non-winner loop: token filter removed from DB query; gated on user count, not token count.
//
// AGENT NOTE: [2026-04-17] - edge-function-agent (verification gate Phase 2b)
// Reference: docs/plans/exec_verification_gate_fulfillment_v1.md — per-winner pushes,
//   pending_verification copy, data.gym_name + redemption_status / requires_verification.
//
// AGENT NOTE: [2026-03-11] - supabase-dba
// Reference: docs/plans/arena_expiration_and_results_flow.md — Step 1
//
// FIX: Changed redemptions filter from 'claimed' to 'pending' (new redemptions start as pending)
// ENHANCEMENT: Now notifies ALL participants (not just winners) with arena_ended push
//
// INTERFACE CONTRACT:
//   Input:  { arena_id?: UUID } (optional, processes all ended arenas if not provided)
//   Output: { success: boolean, arenas_processed: number, winners_notified: number, participants_notified: number, errors: string[] }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
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

interface FinalizeRequest {
  arena_id?: string;
}

/** Rank suffix helper: 1→1st, 2→2nd, 3→3rd */
function ordinal(n: number): string {
  if (n === 1) return '1st';
  if (n === 2) return '2nd';
  if (n === 3) return '3rd';
  return `${n}th`;
}

interface ArenaWinnerRedemptionEmbed {
  id: string;
  redemption_code: string | null;
  status: string;
  gym_id: string | null;
  gyms: { name: string } | null;
}

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { arena_id }: FinalizeRequest = await req.json().catch(() => ({}));

    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const internalJwt = getEdgeInternalJwt();
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find arenas to finalize
    let arenasToFinalize: Array<{ id: string; name: string }> = [];

    if (arena_id) {
      // Finalize specific arena
      const { data: arena, error: arenaError } = await supabase
        .from('sweat_arenas')
        .select('id, name')
        .eq('id', arena_id)
        .eq('is_finalized', false)
        .single();

      if (arenaError) {
        throw new Error(`Failed to fetch arena: ${arenaError.message}`);
      }

      if (arena) {
        arenasToFinalize = [arena];
      }
    } else {
      // Find all arenas that have ended and are not finalized
      const { data: arenas, error: arenasError } = await supabase
        .from('sweat_arenas')
        .select('id, name')
        .eq('is_finalized', false)
        .lt('end_date', new Date().toISOString().split('T')[0]); // end_date < CURRENT_DATE

      if (arenasError) {
        throw new Error(`Failed to fetch arenas: ${arenasError.message}`);
      }

      arenasToFinalize = arenas || [];
    }

    if (arenasToFinalize.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          arenas_processed: 0,
          winners_notified: 0,
          message: 'No arenas to finalize.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let arenasProcessed = 0;
    let winnersNotified = 0;
    let participantsNotified = 0;
    const errors: string[] = [];

    // Process each arena
    for (const arena of arenasToFinalize) {
      try {
        // Call finalize_arena RPC
        const { data: result, error: rpcError } = await supabase.rpc(
          'finalize_arena',
          {
            p_arena_id: arena.id,
          }
        );

        if (rpcError) {
          errors.push(`Arena ${arena.name} (${arena.id}): ${rpcError.message}`);
          continue;
        }

        if (!result || result.length === 0) {
          errors.push(`Arena ${arena.name} (${arena.id}): No result returned from RPC`);
          continue;
        }

        const { winners_count } = result[0];
        const winnerUserIds: string[] = [];

        if (winners_count > 0) {
          // Fetch winners with redemption status + gym name (verification gate Phase 2b)
          const { data: winnerResults } = await supabase
            .from('arena_results')
            .select(
              'user_id, rank, redemption_id, redemptions!inner(id, redemption_code, status, gym_id, gyms(name))'
            )
            .eq('arena_id', arena.id)
            .not('redemption_id', 'is', null);

          const winnerIds = winnerResults?.map((r) => r.user_id) || [];
          winnerUserIds.push(...winnerIds);

          if (winnerIds.length > 0) {
            const { data: winnerProfiles } = await supabase
              .from('profiles')
              .select('id, expo_push_token')
              .in('id', winnerIds);

            const tokenByUser = new Map<string, string>();
            for (const p of winnerProfiles || []) {
              if (p.expo_push_token && isExpoPushToken(p.expo_push_token)) {
                tokenByUser.set(p.id, p.expo_push_token);
              }
            }

            for (const wr of winnerResults || []) {
              const token = tokenByUser.get(wr.user_id);
              // Always call send-push — inbox row is written regardless of token presence.
              // send-push handles tokens:[] gracefully (skip_reason: no_tokens + inbox write).

              const redemption = wr.redemptions as ArenaWinnerRedemptionEmbed | null;
              const code = redemption?.redemption_code ?? null;
              const redemptionStatus = redemption?.status ?? 'pending';
              const needsVerification = redemptionStatus === 'pending_verification';
              const gymName = redemption?.gyms?.name ?? 'the gym';
              const rank = typeof wr.rank === 'number' ? wr.rank : 0;

              const pushBody = !code
                ? `Congratulations! You won a prize in ${arena.name}. Check your redemptions for your code.`
                : needsVerification
                ? `You finished ${ordinal(rank)} in ${arena.name}! 🏆 Verify your membership at ${gymName} reception first, then collect with code ${code}.`
                : `You finished ${ordinal(rank)} in ${arena.name}! 🏆 Show code ${code} at ${gymName} reception to collect your prize.`;

              const pushData: Record<string, string> = {
                type: 'arena_prize',
                arena_id: arena.id,
                arena_name: arena.name,
                redemption_status: redemptionStatus,
                requires_verification: needsVerification ? 'true' : 'false',
                rank: String(rank),
              };
              if (redemption?.gym_id) {
                pushData.gym_id = redemption.gym_id;
              }
              pushData.gym_name = gymName;
              if (redemption?.id) {
                pushData.redemption_id = redemption.id;
              }
              if (code) {
                pushData.redemption_code = code;
              }

              const pushResponse = await fetch(
                `${supabaseUrl}/functions/v1/send-push`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${internalJwt}`,
                  },
                  body: JSON.stringify({
                    client_ref: needsVerification
                      ? 'arena_prize_unverified'
                      : 'arena_prize',
                    tokens: token ? [token] : [],
                    user_ids: [wr.user_id],
                    title: '🏆 Arena Prize Won!',
                    body: pushBody,
                    data: pushData,
                  }),
                }
              );

              const wBody = await pushResponse.json().catch(() => null);
              if (pushResponse.ok) {
                winnersNotified += deliveryCountFromSendPushBody(wBody);
              }

              console.log(JSON.stringify({
                event: 'finalize-arena-winner-push',
                arena_id: arena.id,
                user_id_prefix: String(wr.user_id).slice(0, 8),
                rank,
                redemption_status: redemptionStatus,
                ...compactSendPushMetrics(wBody),
              }));
            }
          }
        }

        // Notify ALL participants (non-winners) that the arena has ended.
        // Token filter removed — users without tokens still get an inbox row.
        const { data: allParticipants } = await supabase
          .from('arena_participants')
          .select('user_id, profiles!inner(expo_push_token)')
          .eq('arena_id', arena.id);

        const nonWinnerParticipants = (allParticipants || [])
          .filter((p: any) => !winnerUserIds.includes(p.user_id));

        const nonWinnerUserIds = nonWinnerParticipants.map((p: any) => p.user_id);
        const nonWinnerTokens = nonWinnerParticipants
          .map((p: any) => p.profiles?.expo_push_token)
          .filter((t: string | null) => isExpoPushToken(t));

        if (nonWinnerUserIds.length > 0) {
          const pushResponse = await fetch(
            `${supabaseUrl}/functions/v1/send-push`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${internalJwt}`,
              },
              body: JSON.stringify({
                client_ref: 'finalize_arena_participants',
                tokens: nonWinnerTokens,       // may be empty array — inbox still written
                user_ids: nonWinnerUserIds,    // always present
                title: '🏁 Arena Ended',
                body: `${arena.name} has ended. Check your final ranking!`,
                data: {
                  type: 'arena_ended',
                  arena_id: arena.id,
                  arena_name: arena.name,
                },
              }),
            }
          );

          const pBody = await pushResponse.json().catch(() => null);
          if (pushResponse.ok) {
            participantsNotified += deliveryCountFromSendPushBody(pBody);
          }
        }

        arenasProcessed++;
      } catch (error: any) {
        errors.push(`Arena ${arena.name} (${arena.id}): ${error.message}`);
      }
    }

    console.log(JSON.stringify({
      event: 'finalize-arena',
      arenas_processed: arenasProcessed,
      winners_notified: winnersNotified,
      participants_notified: participantsNotified,
      error_count: errors.length,
    }));

    return new Response(
      JSON.stringify({
        success: errors.length === 0,
        arenas_processed: arenasProcessed,
        winners_notified: winnersNotified,
        participants_notified: participantsNotified,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
