import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

interface ReferralPreview {
  status: 'valid' | 'expired' | 'used' | 'invalid';
  referrer_name: string | null;
  gym_name: string | null;
  gym_city: string | null;
  gym_logo_url: string | null;
  gym_primary_color: string | null;
  expires_at: string | null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const normalizedCode = code.toUpperCase().trim();

    if (!normalizedCode || normalizedCode.length < 4) {
      return NextResponse.json(
        { status: 'invalid', referrer_name: null, gym_name: null } satisfies Partial<ReferralPreview>,
        { status: 200 }
      );
    }

    const { data: referral, error } = await supabaseServer
      .from('referrals')
      .select(`
        id,
        invite_code,
        status,
        expires_at,
        referrer_user_id,
        invitee_user_id,
        gym_id
      `)
      .eq('invite_code', normalizedCode)
      .single();

    if (error || !referral) {
      return NextResponse.json(
        {
          status: 'invalid',
          referrer_name: null,
          gym_name: null,
          gym_city: null,
          gym_logo_url: null,
          gym_primary_color: null,
          expires_at: null,
        } satisfies ReferralPreview,
        { status: 200 }
      );
    }

    if (referral.status === 'blocked') {
      return NextResponse.json(
        {
          status: 'invalid',
          referrer_name: null,
          gym_name: null,
          gym_city: null,
          gym_logo_url: null,
          gym_primary_color: null,
          expires_at: null,
        } satisfies ReferralPreview,
        { status: 200 }
      );
    }

    if (referral.status === 'expired' || (referral.expires_at && new Date(referral.expires_at) < new Date())) {
      return NextResponse.json(
        {
          status: 'expired',
          referrer_name: null,
          gym_name: null,
          gym_city: null,
          gym_logo_url: null,
          gym_primary_color: null,
          expires_at: referral.expires_at,
        } satisfies ReferralPreview,
        { status: 200 }
      );
    }

    if (referral.invitee_user_id !== null || referral.status !== 'pending') {
      return NextResponse.json(
        {
          status: 'used',
          referrer_name: null,
          gym_name: null,
          gym_city: null,
          gym_logo_url: null,
          gym_primary_color: null,
          expires_at: null,
        } satisfies ReferralPreview,
        { status: 200 }
      );
    }

    const [profileRes, gymRes] = await Promise.all([
      supabaseServer
        .from('profiles')
        .select('username, full_name')
        .eq('id', referral.referrer_user_id)
        .single(),
      supabaseServer
        .from('gyms')
        .select('name, city, logo_url, primary_color')
        .eq('id', referral.gym_id)
        .single(),
    ]);

    const referrerName = profileRes.data?.full_name || profileRes.data?.username || null;
    const gymName = gymRes.data?.name || null;
    const gymCity = gymRes.data?.city || null;
    const gymLogoUrl = gymRes.data?.logo_url || null;
    const gymPrimaryColor = gymRes.data?.primary_color || null;

    return NextResponse.json(
      {
        status: 'valid',
        referrer_name: referrerName,
        gym_name: gymName,
        gym_city: gymCity,
        gym_logo_url: gymLogoUrl,
        gym_primary_color: gymPrimaryColor,
        expires_at: referral.expires_at,
      } satisfies ReferralPreview,
      {
        status: 200,
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      }
    );
  } catch (err) {
    console.error('[referral-preview] Error:', err);
    return NextResponse.json(
      {
        status: 'invalid',
        referrer_name: null,
        gym_name: null,
        gym_city: null,
        gym_logo_url: null,
        gym_primary_color: null,
        expires_at: null,
      },
      { status: 500 }
    );
  }
}
