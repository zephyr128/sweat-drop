# Landing Page Polish Pass - Status Report

**Date:** 2025-01-28  
**Status:** Core infrastructure complete, visual updates in progress

---

## ✅ COMPLETED

### Design System Updates
- ✅ Updated color system to Apple-style (pure black #000000, refined glass colors)
- ✅ Updated typography scale (hero headlines, section headlines, body text)
- ✅ Added glassmorphism CSS classes (glass-card, glass-card-teal, glass-card-orange, etc.)
- ✅ Added noise texture overlay to body
- ✅ Updated tailwind.config.js with new color tokens

### Components Built
- ✅ **GlassCard component** - All variants (default, teal, orange, lime, pricing, featured)
- ✅ **Button component** - Rebuilt with pill shape (rounded-[980px]), all variants (primary, secondary, outline-teal, orange, large, small)
- ✅ **Modal component** - Updated to Apple-style (frosted glass, refined styling)
- ✅ **Navigation** - Updated to Apple-style frosted glass (52px height, saturate blur, refined links)

### Modal System
- ✅ **ModalProvider** - Global modal context system
- ✅ **useModal hook** - Allows any component to open modals
- ✅ **SponsorProposalModal** - Complete with all fields, founding sponsor support
- ✅ **WaitlistModal** - Simple, focused email capture
- ✅ **ContactModal** - Enterprise contact form
- ✅ **ApplyPilotModal** - Already exists, works with modal context

### API Routes
- ✅ `/api/sponsor-proposal` - Updated to match modal fields
- ✅ `/api/waitlist` - Updated to handle gym_name field
- ✅ `/api/contact` - Created for enterprise inquiries

### Utilities
- ✅ `smooth-scroll.ts` - Smooth scroll to anchor IDs

### Example Wiring
- ✅ HomeHero - Wired to use modal context and smooth scroll

---

## 🔄 IN PROGRESS / REMAINING

### Button Wiring (High Priority)
All buttons need to be wired to correct actions. Use this pattern:

```tsx
// For modals:
import { useModal } from '@/lib/modal-context';
const { openModal } = useModal();
<button onClick={() => openModal('apply-pilot', { initialPlan: 'growth' })}>

// For smooth scroll:
import { smoothScrollTo } from '@/lib/smooth-scroll';
<button onClick={() => smoothScrollTo('pricing')}>

// For navigation:
import Link from 'next/link';
<Link href="/sweat-arenas">
```

**Pages to wire:**
- [ ] Homepage - All CTAs (pilot buttons, pricing plan buttons, FAQ accordion)
- [ ] /sweat-arenas - All proposal buttons, anchor scrolls
- [ ] /members - Waitlist buttons, app store links (when live)
- [ ] /sponsors - All proposal buttons, form submission

### GlassCard Application (Medium Priority)
Replace all `.card` classes with `<GlassCard>` component:

**Pages to update:**
- [ ] Homepage - Pricing cards, feature cards, equipment cards, FAQ items
- [ ] /sweat-arenas - Arena cards, sponsor profile cards, pricing cards
- [ ] /members - Reward cards, leaderboard cards, arena preview cards
- [ ] /sponsors - Comparison cards, profile cards, pricing cards

**Pattern:**
```tsx
// Before:
<div className="card p-6">

// After:
<GlassCard variant="default" className="p-6">
```

### Spacing Updates (Medium Priority)
Increase section padding across all pages:

```tsx
// Current:
className="py-24"

// Target:
className="py-32 md:py-40"  // More generous spacing
```

### Background Treatment (Low Priority)
- [ ] Update all section backgrounds to pure black #000000
- [ ] Add ambient glows (more subtle than before)
- [ ] Ensure noise texture is visible

### Phone Mockups (Low Priority)
- [ ] Update phone mockup styling to premium Apple style
- [ ] Add dynamic island if needed
- [ ] Refine shadows and borders

---

## 🔧 QUICK FIXES NEEDED

### Navigation
- [ ] Update mobile menu to use modal context instead of local state
- [ ] Ensure all nav links work correctly

### Pricing Section
- [ ] Ensure annual/monthly toggle works
- [ ] Wire all "Start Free Pilot" buttons to modal with correct plan
- [ ] Wire "Contact us" link to ContactModal

### FAQ Sections
- [ ] Ensure all FAQ accordions animate smoothly
- [ ] Apply GlassCard to FAQ items

---

## 📋 BUTTON WIRING CHECKLIST

### Homepage (/)
- [ ] Apply for Pilot (nav) → `openModal('apply-pilot')`
- [ ] Apply for Free Pilot (hero) → `openModal('apply-pilot')`
- [ ] See How It Works ↓ → `smoothScrollTo('how-it-works')`
- [ ] Start Free Pilot (starter) → `openModal('apply-pilot', { initialPlan: 'starter' })`
- [ ] Start Free Pilot (growth) → `openModal('apply-pilot', { initialPlan: 'growth' })`
- [ ] Start Free Pilot (pro) → `openModal('apply-pilot', { initialPlan: 'pro' })`
- [ ] Start Free Pilot (elite) → `openModal('apply-pilot', { initialPlan: 'elite' })`
- [ ] Contact us (enterprise) → `openModal('contact')`
- [ ] Learn About Sweat Arenas → `<Link href="/sweat-arenas">`
- [ ] Apply for Free Pilot (pilot section) → `openModal('apply-pilot')`
- [ ] Apply for Free Pilot Now (final CTA) → `openModal('apply-pilot')`
- [ ] Annual/Monthly toggle → Update state

### /sweat-arenas
- [ ] I'm a Gym Owner ↓ → `smoothScrollTo('gym-owners')`
- [ ] I'm a Brand ↓ → `smoothScrollTo('sponsors')`
- [ ] Learn About Gym Plans → `<Link href="/#pricing">`
- [ ] Request Proposal (local) → `openModal('sponsor-proposal', { plan: 'local' })`
- [ ] Request Proposal (regional) → `openModal('sponsor-proposal', { plan: 'regional' })`
- [ ] Request Proposal (network) → `openModal('sponsor-proposal', { plan: 'network' })`
- [ ] Apply for Founding Sponsor → `openModal('sponsor-proposal', { founding: true })`

### /members
- [ ] Download on App Store → `<a href="#" target="_blank">` (placeholder)
- [ ] Get it on Google Play → `<a href="#" target="_blank">` (placeholder)
- [ ] Join the Waitlist → `openModal('waitlist', { source: 'members_page' })`
- [ ] Learn About Sweat Arenas → `<Link href="/sweat-arenas">`
- [ ] Join Waitlist (form) → Submit inline (already works)
- [ ] Tell your gym to apply → `<Link href="/#pilot">`

### /sponsors
- [ ] Request Arena Proposal (hero) → `openModal('sponsor-proposal')`
- [ ] Request Proposal (all variants) → `openModal('sponsor-proposal', { plan: '...' })`
- [ ] Apply for Founding Sponsor → `openModal('sponsor-proposal', { founding: true })`
- [ ] Send Proposal Request (form) → Submit inline (already works)

---

## 🎨 VISUAL UPDATES REMAINING

1. **Apply GlassCard everywhere** - Replace all `.card` divs
2. **Update button styles** - Ensure all buttons use new pill shape
3. **Increase spacing** - Make sections more spacious
4. **Refine backgrounds** - Pure black, subtle glows
5. **Update phone mockups** - Premium Apple style

---

## 🚀 NEXT STEPS

1. Wire all buttons using the patterns above
2. Apply GlassCard component to all cards
3. Update spacing (increase section padding)
4. Test all modals open correctly
5. Test all smooth scrolls work
6. Test pricing toggle
7. Test FAQ accordions

---

## 📝 NOTES

- Modal context system is ready - use `useModal()` hook anywhere
- Smooth scroll utility is ready - use `smoothScrollTo(id)`
- All API routes are ready (they log to console, Supabase integration pending)
- GlassCard component supports all variants needed
- Button component is fully rebuilt with Apple-style pill shape

**Estimated remaining work:** 2-3 hours of systematic button wiring and GlassCard application.
