// Edge Function: notify-arena-participants
// Description: Re-sends push notifications for a finalized arena.
// Called by admin panel "Notify Winners" / "Notify All Participants" buttons.
//
// AGENT NOTE: [2026-03-11] - supabase-dba
// Reference: docs/plans/arena_expiration_and_results_flow.md — Step 1c
//
// INTERFACE CONTRACT:
//   Input:  { arena_id: UUID, winners_only?: boolean }
//   Output: { success: boolean, notified: number, errors?: string[] }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

interface NotifyRequest {
  arena_id: string;
  winners_only?: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { arena_id, winners_only = false }: NotifyRequest = await req.json();

    if (!arena_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'arena_id is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify arena exists and is finalized
    const { data: arena, error: arenaError } = await supabase
      .from('sweat_arenas')
      .select('id, name, is_finalized')
      .eq('id', arena_id)
      .single();

    if (arenaError || !arena) {
      return new Response(
        JSON.stringify({ success: false, error: `Arena not found: ${arenaError?.message || 'unknown'}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    if (!arena.is_finalized) {
      return new Response(
        JSON.stringify({ success: false, error: 'Arena is not yet finalized' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    let notified = 0;
    const errors: string[] = [];

    // Get winner user_ids (those with prizes / redemption_id)
    const { data: winnerResults } = await supabase
      .from('arena_results')
      .select('user_id')
      .eq('arena_id', arena_id)
      .not('redemption_id', 'is', null);

    const winnerUserIds = winnerResults?.map((r: any) => r.user_id) || [];

    // Notify winners
    if (winnerUserIds.length > 0) {
      const { data: winnerProfiles } = await supabase
        .from('profiles')
        .select('id, expo_push_token')
        .in('id', winnerUserIds)
        .not('expo_push_token', 'is', null);

      const winnerTokens = (winnerProfiles || [])
        .map((p: any) => p.expo_push_token)
        .filter((t: string | null) => t && t.startsWith('ExponentPushToken'));

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

        if (pushResponse.ok) {
          const pushResult = await pushResponse.json();
          notified += pushResult.sent || 0;
        } else {
          errors.push(`Failed to send winner notifications: ${pushResponse.statusText}`);
        }
      }
    }

    // Notify non-winners (all participants except winners)
    if (!winners_only) {
      const { data: allParticipants } = await supabase
        .from('arena_participants')
        .select('user_id, profiles!inner(expo_push_token)')
        .eq('arena_id', arena_id)
        .not('profiles.expo_push_token', 'is', null);

      const nonWinnerTokens = (allParticipants || [])
        .filter((p: any) => !winnerUserIds.includes(p.user_id))
        .map((p: any) => p.profiles?.expo_push_token)
        .filter((t: string | null) => t && t.startsWith('ExponentPushToken'));

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

        if (pushResponse.ok) {
          const pushResult = await pushResponse.json();
          notified += pushResult.sent || 0;
        } else {
          errors.push(`Failed to send participant notifications: ${pushResponse.statusText}`);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: errors.length === 0,
        notified,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
