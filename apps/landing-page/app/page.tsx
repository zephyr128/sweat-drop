import type { Metadata } from 'next';
import { Hero } from '@/components/sections/Hero';
import { WhatIsSweatDrop } from '@/components/sections/WhatIsSweatDrop';
import { SmartCardioSensors } from '@/components/sections/SmartCardioSensors';
import { AppExperience } from '@/components/sections/AppExperience';
import { WhyItMatters } from '@/components/sections/WhyItMatters';
import { AdminPanel } from '@/components/sections/AdminPanel';
import { FutureVision } from '@/components/sections/FutureVision';
import { PilotSection } from '@/components/sections/PilotSection';
import { Navigation } from '@/components/Navigation';
import { getStructuredData, getOrganizationData } from './structured-data';

export const metadata: Metadata = {
  title: 'SweatDrop - The Digital Layer for Modern Gyms',
  description: 'Transform your gym equipment into connected experiences. IoT sensors and mobile app that increase member retention and drive revenue.',
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
        <Hero />
        <WhatIsSweatDrop />
        <SmartCardioSensors />
        <AppExperience />
        <WhyItMatters />
        <AdminPanel />
        <FutureVision />
        <PilotSection />
      </main>
    </>
  );
}
