'use server';

// AGENT NOTE: 2026-04-17 — admin-coder
// CRITICAL security path. Read docs/plans/bugfix_admin_password_reset_opens_mobile_app.md
// before changing ANYTHING in this file.
//
// Why this exists:
//   Supabase's built-in `resetPasswordForEmail` uses the `reset_password.html`
//   email template, which historically generated CTA URLs on {{ .SiteURL }}
//   (= https://www.sweat-drop.com). That domain is bound to the mobile app via
//   Android App Links / iOS Universal Links — so an admin reset link opened on
//   a phone would silently import the admin session into the consumer app.
//
//   Even after we made the template conditional on `.RedirectTo`, the
//   conditional is fragile (depends on exact string match, on the template
//   actually being deployed to Supabase Cloud, and on Supabase not URL-
//   normalising the value). To close the exploit window with certainty, the
//   admin panel now sends its OWN reset email via Resend, with a URL that
//   ALWAYS lives on `NEXT_PUBLIC_APP_URL` (admin.sweat-drop.com in prod).
//
// Related files:
//   - apps/admin-panel/app/forgot-password/ForgotPasswordForm.tsx (caller)
//   - apps/admin-panel/app/auth/confirm/route.ts (server route that consumes
//     the token_hash via verifyOtp)
//   - apps/admin-panel/app/auth/reset/ResetPasswordForm.tsx (password form)
//   - apps/admin-panel/lib/utils/email-service.ts (email builder + Resend send)

import { headers } from 'next/headers';
import { getAdminClient } from '@/lib/utils/supabase-admin';
import {
  sendEmail,
  buildAdminPasswordResetEmailHtml,
} from '@/lib/utils/email-service';
import { logger } from '@/lib/utils/logger';

export interface SendAdminPasswordResetResult {
  success: boolean;
  // Generic user-facing message; we never leak whether the email exists.
  message: string;
}

// Conservative generic response to prevent account enumeration. We return this
// regardless of whether the email exists, Supabase failed, or Resend failed.
const GENERIC_SENT =
  'If an admin account exists for that email, a password reset link has been sent.';

// Admin-only host allowlist. The reset link MUST live on one of these — never
// on the consumer web host (sweat-drop.com / www.sweat-drop.com, which are
// bound to the mobile app via Android App Links & iOS Universal Links).
//
// We pull the host from the incoming request so that a reset initiated on
// admin.dev.sweat-drop.com emails a link back to admin.dev.sweat-drop.com —
// not to prod. This matters because dev and prod are SEPARATE Supabase
// projects: a token minted by dev's auth is not valid against prod's auth,
// so crossing environments always looks "expired/invalid" to the user.
const ADMIN_HOST_ALLOWLIST = new Set<string>([
  'admin.sweat-drop.com',
  'admin.dev.sweat-drop.com',
  'localhost:3000',
  'localhost:3001',
  '127.0.0.1:3000',
]);

function hostToOrigin(host: string): string {
  const isLocal = host.startsWith('localhost') || host.startsWith('127.0.0.1');
  return `${isLocal ? 'http' : 'https'}://${host}`;
}

async function resolveAdminAppUrl(): Promise<
  | { ok: true; appUrl: string; source: 'request' | 'env' }
  | { ok: false; reason: string }
> {
  // 1) Preferred: derive the origin from the request that triggered this
  //    server action. This is automatically correct per-environment.
  try {
    const h = await headers();
    const rawHost = h.get('host')?.trim().toLowerCase() ?? '';
    if (rawHost && ADMIN_HOST_ALLOWLIST.has(rawHost)) {
      return { ok: true, appUrl: hostToOrigin(rawHost), source: 'request' };
    }
    if (rawHost) {
      // Host was present but not allowlisted — treat as suspicious and fall
      // through to env var (which is itself validated below). Do NOT use the
      // raw host, otherwise a Host-header spoof could redirect the reset
      // link to an attacker-controlled domain.
      logger.warn(
        '[password-reset] request host not in admin allowlist, falling back to env',
        { rawHost },
      );
    }
  } catch (err) {
    // headers() throws if called outside a request context — extremely
    // unlikely from a server action, but handle gracefully.
    logger.warn('[password-reset] headers() unavailable; falling back to env', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // 2) Fallback: NEXT_PUBLIC_APP_URL from env. Validated against the same
  //    allowlist so a misconfigured env can never generate a link pointing
  //    at the consumer domain or an arbitrary host.
  const envUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!envUrl) {
    return {
      ok: false,
      reason: 'no host in request and NEXT_PUBLIC_APP_URL is empty',
    };
  }
  let parsed: URL;
  try {
    parsed = new URL(envUrl);
  } catch {
    return { ok: false, reason: `NEXT_PUBLIC_APP_URL is not a valid URL: ${envUrl}` };
  }
  const envHost = `${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}`.toLowerCase();
  if (!ADMIN_HOST_ALLOWLIST.has(envHost)) {
    return {
      ok: false,
      reason: `NEXT_PUBLIC_APP_URL host not allowlisted: ${envHost}`,
    };
  }
  // Normalise: strip trailing slash and any path, keep scheme + host + port.
  return {
    ok: true,
    appUrl: `${parsed.protocol}//${envHost}`,
    source: 'env',
  };
}

export async function sendAdminPasswordResetEmail(
  rawEmail: string,
): Promise<SendAdminPasswordResetResult> {
  const email = (rawEmail ?? '').trim().toLowerCase();

  if (!email || !email.includes('@')) {
    return { success: false, message: 'Please enter a valid email address.' };
  }

  // appUrl MUST be the admin panel's origin matching the environment the
  // user is currently on (dev vs prod). See resolveAdminAppUrl for the full
  // rationale.
  const resolved = await resolveAdminAppUrl();
  if (!resolved.ok) {
    logger.error(
      '[password-reset] Could not resolve admin appUrl; refusing to generate link',
      { reason: resolved.reason },
    );
    return {
      success: false,
      message:
        'Password reset is temporarily unavailable. Please contact support.',
    };
  }
  const appUrl = resolved.appUrl;

  const admin = getAdminClient();
  if (!admin) {
    logger.error('[password-reset] Admin client unavailable');
    return {
      success: false,
      message:
        'Password reset is temporarily unavailable. Please try again later.',
    };
  }

  try {
    // Generate a recovery link via the Auth Admin API. This gives us a fresh
    // `hashed_token` that we can embed in our OWN URL — fully bypassing
    // Supabase's email template.
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: {
        // We don't actually use Supabase's redirect; `redirectTo` is only
        // required by the API schema. But we still set it to the admin domain
        // so that any auditor looking at the Supabase logs sees the intended
        // destination.
        redirectTo: `${appUrl}/auth/confirm`,
      },
    });

    if (error) {
      // Most common error: "User not found". We intentionally swallow this
      // and return the generic success message to prevent email enumeration.
      const msg = error.message?.toLowerCase() ?? '';
      const isEnumerationError =
        msg.includes('user not found') || msg.includes('not found');

      if (isEnumerationError) {
        logger.info('[password-reset] No account for email (returning generic)', {
          emailDomain: email.split('@')[1] ?? 'unknown',
        });
        return { success: true, message: GENERIC_SENT };
      }

      logger.error('[password-reset] generateLink failed', {
        error: error.message,
      });
      return {
        success: false,
        message:
          'We could not send a reset link right now. Please try again in a moment.',
      };
    }

    const hashedToken = (data as { properties?: { hashed_token?: string } })
      ?.properties?.hashed_token;

    if (!hashedToken) {
      logger.error('[password-reset] generateLink returned no hashed_token', {
        properties: (data as { properties?: unknown })?.properties,
      });
      return {
        success: false,
        message:
          'We could not send a reset link right now. Please try again in a moment.',
      };
    }

    // Build our own URL. This is the only link the user receives — it lives
    // entirely on the admin domain.
    const resetUrl = `${appUrl}/auth/confirm?token_hash=${encodeURIComponent(
      hashedToken,
    )}&type=recovery`;

    const sendResult = await sendEmail({
      to: email,
      subject: 'Reset your SweatDrop admin password',
      html: buildAdminPasswordResetEmailHtml({ resetUrl }),
    });

    if (!sendResult.success) {
      logger.error('[password-reset] Email send failed', {
        error: sendResult.error,
      });
      // Intentionally still return generic success — we don't want the caller
      // to know delivery failed (could be used for enumeration too). But we
      // log server-side so we can monitor Resend health in Sentry / logs.
      return { success: true, message: GENERIC_SENT };
    }

    logger.info('[password-reset] Admin reset email sent', {
      emailDomain: email.split('@')[1] ?? 'unknown',
    });
    return { success: true, message: GENERIC_SENT };
  } catch (err) {
    logger.error('[password-reset] Unexpected error', {
      error: err instanceof Error ? err.message : 'Unknown error',
    });
    return {
      success: false,
      message:
        'We could not send a reset link right now. Please try again in a moment.',
    };
  }
}
