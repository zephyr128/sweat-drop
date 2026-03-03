import { NextRequest, NextResponse } from 'next/server';
import { sendContactEmail } from '@/lib/email';
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
    const { name, company, email, phone, locations, message } = body;

    if (!name || !company || !email || !phone) {
      return NextResponse.json({ error: 'Required fields missing' }, { status: 400 });
    }

    // Sanitize and prepare email data
    const emailData = {
      name: sanitizeString(name),
      company: sanitizeString(company),
      email: sanitizeString(email).toLowerCase().trim(),
      phone: sanitizeString(phone),
      locations: locations ? sanitizeString(locations) : undefined,
      message: message ? sanitizeString(message) : undefined,
    };

    // Send email
    await sendContactEmail(emailData);

    console.log('Contact form submission:', {
      ...emailData,
      timestamp: new Date().toISOString(),
    });

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
    console.error('Error processing contact form:', error);

    const errorMessage = error instanceof Error ? error.message : 'Failed to process contact';

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
