'use server';

// AGENT NOTE: [2026-04-20] - admin-panel
//   Superadmin-only server actions for:
//     1. Gym ownership transfer (assign existing owner / invite new / unassign)
//     2. Force change of a user's email (for owners, staff, any role)
//   Every mutation writes an audit row to:
//     - public.gym_ownership_history
//     - public.user_email_change_history
//   Migration: 20260420150000_gym_owner_transfer_and_email_change_audit.sql

import { getAdminClient } from '@/lib/utils/supabase-admin';
import { getCurrentProfile } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { sendEmail, buildOwnerInvitationEmailHtml } from '@/lib/utils/email-service';

// ────────────────────────────────────────────────────────────────────────────
//  Guards
// ────────────────────────────────────────────────────────────────────────────

async function requireSuperadmin() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== 'superadmin') {
    return { error: 'Only superadmins can perform this action', profile: null };
  }
  return { error: null, profile };
}

// ────────────────────────────────────────────────────────────────────────────
//  Types
// ────────────────────────────────────────────────────────────────────────────

export interface AssignGymOwnerInput {
  gymId: string;
  newOwnerId: string;
  reason?: string;
}

export interface UnassignGymOwnerInput {
  gymId: string;
  reason?: string;
}

export interface InviteNewOwnerForGymInput {
  gymId: string;
  email: string;
  reason?: string;
}

export interface ForceChangeEmailInput {
  userId: string;
  newEmail: string;
  reason?: string;
}

// ────────────────────────────────────────────────────────────────────────────
//  Helpers
// ────────────────────────────────────────────────────────────────────────────

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function logGymOwnershipChange(params: {
  gymId: string;
  oldOwnerId: string | null;
  newOwnerId: string | null;
  changedBy: string;
  method: 'invite' | 'assign_existing' | 'unassign';
  reason?: string | null;
}): Promise<void> {
  const admin = getAdminClient();
  if (!admin) return;
  try {
    const { error } = await (admin.from('gym_ownership_history') as any).insert({
      gym_id: params.gymId,
      old_owner_id: params.oldOwnerId,
      new_owner_id: params.newOwnerId,
      changed_by: params.changedBy,
      change_method: params.method,
      reason: params.reason ?? null,
    });
    if (error) {
      console.error('[logGymOwnershipChange] failed to write audit row:', error.message);
    }
  } catch (e) {
    console.error('[logGymOwnershipChange] exception:', e);
  }
}

async function logEmailChange(params: {
  userId: string;
  oldEmail: string;
  newEmail: string;
  changedBy: string;
  reason?: string | null;
}): Promise<void> {
  const admin = getAdminClient();
  if (!admin) return;
  try {
    const { error } = await (admin.from('user_email_change_history') as any).insert({
      user_id: params.userId,
      old_email: params.oldEmail,
      new_email: params.newEmail,
      changed_by: params.changedBy,
      reason: params.reason ?? null,
    });
    if (error) {
      console.error('[logEmailChange] failed to write audit row:', error.message);
    }
  } catch (e) {
    console.error('[logEmailChange] exception:', e);
  }
}

// ────────────────────────────────────────────────────────────────────────────
//  1. Assign an existing gym_owner to a gym (reassign)
// ────────────────────────────────────────────────────────────────────────────

export async function assignGymOwner(input: AssignGymOwnerInput) {
  try {
    const guard = await requireSuperadmin();
    if (guard.error || !guard.profile) {
      return { success: false, error: guard.error };
    }

    const admin = getAdminClient();
    if (!admin) {
      return { success: false, error: 'Admin client not available.' };
    }

    const { data: gym, error: gymErr } = await admin
      .from('gyms')
      .select('id, owner_id')
      .eq('id', input.gymId)
      .single();
    if (gymErr || !gym) {
      return { success: false, error: 'Gym not found' };
    }
    const oldOwnerId = (gym as { owner_id: string | null }).owner_id;

    const { data: newOwner, error: ownerErr } = await admin
      .from('profiles')
      .select('id, email, role')
      .eq('id', input.newOwnerId)
      .single();
    if (ownerErr || !newOwner) {
      return { success: false, error: 'New owner profile not found' };
    }
    const newOwnerData = newOwner as { id: string; email: string; role: string };

    if (newOwnerData.role !== 'gym_owner') {
      return {
        success: false,
        error: `Target user is not a gym_owner (current role: ${newOwnerData.role}). Use "Invite" flow instead.`,
      };
    }

    if (oldOwnerId === input.newOwnerId) {
      return { success: false, error: 'This user already owns this gym.' };
    }

    const { error: updateErr } = await (admin.from('gyms') as any)
      .update({ owner_id: input.newOwnerId, updated_at: new Date().toISOString() })
      .eq('id', input.gymId);
    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    await logGymOwnershipChange({
      gymId: input.gymId,
      oldOwnerId,
      newOwnerId: input.newOwnerId,
      changedBy: guard.profile.id,
      method: 'assign_existing',
      reason: input.reason,
    });

    revalidatePath('/dashboard/gyms');
    revalidatePath(`/dashboard/gym/${input.gymId}`);
    revalidatePath(`/dashboard/gym/${input.gymId}/settings`);
    revalidatePath('/dashboard/super/owners');

    return { success: true };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'assignGymOwner failed';
    return { success: false, error: msg };
  }
}

// ────────────────────────────────────────────────────────────────────────────
//  2. Unassign (set gyms.owner_id = null)
// ────────────────────────────────────────────────────────────────────────────

export async function unassignGymOwner(input: UnassignGymOwnerInput) {
  try {
    const guard = await requireSuperadmin();
    if (guard.error || !guard.profile) {
      return { success: false, error: guard.error };
    }

    const admin = getAdminClient();
    if (!admin) {
      return { success: false, error: 'Admin client not available.' };
    }

    const { data: gym, error: gymErr } = await admin
      .from('gyms')
      .select('id, owner_id')
      .eq('id', input.gymId)
      .single();
    if (gymErr || !gym) {
      return { success: false, error: 'Gym not found' };
    }
    const oldOwnerId = (gym as { owner_id: string | null }).owner_id;

    if (!oldOwnerId) {
      return { success: false, error: 'Gym already has no owner.' };
    }

    const { error: updateErr } = await (admin.from('gyms') as any)
      .update({ owner_id: null, updated_at: new Date().toISOString() })
      .eq('id', input.gymId);
    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    await logGymOwnershipChange({
      gymId: input.gymId,
      oldOwnerId,
      newOwnerId: null,
      changedBy: guard.profile.id,
      method: 'unassign',
      reason: input.reason,
    });

    revalidatePath('/dashboard/gyms');
    revalidatePath(`/dashboard/gym/${input.gymId}`);
    revalidatePath(`/dashboard/gym/${input.gymId}/settings`);
    revalidatePath('/dashboard/super/owners');

    return { success: true };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'unassignGymOwner failed';
    return { success: false, error: msg };
  }
}

// ────────────────────────────────────────────────────────────────────────────
//  3. Invite a NEW owner for this gym (email-based)
//     - Cancels any pending gym_owner invitations targeting the same gym
//     - Creates a new staff_invitations row (role=gym_owner, gym_id=gymId)
//     - On acceptance, accept_owner_invitation RPC updates gyms.owner_id
//       and writes a gym_ownership_history row with method=invitation_accepted
//     - We also pre-log an 'invite' audit row so we have traceability even
//       if the invitation is never accepted.
// ────────────────────────────────────────────────────────────────────────────

export async function inviteNewOwnerForGym(input: InviteNewOwnerForGymInput) {
  try {
    const guard = await requireSuperadmin();
    if (guard.error || !guard.profile) {
      return { success: false, error: guard.error };
    }

    const email = normalizeEmail(input.email);
    if (!isValidEmail(email)) {
      return { success: false, error: 'Invalid email address' };
    }

    const admin = getAdminClient();
    if (!admin) {
      return { success: false, error: 'Admin client not available.' };
    }

    const { data: gym, error: gymErr } = await admin
      .from('gyms')
      .select('id, name, owner_id')
      .eq('id', input.gymId)
      .single();
    if (gymErr || !gym) {
      return { success: false, error: 'Gym not found' };
    }
    const gymData = gym as { id: string; name: string; owner_id: string | null };

    // If same email belongs to the current owner → no-op
    if (gymData.owner_id) {
      const { data: currentOwner } = await admin
        .from('profiles')
        .select('email')
        .eq('id', gymData.owner_id)
        .single();
      if (
        currentOwner &&
        (currentOwner as { email: string }).email.toLowerCase() === email
      ) {
        return {
          success: false,
          error: 'This email already belongs to the current owner of this gym.',
        };
      }
    }

    // Cancel any other pending gym_owner invitations targeting this gym so we
    // never have two competing invitations outstanding.
    const { data: existingForGym } = await admin
      .from('staff_invitations')
      .select('id')
      .eq('gym_id', input.gymId)
      .eq('role', 'gym_owner')
      .eq('status', 'pending');

    if (existingForGym && (existingForGym as Array<{ id: string }>).length > 0) {
      const ids = (existingForGym as Array<{ id: string }>).map((r) => r.id);
      await (admin.from('staff_invitations') as any)
        .update({ status: 'cancelled' })
        .in('id', ids);
    }

    // Cancel any pending gym_owner invitations for the same email+gym combo
    // (edge case if prior cancellation missed one)
    await (admin.from('staff_invitations') as any)
      .update({ status: 'cancelled' })
      .eq('email', email)
      .eq('gym_id', input.gymId)
      .eq('role', 'gym_owner')
      .eq('status', 'pending');

    const { data: invitation, error: invErr } = await (admin
      .from('staff_invitations') as any)
      .insert({
        email,
        role: 'gym_owner',
        invited_by: guard.profile.id,
        gym_id: input.gymId,
      })
      .select()
      .single();

    if (invErr) {
      return { success: false, error: invErr.message };
    }
    const invitationData = invitation as { id: string; token: string; email: string };

    // Pre-log audit row; final transfer audit row is written by
    // accept_owner_invitation RPC when the recipient accepts.
    await logGymOwnershipChange({
      gymId: input.gymId,
      oldOwnerId: gymData.owner_id,
      newOwnerId: null,
      changedBy: guard.profile.id,
      method: 'invite',
      reason:
        (input.reason ? input.reason + ' — ' : '') +
        `Invitation ${invitationData.id} sent to ${email}`,
    });

    // Send email (non-fatal on failure)
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const acceptUrl = `${baseUrl}/accept-invitation/${invitationData.token}`;
      const html = buildOwnerInvitationEmailHtml({
        gymName: gymData.name,
        acceptUrl,
      });
      await sendEmail({
        to: email,
        subject: `You've been invited to manage ${gymData.name} on SweatDrop`,
        html,
      });
    } catch (emailErr) {
      console.error('[inviteNewOwnerForGym] email send failed:', emailErr);
    }

    revalidatePath('/dashboard/gyms');
    revalidatePath(`/dashboard/gym/${input.gymId}`);
    revalidatePath(`/dashboard/gym/${input.gymId}/settings`);
    revalidatePath('/dashboard/super/owners');

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    return {
      success: true,
      invitationUrl: `${baseUrl}/accept-invitation/${invitationData.token}`,
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'inviteNewOwnerForGym failed';
    return { success: false, error: msg };
  }
}

// ────────────────────────────────────────────────────────────────────────────
//  4. Force change email for any user (superadmin only)
// ────────────────────────────────────────────────────────────────────────────

export async function forceChangeUserEmail(input: ForceChangeEmailInput) {
  try {
    const guard = await requireSuperadmin();
    if (guard.error || !guard.profile) {
      return { success: false, error: guard.error };
    }

    const newEmail = normalizeEmail(input.newEmail);
    if (!isValidEmail(newEmail)) {
      return { success: false, error: 'Invalid new email address' };
    }

    const admin = getAdminClient();
    if (!admin) {
      return { success: false, error: 'Admin client not available.' };
    }

    const { data: profile, error: profErr } = await admin
      .from('profiles')
      .select('id, email, role, username')
      .eq('id', input.userId)
      .single();
    if (profErr || !profile) {
      return { success: false, error: 'User not found' };
    }
    const profileData = profile as {
      id: string;
      email: string;
      role: string;
      username: string | null;
    };
    const oldEmail = profileData.email;

    if (oldEmail.toLowerCase() === newEmail) {
      return { success: false, error: 'New email is the same as the current email.' };
    }

    // Make sure newEmail is not already in use
    const { data: conflict } = await admin
      .from('profiles')
      .select('id')
      .eq('email', newEmail)
      .neq('id', input.userId)
      .maybeSingle();
    if (conflict) {
      return {
        success: false,
        error: 'Another user already uses this email. Choose a different one.',
      };
    }

    // 1) Update auth.users via admin API (also confirms the email so user can
    //    sign in immediately without email verification loop).
    const { error: authErr } = await admin.auth.admin.updateUserById(input.userId, {
      email: newEmail,
      email_confirm: true,
    });
    if (authErr) {
      return {
        success: false,
        error: `Failed to update auth user: ${authErr.message}`,
      };
    }

    // 2) Mirror to profiles.email (trigger may already do this; we do it
    //    explicitly to avoid any timing / schema-drift issues).
    const { error: profileUpdateErr } = await (admin.from('profiles') as any)
      .update({ email: newEmail, updated_at: new Date().toISOString() })
      .eq('id', input.userId);
    if (profileUpdateErr) {
      console.error(
        '[forceChangeUserEmail] profile update failed (auth updated OK):',
        profileUpdateErr.message,
      );
    }

    await logEmailChange({
      userId: input.userId,
      oldEmail,
      newEmail,
      changedBy: guard.profile.id,
      reason: input.reason,
    });

    revalidatePath('/dashboard/super/owners');
    revalidatePath('/dashboard/super');

    return { success: true, oldEmail, newEmail };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'forceChangeUserEmail failed';
    return { success: false, error: msg };
  }
}

// ────────────────────────────────────────────────────────────────────────────
//  Read helpers for audit UI
// ────────────────────────────────────────────────────────────────────────────

export async function getGymOwnershipHistory(gymId: string) {
  try {
    const guard = await requireSuperadmin();
    if (guard.error) {
      return { success: false, error: guard.error, data: [] };
    }

    const admin = getAdminClient();
    if (!admin) {
      return { success: false, error: 'Admin client not available.', data: [] };
    }

    const { data, error } = await admin
      .from('gym_ownership_history')
      .select(
        `
        id,
        gym_id,
        old_owner_id,
        new_owner_id,
        changed_by,
        change_method,
        reason,
        changed_at,
        old_owner:old_owner_id ( id, email, username, full_name ),
        new_owner:new_owner_id ( id, email, username, full_name ),
        actor:changed_by ( id, email, username )
      `,
      )
      .eq('gym_id', gymId)
      .order('changed_at', { ascending: false });

    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (error: unknown) {
    const msg =
      error instanceof Error ? error.message : 'getGymOwnershipHistory failed';
    return { success: false, error: msg, data: [] };
  }
}

export async function getUserEmailChangeHistory(userId: string) {
  try {
    const guard = await requireSuperadmin();
    if (guard.error) {
      return { success: false, error: guard.error, data: [] };
    }

    const admin = getAdminClient();
    if (!admin) {
      return { success: false, error: 'Admin client not available.', data: [] };
    }

    const { data, error } = await admin
      .from('user_email_change_history')
      .select(
        `
        id,
        user_id,
        old_email,
        new_email,
        changed_by,
        reason,
        changed_at,
        actor:changed_by ( id, email, username )
      `,
      )
      .eq('user_id', userId)
      .order('changed_at', { ascending: false });

    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (error: unknown) {
    const msg =
      error instanceof Error ? error.message : 'getUserEmailChangeHistory failed';
    return { success: false, error: msg, data: [] };
  }
}
