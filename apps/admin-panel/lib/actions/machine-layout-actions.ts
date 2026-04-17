'use server';

// AGENT NOTE: 2026-04-17 — admin-coder
// This file depends on the `machine_floor_layout` migration (supabase-dba step 4).
// Required schema:
//   ALTER TABLE machines ADD COLUMN floor_row smallint, floor_col smallint, floor_rotation smallint;
//   CREATE TABLE gym_floor_config (gym_id uuid PK, rows smallint, cols smallint, updated_at timestamptz);
// After the migration is applied, regenerate types with `pnpm types:generate` and remove the
// `as any` casts on the new columns below.
// Related files:
//   - apps/admin-panel/components/analytics/MachineFloorLayout.tsx (UI)
//   - backend/supabase/migrations/*_machine_floor_layout.sql

import { getAdminClient } from '@/lib/utils/supabase-admin';
import { getCurrentProfile } from '@/lib/auth';
import type { LiveMachine } from '@/lib/actions/machine-analytics-actions';

export interface FloorConfig {
  rows: number;
  cols: number;
}

export interface FloorMachine extends Pick<LiveMachine, 'id' | 'name' | 'type'> {
  floor_row: number | null;
  floor_col: number | null;
}

export interface GymFloorLayout {
  config: FloorConfig;
  machines: FloorMachine[];
}

export interface MachinePlacement {
  machineId: string;
  row: number | null;
  col: number | null;
}

async function authorizeGymManagement(gymId: string) {
  const profile = await getCurrentProfile();
  if (!profile) return { authorized: false as const, error: 'Not authenticated' };

  if (profile.role === 'superadmin') return { authorized: true as const, profile };

  if (profile.role === 'gym_owner') {
    const admin = getAdminClient();
    if (!admin) return { authorized: false as const, error: 'Admin client not available' };
    const { data: gym } = await admin
      .from('gyms')
      .select('owner_id')
      .eq('id', gymId)
      .single() as { data: { owner_id: string | null } | null };
    if (gym?.owner_id === profile.id) return { authorized: true as const, profile };
  }

  if (
    (profile.role === 'gym_admin' || profile.role === 'receptionist') &&
    profile.assigned_gym_id === gymId
  ) {
    return { authorized: true as const, profile };
  }

  return { authorized: false as const, error: 'Unauthorized' };
}

export async function getGymFloorLayout(
  gymId: string,
): Promise<{ success: boolean; data?: GymFloorLayout; error?: string }> {
  try {
    const admin = getAdminClient();
    if (!admin) return { success: false, error: 'Admin client not available' };

    // Fetch or create floor config for this gym
    const { data: configRow } = await (admin.from('gym_floor_config') as any)
      .select('rows, cols')
      .eq('gym_id', gymId)
      .maybeSingle() as { data: { rows: number; cols: number } | null };

    const config: FloorConfig = configRow ?? { rows: 12, cols: 8 };

    // Fetch machines with their floor placement columns
    const { data: machines, error } = await (admin.from('machines') as any)
      .select('id, name, type, floor_row, floor_col')
      .eq('gym_id', gymId)
      .eq('is_active', true) as {
      data: FloorMachine[] | null;
      error: { message: string } | null;
    };

    if (error) throw new Error(error.message);

    return {
      success: true,
      data: {
        config,
        machines: machines ?? [],
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to load floor layout',
    };
  }
}

export async function saveMachineFloorLayout(
  gymId: string,
  placements: MachinePlacement[],
): Promise<{ success: boolean; error?: string }> {
  try {
    const auth = await authorizeGymManagement(gymId);
    if (!auth.authorized) return { success: false, error: auth.error };

    // Only gym_owner / gym_admin / superadmin may edit layout (not receptionist)
    if (auth.profile.role === 'receptionist') {
      return { success: false, error: 'Read-only access — receptionists cannot edit the floor layout' };
    }

    const admin = getAdminClient();
    if (!admin) return { success: false, error: 'Admin client not available' };

    // Validate: no two placements share the same (row, col) — belt-and-suspenders before DB
    const placed = placements.filter((p) => p.row !== null && p.col !== null);
    const cellSet = new Set<string>();
    for (const p of placed) {
      const key = `${p.row}:${p.col}`;
      if (cellSet.has(key)) {
        return { success: false, error: `Duplicate placement at cell (${p.row}, ${p.col})` };
      }
      cellSet.add(key);
    }

    // Write all placements. The DB unique index on (gym_id, floor_row, floor_col)
    // provides a final guard against races.
    const results = await Promise.all(
      placements.map(async (p) => {
        const { error } = await (admin.from('machines') as any)
          .update({ floor_row: p.row, floor_col: p.col })
          .eq('id', p.machineId)
          .eq('gym_id', gymId);
        return { machineId: p.machineId, error };
      }),
    );

    const firstErr = results.find((r) => r.error);
    if (firstErr?.error) {
      return {
        success: false,
        error: firstErr.error.message || 'One or more placements failed to save. Please retry.',
      };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to save floor layout',
    };
  }
}

export async function updateGymFloorDimensions(
  gymId: string,
  rows: number,
  cols: number,
): Promise<{ success: boolean; unplacedIds?: string[]; error?: string }> {
  try {
    const auth = await authorizeGymManagement(gymId);
    if (!auth.authorized) return { success: false, error: auth.error };

    if (auth.profile.role === 'receptionist') {
      return { success: false, error: 'Read-only access' };
    }

    if (rows < 1 || rows > 50 || cols < 1 || cols > 50) {
      return { success: false, error: 'Grid dimensions must be between 1 and 50' };
    }

    const admin = getAdminClient();
    if (!admin) return { success: false, error: 'Admin client not available' };

    // Upsert the config row
    const { error: configErr } = await (admin.from('gym_floor_config') as any).upsert(
      { gym_id: gymId, rows, cols, updated_at: new Date().toISOString() },
      { onConflict: 'gym_id' },
    );
    if (configErr) throw new Error(configErr.message);

    // Unplace any machines that are now outside the new bounds
    const { data: outOfBounds } = await (admin.from('machines') as any)
      .select('id')
      .eq('gym_id', gymId)
      .or(`floor_row.gte.${rows},floor_col.gte.${cols}`) as {
      data: { id: string }[] | null;
    };

    const unplacedIds: string[] = (outOfBounds ?? []).map((m: { id: string }) => m.id);

    if (unplacedIds.length > 0) {
      await (admin.from('machines') as any)
        .update({ floor_row: null, floor_col: null })
        .in('id', unplacedIds)
        .eq('gym_id', gymId);
    }

    return { success: true, unplacedIds };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to update floor dimensions',
    };
  }
}
