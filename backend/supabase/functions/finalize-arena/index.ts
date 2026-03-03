// Edge Function: finalize-arena
// Description: Finalizes ended arenas by calling finalize_arena() RPC and sending push notifications to winners.
// Called by cron job: Daily at 00:30 UTC
//
// AGENT NOTE: [2026-03-03] - supabase-dba (Phase 3.2)
// Reference: docs/plans/phase3_audit_and_arenas_plan.md — Phase 3.2, Section 4.6
//
// INTERFACE CONTRACT:
//   Input:  { arena_id?: UUID } (optional, processes all ended arenas if not provided)
//   Output: { success: boolean, arenas_processed: number, winners_notified: number, errors: string[] }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

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

        if (winners_count > 0) {
          // Fetch winners' redemption codes and push tokens
          const { data: redemptions, error: redemptionsError } = await supabase
            .from('redemptions')
            .select('user_id, redemption_code, profiles!inner(expo_push_token)')
            .eq('source_type', 'arena_prize')
            .eq('status', 'claimed')
            .gte('created_at', new Date(Date.now() - 60000).toISOString()) // Last minute
            .not('profiles.expo_push_token', 'is', null)
            .in(
              'user_id',
              (
                await supabase
                  .from('arena_results')
                  .select('user_id')
                  .eq('arena_id', arena.id)
                  .not('redemption_id', 'is', null)
              ).data?.map((r: any) => r.user_id) || []
            );

          if (!redemptionsError && redemptions && redemptions.length > 0) {
            // Send push notifications to winners
            const tokens = redemptions
              .map((r: any) => r.profiles?.expo_push_token)
              .filter((t: string | null) => t && t.startsWith('ExponentPushToken'));

            if (tokens.length > 0) {
              // Call send-push edge function
              const pushResponse = await fetch(
                `${supabaseUrl}/functions/v1/send-push`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${supabaseServiceKey}`,
                  },
                  body: JSON.stringify({
                    tokens,
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

              if (pushResponse.ok) {
                const pushResult = await pushResponse.json();
                winnersNotified += pushResult.sent || 0;
              }
            }
          }
        }

        arenasProcessed++;
      } catch (error: any) {
        errors.push(`Arena ${arena.name} (${arena.id}): ${error.message}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: errors.length === 0,
        arenas_processed: arenasProcessed,
        winners_notified: winnersNotified,
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
