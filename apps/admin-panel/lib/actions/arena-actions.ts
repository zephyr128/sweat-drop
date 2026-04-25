'use server';

import { getAdminClient } from '@/lib/utils/supabase-admin';
import { createClient as createServerClient } from '@/lib/supabase-server';
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
  // Opt-in requirements
  opt_in_type: z.enum(['free', 'drops', 'streak', 'level']).default('free'),
  opt_in_value: z.number().int().min(0).default(0),
  // Branding
  card_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().or(z.literal('')),
  card_text_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().or(z.literal('')),
  card_gradient_end: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().or(z.literal('')),
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
  // Opt-in requirements
  opt_in_type: string;
  opt_in_value: number;
  // Branding
  card_color: string | null;
  card_text_color: string | null;
  card_gradient_end: string | null;
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

export async function getArenaById(arenaId: string): Promise<{ success: boolean; data?: Arena; error?: string }> {
  try {
    const profile = await getCurrentProfile();
    if (!profile) return { success: false, error: 'Not authenticated' };
    if (!['superadmin', 'gym_owner', 'gym_admin'].includes(profile.role)) {
      return { success: false, error: 'Unauthorized' };
    }

    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) return { success: false, error: 'Admin client not available.' };

    const { data: arena, error } = await supabaseAdmin
      .from('sweat_arenas')
      .select('*')
      .eq('id', arenaId)
      .single();
    if (error) throw error;
    if (!arena) return { success: false, error: 'Arena not found' };

    const { count: participantCount } = await supabaseAdmin
      .from('arena_participants')
      .select('id', { count: 'exact', head: true })
      .eq('arena_id', arenaId);

    const { data: arenaGymData } = await supabaseAdmin
      .from('arena_gyms')
      .select('gym_id, gyms:gym_id(name)')
      .eq('arena_id', arenaId);

    const gyms = (arenaGymData || []).map((ag: Record<string, unknown>) => ({
      gym_id: ag.gym_id as string,
      name: ((ag.gyms as { name: string }) || { name: 'Unknown' }).name,
    }));

    return {
      success: true,
      data: {
        ...(arena as Record<string, unknown>),
        participant_count: participantCount || 0,
        gym_count: gyms.length,
        gyms,
      } as Arena,
    };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Failed to fetch arena';
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

    if (!['superadmin', 'gym_owner', 'gym_admin'].includes(profile.role)) {
      return { success: false, error: 'Unauthorized' };
    }

    // Gym owners and gym admins can only create local arenas
    if (['gym_owner', 'gym_admin'].includes(profile.role) && input.arena_scope !== 'local') {
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
        opt_in_type: validated.opt_in_type || 'free',
        opt_in_value: validated.opt_in_value || 0,
        card_color: validated.card_color?.trim() || null,
        card_text_color: validated.card_text_color?.trim() || null,
        card_gradient_end: validated.card_gradient_end?.trim() || null,
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

    if (!['superadmin', 'gym_owner', 'gym_admin'].includes(profile.role)) {
      return { success: false, error: 'Unauthorized' };
    }

    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available.' };
    }

    // gym_owner and gym_admin can only edit local arenas
    if (['gym_owner', 'gym_admin'].includes(profile.role)) {
      const { data: arena } = await supabaseAdmin
        .from('sweat_arenas')
        .select('arena_scope')
        .eq('id', arenaId)
        .single();

      if ((arena as any)?.arena_scope !== 'local') {
        return { success: false, error: 'You can only edit local arenas' };
      }
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
    if (input.opt_in_type !== undefined) updateData.opt_in_type = input.opt_in_type;
    if (input.opt_in_value !== undefined) updateData.opt_in_value = input.opt_in_value;
    if (input.card_color !== undefined) updateData.card_color = input.card_color?.trim() || null;
    if (input.card_text_color !== undefined) updateData.card_text_color = input.card_text_color?.trim() || null;
    if (input.card_gradient_end !== undefined) updateData.card_gradient_end = input.card_gradient_end?.trim() || null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabaseAdmin as any)
      .from('sweat_arenas')
      .update(updateData)
      .eq('id', arenaId);

    if (error) throw error;

    // Update gym links — only for local arenas.
    // Regional/network gyms are managed via the invitation acceptance flow;
    // directly mutating arena_gyms for those scopes would bypass invitation acceptance.
    if (input.gym_ids) {
      const { data: arenaForScope } = await supabaseAdmin
        .from('sweat_arenas')
        .select('arena_scope')
        .eq('id', arenaId)
        .single();

      if ((arenaForScope as any)?.arena_scope === 'local') {
        // Delete existing links and replace
        await supabaseAdmin.from('arena_gyms').delete().eq('arena_id', arenaId);

        if (input.gym_ids.length > 0) {
          const gymLinks = input.gym_ids.map((gymId) => ({
            arena_id: arenaId,
            gym_id: gymId,
            approved_by: profile.id,
            approved_at: new Date().toISOString(),
          }));

          await supabaseAdmin.from('arena_gyms').insert(gymLinks as any);
        }
      }
      // For regional/network arenas: silently skip — gym membership managed via invitations.
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

    if (!['superadmin', 'gym_owner', 'gym_admin'].includes(profile.role)) {
      return { success: false, error: 'Unauthorized' };
    }

    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available.' };
    }

    // gym_owner and gym_admin can only toggle local arenas
    if (['gym_owner', 'gym_admin'].includes(profile.role)) {
      const { data: arena } = await supabaseAdmin
        .from('sweat_arenas')
        .select('arena_scope')
        .eq('id', arenaId)
        .single();

      if ((arena as any)?.arena_scope !== 'local') {
        return { success: false, error: 'You can only toggle local arenas' };
      }
    }

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

    // Use authenticated client for RPC calls that check auth.uid()
    const supabase = await createServerClient();

    const { data, error } = await supabase.rpc('finalize_arena', {
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

export interface ParticipantGymBreakdown {
  gym_id: string;
  gym_name: string;
  score: number;
  sessions: number;
}

export interface ParticipantWithBreakdown {
  user_id: string;
  username: string;
  avatar_url: string | null;
  /** Gym the user opted into this arena from — use for member profile links */
  participant_gym_id: string;
  gym_name: string;
  current_score: number;
  rank: number;
  opted_in_at: string;
  gym_breakdown: ParticipantGymBreakdown[] | { own_gym_score: number; other_gyms_score: number; total_sessions: number } | null;
}

export async function getArenaParticipants(arenaId: string, viewingGymId?: string): Promise<{
  success: boolean;
  data?: ParticipantWithBreakdown[];
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

    // Fetch per-gym breakdown for all participants in this arena
    const { data: gymScoresData } = await supabaseAdmin
      .from('arena_participant_gym_scores')
      .select(`
        user_id,
        gym_id,
        score,
        sessions,
        gyms:gym_id (name)
      `)
      .eq('arena_id', arenaId);

    // Group gym scores by user_id
    const gymScoresByUser = new Map<string, ParticipantGymBreakdown[]>();
    for (const gs of ((gymScoresData || []) as any[])) {
      const userId = gs.user_id as string;
      if (!gymScoresByUser.has(userId)) {
        gymScoresByUser.set(userId, []);
      }
      gymScoresByUser.get(userId)!.push({
        gym_id: gs.gym_id,
        gym_name: gs.gyms?.name || 'Unknown',
        score: Number(gs.score) || 0,
        sessions: gs.sessions || 0,
      });
    }

    // Sort each user's gym scores by score DESC
    for (const [, scores] of gymScoresByUser) {
      scores.sort((a, b) => b.score - a.score);
    }

    // Determine caller's gym for privacy view
    // Priority: explicit viewingGymId > assigned_gym_id > ownership lookup
    const isSuperadmin = profile.role === 'superadmin';
    const callerGymId: string | null = viewingGymId || profile.assigned_gym_id || null;

    const participants: ParticipantWithBreakdown[] = ((data || []) as unknown as Array<{
      user_id: string;
      current_score: number;
      opted_in_at: string;
      gym_id: string;
      profiles: { username: string; avatar_url: string | null } | null;
      gyms: { name: string } | null;
    }>).map((p, idx) => {
      const userGymScores = gymScoresByUser.get(p.user_id) || [];

      let gymBreakdown: ParticipantWithBreakdown['gym_breakdown'] = null;

      if (userGymScores.length > 0) {
        if (isSuperadmin) {
          // Superadmin: full per-gym breakdown
          gymBreakdown = userGymScores;
        } else {
          // Gym owner/admin: own gym vs others (no gym names)
          let ownGymScore = 0;
          let otherGymsScore = 0;
          let totalSessions = 0;
          for (const gs of userGymScores) {
            totalSessions += gs.sessions;
            if (gs.gym_id === callerGymId) {
              ownGymScore += gs.score;
            } else {
              otherGymsScore += gs.score;
            }
          }
          gymBreakdown = { own_gym_score: ownGymScore, other_gyms_score: otherGymsScore, total_sessions: totalSessions };
        }
      }

      // Determine displayed gym name:
      // Use the gym with the highest score from breakdown (most relevant for this arena),
      // falling back to arena_participants.gym_id if no breakdown data
      let displayGymName = p.gyms?.name || 'Unknown';
      let displayGymId = p.gym_id;
      if (userGymScores.length > 0) {
        // userGymScores is already sorted by score DESC
        displayGymName = userGymScores[0].gym_name;
        displayGymId = userGymScores[0].gym_id;
      }

      // Privacy: gym_owner/gym_admin only see their own gym name; others anonymized
      if (!isSuperadmin && callerGymId && displayGymId !== callerGymId) {
        displayGymName = 'Other Gym';
      }

      const rawAvatar = p.profiles?.avatar_url;
      const avatarUrl =
        typeof rawAvatar === 'string' && rawAvatar.trim() ? rawAvatar.trim() : null;

      return {
        user_id: p.user_id,
        username: p.profiles?.username || 'Unknown',
        avatar_url: avatarUrl,
        participant_gym_id: p.gym_id,
        gym_name: displayGymName,
        current_score: p.current_score,
        rank: idx + 1,
        opted_in_at: p.opted_in_at,
        gym_breakdown: gymBreakdown,
      };
    });

    return { success: true, data: participants };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Failed to fetch participants';
    return { success: false, error: errMsg };
  }
}

export async function cancelArena(arenaId: string): Promise<{ success: boolean; participantsRefunded?: number; error?: string }> {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return { success: false, error: 'Not authenticated' };
    }

    if (profile.role !== 'superadmin') {
      return { success: false, error: 'Only superadmin can cancel arenas' };
    }

    // CRITICAL: Use authenticated client for RPC calls that check auth.uid()
    // The admin (service role) client has NO user session, so auth.uid() returns null
    // inside SECURITY DEFINER functions, causing the is_superadmin() check to fail.
    const supabase = await createServerClient();

    // Call the cancel_arena RPC with authenticated client
    const { data, error } = await supabase.rpc('cancel_arena', {
      p_arena_id: arenaId,
    });

    if (error) {
      console.error('[cancelArena] RPC error:', error);
      throw error;
    }

    const result = (data as any)?.[0] || data;
    const success = result?.success ?? false;
    const participantsRefunded = result?.participants_refunded ?? 0;

    if (!success) {
      return { success: false, error: result?.error_message || 'Failed to cancel arena' };
    }

    // Use admin client for post-RPC operations (push notifications, etc.)
    const supabaseAdmin = getAdminClient();

    // Fetch arena info for push notification
    if (supabaseAdmin && participantsRefunded > 0) {
      const { data: arenaData } = await supabaseAdmin
        .from('sweat_arenas')
        .select('name, opt_in_type, opt_in_value')
        .eq('id', arenaId)
        .single();

      try {
        const { data: participantTokens } = await supabaseAdmin
          .from('arena_participants')
          .select('user_id, profiles:user_id(expo_push_token)')
          .eq('arena_id', arenaId);

        const participants = (participantTokens || []) as any[];
        const participantUserIds = participants.map((p) => p.user_id).filter(Boolean);
        const tokens = participants
          .map((p) => p.profiles?.expo_push_token)
          .filter(Boolean);

        if (participantUserIds.length > 0) {
          const arenaName = (arenaData as any)?.name || 'Unknown';
          const isDropsArena = (arenaData as any)?.opt_in_type === 'drops';
          const optInValue = (arenaData as any)?.opt_in_value || 0;

          const body = isDropsArena && optInValue > 0
            ? `Arena '${arenaName}' je otkazana. ${optInValue} 💧 drops su ti vraćeni.`
            : `Arena '${arenaName}' je otkazana.`;

          await supabaseAdmin.functions.invoke('send-push', {
            body: JSON.stringify({
              tokens,
              user_ids: participantUserIds,
              title: '⚠️ Arena otkazana',
              body,
              data: { type: 'arena_cancelled', arena_id: arenaId },
            }),
          });
        }
      } catch (pushError) {
        console.error('[cancelArena] Push notification error:', pushError);
        // Don't fail the cancellation if push fails
      }
    }

    revalidatePath('/dashboard/arenas');
    return { success: true, participantsRefunded };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Failed to cancel arena';
    return { success: false, error: errMsg };
  }
}

export async function notifyArenaParticipants(
  arenaId: string,
  winnersOnly: boolean
): Promise<{ success: boolean; notifiedCount?: number; error?: string }> {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return { success: false, error: 'Not authenticated' };
    }

    if (profile.role !== 'superadmin') {
      return { success: false, error: 'Only superadmin can send arena notifications' };
    }

    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available.' };
    }

    const { data: arenaData } = await supabaseAdmin
      .from('sweat_arenas')
      .select('name, is_finalized')
      .eq('id', arenaId)
      .single();

    if (!arenaData) {
      return { success: false, error: 'Arena not found' };
    }

    const arena = arenaData as { name: string; is_finalized: boolean };
    if (!arena.is_finalized) {
      return { success: false, error: 'Arena must be finalized before sending notifications' };
    }

    if (winnersOnly) {
      // Fetch winners: participants who have arena_results with a prize
      const { data: arenaResults } = await supabaseAdmin
        .from('arena_results')
        .select('user_id, prize_description')
        .eq('arena_id', arenaId)
        .not('prize_description', 'is', null);

      const winnerUserIds = ((arenaResults || []) as any[]).map((r) => r.user_id).filter(Boolean);
      if (winnerUserIds.length === 0) {
        return { success: true, notifiedCount: 0 };
      }

      const { data: winnerProfiles } = await supabaseAdmin
        .from('profiles')
        .select('id, expo_push_token')
        .in('id', winnerUserIds)
        .not('expo_push_token', 'is', null);

      const tokens = ((winnerProfiles || []) as any[])
        .map((p) => p.expo_push_token)
        .filter((t: string) => t?.startsWith('ExponentPushToken'));

      await supabaseAdmin.functions.invoke('send-push', {
        body: JSON.stringify({
          tokens,
          user_ids: winnerUserIds,
          title: '🏆 You won a prize!',
          body: `You won a prize in ${arena.name}! Check your results.`,
          data: { type: 'arena_prize', arena_id: arenaId, arena_name: arena.name },
        }),
      });

      return { success: true, notifiedCount: winnerUserIds.length };
    } else {
      // Notify ALL participants
      const { data: allParticipants } = await supabaseAdmin
        .from('arena_participants')
        .select('user_id, profiles:user_id(expo_push_token)')
        .eq('arena_id', arenaId);

      const participants = (allParticipants || []) as any[];
      const participantUserIds = participants.map((p) => p.user_id).filter(Boolean);
      const tokens = participants
        .map((p) => p.profiles?.expo_push_token)
        .filter((t: string) => t?.startsWith('ExponentPushToken'));

      if (participantUserIds.length > 0) {
        await supabaseAdmin.functions.invoke('send-push', {
          body: JSON.stringify({
            tokens,
            user_ids: participantUserIds,
            title: '🏁 Arena Results Available',
            body: `${arena.name} has ended. Check your final ranking!`,
            data: { type: 'arena_ended', arena_id: arenaId, arena_name: arena.name },
          }),
        });
      }

      return { success: true, notifiedCount: participantUserIds.length };
    }
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Failed to send notifications';
    console.error('[notifyArenaParticipants] Error:', error);
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
