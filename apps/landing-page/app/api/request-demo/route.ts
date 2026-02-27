import { NextResponse } from 'next/server';
import { sendRequestDemoEmail } from '@/lib/email';
import { checkRateLimit } from '@/lib/rate-limit';
import { validateRequestDemo, sanitizeString } from '@/lib/validation';

export async function POST(request: Request) {
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

    // Parse and validate request body
    const body = await request.json();

    // Validate input
    const validation = validateRequestDemo(body);
    if (!validation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation failed',
          errors: validation.errors,
        },
        { status: 400 }
      );
    }

    // Sanitize and prepare email data
    const emailData = {
      fullName: sanitizeString(body.fullName),
      gymName: sanitizeString(body.gymName),
      email: sanitizeString(body.email).toLowerCase(),
      phone: body.phone ? sanitizeString(body.phone) : undefined,
      locations: body.locations ? sanitizeString(body.locations) : undefined,
      message: body.message ? sanitizeString(body.message) : undefined,
    };

    // Send email
    await sendRequestDemoEmail(emailData);

    // Log successful submission
    console.log('Request Demo Submission:', {
      timestamp: new Date().toISOString(),
      email: emailData.email,
      gymName: emailData.gymName,
    });

    return NextResponse.json(
      {
        success: true,
      },
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
    console.error('Error processing request demo:', error);

    // Don't expose internal errors to client
    const errorMessage = error instanceof Error ? error.message : 'Failed to process request';

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

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to process request. Please try again later.',
      },
      { status: 500 }
    );
  }
}
