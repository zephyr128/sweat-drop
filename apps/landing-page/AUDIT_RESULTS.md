# Landing Page Audit Results
**Date:** 2025-01-28  
**Auditor:** Landing Page Agent

---

## EXISTING CODEBASE STRUCTURE

### ✅ Reusable Components

**Navigation:**
- `components/Navigation.tsx` - Exists but needs major update
  - Current: Logo + Language selector only
  - Needed: Logo + nav links (For Gyms | Pricing | Sweat Arenas | For Members | For Sponsors) + CTA button + language toggle
  - Status: **REBUILD REQUIRED**

**UI Components:**
- `components/ui/Button.tsx` - Exists, needs variant updates for new design
- `components/ui/Input.tsx` - Exists, can be reused
- `components/ui/Textarea.tsx` - Exists, can be reused
- `components/ui/Modal.tsx` - Exists, can be reused
- `components/ui/ScrollReveal.tsx` - Exists, can be reused
- `components/ui/BorderBeam.tsx` - Exists, can be reused
- `components/ui/Select.tsx` - Exists, can be reused

**Forms:**
- `components/modals/ApplyPilotModal.tsx` - Exists, can be adapted
- `components/modals/RequestDemoModal.tsx` - Exists, can be adapted
- API routes exist: `/api/apply-pilot/route.ts`, `/api/request-demo/route.ts`

**Language System:**
- `lib/i18n.ts` - Exists, comprehensive translation system
- `lib/use-language.tsx` - Exists, React hook for translations
- `components/LanguageSelector.tsx` - Exists, can be reused

---

## DESIGN SYSTEM MISMATCH

### Current Design System:
- **Fonts:** Space Grotesk (display), Inter (body)
- **Colors:** Primary #00E5FF (cyan), Volt Green #CEFF00, Deep Blue #0066FF
- **Background:** #000000

### Required Design System:
- **Fonts:** Bebas Neue (display), DM Sans (body), Space Mono (labels/data)
- **Colors:** Primary #00E5CC (teal), Drops #C8FF00 (acid green), Urgency #FF5500 (orange)
- **Background:** #070709
- **Text:** #EEEEF2 (primary), #8889A0 (secondary)
- **Border:** #1e1f28

**Status:** **DESIGN SYSTEM REBUILD REQUIRED**

---

## EXISTING PAGES

### Current Pages:
- `/` - Homepage (needs full redesign per spec)
- No `/sweat-arenas` page exists
- No `/members` page exists
- No `/sponsors` page exists

**Status:** **3 NEW PAGES NEEDED**

---

## EXISTING SECTIONS (Homepage)

Current sections that may be reusable:
- `components/sections/Hero.tsx` - Needs complete rebuild
- `components/sections/WhatIsSweatDrop.tsx` - May have reusable concepts
- `components/sections/SmartCardioSensors.tsx` - Can be adapted for equipment section
- `components/sections/AppExperience.tsx` - Can be adapted
- `components/sections/WhyItMatters.tsx` - Can be adapted
- `components/sections/AdminPanel.tsx` - Can be adapted for dashboard mockup
- `components/sections/PilotSection.tsx` - Can be adapted
- `components/sections/FutureVision.tsx` - **DO NOT USE** (shows coming soon features)

**Status:** Most sections need rebuild, but concepts can be reused

---

## TECHNICAL INFRASTRUCTURE

### ✅ Working:
- Next.js 15 App Router setup
- TypeScript strict mode
- Tailwind CSS configured
- Framer Motion for animations
- Image optimization (Next.js Image)
- SEO metadata structure
- Structured data (JSON-LD)
- API routes for forms
- Supabase integration ready

### ⚠️ Needs Update:
- Font loading (need Bebas Neue, DM Sans, Space Mono)
- Color tokens in Tailwind config
- Analytics integration (check if exists)

---

## CONTENT AUDIT

### Honest Product State (per spec):

**EXISTS:**
- ✅ React Native mobile app (in development)
- ✅ Magene S3+ sensor for bikes/ellipticals
- ✅ Direct BLE connection to smart treadmills (Life Fitness, Technogym, Matrix, Shua)
- ✅ Supabase backend
- ✅ Next.js admin panel (in development)
- ✅ Zero gym partners currently
- ✅ Zero real users currently

**DOES NOT EXIST:**
- ❌ Smart Pin sensor
- ❌ Smart Carabiner
- ❌ Universal Motion Sensor
- ❌ Weight machine tracking
- ❌ Any live gym partners
- ❌ Any real retention numbers

**RULE:** Never show coming soon features as if they exist. Never show fake social proof.

---

## IMAGE ASSETS

### Existing Assets:
- `/public/appicon.png` - Logo (can reuse)
- `/public/mobile-app-mockup.png` - May be usable
- `/public/admin-panel-mockup.png` - May be usable
- `/public/bike-sensor.png` - Can reuse
- `/public/hero.png` - May need replacement

### Required Assets (per spec):
1. Hero phone mockup (homepage) - 800×1200px, PNG transparent
2. Hero phone mockup (members page) - 800×1200px, PNG transparent
3. Arena screen mockup - 800×1200px, PNG transparent
4. Admin dashboard mockup - 1200×800px
5. App screenshots × 4 (members page) - 390×844px each
6. OpenGraph images × 4 - 1200×630px each

**Status:** **FLAG FOR HUMAN** - Need to provide or generate

---

## COPY PLACEHOLDERS

### Numbers/Data That Need Real Values:
- Pilot spots available (currently: "3 spots, 1 reserved")
- Pricing tiers (€39/79/149/249 per spec)
- Adoption rates (spec says "60-70% typically" - rephrase if no data)
- Arena pricing (€150-300 local, €500 regional, €1500 network)
- Founding sponsor spots (3 spots)

### Testimonials:
- None exist (do not create fake ones)

### Case Studies:
- None exist (do not create fake ones)

---

## SERBIAN TRANSLATION NOTE

All new copy needs native Serbian review:
- Homepage: All sections
- Sweat Arenas: All sections
- Members: All sections
- Sponsors: All sections

**Flag:** Professional translation needed, not machine translation

---

## BUILD ORDER

1. **Update Design System**
   - Add Bebas Neue, DM Sans, Space Mono fonts
   - Update Tailwind colors to match spec
   - Update global CSS

2. **Rebuild Navigation**
   - Add nav links
   - Add CTA button
   - Update styling

3. **Create Shared Footer** (if needed per spec)

4. **Build Homepage (/)** - Full redesign
   - Hero section
   - How It Works (3 steps)
   - Compatible Equipment
   - Why SweatDrop Works
   - Pricing
   - Sweat Arenas Preview
   - Pilot Program
   - FAQ
   - Final CTA

5. **Build Sweat Arenas (/sweat-arenas)**
   - Hero
   - What Is a Sweat Arena
   - For Gym Owners section
   - For Sponsors section
   - FAQ
   - Final CTA

6. **Build Members (/members)**
   - Hero
   - How It Works
   - What You Earn
   - Leaderboard
   - Reward Store
   - Sweat Arenas for Members
   - App Screenshots
   - Find Your Gym
   - Final CTA

7. **Build Sponsors (/sponsors)**
   - Hero
   - Problem comparison
   - How It Works
   - Projected Numbers
   - Who Runs Arenas
   - Pricing
   - Founding Sponsor Program
   - What You Receive
   - FAQ
   - Final CTA

8. **SEO & Analytics**
   - Update meta tags per page
   - Generate sitemap.xml
   - Add analytics tracking
   - Create OpenGraph images (placeholders)

9. **Forms Integration**
   - Pilot application form
   - Waitlist form
   - Sponsor proposal form
   - Connect to Supabase

---

## SUMMARY

**Reusable:** UI components, form modals, language system, API routes, infrastructure  
**Rebuild:** Navigation, design system, homepage sections, all new pages  
**New:** 3 new pages, updated fonts, new color scheme, new copy throughout

**Estimated Work:** Full redesign with new design system + 3 new pages

---

**Next Step:** Begin building with design system update first.
