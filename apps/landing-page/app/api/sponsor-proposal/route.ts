import { NextRequest, NextResponse } from 'next/server';
import { sendSponsorProposalEmail } from '@/lib/email';
import { checkRateLimit } from '@/lib/rate-limit';
import { sanitizeString } from '@/lib/validation';

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
    const { company, name, email, phone, website, plan, founding, message, startDate } = body;

    if (!company || !name || !email || !phone) {
      return NextResponse.json({ error: 'Required fields missing' }, { status: 400 });
    }

    // Sanitize and prepare email data
    const emailData = {
      company: sanitizeString(company),
      name: sanitizeString(name),
      email: sanitizeString(email).toLowerCase().trim(),
      phone: sanitizeString(phone),
      website: website ? sanitizeString(website) : undefined,
      plan: plan ? sanitizeString(plan) : undefined,
      founding: founding || false,
      message: message ? sanitizeString(message) : undefined,
      startDate: startDate ? sanitizeString(startDate) : undefined,
    };

    // Send email
    await sendSponsorProposalEmail(emailData);

    // TODO: Save to Supabase sponsor_leads table
    console.log('Sponsor proposal request:', {
      ...emailData,
      timestamp: new Date().toISOString(),
    });

    // In production:
    // 1. Save to Supabase
    // 2. Email already sent above

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
    console.error('Error processing sponsor proposal:', error);

    const errorMessage = error instanceof Error ? error.message : 'Failed to process proposal';

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
