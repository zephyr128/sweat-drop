import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const supabaseServiceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();

const key = supabaseServiceKey || supabaseAnonKey;

if (!supabaseUrl || !key) {
  console.warn('[supabase-server] Missing SUPABASE_URL or key — Supabase calls will fail at runtime.');
}

export const supabaseServer = createClient(supabaseUrl, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
