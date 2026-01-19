/**
 * Lazy admin client creation for server-side code ONLY
 * CRITICAL: This must NEVER be used in client components or browser code
 * Service role key must NEVER be exposed to the browser
 * This ensures the client is only created at runtime, not during build
 * 
 * NOTE: This is NOT a server action - it's a utility function that should
 * only be called from server actions, server components, or API routes.
 * Do NOT add 'use server' here - that's only for functions that are called from the client.
 */
import { createClient } from '@supabase/supabase-js';

let _adminClient: ReturnType<typeof createClient> | null = null;

export function getAdminClient() {
  // CRITICAL: This function should ONLY be called from server-side code
  // If called from client, it will fail because process.env is not available
  if (typeof window !== 'undefined') {
    throw new Error('getAdminClient() cannot be called from client-side code. Use server actions instead.');
  }

  if (_adminClient) {
    return _adminClient;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    // Don't throw - return null and let server actions handle the error gracefully
    console.error('[getAdminClient] Missing Supabase admin credentials. NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
    return null;
  }

  _adminClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return _adminClient;
}
