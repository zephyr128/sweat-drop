// Edge Function: notify-arena-participants
// Description: Re-sends push notifications for a finalized arena.
// Called by admin panel "Notify Winners" / "Notify All Participants" buttons.
//
// AGENT NOTE: [2026-05-11] - edge-function-agent (feature_multigym_notification_differentiation)
//   Added gym_id to sweat_arenas query; looks up gym name + logo_url.
//   Winner push title: "🏆 Arena Prize Won! — [Gym Name]"; gym_id, gym_name, gym_logo_url in data.
//   Participant push title: "🏁 Arena Ended — [Gym Name]"; same gym fields in data.
//
// AGENT NOTE: [2026-04-20] - supabase-dba (push_notifications_systemic_fix_plan Phase 2.2)
//   Added user_ids to both winners and non-winner send-push calls for inbox parity.
//   Token filter on winner profiles query removed — inbox written for all winners.
//   Non-winner query token filter removed — gated on user count.
//
// AGENT NOTE: [2026-03-11] - supabase-dba
// Reference: docs/plans/arena_expiration_and_results_flow.md — Step 1c
//
// INTERFACE CONTRACT:
//   Input:  { arena_id: UUID, winners_only?: boolean }
//   Output: { success: boolean, notified: number, errors?: string[] }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { deliveryCountFromSendPushBody, isExpoPushToken } from '../_shared/expo-push.ts';
import { getEdgeInternalJwt } from '../_shared/edge-auth.ts';

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
    const internalJwt = getEdgeInternalJwt();
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify arena exists and is finalized
    const { data: arena, error: arenaError } = await supabase
      .from('sweat_arenas')
      .select('id, name, is_finalized, gym_id')
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

    // Look up gym name + logo for push gym differentiation.
    let gymName = 'the gym';
    let gymLogoUrl: string | null = null;
    if (arena.gym_id) {
      const { data: gymRow } = await supabase
        .from('gyms')
        .select('name, logo_url')
        .eq('id', arena.gym_id)
        .maybeSingle();
      if (gymRow?.name) gymName = gymRow.name;
      gymLogoUrl = (gymRow as any)?.logo_url ?? null;
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

    // Notify winners — token filter removed; inbox written for all winners
    if (winnerUserIds.length > 0) {
      const { data: winnerProfiles } = await supabase
        .from('profiles')
        .select('id, expo_push_token')
        .in('id', winnerUserIds);

      const winnerTokens = (winnerProfiles || [])
        .map((p: any) => p.expo_push_token)
        .filter((t: string | null) => isExpoPushToken(t));

      const pushResponse = await fetch(
        `${supabaseUrl}/functions/v1/send-push`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${internalJwt}`,
          },
          body: JSON.stringify({
            client_ref: 'notify_arena_winners',
            tokens: winnerTokens,
            user_ids: winnerUserIds,
            title: `🏆 Arena Prize Won! — ${gymName}`,
            body: `Congratulations! You won a prize in ${arena.name}. Check your redemptions for your code.`,
            data: {
              type: 'arena_prize',
              arena_id: arena.id,
              arena_name: arena.name,
              ...(arena.gym_id ? { gym_id: arena.gym_id } : {}),
              gym_name: gymName,
              ...(gymLogoUrl ? { gym_logo_url: gymLogoUrl } : {}),
            },
          }),
        }
      );

      const winnerPushBody = await pushResponse.json().catch(() => null);
      const winnerDelivered = deliveryCountFromSendPushBody(winnerPushBody);
      if (pushResponse.ok) {
        notified += winnerDelivered;
      } else {
        errors.push(`Failed to send winner notifications: HTTP ${pushResponse.status}`);
      }
    }

    // Notify non-winners (all participants except winners)
    // Token filter removed — inbox written for all participants regardless of token.
    if (!winners_only) {
      const { data: allParticipants } = await supabase
        .from('arena_participants')
        .select('user_id, profiles!inner(expo_push_token)')
        .eq('arena_id', arena_id);

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
              client_ref: 'notify_arena_participants',
              tokens: nonWinnerTokens,
              user_ids: nonWinnerUserIds,
              title: `🏁 Arena Ended — ${gymName}`,
              body: `${arena.name} has ended. Check your final ranking!`,
              data: {
                type: 'arena_ended',
                arena_id: arena.id,
                arena_name: arena.name,
                ...(arena.gym_id ? { gym_id: arena.gym_id } : {}),
                gym_name: gymName,
                ...(gymLogoUrl ? { gym_logo_url: gymLogoUrl } : {}),
              },
            }),
          }
        );

        const partPushBody = await pushResponse.json().catch(() => null);
        const partDelivered = deliveryCountFromSendPushBody(partPushBody);
        if (pushResponse.ok) {
          notified += partDelivered;
        } else {
          errors.push(`Failed to send participant notifications: HTTP ${pushResponse.status}`);
        }
      }
    }

    console.log(JSON.stringify({
      event: 'notify-arena-participants',
      arena_id,
      winners_only,
      notified,
      error_count: errors.length,
    }));

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
