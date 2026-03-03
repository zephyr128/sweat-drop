// Edge Function: distribute-leaderboard-prizes
// Description: Distributes leaderboard prizes at the end of weekly/monthly periods.
// Runs BEFORE the reset cron jobs to capture the final standings.
//
// AGENT NOTE: [2026-03-03] - supabase-dba (Phase 3.1)
// Reference: docs/plans/phase3_audit_and_arenas_plan.md — Phase 3.1
//
// SCHEDULE:
//   Weekly: Sunday 22:55 UTC (5 min before weekly_drops reset at 23:00)
//   Monthly: Last day of month 22:55 UTC
//
// INTERFACE CONTRACT:
//   Input:  { period: "weekly" | "monthly" }
//   Output: { gyms_processed: number, total_winners: number, details: [...] }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // Determine period from request body or current time
    let period: string;
    try {
      const body = await req.json();
      period = body.period || 'weekly';
    } catch {
      period = 'weekly';
    }

    if (!['weekly', 'monthly'].includes(period)) {
      return new Response(
        JSON.stringify({ error: `Invalid period: ${period}` }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    // Get all active gyms
    const { data: gyms, error: gymsError } = await supabase
      .from('gyms')
      .select('id, name')
      .eq('is_active', true);

    if (gymsError) throw gymsError;

    const details: Array<{ gym_id: string; gym_name: string; winners: number }> = [];
    let totalWinners = 0;

    for (const gym of gyms || []) {
      // Check if gym has configured rewards for this period
      const { data: rewards } = await supabase
        .from('leaderboard_rewards')
        .select('id')
        .eq('gym_id', gym.id)
        .eq('period', period)
        .eq('is_active', true)
        .limit(1);

      if (!rewards || rewards.length === 0) continue;

      // Call distribute_leaderboard_prizes RPC
      const { data: winnersCount, error: distError } = await supabase.rpc(
        'distribute_leaderboard_prizes',
        { p_gym_id: gym.id, p_period: period }
      );

      if (distError) {
        console.error(`Error distributing prizes for gym ${gym.name}:`, distError);
        continue;
      }

      const winners = winnersCount || 0;
      totalWinners += winners;
      details.push({ gym_id: gym.id, gym_name: gym.name, winners });

      // Send push notifications to winners
      if (winners > 0) {
        // Get top 3 with tokens
        const { data: topUsers } = await supabase.rpc('get_leaderboard', {
          p_type: 'gym',
          p_scope_id: gym.id,
          p_period: period,
          p_limit: 3,
          p_newcomer_only: false,
        });

        if (topUsers) {
          for (const user of topUsers) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('expo_push_token')
              .eq('id', user.user_id)
              .single();

            if (profile?.expo_push_token) {
              // Send push via send-push function
              await fetch(`${supabaseUrl}/functions/v1/send-push`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${serviceRoleKey}`,
                },
                body: JSON.stringify({
                  tokens: [profile.expo_push_token],
                  title: '🏆 Leaderboard Prize!',
                  body: `Congratulations! You finished #${user.rank} on the ${period} leaderboard at ${gym.name}!`,
                  data: {
                    type: 'leaderboard_prize',
                    gym_id: gym.id,
                    rank: String(user.rank),
                    period,
                  },
                }),
              });
            }
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        gyms_processed: details.length,
        total_winners: totalWinners,
        period,
        details,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('distribute-leaderboard-prizes error:', message);

    return new Response(
      JSON.stringify({ error: message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
