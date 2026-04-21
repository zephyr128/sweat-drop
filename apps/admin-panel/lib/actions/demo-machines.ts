'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase-server';
import { getCurrentProfile } from '@/lib/auth';

const ToggleSchema = z.object({
  machine_id: z.string().uuid(),
  is_demo_machine: z.boolean(),
});

export interface DemoMachineRow {
  id: string;
  name: string;
  type: string;
  is_demo_machine: boolean;
}

export async function getGymDemoMachines(
  gymId: string,
): Promise<{ success: boolean; data?: DemoMachineRow[]; error?: string }> {
  try {
    const profile = await getCurrentProfile();
    if (!profile || profile.role !== 'superadmin') {
      return { success: false, error: 'Only superadmins can view demo machine settings.' };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('machines')
      .select('id, name, type, is_demo_machine')
      .eq('gym_id', gymId)
      .order('name', { ascending: true });

    if (error) return { success: false, error: error.message };

    return {
      success: true,
      data: (data ?? []).map((machine) => ({
        id: machine.id,
        name: machine.name,
        type: machine.type,
        is_demo_machine: machine.is_demo_machine,
      })),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch machine demo settings.',
    };
  }
}

export async function toggleDemoMachine(
  input: z.infer<typeof ToggleSchema>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const parsed = ToggleSchema.parse(input);

    const profile = await getCurrentProfile();
    if (!profile || profile.role !== 'superadmin') {
      return { success: false, error: 'Only superadmins can mark demo machines.' };
    }

    const supabase = await createClient();
    const { data: machine, error: machineError } = await supabase
      .from('machines')
      .select('id, gym_id, is_demo_machine')
      .eq('id', parsed.machine_id)
      .single();

    if (machineError || !machine) {
      return { success: false, error: 'Machine not found.' };
    }

    if (machine.is_demo_machine === parsed.is_demo_machine) {
      return { success: true };
    }

    const { error: updateError } = await supabase
      .from('machines')
      .update({ is_demo_machine: parsed.is_demo_machine })
      .eq('id', parsed.machine_id);

    if (updateError) return { success: false, error: updateError.message };

    revalidatePath(`/dashboard/gym/${machine.gym_id}/machines`);
    revalidatePath('/dashboard/super/machines');

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to toggle demo machine.',
    };
  }
}
