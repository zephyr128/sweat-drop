import nodemailer from 'nodemailer';

const CONTACT_EMAIL = process.env.CONTACT_EMAIL || 'support@sweat-drop.com';

interface EmailConfig {
  user: string;
  appPassword: string;
}

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (transporter) {
    return transporter;
  }

  const user = process.env.GMAIL_USER;
  const appPassword = process.env.GMAIL_APP_PASSWORD;

  if (!user || !appPassword) {
    throw new Error('Gmail credentials not configured. Please set GMAIL_USER and GMAIL_APP_PASSWORD environment variables.');
  }

  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user,
      pass: appPassword,
    },
  });

  return transporter;
}

interface RequestDemoEmailData {
  fullName: string;
  gymName: string;
  email: string;
  phone?: string;
  locations?: string;
  message?: string;
}

interface ApplyPilotEmailData {
  fullName: string;
  gymName: string;
  cityCountry: string;
  activeMembers: string;
  cardioMachines: string;
  multipleLocations: string;
  whyJoin: string;
}

function sanitizeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatRequestDemoEmail(data: RequestDemoEmailData): { subject: string; html: string } {
  const subject = 'New Demo Request - SweatDrop';
  
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .header {
            background: linear-gradient(135deg, #00E5FF 0%, #00B8CC 100%);
            color: white;
            padding: 30px;
            text-align: center;
            border-radius: 8px 8px 0 0;
          }
          .header h1 {
            margin: 0;
            font-size: 24px;
            font-weight: 700;
          }
          .content {
            background: #f9f9f9;
            padding: 30px;
            border-radius: 0 0 8px 8px;
          }
          .field {
            margin-bottom: 20px;
          }
          .field-label {
            font-weight: 600;
            color: #666;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 5px;
          }
          .field-value {
            color: #333;
            font-size: 16px;
            padding: 10px;
            background: white;
            border-radius: 4px;
            border-left: 3px solid #00E5FF;
          }
          .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
            text-align: center;
            color: #999;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>New Demo Request</h1>
        </div>
        <div class="content">
          <div class="field">
            <div class="field-label">Full Name</div>
            <div class="field-value">${sanitizeHtml(data.fullName)}</div>
          </div>
          <div class="field">
            <div class="field-label">Gym Name</div>
            <div class="field-value">${sanitizeHtml(data.gymName)}</div>
          </div>
          <div class="field">
            <div class="field-label">Email</div>
            <div class="field-value">${sanitizeHtml(data.email)}</div>
          </div>
          ${data.phone ? `
          <div class="field">
            <div class="field-label">Phone</div>
            <div class="field-value">${sanitizeHtml(data.phone)}</div>
          </div>
          ` : ''}
          ${data.locations ? `
          <div class="field">
            <div class="field-label">Number of Locations</div>
            <div class="field-value">${sanitizeHtml(data.locations)}</div>
          </div>
          ` : ''}
          ${data.message ? `
          <div class="field">
            <div class="field-label">Message</div>
            <div class="field-value" style="white-space: pre-wrap;">${sanitizeHtml(data.message)}</div>
          </div>
          ` : ''}
          <div class="footer">
            <p>This email was sent from the SweatDrop website contact form.</p>
            <p>Timestamp: ${new Date().toLocaleString()}</p>
          </div>
        </div>
      </body>
    </html>
  `;

  return { subject, html };
}

function formatApplyPilotEmail(data: ApplyPilotEmailData): { subject: string; html: string } {
  const subject = 'New Pilot Application - SweatDrop';
  
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .header {
            background: linear-gradient(135deg, #00E5FF 0%, #00B8CC 100%);
            color: white;
            padding: 30px;
            text-align: center;
            border-radius: 8px 8px 0 0;
          }
          .header h1 {
            margin: 0;
            font-size: 24px;
            font-weight: 700;
          }
          .content {
            background: #f9f9f9;
            padding: 30px;
            border-radius: 0 0 8px 8px;
          }
          .field {
            margin-bottom: 20px;
          }
          .field-label {
            font-weight: 600;
            color: #666;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 5px;
          }
          .field-value {
            color: #333;
            font-size: 16px;
            padding: 10px;
            background: white;
            border-radius: 4px;
            border-left: 3px solid #00E5FF;
          }
          .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
            text-align: center;
            color: #999;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>New Pilot Application</h1>
        </div>
        <div class="content">
          <div class="field">
            <div class="field-label">Full Name</div>
            <div class="field-value">${sanitizeHtml(data.fullName)}</div>
          </div>
          <div class="field">
            <div class="field-label">Gym Name</div>
            <div class="field-value">${sanitizeHtml(data.gymName)}</div>
          </div>
          <div class="field">
            <div class="field-label">City / Country</div>
            <div class="field-value">${sanitizeHtml(data.cityCountry)}</div>
          </div>
          <div class="field">
            <div class="field-label">Number of Active Members</div>
            <div class="field-value">${sanitizeHtml(data.activeMembers)}</div>
          </div>
          <div class="field">
            <div class="field-label">Cardio Machines Count</div>
            <div class="field-value">${sanitizeHtml(data.cardioMachines)}</div>
          </div>
          <div class="field">
            <div class="field-label">Multiple Locations</div>
            <div class="field-value">${sanitizeHtml(data.multipleLocations)}</div>
          </div>
          <div class="field">
            <div class="field-label">Why Join Pilot?</div>
            <div class="field-value" style="white-space: pre-wrap;">${sanitizeHtml(data.whyJoin)}</div>
          </div>
          <div class="footer">
            <p>This email was sent from the SweatDrop website pilot application form.</p>
            <p>Timestamp: ${new Date().toLocaleString()}</p>
          </div>
        </div>
      </body>
    </html>
  `;

  return { subject, html };
}

export async function sendRequestDemoEmail(data: RequestDemoEmailData): Promise<void> {
  const transport = getTransporter();
  const { subject, html } = formatRequestDemoEmail(data);
  const user = process.env.GMAIL_USER!;

  await transport.sendMail({
    from: `"SweatDrop Website" <${user}>`,
    to: CONTACT_EMAIL,
    replyTo: data.email,
    subject,
    html,
  });
}

export async function sendApplyPilotEmail(data: ApplyPilotEmailData): Promise<void> {
  const transport = getTransporter();
  const { subject, html } = formatApplyPilotEmail(data);
  const user = process.env.GMAIL_USER!;

  await transport.sendMail({
    from: `"SweatDrop Website" <${user}>`,
    to: CONTACT_EMAIL,
    replyTo: CONTACT_EMAIL,
    subject,
    html,
  });
}

interface WaitlistEmailData {
  email: string;
  gym_name?: string;
  source?: string;
}

interface SponsorProposalEmailData {
  company: string;
  name: string;
  email: string;
  phone: string;
  website?: string;
  plan?: string;
  founding?: boolean;
  message?: string;
  startDate?: string;
}

interface ContactEmailData {
  name: string;
  company: string;
  email: string;
  phone: string;
  locations?: string;
  message?: string;
}

function formatWaitlistEmail(data: WaitlistEmailData): { subject: string; html: string } {
  const subject = 'New Waitlist Signup - SweatDrop';
  
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .header {
            background: linear-gradient(135deg, #00E5FF 0%, #00B8CC 100%);
            color: white;
            padding: 30px;
            text-align: center;
            border-radius: 8px 8px 0 0;
          }
          .header h1 {
            margin: 0;
            font-size: 24px;
            font-weight: 700;
          }
          .content {
            background: #f9f9f9;
            padding: 30px;
            border-radius: 0 0 8px 8px;
          }
          .field {
            margin-bottom: 20px;
          }
          .field-label {
            font-weight: 600;
            color: #666;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 5px;
          }
          .field-value {
            color: #333;
            font-size: 16px;
            padding: 10px;
            background: white;
            border-radius: 4px;
            border-left: 3px solid #00E5FF;
          }
          .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
            text-align: center;
            color: #999;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>New Waitlist Signup</h1>
        </div>
        <div class="content">
          <div class="field">
            <div class="field-label">Email</div>
            <div class="field-value">${sanitizeHtml(data.email)}</div>
          </div>
          ${data.gym_name ? `
          <div class="field">
            <div class="field-label">Gym Name</div>
            <div class="field-value">${sanitizeHtml(data.gym_name)}</div>
          </div>
          ` : ''}
          <div class="field">
            <div class="field-label">Source</div>
            <div class="field-value">${sanitizeHtml(data.source || 'organic')}</div>
          </div>
          <div class="footer">
            <p>This email was sent from the SweatDrop website waitlist form.</p>
            <p>Timestamp: ${new Date().toLocaleString()}</p>
          </div>
        </div>
      </body>
    </html>
  `;

  return { subject, html };
}

function formatSponsorProposalEmail(data: SponsorProposalEmailData): { subject: string; html: string } {
  const subject = data.founding ? 'New Founding Sponsor Proposal - SweatDrop' : 'New Sponsor Proposal - SweatDrop';
  
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .header {
            background: linear-gradient(135deg, #FF5500 0%, #CC4400 100%);
            color: white;
            padding: 30px;
            text-align: center;
            border-radius: 8px 8px 0 0;
          }
          .header h1 {
            margin: 0;
            font-size: 24px;
            font-weight: 700;
          }
          .content {
            background: #f9f9f9;
            padding: 30px;
            border-radius: 0 0 8px 8px;
          }
          .field {
            margin-bottom: 20px;
          }
          .field-label {
            font-weight: 600;
            color: #666;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 5px;
          }
          .field-value {
            color: #333;
            font-size: 16px;
            padding: 10px;
            background: white;
            border-radius: 4px;
            border-left: 3px solid #FF5500;
          }
          .badge {
            display: inline-block;
            background: #FF5500;
            color: white;
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 600;
            margin-bottom: 10px;
          }
          .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
            text-align: center;
            color: #999;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${data.founding ? 'New Founding Sponsor Proposal' : 'New Sponsor Proposal'}</h1>
        </div>
        <div class="content">
          ${data.founding ? '<div class="badge">FOUNDING SPONSOR</div>' : ''}
          <div class="field">
            <div class="field-label">Company</div>
            <div class="field-value">${sanitizeHtml(data.company)}</div>
          </div>
          <div class="field">
            <div class="field-label">Contact Name</div>
            <div class="field-value">${sanitizeHtml(data.name)}</div>
          </div>
          <div class="field">
            <div class="field-label">Email</div>
            <div class="field-value">${sanitizeHtml(data.email)}</div>
          </div>
          <div class="field">
            <div class="field-label">Phone</div>
            <div class="field-value">${sanitizeHtml(data.phone)}</div>
          </div>
          ${data.website ? `
          <div class="field">
            <div class="field-label">Website</div>
            <div class="field-value">${sanitizeHtml(data.website)}</div>
          </div>
          ` : ''}
          ${data.plan ? `
          <div class="field">
            <div class="field-label">Arena Plan</div>
            <div class="field-value">${sanitizeHtml(data.plan)}</div>
          </div>
          ` : ''}
          ${data.startDate ? `
          <div class="field">
            <div class="field-label">Ideal Start Date</div>
            <div class="field-value">${sanitizeHtml(data.startDate)}</div>
          </div>
          ` : ''}
          ${data.message ? `
          <div class="field">
            <div class="field-label">Message</div>
            <div class="field-value" style="white-space: pre-wrap;">${sanitizeHtml(data.message)}</div>
          </div>
          ` : ''}
          <div class="footer">
            <p>This email was sent from the SweatDrop website sponsor proposal form.</p>
            <p>Timestamp: ${new Date().toLocaleString()}</p>
          </div>
        </div>
      </body>
    </html>
  `;

  return { subject, html };
}

function formatContactEmail(data: ContactEmailData): { subject: string; html: string } {
  const subject = 'New Contact Form Submission - SweatDrop';
  
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .header {
            background: linear-gradient(135deg, #00E5FF 0%, #00B8CC 100%);
            color: white;
            padding: 30px;
            text-align: center;
            border-radius: 8px 8px 0 0;
          }
          .header h1 {
            margin: 0;
            font-size: 24px;
            font-weight: 700;
          }
          .content {
            background: #f9f9f9;
            padding: 30px;
            border-radius: 0 0 8px 8px;
          }
          .field {
            margin-bottom: 20px;
          }
          .field-label {
            font-weight: 600;
            color: #666;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 5px;
          }
          .field-value {
            color: #333;
            font-size: 16px;
            padding: 10px;
            background: white;
            border-radius: 4px;
            border-left: 3px solid #00E5FF;
          }
          .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
            text-align: center;
            color: #999;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>New Contact Form Submission</h1>
        </div>
        <div class="content">
          <div class="field">
            <div class="field-label">Name</div>
            <div class="field-value">${sanitizeHtml(data.name)}</div>
          </div>
          <div class="field">
            <div class="field-label">Company</div>
            <div class="field-value">${sanitizeHtml(data.company)}</div>
          </div>
          <div class="field">
            <div class="field-label">Email</div>
            <div class="field-value">${sanitizeHtml(data.email)}</div>
          </div>
          <div class="field">
            <div class="field-label">Phone</div>
            <div class="field-value">${sanitizeHtml(data.phone)}</div>
          </div>
          ${data.locations ? `
          <div class="field">
            <div class="field-label">Number of Locations</div>
            <div class="field-value">${sanitizeHtml(data.locations)}</div>
          </div>
          ` : ''}
          ${data.message ? `
          <div class="field">
            <div class="field-label">Message</div>
            <div class="field-value" style="white-space: pre-wrap;">${sanitizeHtml(data.message)}</div>
          </div>
          ` : ''}
          <div class="footer">
            <p>This email was sent from the SweatDrop website contact form.</p>
            <p>Timestamp: ${new Date().toLocaleString()}</p>
          </div>
        </div>
      </body>
    </html>
  `;

  return { subject, html };
}

export async function sendWaitlistEmail(data: WaitlistEmailData): Promise<void> {
  const transport = getTransporter();
  const { subject, html } = formatWaitlistEmail(data);
  const user = process.env.GMAIL_USER!;

  await transport.sendMail({
    from: `"SweatDrop Website" <${user}>`,
    to: CONTACT_EMAIL,
    replyTo: data.email,
    subject,
    html,
  });
}

export async function sendSponsorProposalEmail(data: SponsorProposalEmailData): Promise<void> {
  const transport = getTransporter();
  const { subject, html } = formatSponsorProposalEmail(data);
  const user = process.env.GMAIL_USER!;

  await transport.sendMail({
    from: `"SweatDrop Website" <${user}>`,
    to: CONTACT_EMAIL,
    replyTo: data.email,
    subject,
    html,
  });
}

export async function sendContactEmail(data: ContactEmailData): Promise<void> {
  const transport = getTransporter();
  const { subject, html } = formatContactEmail(data);
  const user = process.env.GMAIL_USER!;

  await transport.sendMail({
    from: `"SweatDrop Website" <${user}>`,
    to: CONTACT_EMAIL,
    replyTo: data.email,
    subject,
    html,
  });
}
