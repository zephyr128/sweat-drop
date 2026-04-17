/**
 * Defense-in-depth: prevent elevated-role (admin/staff) sessions from persisting
 * inside the consumer mobile app.
 *
 * The mobile app is for gym members only. Accounts with roles other than 'user'
 * must be managed through the SweatDrop admin panel at admin.sweat-drop.com.
 *
 * This module is called at every auth-state transition entry point:
 *   - authStore.initialize()          → on cold-start with a rehydrated session
 *   - authStore.onAuthStateChange()   → on SIGNED_IN events
 *   - _layout.tsx processUrl()        → after setSession from a deep link
 *   - app/auth/confirm.tsx            → after verifyOtp / setSession
 *
 * Related plan: docs/plans/bugfix_admin_password_reset_opens_mobile_app.md (Step 4)
 */

import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';

/**
 * Returns true only if the given role belongs to a regular consumer account.
 * Every other value (superadmin, gym_admin, receptionist, null, undefined, '')
 * is treated as elevated / non-consumer → fail safe.
 */
export function isConsumerRole(role: string | null | undefined): boolean {
  return role === 'user';
}

/**
 * Forcefully evicts an elevated-role session from the mobile app:
 *  1. Signs out from Supabase so the tokens are invalidated locally.
 *  2. Resets the auth store to a clean signed-out state.
 *  3. Shows a user-facing modal explaining that the account belongs to the admin panel.
 *
 * @param reason - Short identifier used for logging (e.g. 'signed_in_with_elevated_role').
 * @param role   - The role value that was detected, used for logging.
 */
export async function rejectElevatedSession(
  reason: string,
  role?: string | null,
): Promise<void> {
  log.warn('[Auth] Rejecting elevated-role session', { reason, role });

  try {
    await supabase.auth.signOut();
  } catch (e) {
    log.warn('[Auth] signOut during rejectElevatedSession failed:', e);
  }

  // Reset auth store — lazy import to avoid circular dependency
  // (authStore imports supabase; this file also imports supabase).
  try {
    const { useAuthStore } = await import('@/lib/stores/authStore');
    useAuthStore.getState().reset();
  } catch (e) {
    log.warn('[Auth] authStore reset during rejectElevatedSession failed:', e);
  }

  // Surface a user-facing modal — lazy import for the same reason
  try {
    const { useAppModal } = await import('@/lib/stores/useAppModal');
    useAppModal.getState().showModal({
      title: 'Admin account detected',
      body: 'This account is managed through the SweatDrop admin panel. Please sign in at admin.sweat-drop.com — the mobile app is for gym members only.',
      buttons: [{ label: 'OK', style: 'default' }],
    });
  } catch (e) {
    log.warn('[Auth] showModal during rejectElevatedSession failed:', e);
  }
}
