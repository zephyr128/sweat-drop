import type { Metadata } from 'next';
import { Navigation } from '@/components/Navigation';
import { Footer } from '@/components/Footer';
import { HomeHero } from '@/components/sections/HomeHero';
import { HowItWorks } from '@/components/sections/HowItWorks';
import { CompatibleEquipment } from '@/components/sections/CompatibleEquipment';
import { WhyItWorks } from '@/components/sections/WhyItWorks';
import { Pricing } from '@/components/sections/Pricing';
import { SweatArenasPreview } from '@/components/sections/SweatArenasPreview';
import { PilotProgram } from '@/components/sections/PilotProgram';
import { FAQ } from '@/components/sections/FAQ';
import { FinalCTA } from '@/components/sections/FinalCTA';
import { getStructuredData, getOrganizationData } from './structured-data';

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
      <Navigation />
      <main>
        <HomeHero />
        <HowItWorks />
        <CompatibleEquipment />
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
