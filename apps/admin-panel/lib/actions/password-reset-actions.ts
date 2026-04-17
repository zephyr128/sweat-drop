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

export async function sendAdminPasswordResetEmail(
  rawEmail: string,
): Promise<SendAdminPasswordResetResult> {
  const email = (rawEmail ?? '').trim().toLowerCase();

  if (!email || !email.includes('@')) {
    return { success: false, message: 'Please enter a valid email address.' };
  }

  // appUrl MUST be the admin panel's origin. If it's missing or points at the
  // consumer domain we refuse to generate a link — this is a configuration
  // error, not a runtime error the user can fix, so we fail loudly server-side
  // but return a generic message to the client.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!appUrl) {
    logger.error(
      '[password-reset] NEXT_PUBLIC_APP_URL is not set; refusing to generate admin reset link',
    );
    return {
      success: false,
      message:
        'Password reset is temporarily unavailable. Please contact support.',
    };
  }

  let appHost: string;
  try {
    appHost = new URL(appUrl).hostname;
  } catch {
    logger.error('[password-reset] NEXT_PUBLIC_APP_URL is not a valid URL', {
      appUrl,
    });
    return {
      success: false,
      message:
        'Password reset is temporarily unavailable. Please contact support.',
    };
  }

  if (appHost === 'sweat-drop.com' || appHost === 'www.sweat-drop.com') {
    // Refuse to proceed — this host is bound to the mobile app via App Links.
    logger.error(
      '[password-reset] NEXT_PUBLIC_APP_URL points at consumer domain — refusing',
      { appUrl },
    );
    return {
      success: false,
      message:
        'Password reset is misconfigured. Please contact support.',
    };
  }

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
