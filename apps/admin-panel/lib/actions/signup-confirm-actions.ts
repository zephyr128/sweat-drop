'use server';

import { z } from 'zod';
import { getAdminClient } from '@/lib/utils/supabase-admin';
import { resolveAdminAppUrl } from '@/lib/utils/admin-app-url';
import { buildAdminEmailConfirmHtml, sendEmail } from '@/lib/utils/email-service';
import { logger } from '@/lib/utils/logger';

const CreateAdminUserSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(6).max(256),
  username: z.string().trim().min(2).max(40),
  inviteToken: z.string().trim().min(1).max(255).nullable(),
});

type ConfirmLinkType = 'email' | 'magiclink';

export interface CreateAdminUserResult {
  success: boolean;
  message: string;
}

async function resolveInvitationGymName(
  admin: NonNullable<ReturnType<typeof getAdminClient>>,
  inviteToken: string | null,
): Promise<string | undefined> {
  if (!inviteToken) return undefined;
  const { data } = await admin
    .from('staff_invitations')
    .select('gyms:gym_id(name)')
    .eq('token', inviteToken)
    .maybeSingle();

  const gym = (data as { gyms?: { name?: string } | null } | null)?.gyms;
  return gym?.name?.trim() || undefined;
}

async function generateConfirmToken(
  admin: NonNullable<ReturnType<typeof getAdminClient>>,
  email: string,
  appUrl: string,
  password?: string,
): Promise<{ hashedToken: string; linkType: ConfirmLinkType } | null> {
  if (password) {
    const signupResult = await admin.auth.admin.generateLink({
      type: 'signup',
      email,
      password,
      options: {
        redirectTo: `${appUrl}/auth/confirm`,
      },
    });

    const signupToken = (signupResult.data as { properties?: { hashed_token?: string } } | null)
      ?.properties?.hashed_token;
    if (!signupResult.error && signupToken) {
      return { hashedToken: signupToken, linkType: 'email' };
    }

    if (signupResult.error) {
      logger.warn('[admin-signup] signup generateLink failed; trying magiclink fallback', {
        error: signupResult.error.message,
      });
    }
  }

  const magicResult = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: {
      redirectTo: `${appUrl}/auth/confirm`,
    },
  });

  const magicToken = (magicResult.data as { properties?: { hashed_token?: string } } | null)
    ?.properties?.hashed_token;
  if (!magicResult.error && magicToken) {
    return { hashedToken: magicToken, linkType: 'magiclink' };
  }

  if (magicResult.error) {
    logger.error('[admin-signup] magiclink generateLink failed', {
      error: magicResult.error.message,
    });
  }
  return null;
}

async function sendSignupConfirmEmail(
  admin: NonNullable<ReturnType<typeof getAdminClient>>,
  email: string,
  inviteToken: string | null,
  appUrl: string,
  password?: string,
): Promise<{ success: boolean; message: string }> {
  const generated = await generateConfirmToken(admin, email, appUrl, password);
  if (!generated) {
    return {
      success: false,
      message: 'Could not create verification email. Please try again shortly.',
    };
  }

  const nextPath = inviteToken
    ? `/accept-invitation/${encodeURIComponent(inviteToken)}`
    : '/dashboard';
  const confirmUrl =
    `${appUrl}/auth/confirm?token_hash=${encodeURIComponent(generated.hashedToken)}` +
    `&type=${generated.linkType === 'magiclink' ? 'magiclink' : 'email'}` +
    `&next=${encodeURIComponent(nextPath)}`;

  const gymName = await resolveInvitationGymName(admin, inviteToken);
  const sendResult = await sendEmail({
    to: email,
    subject: 'Verify your email for SweatDrop Admin',
    html: buildAdminEmailConfirmHtml({
      confirmUrl,
      gymName,
    }),
  });

  if (!sendResult.success) {
    logger.error('[admin-signup] Failed to send confirmation email', {
      emailDomain: email.split('@')[1] ?? 'unknown',
      error: sendResult.error,
    });
    return {
      success: false,
      message: 'Account created, but we could not send verification email. Please contact support.',
    };
  }

  return {
    success: true,
    message: 'Account created. Check your email to verify and continue.',
  };
}

export async function sendAdminSignupConfirmEmail(
  email: string,
  inviteToken: string | null,
): Promise<{ success: boolean; message: string }> {
  const admin = getAdminClient();
  if (!admin) {
    return {
      success: false,
      message: 'Email confirmation is temporarily unavailable. Please try again.',
    };
  }

  const resolved = await resolveAdminAppUrl();
  if (!resolved.ok) {
    logger.error('[admin-signup] Unable to resolve admin app URL for confirm email', {
      reason: resolved.reason,
    });
    return {
      success: false,
      message: 'Email confirmation is temporarily unavailable. Please contact support.',
    };
  }

  return sendSignupConfirmEmail(admin, email.trim().toLowerCase(), inviteToken, resolved.appUrl);
}

export async function createAdminUser(
  input: z.infer<typeof CreateAdminUserSchema>,
): Promise<CreateAdminUserResult> {
  const parsed = CreateAdminUserSchema.safeParse({
    ...input,
    email: input.email?.trim().toLowerCase(),
  });
  if (!parsed.success) {
    return { success: false, message: 'Please provide valid signup details.' };
  }

  const admin = getAdminClient();
  if (!admin) {
    return { success: false, message: 'Signup is temporarily unavailable. Please try again.' };
  }

  const resolved = await resolveAdminAppUrl();
  if (!resolved.ok) {
    logger.error('[admin-signup] Unable to resolve admin app URL', {
      reason: resolved.reason,
    });
    return {
      success: false,
      message: 'Signup is temporarily unavailable. Please contact support.',
    };
  }

  const { email, password, username, inviteToken } = parsed.data;
  const createResult = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
    // Use preferred_username — the handle_new_user trigger checks this key first
    user_metadata: { preferred_username: username },
  });

  if (createResult.error) {
    const msg = createResult.error.message.toLowerCase();
    const alreadyExists =
      msg.includes('already registered') ||
      msg.includes('already exists') ||
      msg.includes('duplicate');
    if (!alreadyExists) {
      logger.error('[admin-signup] createUser failed', {
        error: createResult.error.message,
      });
      return {
        success: false,
        message: 'Could not create account. Please try again in a moment.',
      };
    }
  }

  return sendSignupConfirmEmail(admin, email, inviteToken, resolved.appUrl, password);
}
