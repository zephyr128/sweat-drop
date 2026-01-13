'use server';

import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

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
