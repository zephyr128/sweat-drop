import { NextRequest, NextResponse } from 'next/server';
import { sendWaitlistEmail } from '@/lib/email';
import { checkRateLimit } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimit = checkRateLimit(request);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: 'Too many requests. Please try again later.',
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil((rateLimit.resetTime - Date.now()) / 1000)),
            'X-RateLimit-Limit': '5',
            'X-RateLimit-Remaining': String(rateLimit.remaining),
            'X-RateLimit-Reset': String(rateLimit.resetTime),
          },
        }
      );
    }

    const body = await request.json();
    const { email, gym_name, source } = body;

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    }

    // Send email
    await sendWaitlistEmail({
      email: email.toLowerCase().trim(),
      gym_name: gym_name?.trim() || undefined,
      source: source || 'organic',
    });

    // TODO: Save to Supabase waitlist table
    // Handle duplicate emails gracefully (ON CONFLICT DO NOTHING)
    console.log('Waitlist signup:', { 
      email: email.toLowerCase().trim(), 
      gym_name: gym_name?.trim() || null,
      source: source || 'organic', 
      timestamp: new Date().toISOString() 
    });

    // In production, save to Supabase:
    // const { data, error } = await supabase
    //   .from('waitlist')
    //   .insert([{ email, gym_name, source, created_at: new Date().toISOString() }])
    //   .onConflict('email')
    //   .ignore();

    return NextResponse.json(
      { success: true },
      {
        status: 200,
        headers: {
          'X-RateLimit-Limit': '5',
          'X-RateLimit-Remaining': String(rateLimit.remaining),
          'X-RateLimit-Reset': String(rateLimit.resetTime),
        },
      }
    );
  } catch (error) {
    console.error('Error processing waitlist signup:', error);

    const errorMessage = error instanceof Error ? error.message : 'Failed to process signup';

    // Check if it's an email configuration error
    if (errorMessage.includes('Gmail credentials')) {
      console.error('Gmail configuration error. Please check environment variables.');
      return NextResponse.json(
        {
          success: false,
          error: 'Service temporarily unavailable. Please try again later.',
        },
        { status: 503 }
      );
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
