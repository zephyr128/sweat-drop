import type { User } from '@supabase/supabase-js';

/**
 * True when the user signed up with email/password (email identity) and has not
 * confirmed their email yet. OAuth identities are excluded to avoid blocking
 * Google/Apple users if metadata is incomplete.
 */
export function shouldRequireEmailVerification(user: User | null | undefined): boolean {
  if (!user?.email) return false;
  if (user.email_confirmed_at) return false;

  const provider = typeof user.app_metadata?.provider === 'string'
    ? user.app_metadata.provider
    : '';
  if (provider === 'google' || provider === 'apple') return false;

  const identities = user.identities ?? [];
  const hasOAuth = identities.some(
    (i) => i.provider === 'google' || i.provider === 'apple',
  );
  if (hasOAuth) return false;

  const hasEmailIdentity = identities.some((i) => i.provider === 'email');
  if (hasEmailIdentity) return true;

  // Fail closed for users with an email and no confirmation signal.
  // This avoids bypass when identities are absent in a cached/stale JWT.
  return true;
}
