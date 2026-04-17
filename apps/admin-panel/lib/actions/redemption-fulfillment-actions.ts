'use server';

// AGENT NOTE: 2026-04-17 — admin-coder
// Depends on Phase 1 migration: mark_redemption_fulfilled RPC +
// get_arena_fulfillment_manifest RPC + fulfilled_at/fulfilled_by columns on redemptions.
// Related files:
//   - apps/admin-panel/components/modules/ArenaFulfillmentTable.tsx (arena manifest UI)
//   - apps/admin-panel/components/modules/RedemptionsManager.tsx (inline per-redemption "Mark received" action)
//   - apps/admin-panel/app/dashboard/arenas/[arenaId]/fulfillment/page.tsx (arena fulfillment page)

import { getCurrentProfile } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { createClient as createServerClient } from '@/lib/supabase-server';

export interface FulfillmentRow {
  redemption_id: string;
  user_id: string;
  username: string;
  full_name: string | null;
  rank: number;
  prize_description: string;
  gym_id: string;
  gym_name: string;
  status: string;
  redemption_code: string;
  fulfilled_at: string | null;
  fulfilled_by: string | null;
  confirmed_at: string | null;
  expires_at: string | null;
}

export async function markRedemptionFulfilled(
  redemptionId: string,
  notes?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const profile = await getCurrentProfile();
    if (!profile) return { success: false, error: 'Not authenticated' };

    const allowed = ['superadmin', 'gym_owner', 'gym_admin', 'receptionist'];
    if (!allowed.includes(profile.role)) {
      return { success: false, error: 'Unauthorized' };
    }

    // Use the authenticated server client (cookie/JWT context), not service-role.
    // SQL RPC uses auth.uid() via _admin_check_gym_access(), so calling it through
    // the admin client would strip caller identity and fail auth checks.
    const supabase = await createServerClient();

    const { data, error } = await (supabase.rpc('mark_redemption_fulfilled', {
      p_redemption_id: redemptionId,
      p_notes: notes ?? null,
    } as any) as any);

    if (error) throw error;

    const result = (data as any)?.[0] ?? data;
    if (!result?.success) {
      return { success: false, error: result?.error_message || 'Failed to mark as fulfilled' };
    }

    // Fire-and-forget: invoke send-prize-ready-push edge function
    // (server-to-server via service role; do not block the UI on push delivery)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (supabaseUrl && serviceRoleKey) {
      fetch(`${supabaseUrl}/functions/v1/send-prize-ready-push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({ redemption_id: redemptionId }),
      }).catch(() => {
        // Best-effort — push failure should not block UI
      });
    }

    revalidatePath('/dashboard/arenas/[arenaId]/fulfillment', 'page');
    revalidatePath('/dashboard/gym/[id]/redemptions', 'page');
    revalidatePath('/dashboard/owner', 'page');
    revalidatePath('/dashboard/super', 'page');
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to mark as fulfilled',
    };
  }
}

export async function getArenaFulfillmentManifest(
  arenaId: string,
): Promise<{ success: boolean; data?: FulfillmentRow[]; error?: string }> {
  try {
    const profile = await getCurrentProfile();
    if (!profile) return { success: false, error: 'Not authenticated' };

    const allowed = ['superadmin', 'gym_owner', 'gym_admin', 'receptionist'];
    if (!allowed.includes(profile.role)) {
      return { success: false, error: 'Unauthorized' };
    }

    // Must preserve auth context for SQL-side access checks.
    const supabase = await createServerClient();

    const { data, error } = await (supabase.rpc('get_arena_fulfillment_manifest', {
      p_arena_id: arenaId,
    } as any) as any);

    if (error) throw error;

    return { success: true, data: (data as FulfillmentRow[]) ?? [] };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to load fulfillment manifest',
    };
  }
}
