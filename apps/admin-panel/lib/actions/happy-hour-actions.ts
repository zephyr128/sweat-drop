'use server';

import { createClient } from '@/lib/supabase-server';
import { getAdminClient } from '@/lib/utils/supabase-admin';
import { logger } from '@/lib/utils/logger';
import { revalidatePath } from 'next/cache';

export interface BoostRule {
  id: string;
  gym_id: string;
  name: string;
  is_active: boolean;
  days_of_week: number[];
  start_time_local: string;
  end_time_local: string;
  timezone: string;
  multiplier: number;
  machine_types: string[] | null;
  priority: number;
  is_visible_to_members: boolean;
  display_label: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActiveBoostStatus {
  active: boolean;
  multiplier: number;
  rule_id: string | null;
  rule_name: string | null;
  start_time: string | null;
  end_time: string | null;
  timezone: string | null;
}

export interface UpsertBoostRuleParams {
  gymId: string;
  ruleId?: string | null;
  name: string;
  isActive?: boolean;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  timezone?: string;
  multiplier: number;
  machineTypes?: string[] | null;
  priority?: number;
  isVisibleToMembers?: boolean;
  displayLabel?: string | null;
}

export interface ScheduleWindow {
  rule_id: string;
  name: string;
  label: string;
  multiplier: number;
  date: string;
  day_name: string;
  start_time: string;
  end_time: string;
  start_at: string;
  end_at: string;
  is_visible: boolean;
  machine_types: string[] | null;
  is_past: boolean;
}

export async function getBoostRules(
  gymId: string,
): Promise<{ success: boolean; data?: BoostRule[]; error?: string }> {
  try {
    // Use admin client to bypass RLS — the RLS policy on gym_drop_boost_rules
    // requires admin_gym_id/assigned_gym_id which not all gym_owner profiles have.
    // Access control is enforced by requireGymAccess in the page server component.
    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available' };
    }

    const { data, error } = await supabaseAdmin
      .from('gym_drop_boost_rules')
      .select('*')
      .eq('gym_id', gymId)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw error;

    return { success: true, data: (data ?? []) as BoostRule[] };
  } catch (error: unknown) {
    logger.error('Error fetching boost rules', { error, gymId });
    return { success: false, error: error instanceof Error ? error.message : 'Failed to load rules' };
  }
}

export async function upsertBoostRule(
  params: UpsertBoostRuleParams,
): Promise<{ success: boolean; data?: { rule_id: string }; error?: string }> {
  try {
    const supabase = await createClient();

    const rpcParams = {
      p_gym_id: params.gymId,
      p_rule_id: params.ruleId ?? null,
      p_name: params.name,
      p_is_active: params.isActive ?? true,
      p_days_of_week: params.daysOfWeek,
      p_start_time: params.startTime,
      p_end_time: params.endTime,
      p_timezone: params.timezone ?? 'Europe/Belgrade',
      p_multiplier: params.multiplier,
      p_machine_types: params.machineTypes ?? null,
      p_priority: params.priority ?? 0,
    };

    logger.info('[HappyHour] upsertBoostRule called', { params: rpcParams });

    const { data, error } = await supabase.rpc('admin_upsert_drop_boost_rule', rpcParams);

    logger.info('[HappyHour] RPC response', { data, error });

    if (error) throw error;

    const result = data as Record<string, unknown> | null;
    if (result?.error) {
      return { success: false, error: result.error as string };
    }

    const ruleId = result?.rule_id as string;

    // The RPC doesn't accept visibility/label fields, so patch them via admin client
    if (ruleId && (params.isVisibleToMembers !== undefined || params.displayLabel !== undefined)) {
      const supabaseAdmin = getAdminClient();
      if (supabaseAdmin) {
        const patch: Record<string, unknown> = {};
        if (params.isVisibleToMembers !== undefined) patch.is_visible_to_members = params.isVisibleToMembers;
        if (params.displayLabel !== undefined) patch.display_label = params.displayLabel || null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabaseAdmin as any).from('gym_drop_boost_rules').update(patch).eq('id', ruleId);
      }
    }

    revalidatePath(`/dashboard/gym/${params.gymId}/economy`);
    return { success: true, data: { rule_id: ruleId } };
  } catch (error: unknown) {
    logger.error('Error upserting boost rule', { error, gymId: params.gymId });
    return { success: false, error: error instanceof Error ? error.message : 'Failed to save rule' };
  }
}

export async function deleteBoostRule(
  ruleId: string,
  gymId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabaseAdmin = getAdminClient();
    if (!supabaseAdmin) {
      return { success: false, error: 'Admin client not available' };
    }

    const { error } = await supabaseAdmin
      .from('gym_drop_boost_rules')
      .delete()
      .eq('id', ruleId)
      .eq('gym_id', gymId);

    if (error) throw error;

    revalidatePath(`/dashboard/gym/${gymId}/economy`);
    return { success: true };
  } catch (error: unknown) {
    logger.error('Error deleting boost rule', { error, ruleId, gymId });
    return { success: false, error: error instanceof Error ? error.message : 'Failed to delete rule' };
  }
}

export async function getActiveBoost(
  gymId: string,
): Promise<{ success: boolean; data?: ActiveBoostStatus; error?: string }> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase.rpc('get_active_drop_boost', {
      p_gym_id: gymId,
    });

    if (error) throw error;

    const result = data as Record<string, unknown> | null;
    return {
      success: true,
      data: {
        active: result?.active === true,
        multiplier: Number(result?.multiplier ?? 1),
        rule_id: (result?.rule_id as string) ?? null,
        rule_name: (result?.rule_name as string) ?? null,
        start_time: (result?.start_time as string) ?? null,
        end_time: (result?.end_time as string) ?? null,
        timezone: (result?.timezone as string) ?? null,
      },
    };
  } catch (error: unknown) {
    logger.error('Error fetching active boost', { error, gymId });
    return { success: false, error: error instanceof Error ? error.message : 'Failed to fetch boost status' };
  }
}

export async function getSchedulePreview(
  gymId: string,
  days: number = 7,
): Promise<{ success: boolean; data?: ScheduleWindow[]; error?: string }> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase.rpc('get_happy_hour_schedule_preview', {
      p_gym_id: gymId,
      p_days: days,
    });

    if (error) throw error;

    const result = data as Record<string, unknown> | null;
    if (result?.error) {
      return { success: false, error: result.error as string };
    }

    const windows = (result?.schedule ?? []) as ScheduleWindow[];
    return { success: true, data: windows };
  } catch (error: unknown) {
    logger.error('Error fetching schedule preview', { error, gymId });
    return { success: false, error: error instanceof Error ? error.message : 'Failed to load schedule' };
  }
}
