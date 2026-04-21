import { logger } from './logger';

// ── Types ──────────────────────────────────────────────────────

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

interface InvitationTemplateVars {
  heading: string;
  bodyText: string;
  acceptUrl: string;
  ctaLabel?: string;
}

// ── Core send function ────────────────────────────────────────

/**
 * Send an email via Resend API.
 * Falls back to logging the content when RESEND_API_KEY is not set.
 */
export async function sendEmail(opts: SendEmailOptions): Promise<SendEmailResult> {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const fromAddress = process.env.RESEND_FROM_EMAIL || 'SweatDrop <noreply@sweatdrop.com>';

  if (!RESEND_API_KEY) {
    logger.info('Email not sent (no RESEND_API_KEY)', {
      to: opts.to,
      subject: opts.subject,
      note: 'Set RESEND_API_KEY to enable email delivery.',
    });
    return { success: false, error: 'RESEND_API_KEY not configured' };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      logger.error('Resend API error', { status: response.status, body, to: opts.to });
      return { success: false, error: `Resend ${response.status}: ${body}` };
    }

    const data = await response.json().catch(() => ({}));
    logger.info('Email sent via Resend', { to: opts.to, subject: opts.subject });
    return { success: true, messageId: data.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown email error';
    logger.error('Email send exception', { error: msg, to: opts.to });
    return { success: false, error: msg };
  }
}

// ── Shared HTML wrapper ───────────────────────────────────────

function wrapEmailHtml(vars: InvitationTemplateVars): string {
  const { heading, bodyText, acceptUrl, ctaLabel = 'Accept Invitation' } = vars;

  return [
    '<!DOCTYPE html>',
    '<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">',
    '<meta name="color-scheme" content="dark only"><meta name="supported-color-schemes" content="dark only">',
    '<style>body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}',
    'table,td{mso-table-lspace:0pt;mso-table-rspace:0pt}',
    'body{margin:0;padding:0;width:100%!important;background-color:#000000}',
    ':root{color-scheme:dark only;supported-color-schemes:dark only}',
    '@media only screen and (max-width:480px){.card-td{padding:32px 20px!important}.heading{font-size:22px!important}.cta-link{padding:14px 28px!important}}</style>',
    '</head>',
    '<body style="margin:0;padding:0;background-color:#000000;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#000000">',
    '<tr><td align="center" style="padding:40px 16px">',

    // Container
    '<table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%">',

    // Logo
    '<tr><td align="center" style="padding-bottom:32px">',
    '<p style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;font-size:14px;font-weight:700;letter-spacing:4px;text-transform:uppercase;color:#F5F5F7;margin:14px 0 0 0">SWEATDROP</p>',
    '</td></tr>',

    // Card
    '<tr><td>',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#111111;border:1px solid #222222;border-radius:16px">',
    '<tr><td class="card-td" style="padding:40px 32px;text-align:center">',

    // Accent line
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 28px auto">',
    '<tr><td style="width:40px;height:3px;background-color:#00E5FF;border-radius:2px;font-size:0;line-height:0">&nbsp;</td></tr>',
    '</table>',

    // Heading
    `<h1 class="heading" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:26px;font-weight:700;color:#F5F5F7;margin:0 0 12px 0;line-height:1.2">${heading}</h1>`,

    // Body text
    `<p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.6;color:#86868B;margin:0 0 32px 0">${bodyText}</p>`,

    // CTA button
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">',
    '<tr><td align="center" style="background-color:#00E5FF;border-radius:10px">',
    `<a href="${acceptUrl}" class="cta-link" target="_blank" style="display:inline-block;padding:14px 40px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;font-weight:700;color:#000000;text-decoration:none;letter-spacing:0.5px">${ctaLabel}</a>`,
    '</td></tr></table>',

    // Fallback link
    `<p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12px;color:#515154;line-height:1.5;margin:28px 0 0 0">Or copy this link:<br/>`,
    `<a href="${acceptUrl}" style="color:#00E5FF;word-break:break-all">${acceptUrl}</a></p>`,

    // Divider
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0">',
    '<tr><td style="height:1px;background-color:#1C1C1E;font-size:0;line-height:0">&nbsp;</td></tr></table>',

    // Expire note
    `<p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12px;color:#515154;line-height:1.5;margin:0">This link expires in 7 days. If you didn't expect this invitation, you can safely ignore this email.</p>`,

    '</td></tr></table></td></tr>',

    // Footer
    '<tr><td align="center" style="padding-top:32px">',
    `<p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12px;color:#515154;line-height:1.6;margin:0">&copy; ${new Date().getFullYear()} SweatDrop. All rights reserved.</p>`,
    '</td></tr>',

    '</table></td></tr></table></body></html>',
  ].join('');
}

// ── Template builders ──────────────────────────────────────────

export function buildStaffInvitationEmailHtml(vars: {
  gymName: string;
  roleName: string;
  acceptUrl: string;
}): string {
  return wrapEmailHtml({
    heading: 'Staff Invitation',
    bodyText: `You've been invited to join <strong style="color:#fff">${vars.gymName}</strong> as a <strong style="color:#00E5FF">${vars.roleName}</strong>.`,
    acceptUrl: vars.acceptUrl,
    ctaLabel: 'Accept Invitation',
  });
}

export function buildOwnerInvitationEmailHtml(vars: {
  gymName?: string;
  acceptUrl: string;
}): string {
  const gym = vars.gymName || 'a gym';
  return wrapEmailHtml({
    heading: 'Gym Owner Invitation',
    bodyText: `You've been invited to manage <strong style="color:#fff">${gym}</strong> on <strong style="color:#00E5FF">SweatDrop</strong>.`,
    acceptUrl: vars.acceptUrl,
    ctaLabel: 'Accept Invitation',
  });
}

/**
 * Admin-panel-specific password reset email.
 *
 * SECURITY: The CTA link MUST live on admin.sweat-drop.com (or localhost in dev)
 * because the consumer domain sweat-drop.com is bound to the mobile app via
 * Android App Links / iOS Universal Links. An admin session that lands on
 * sweat-drop.com is silently imported into the mobile app, leaking elevated
 * privileges. This email is sent directly via Resend (bypassing Supabase's
 * email template) so the URL is entirely under our control.
 */
export function buildAdminPasswordResetEmailHtml(vars: {
  resetUrl: string;
}): string {
  return wrapEmailHtml({
    heading: 'Reset your admin password',
    bodyText:
      'We received a request to reset the password for your <strong style="color:#fff">SweatDrop admin account</strong>. Use the button below to choose a new password in your browser. This link opens the admin panel — not the consumer mobile app.',
    acceptUrl: vars.resetUrl,
    ctaLabel: 'Reset Password',
  });
}

export function buildAdminEmailConfirmHtml(vars: {
  confirmUrl: string;
  gymName?: string;
}): string {
  const gymText = vars.gymName
    ? ` to manage <strong style="color:#fff">${vars.gymName}</strong> on`
    : ' to access';

  return wrapEmailHtml({
    heading: 'Verify your email',
    bodyText: `You've been invited${gymText} <strong style="color:#00E5FF">SweatDrop Admin</strong>.<br><br>Please confirm your email address to activate your account and accept your invitation.`,
    acceptUrl: vars.confirmUrl,
    ctaLabel: 'Verify Email',
  });
}
