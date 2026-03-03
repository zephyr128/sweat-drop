import { NextResponse } from 'next/server';
import { sendApplyPilotEmail } from '@/lib/email';
import { checkRateLimit } from '@/lib/rate-limit';
import { validateApplyPilot, sanitizeString } from '@/lib/validation';

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
    const validation = validateApplyPilot(body);
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
      cityCountry: sanitizeString(body.cityCountry),
      activeMembers: sanitizeString(body.activeMembers),
      cardioMachines: sanitizeString(body.cardioMachines),
      multipleLocations: sanitizeString(body.multipleLocations),
      whyJoin: sanitizeString(body.whyJoin),
      selectedPlan: body.selectedPlan ? sanitizeString(body.selectedPlan) : null,
    };

    // Send email
    await sendApplyPilotEmail(emailData);

    // Log successful submission
    console.log('Apply Pilot Submission:', {
      timestamp: new Date().toISOString(),
      gymName: emailData.gymName,
      cityCountry: emailData.cityCountry,
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
    console.error('Error processing pilot application:', error);

    // Don't expose internal errors to client
    const errorMessage = error instanceof Error ? error.message : 'Failed to process application';

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
        error: 'Failed to process application. Please try again later.',
      },
      { status: 500 }
    );
  }
}
