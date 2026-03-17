import type { Metadata } from 'next';
import { Navigation } from '@/components/Navigation';
import { Footer } from '@/components/Footer';
import { HomeHero } from '@/components/sections/HomeHero';
import { HowItWorks } from '@/components/sections/HowItWorks';
import { BrandAppPreview } from '@/components/sections/BrandAppPreview';
import { CompatibleEquipment } from '@/components/sections/CompatibleEquipment';
import { CheckInSection } from '@/components/sections/CheckInSection';
import { WhyItWorks } from '@/components/sections/WhyItWorks';
import { Pricing } from '@/components/sections/Pricing';
import { SweatArenasPreview } from '@/components/sections/SweatArenasPreview';
import { PilotProgram } from '@/components/sections/PilotProgram';
import { FAQ } from '@/components/sections/FAQ';
import { FinalCTA } from '@/components/sections/FinalCTA';
import { getStructuredData, getOrganizationData, getFAQStructuredData } from './structured-data';

export const metadata: Metadata = {
  title: 'SweatDrop — Gym Gamification Platform Belgrade',
  description: 'Turn your cardio floor into a competition. Members earn drops, win prizes, come back more often. 90-day free pilot for Belgrade gyms.',
  openGraph: {
    title: 'SweatDrop — Be the First Gym in Belgrade',
    description: 'Members compete, earn drops, win real prizes. You get retention data.',
    images: [{ url: '/og/homepage.png', width: 1200, height: 630 }],
  },
};

export default function HomePage() {
  const structuredData = getStructuredData();
  const organizationData = getOrganizationData();
  const faqStructuredData = getFAQStructuredData();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationData) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructuredData) }}
      />
      <Navigation />
      <main>
        <HomeHero />
        <HowItWorks />
        <BrandAppPreview />
        <CompatibleEquipment />
        <CheckInSection />
        <WhyItWorks />
        <Pricing />
        <SweatArenasPreview />
        <PilotProgram />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}
