import { redirect } from 'next/navigation';

interface LegacyConfirmRedirectPageProps {
  searchParams: {
    [key: string]: string | string[] | undefined;
  };
}

/**
 * Backward-compat route for malformed links like:
 * /auth/reset/auth/confirm?token_hash=...&type=recovery
 *
 * We redirect to the canonical confirm endpoint and preserve query params.
 */
export default function LegacyConfirmRedirectPage({ searchParams }: LegacyConfirmRedirectPageProps) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === 'string') {
      query.set(key, value);
    } else if (Array.isArray(value) && value.length > 0) {
      query.set(key, value[0]);
    }
  }

  const qs = query.toString();
  redirect(qs ? `/auth/confirm?${qs}` : '/auth/confirm');
}
