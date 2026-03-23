import { redirect, notFound } from 'next/navigation';
import { getCurrentProfile, type UserProfile, type UserRole } from './auth';

/**
 * Quick auth guard for server component pages.
 * Middleware already validates authentication — this just fetches
 * the profile (single DB call) and checks role access.
 */
export async function requireProfile(allowedRoles?: UserRole[]): Promise<UserProfile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    redirect('/dashboard');
  }

  return profile;
}

/**
 * Auth guard for gym-scoped pages.
 * Returns the profile after verifying the user has access to the given gym.
 *
 * Middleware already verifies gym ownership for gym_owner via
 * `gyms.owner_id === user.id`, so we trust that here to avoid a
 * redundant DB call and a redirect loop (profiles.owner_id is NOT
 * a gym ID — it may be null or stale).
 */
export async function requireGymAccess(
  gymId: string,
  allowedRoles: UserRole[] = ['superadmin', 'gym_owner', 'gym_admin'],
): Promise<UserProfile> {
  const profile = await requireProfile(allowedRoles);

  if (profile.role === 'superadmin') return profile;

  // Middleware already verified gym ownership for gym_owner
  if (profile.role === 'gym_owner') return profile;

  // For gym_admin / receptionist, verify assigned gym
  if (profile.assigned_gym_id === gymId) return profile;

  redirect('/dashboard');
}
