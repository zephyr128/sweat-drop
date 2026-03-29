// Edge Function: finalize-arena
// Description: Finalizes ended arenas by calling finalize_arena() RPC and sending push notifications.
// Called by cron job: Daily at 00:30 UTC
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
import { deliveryCountFromSendPushBody, isExpoPushToken } from '../_shared/expo-push.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

interface FinalizeRequest {
  arena_id?: string;
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
          // Fetch winners with prizes (redemption_id IS NOT NULL in arena_results)
          const { data: winnerResults } = await supabase
            .from('arena_results')
            .select('user_id')
            .eq('arena_id', arena.id)
            .not('redemption_id', 'is', null);

          const winnerIds = winnerResults?.map((r: any) => r.user_id) || [];
          winnerUserIds.push(...winnerIds);

          if (winnerIds.length > 0) {
            // Fetch winners' push tokens
            const { data: winnerProfiles } = await supabase
              .from('profiles')
              .select('id, expo_push_token')
              .in('id', winnerIds)
              .not('expo_push_token', 'is', null);

            const winnerTokens = (winnerProfiles || [])
              .map((p: any) => p.expo_push_token)
              .filter((t: string | null) => isExpoPushToken(t));

            if (winnerTokens.length > 0) {
              const pushResponse = await fetch(
                `${supabaseUrl}/functions/v1/send-push`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${supabaseServiceKey}`,
                  },
                  body: JSON.stringify({
                    client_ref: 'finalize_arena_winners',
                    tokens: winnerTokens,
                    title: '🏆 Arena Prize Won!',
                    body: `Congratulations! You won a prize in ${arena.name}. Check your redemptions for your code.`,
                    data: {
                      type: 'arena_prize',
                      arena_id: arena.id,
                      arena_name: arena.name,
                    },
                  }),
                }
              );

              const wBody = await pushResponse.json().catch(() => null);
              if (pushResponse.ok) {
                winnersNotified += deliveryCountFromSendPushBody(wBody);
              }
            }
          }
        }

        // Notify ALL participants (non-winners) that the arena has ended
        const { data: allParticipants } = await supabase
          .from('arena_participants')
          .select('user_id, profiles!inner(expo_push_token)')
          .eq('arena_id', arena.id)
          .not('profiles.expo_push_token', 'is', null);

        const nonWinnerTokens = (allParticipants || [])
          .filter((p: any) => !winnerUserIds.includes(p.user_id))
          .map((p: any) => p.profiles?.expo_push_token)
          .filter((t: string | null) => isExpoPushToken(t));

        if (nonWinnerTokens.length > 0) {
          const pushResponse = await fetch(
            `${supabaseUrl}/functions/v1/send-push`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${supabaseServiceKey}`,
              },
              body: JSON.stringify({
                client_ref: 'finalize_arena_participants',
                tokens: nonWinnerTokens,
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
