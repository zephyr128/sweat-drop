'use server';

import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getCurrentProfile } from '../auth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const createMachineSchema = z.object({
  gymId: z.string().uuid(),
  name: z.string().min(1, 'Name is required'),
  type: z.enum(['treadmill', 'bike']),
  uniqueQrCode: z.string().optional(),
});

export async function createMachine(input: z.infer<typeof createMachineSchema>) {
  try {
    // Only SuperAdmin can create machines
    const profile = await getCurrentProfile();
    if (!profile || profile.role !== 'superadmin') {
      return { success: false, error: 'Only superadmins can create machines' };
    }

    const validated = createMachineSchema.parse(input);

    // Generate QR code if not provided
    let qrCode = validated.uniqueQrCode;
    if (!qrCode) {
      const { data: generatedCode, error: genError } = await supabaseAdmin.rpc(
        'generate_machine_qr_code'
      );
      if (genError) {
        // Fallback: generate manually
        qrCode = `MACHINE-${validated.gymId.substring(0, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
      } else {
        qrCode = generatedCode;
      }
    }

    // Check if QR code already exists
    const { data: existing } = await supabaseAdmin
      .from('machines')
      .select('id')
      .eq('unique_qr_code', qrCode)
      .single();

    if (existing) {
      return { success: false, error: 'QR code already exists. Please use a different one.' };
    }

    const { data, error } = await supabaseAdmin
      .from('machines')
      .insert({
        gym_id: validated.gymId,
        name: validated.name,
        type: validated.type,
        unique_qr_code: qrCode,
        is_active: true,
      })
      .select()
      .single();

    if (error) throw error;

    revalidatePath(`/dashboard/gym/${validated.gymId}/machines`);
    return { success: true, data };
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors[0].message };
    }
    // Error creating machine
    return { success: false, error: error.message };
  }
}

export async function deleteMachine(machineId: string, gymId: string) {
  try {
    // Only SuperAdmin can delete machines
    const profile = await getCurrentProfile();
    if (!profile || profile.role !== 'superadmin') {
      return { success: false, error: 'Only superadmins can delete machines' };
    }

    const { error } = await supabaseAdmin
      .from('machines')
      .delete()
      .eq('id', machineId)
      .eq('gym_id', gymId); // Security: ensure it belongs to the gym

    if (error) throw error;

    revalidatePath(`/dashboard/gym/${gymId}/machines`);
    return { success: true };
  } catch (error: any) {
    // Error deleting machine
    return { success: false, error: error.message };
  }
}

export async function toggleMachineStatus(
  machineId: string,
  gymId: string,
  isActive: boolean
) {
  try {
    // Only SuperAdmin can toggle is_active
    const profile = await getCurrentProfile();
    if (!profile || profile.role !== 'superadmin') {
      return { success: false, error: 'Only superadmins can toggle machine status' };
    }

    const { error } = await supabaseAdmin
      .from('machines')
      .update({ is_active: isActive })
      .eq('id', machineId)
      .eq('gym_id', gymId);

    if (error) throw error;

    revalidatePath(`/dashboard/gym/${gymId}/machines`);
    return { success: true };
  } catch (error: any) {
    // Error toggling machine status
    return { success: false, error: error.message };
  }
}

export async function updateMachine(
  machineId: string,
  gymId: string,
  input: { name?: string; type?: 'treadmill' | 'bike' }
) {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return { success: false, error: 'Not authenticated' };
    }

    // Gym owners/admins can only update name and type
    if (profile.role === 'gym_admin' || profile.role === 'superadmin') {
      const updateData: any = {};
      if (input.name !== undefined) updateData.name = input.name;
      if (input.type !== undefined) updateData.type = input.type;

      const { error } = await supabaseAdmin
        .from('machines')
        .update(updateData)
        .eq('id', machineId)
        .eq('gym_id', gymId);

      if (error) throw error;

      revalidatePath(`/dashboard/gym/${gymId}/machines`);
      return { success: true };
    }

    return { success: false, error: 'Unauthorized' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function pairSensorToMachine(machineId: string, sensorId: string) {
  try {
    // Only SuperAdmin can pair sensors
    const profile = await getCurrentProfile();
    if (!profile || profile.role !== 'superadmin') {
      return { success: false, error: 'Only superadmins can pair sensors' };
    }

    const { data, error } = await supabaseAdmin.rpc('pair_sensor_to_machine', {
      p_machine_id: machineId,
      p_sensor_id: sensorId,
    });

    if (error) throw error;

    // Get the machine to revalidate the correct path
    const { data: machine } = await supabaseAdmin
      .from('machines')
      .select('gym_id')
      .eq('id', machineId)
      .single();

    if (machine) {
      revalidatePath(`/dashboard/gym/${machine.gym_id}/machines`);
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function toggleMaintenance(
  machineId: string,
  gymId: string,
  isUnderMaintenance: boolean,
  maintenanceNotes?: string
) {
  try {
    const updateData: any = {
      is_under_maintenance: isUnderMaintenance,
    };

    if (isUnderMaintenance) {
      updateData.maintenance_started_at = new Date().toISOString();
      if (maintenanceNotes) {
        updateData.maintenance_notes = maintenanceNotes;
      }
    } else {
      updateData.maintenance_started_at = null;
      updateData.maintenance_notes = null;
    }

    const { error } = await supabaseAdmin
      .from('machines')
      .update(updateData)
      .eq('id', machineId)
      .eq('gym_id', gymId);

    if (error) throw error;

    revalidatePath(`/dashboard/gym/${gymId}/machines`);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getMachineReports(gymId: string) {
  try {
    const { data, error } = await supabaseAdmin.rpc('get_machines_with_reports', {
      p_gym_id: gymId,
    });

    if (error) throw error;

    return { success: true, data: data || [] };
  } catch (error: any) {
    return { success: false, error: error.message, data: [] };
  }
}
