// Edge Function: delete-account
// Permanently deletes a user's account and all associated data.
// Required by Apple App Store since June 2022.
//
// Auth: Bearer token (user's JWT) — the user can only delete their own account.
// Method: POST
// Returns: { success: true } or { error: string }

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
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Verify the requesting user's JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const token = authHeader.replace('Bearer ', '');

    // Create a client scoped to the user to verify identity
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const userId = user.id;

    // Admin client for deletion operations (bypasses RLS)
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Delete data in FK-safe order (children before parents)
    const tables = [
      { table: 'drops_transactions', column: 'user_id' },
      { table: 'challenge_progress', column: 'user_id' },
      { table: 'user_badges', column: 'user_id' },
      { table: 'gym_checkins', column: 'user_id' },
      { table: 'sessions', column: 'user_id' },
      { table: 'gym_memberships', column: 'user_id' },
      { table: 'gym_member_identities', column: 'user_id' },
      { table: 'arena_participants', column: 'user_id' },
      { table: 'redemptions', column: 'user_id' },
      { table: 'profiles', column: 'id' },
    ];

    for (const { table, column } of tables) {
      const { error } = await adminClient
        .from(table)
        .delete()
        .eq(column, userId);

      if (error) {
        console.error(`[delete-account] Failed to delete from ${table}:`, error.message);
        // Continue — some tables may be empty or not exist yet
      }
    }

    // Finally, delete the auth user
    const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(userId);

    if (deleteAuthError) {
      console.error('[delete-account] Failed to delete auth user:', deleteAuthError.message);
      return new Response(
        JSON.stringify({ error: 'Failed to delete authentication record. Please contact support.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`[delete-account] Successfully deleted user ${userId}`);

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[delete-account] Unexpected error:', err);
    return new Response(
      JSON.stringify({ error: 'An unexpected error occurred. Please try again.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
