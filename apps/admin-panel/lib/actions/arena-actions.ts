'use server';

import { getAdminClient } from '@/lib/utils/supabase-admin';
import { revalidatePath } from 'next/cache';
import { getCurrentProfile } from '../auth';
import { z } from 'zod';

const prizeSchema = z.object({
  rank: z.number().int().positive(),
  prize: z.string().min(1),
});

const createArenaSchema = z.object({
  name: z.string().min(1, 'Arena name is required'),
  description: z.string().optional(),
  arena_scope: z.enum(['local', 'regional', 'network']),
  scoring_model: z.enum(['total_drops', 'days_visited', 'variety_score', 'streak_days']),
  sponsor_name: z.string().min(1, 'Sponsor name is required'),
  sponsor_logo: z.string().url().optional().or(z.literal('')),
  sponsor_contact_email: z.string().email().optional().or(z.literal('')),
  prizes: z.array(prizeSchema).min(1, 'At least one prize is required'),
  start_date: z.string().min(1, 'Start date is required'),
  end_date: z.string().min(1, 'End date is required'),
  sponsor_fee_cents: z.number().int().min(0).optional(),
  gym_ids: z.array(z.string().uuid()).optional(), // For linking gyms
});

export interface Arena {
  id: string;
  name: string;
  description: string | null;
  arena_scope: string;
  scoring_model: string;
  sponsor_name: string;
  sponsor_logo: string | null;
  sponsor_contact_email: string | null;
  prizes: Array<{ rank: number; prize: string }>;
  start_date: string;
  end_date: string;
  is_active: boolean;
  is_finalized: boolean;
  finalized_at: string | null;
  sponsor_fee_cents: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Computed fields from joins
  participant_count?: number;
  gym_count?: number;
  gyms?: Array<{ gym_id: string; name: string }>;
}

export async function getArenas(options?: {
  gymId?: string;
  scope?: 'local' | 'regional' | 'network';
  activeOnly?: boolean;
}): Promise<{ success: boolean; data?: Arena[]; error?: string }> {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return { success: false, error: 'Not authenticated' };
    }

    if (!['superadmin', 'gym_owner', 'gym_admin'].includes(profile.role)) {
      return { success: false, error: 'Unauthorized' };
    }

    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available.' };
    }

    let query = supabaseAdmin
      .from('sweat_arenas')
      .select('*')
      .order('created_at', { ascending: false });

    if (options?.scope) {
      query = query.eq('arena_scope', options.scope);
    }

    if (options?.activeOnly) {
      query = query.eq('is_active', true);
    }

    const { data: arenas, error } = await query;
    if (error) throw error;

    // If filtering by gym, only include arenas that have that gym participating
    let filteredArenas = arenas || [];
    if (options?.gymId) {
      const { data: arenaGyms } = await supabaseAdmin
        .from('arena_gyms')
        .select('arena_id')
        .eq('gym_id', options.gymId);

      const arenaIds = new Set((arenaGyms || []).map((ag: { arena_id: string }) => ag.arena_id));
      filteredArenas = filteredArenas.filter((a: { id: string }) => arenaIds.has(a.id));
    }

    // Enrich with participant count and gym info
    const enrichedArenas: Arena[] = await Promise.all(
      filteredArenas.map(async (arena: Record<string, unknown>) => {
        const { count: participantCount } = await supabaseAdmin
          .from('arena_participants')
          .select('id', { count: 'exact', head: true })
          .eq('arena_id', arena.id as string);

        const { data: arenaGymData } = await supabaseAdmin
          .from('arena_gyms')
          .select('gym_id, gyms:gym_id(name)')
          .eq('arena_id', arena.id as string);

        const gyms = (arenaGymData || []).map((ag: Record<string, unknown>) => ({
          gym_id: ag.gym_id as string,
          name: ((ag.gyms as { name: string }) || { name: 'Unknown' }).name,
        }));

        return {
          ...arena,
          participant_count: participantCount || 0,
          gym_count: gyms.length,
          gyms,
        } as Arena;
      })
    );

    return { success: true, data: enrichedArenas };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Failed to fetch arenas';
    return { success: false, error: errMsg };
  }
}

export async function createArena(
  input: z.infer<typeof createArenaSchema>
): Promise<{ success: boolean; data?: Arena; error?: string }> {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return { success: false, error: 'Not authenticated' };
    }

    if (!['superadmin', 'gym_owner'].includes(profile.role)) {
      return { success: false, error: 'Unauthorized' };
    }

    // Gym owners can only create local arenas
    if (profile.role === 'gym_owner' && input.arena_scope !== 'local') {
      return { success: false, error: 'Gym owners can only create local arenas' };
    }

    const validated = createArenaSchema.parse(input);

    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available.' };
    }

    const { data: arena, error } = await (supabaseAdmin
      .from('sweat_arenas')
      .insert({
        name: validated.name,
        description: validated.description || null,
        arena_scope: validated.arena_scope,
        scoring_model: validated.scoring_model,
        sponsor_name: validated.sponsor_name,
        sponsor_logo: validated.sponsor_logo?.trim() || null,
        sponsor_contact_email: validated.sponsor_contact_email?.trim() || null,
        prizes: validated.prizes as any,
        start_date: validated.start_date,
        end_date: validated.end_date,
        sponsor_fee_cents: validated.sponsor_fee_cents || 0,
        created_by: profile.id,
        is_active: true,
        is_finalized: false,
      } as any)
      .select()
      .single()) as any;

    if (error) throw error;

    // Link gyms
    if (validated.gym_ids && validated.gym_ids.length > 0) {
      const gymLinks = validated.gym_ids.map((gymId) => ({
        arena_id: (arena as { id: string }).id,
        gym_id: gymId,
        approved_by: profile.id,
        approved_at: new Date().toISOString(),
      }));

      // @ts-ignore - Supabase type inference issue with arena_gyms table
      const { error: linkError } = await supabaseAdmin
        .from('arena_gyms')
        .insert(gymLinks as any);

      if (linkError) {
        console.error('[createArena] Failed to link gyms:', linkError);
      }
    }

    revalidatePath('/dashboard/arenas');
    return { success: true, data: arena as Arena };
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors[0].message };
    }
    const errMsg = error instanceof Error ? error.message : 'Failed to create arena';
    return { success: false, error: errMsg };
  }
}

export async function updateArena(
  arenaId: string,
  input: Partial<z.infer<typeof createArenaSchema>>
): Promise<{ success: boolean; error?: string }> {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return { success: false, error: 'Not authenticated' };
    }

    if (!['superadmin', 'gym_owner'].includes(profile.role)) {
      return { success: false, error: 'Unauthorized' };
    }

    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available.' };
    }

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.name) updateData.name = input.name;
    if (input.description !== undefined) updateData.description = input.description || null;
    if (input.sponsor_name) updateData.sponsor_name = input.sponsor_name;
    if (input.sponsor_logo !== undefined) updateData.sponsor_logo = input.sponsor_logo?.trim() || null;
    if (input.sponsor_contact_email !== undefined) updateData.sponsor_contact_email = input.sponsor_contact_email?.trim() || null;
    if (input.prizes) updateData.prizes = input.prizes;
    if (input.start_date) updateData.start_date = input.start_date;
    if (input.end_date) updateData.end_date = input.end_date;
    if (input.sponsor_fee_cents !== undefined) updateData.sponsor_fee_cents = input.sponsor_fee_cents;
    if (input.scoring_model) updateData.scoring_model = input.scoring_model;

    // @ts-ignore - Supabase type inference issue with sweat_arenas table
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabaseAdmin as any)
      .from('sweat_arenas')
      .update(updateData)
      .eq('id', arenaId);

    if (error) throw error;

    // Update gym links if provided
    if (input.gym_ids) {
      // Delete existing links
      await supabaseAdmin.from('arena_gyms').delete().eq('arena_id', arenaId);

      // Insert new links
      if (input.gym_ids.length > 0) {
        const gymLinks = input.gym_ids.map((gymId) => ({
          arena_id: arenaId,
          gym_id: gymId,
          approved_by: profile.id,
          approved_at: new Date().toISOString(),
        }));

        // @ts-ignore - Supabase type inference issue with arena_gyms table
        await supabaseAdmin.from('arena_gyms').insert(gymLinks as any);
      }
    }

    revalidatePath('/dashboard/arenas');
    return { success: true };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Failed to update arena';
    return { success: false, error: errMsg };
  }
}

export async function deleteArena(arenaId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return { success: false, error: 'Not authenticated' };
    }

    if (!['superadmin'].includes(profile.role)) {
      return { success: false, error: 'Only superadmin can delete arenas' };
    }

    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available.' };
    }

    const { error } = await supabaseAdmin
      .from('sweat_arenas')
      .delete()
      .eq('id', arenaId);

    if (error) throw error;

    revalidatePath('/dashboard/arenas');
    return { success: true };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Failed to delete arena';
    return { success: false, error: errMsg };
  }
}

export async function toggleArenaStatus(
  arenaId: string,
  isActive: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return { success: false, error: 'Not authenticated' };
    }

    if (!['superadmin', 'gym_owner'].includes(profile.role)) {
      return { success: false, error: 'Unauthorized' };
    }

    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available.' };
    }

    // @ts-ignore - Supabase type inference issue with sweat_arenas table
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabaseAdmin as any)
      .from('sweat_arenas')
      .update({ is_active: isActive })
      .eq('id', arenaId);

    if (error) throw error;

    revalidatePath('/dashboard/arenas');
    return { success: true };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Failed to update arena status';
    return { success: false, error: errMsg };
  }
}

export async function finalizeArena(arenaId: string): Promise<{ success: boolean; winnersCount?: number; error?: string }> {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return { success: false, error: 'Not authenticated' };
    }

    if (profile.role !== 'superadmin') {
      return { success: false, error: 'Only superadmin can finalize arenas' };
    }

    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available.' };
    }

    // @ts-ignore - Supabase RPC type inference issue
    const { data, error } = await supabaseAdmin.rpc('finalize_arena', {
      p_arena_id: arenaId,
    });

    if (error) {
      console.error('[finalizeArena] RPC error:', error);
      console.error('[finalizeArena] Error details:', JSON.stringify(error, null, 2));
      throw error;
    }

    revalidatePath('/dashboard/arenas');
    return { success: true, winnersCount: (data as any)?.[0]?.winners_count || (data as number) || 0 };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Failed to finalize arena';
    console.error('[finalizeArena] Exception:', error);
    return { success: false, error: errMsg };
  }
}

export async function getArenaParticipants(arenaId: string): Promise<{
  success: boolean;
  data?: Array<{
    user_id: string;
    username: string;
    avatar_url: string | null;
    gym_name: string;
    current_score: number;
    rank: number;
    opted_in_at: string;
  }>;
  error?: string;
}> {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return { success: false, error: 'Not authenticated' };
    }

    if (!['superadmin', 'gym_owner', 'gym_admin'].includes(profile.role)) {
      return { success: false, error: 'Unauthorized' };
    }

    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available.' };
    }

    const { data, error } = await supabaseAdmin
      .from('arena_participants')
      .select(`
        user_id,
        current_score,
        opted_in_at,
        gym_id,
        profiles:user_id (username, avatar_url),
        gyms:gym_id (name)
      `)
      .eq('arena_id', arenaId)
      .order('current_score', { ascending: false });

    if (error) throw error;

    const participants = ((data || []) as unknown as Array<{
      user_id: string;
      current_score: number;
      opted_in_at: string;
      gym_id: string;
      profiles: { username: string; avatar_url: string | null } | null;
      gyms: { name: string } | null;
    }>).map((p, idx) => ({
      user_id: p.user_id,
      username: p.profiles?.username || 'Unknown',
      avatar_url: p.profiles?.avatar_url || null,
      gym_name: p.gyms?.name || 'Unknown',
      current_score: p.current_score,
      rank: idx + 1,
      opted_in_at: p.opted_in_at,
    }));

    return { success: true, data: participants };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Failed to fetch participants';
    return { success: false, error: errMsg };
  }
}

export async function getAllGyms(): Promise<{ success: boolean; data?: Array<{ id: string; name: string }>; error?: string }> {
  try {
    const profile = await getCurrentProfile();
    if (!profile) return { success: false, error: 'Not authenticated' };

    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) return { success: false, error: 'Admin client not available.' };

    let query = supabaseAdmin.from('gyms').select('id, name').order('name');

    // Non-superadmin: only their own gyms
    if (profile.role === 'gym_owner') {
      query = query.eq('owner_id', profile.id);
    }

    const { data, error } = await query;
    if (error) throw error;

    return { success: true, data: (data || []) as Array<{ id: string; name: string }> };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Failed to fetch gyms';
    return { success: false, error: errMsg };
  }
}
