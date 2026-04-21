// SECURITY: This route MUST stay on the admin panel domain (admin.sweat-drop.com).
// NEVER redirect to sweat-drop.com or sweatdrop:// from here.
// The consumer mobile app intercepts links on sweat-drop.com via Android App Links /
// iOS Universal Links — routing an admin session there would expose elevated
// privileges inside the consumer app.
import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as 'email' | 'recovery' | 'magiclink' | null;
  const next = searchParams.get('next');

  const baseUrl = request.nextUrl.origin;

  if (!tokenHash || !type) {
    return NextResponse.redirect(`${baseUrl}/login?error=invalid_link`);
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: type === 'recovery' ? 'recovery' : type === 'magiclink' ? 'magiclink' : 'email',
  });

  if (error) {
    const msg =
      error.message.toLowerCase().includes('expired')
        ? 'link_expired'
        : 'confirmation_failed';
    return NextResponse.redirect(`${baseUrl}/login?error=${msg}`);
  }

  if (type === 'recovery') {
    // Session is now established — redirect to the reset-password form
    return NextResponse.redirect(`${baseUrl}/auth/reset`);
  }

  // Email/magiclink confirmation — redirect to safe local path when provided
  if (next && next.startsWith('/')) {
    const sep = next.includes('?') ? '&' : '?';
    return NextResponse.redirect(`${baseUrl}${next}${sep}confirmed=true`);
  }

  // Default confirmation redirect
  return NextResponse.redirect(`${baseUrl}/login?confirmed=true`);
}
