import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as 'email' | 'recovery' | null;

  const baseUrl = request.nextUrl.origin;

  if (!tokenHash || !type) {
    return NextResponse.redirect(`${baseUrl}/login?error=invalid_link`);
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: type === 'recovery' ? 'recovery' : 'email',
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

  // Email confirmation — redirect to login with success flag
  return NextResponse.redirect(`${baseUrl}/login?confirmed=true`);
}
