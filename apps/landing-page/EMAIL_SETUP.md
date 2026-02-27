# Email Setup Guide

This guide explains how to configure Gmail SMTP for the SweatDrop landing page contact forms.

## Prerequisites

1. A Gmail account (`symfony123@gmail.com` in this case)
2. 2-Step Verification enabled on your Google Account

## Step 1: Enable 2-Step Verification

1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Under "Signing in to Google", click **2-Step Verification**
3. Follow the prompts to enable 2-Step Verification

## Step 2: Generate App Password

1. Go back to [Google Account Security](https://myaccount.google.com/security)
2. Under "Signing in to Google", click **App passwords**
3. You may need to sign in again
4. Select:
   - **App:** Mail
   - **Device:** Other (Custom name)
   - Enter: `SweatDrop Landing Page`
5. Click **Generate**
6. Copy the 16-character password (it will look like: `abcd efgh ijkl mnop`)

## Step 3: Configure Environment Variables

1. Create a `.env.local` file in the `apps/landing-page/` directory
2. Add the following:

```bash
GMAIL_USER=symfony123@gmail.com
GMAIL_APP_PASSWORD=your_16_character_app_password_here
```

**Important:**
- Remove any spaces from the app password
- Never commit `.env.local` to version control
- The `.env.local` file is already in `.gitignore`

## Step 4: Install Dependencies

If you haven't already, install the required packages:

```bash
cd apps/landing-page
pnpm add nodemailer
pnpm add -D @types/nodemailer
```

## Step 5: Test the Forms

1. Start the development server: `pnpm dev`
2. Navigate to the landing page
3. Click "Request Demo" or "Apply for Pilot"
4. Fill out and submit the form
5. Check your Gmail inbox (`symfony123@gmail.com`) for the email

## Troubleshooting

### "Gmail credentials not configured" Error

- Make sure `.env.local` exists and contains both `GMAIL_USER` and `GMAIL_APP_PASSWORD`
- Restart your development server after adding environment variables
- Check that there are no extra spaces or quotes in the values

### "Invalid login" Error

- Verify you're using an App Password, not your regular Gmail password
- Make sure 2-Step Verification is enabled
- Regenerate the App Password if needed

### Emails Not Arriving

- Check your spam folder
- Verify the email address in `GMAIL_USER` is correct
- Check server logs for error messages
- Ensure your Gmail account isn't restricted

### Rate Limiting

The forms have rate limiting enabled:
- **Limit:** 5 requests per 15 minutes per IP address
- If you hit the limit, wait 15 minutes or test from a different IP

## Production Deployment

For production (Vercel, Netlify, etc.):

1. Add environment variables in your hosting platform's dashboard:
   - `GMAIL_USER`
   - `GMAIL_APP_PASSWORD`

2. Never commit `.env.local` to your repository

3. Restart your application after adding environment variables

## Security Notes

- ✅ App Passwords are more secure than regular passwords
- ✅ Credentials are only used server-side (never exposed to client)
- ✅ Input is sanitized to prevent XSS attacks
- ✅ Rate limiting prevents abuse
- ✅ All form data is validated before sending

## Email Templates

The emails are sent as HTML with:
- Professional styling matching SweatDrop brand
- All form fields clearly displayed
- Timestamp for tracking
- Reply-to set to user's email (for Request Demo)

Both forms send emails to: `symfony123@gmail.com`
