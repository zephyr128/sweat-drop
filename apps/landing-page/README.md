# Sweat Drop Landing Page

Professional marketing website for Sweat Drop - a gamified fitness IoT platform.

## Tech Stack

- **Framework:** Next.js 15 (App Router)
- **React:** 19.1.0
- **Styling:** Tailwind CSS
- **Animations:** Framer Motion
- **Icons:** Lucide React
- **Fonts:** Inter, Space Grotesk (Google Fonts)
- **i18n:** Custom implementation (English/Serbian)
- **Email:** Nodemailer with Gmail SMTP

## Design System

**Style:** High-Octane Minimalism
- Background: `#000000` (pure black)
- Primary: `#00E5FF` (neon cyan/blue)
- Secondary: `#FF9100` (orange)
- Typography: Geometric sans-serif (Archivo, Syne)

## Features

- ✅ Hero Section with CTAs (Request Demo, Apply for Pilot)
- ✅ Functional Contact Forms with Email Integration
- ✅ Request Demo Modal Form
- ✅ Apply for Pilot Modal Form
- ✅ Smart Cardio Sensors Section
- ✅ App Experience Section
- ✅ Why It Matters Section
- ✅ Admin Panel Section
- ✅ Future Vision Section
- ✅ Pilot Program Section
- ✅ Language Selector (English/Serbian)
- ✅ SEO Optimized with Structured Data
- ✅ Responsive Design (mobile-first)
- ✅ Rate Limiting (5 requests per 15 minutes per IP)
- ✅ Input Validation & Sanitization

## Development

```bash
# Install dependencies
pnpm install

# Install email dependencies (if not already installed)
pnpm add nodemailer
pnpm add -D @types/nodemailer

# Create .env.local file (see Environment Variables section)
cp .env.example .env.local
# Edit .env.local with your Gmail credentials

# Start development server
pnpm dev:landing

# Build for production
pnpm build:landing

# Type check
pnpm type-check
```

## Project Structure

```
apps/landing-page/
├── app/
│   ├── layout.tsx          # Root layout with fonts and metadata
│   ├── page.tsx            # Home page
│   └── globals.css         # Global styles
├── components/
│   ├── sections/           # Landing page sections
│   │   ├── Hero.tsx
│   │   ├── FeatureBento.tsx
│   │   ├── HardwareTimeline.tsx
│   │   ├── WhySection.tsx
│   │   ├── CoverageMatrix.tsx
│   │   └── CTA.tsx
│   ├── DynamicDropCounter.tsx
│   ├── LanguageSelector.tsx
│   └── Navigation.tsx
├── app/
│   ├── api/
│   │   ├── request-demo/   # Request Demo API endpoint
│   │   └── apply-pilot/    # Apply Pilot API endpoint
│   ├── layout.tsx          # Root layout with fonts and metadata
│   ├── page.tsx            # Home page
│   └── globals.css         # Global styles
├── components/
│   ├── modals/             # Modal components
│   │   ├── RequestDemoModal.tsx
│   │   └── ApplyPilotModal.tsx
│   ├── sections/          # Landing page sections
│   │   ├── Hero.tsx
│   │   ├── WhatIsSweatDrop.tsx
│   │   ├── SmartCardioSensors.tsx
│   │   ├── AppExperience.tsx
│   │   ├── WhyItMatters.tsx
│   │   ├── AdminPanel.tsx
│   │   ├── FutureVision.tsx
│   │   └── PilotSection.tsx
│   ├── ui/                 # UI components
│   │   ├── Modal.tsx
│   │   ├── Input.tsx
│   │   ├── Textarea.tsx
│   │   ├── Select.tsx
│   │   ├── Button.tsx
│   │   └── ...
│   ├── LanguageSelector.tsx
│   └── Navigation.tsx
└── lib/
    ├── i18n.ts             # Translation definitions
    ├── use-language.tsx     # Language context hook
    ├── email.ts             # Email sending utility (Nodemailer)
    ├── rate-limit.ts        # Rate limiting utility
    └── validation.ts       # Input validation utilities
```

## Environment Variables

### Required for Email Functionality

The contact forms require Gmail SMTP configuration:

1. **GMAIL_USER** - Your Gmail address (e.g., `symfony123@gmail.com`)
2. **GMAIL_APP_PASSWORD** - Gmail App Password (NOT your regular Gmail password)

### Setting Up Gmail App Password

1. Go to your Google Account settings: https://myaccount.google.com/
2. Navigate to **Security** → **2-Step Verification** (must be enabled)
3. Scroll down to **App passwords**
4. Select **Mail** and **Other (Custom name)**
5. Enter "SweatDrop Landing Page" as the name
6. Click **Generate**
7. Copy the 16-character password (spaces don't matter)
8. Add it to your `.env.local` file:

```bash
GMAIL_USER=symfony123@gmail.com
GMAIL_APP_PASSWORD=your_16_character_app_password
CONTACT_EMAIL=support@sweat-drop.com
```

**Important:** 
- Never commit `.env.local` to version control
- Use App Password, NOT your regular Gmail password
- 2-Step Verification must be enabled on your Google account

### Optional Environment Variables

- `CONTACT_EMAIL` - Where form submissions are sent (default: `support@sweat-drop.com`)
- `NEXT_PUBLIC_GA_ID` - Google Analytics ID
- `NEXT_PUBLIC_SITE_URL` - Site URL for SEO metadata

## Deployment

The landing page can be deployed to:
- **Vercel** (recommended for Next.js)
- **Netlify**
- **Any Node.js hosting**

Build command: `pnpm build:landing`
Output directory: `.next`
