// Supabase Edge Function to reset daily and weekly challenges
// This function should be called via a cron job:
// - Daily: Every day at 00:00 UTC
// - Weekly: Every Monday at 00:00 UTC

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get the reset type from query params or body
    const url = new URL(req.url);
    const resetType = url.searchParams.get('type') || 'daily'; // 'daily' or 'weekly'

    console.log(`Resetting ${resetType} challenges...`);

    let result;
    if (resetType === 'daily') {
      // Reset daily challenges
      const { data, error } = await supabase.rpc('reset_daily_challenges');
      if (error) throw error;
      result = { type: 'daily', success: true, data };
    } else if (resetType === 'weekly') {
      // Reset weekly challenges
      const { data, error } = await supabase.rpc('reset_weekly_challenges');
      if (error) throw error;
      result = { type: 'weekly', success: true, data };
    } else {
      throw new Error(`Invalid reset type: ${resetType}. Must be 'daily' or 'weekly'.`);
    }

    console.log(`${resetType} challenges reset successfully`);

    return new Response(
      JSON.stringify(result),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('Error resetting challenges:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
