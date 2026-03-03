import type { Metadata } from 'next';
import { Navigation } from '@/components/Navigation';
import { Footer } from '@/components/Footer';
import { SponsorsHero } from '@/components/sections/sponsors/SponsorsHero';
import { ProblemComparison } from '@/components/sections/sponsors/ProblemComparison';
import { HowArenaWorks } from '@/components/sections/sponsors/HowArenaWorks';
import { ProjectedNumbers } from '@/components/sections/sponsors/ProjectedNumbers';
import { SponsorProfiles } from '@/components/sections/sponsors/SponsorProfiles';
import { ArenaPricing } from '@/components/sections/sponsors/ArenaPricing';
import { FoundingSponsor } from '@/components/sections/sponsors/FoundingSponsor';
import { WhatYouReceive } from '@/components/sections/sponsors/WhatYouReceive';
import { SponsorsFAQ } from '@/components/sections/sponsors/SponsorsFAQ';
import { ProposalForm } from '@/components/sections/sponsors/ProposalForm';

export const metadata: Metadata = {
  title: 'SweatDrop — Reach Active Gym Members in Belgrade',
  description: 'Sweat Arenas put your brand at the center of a 30-day gym competition. Members compete for your prizes.',
  openGraph: {
    title: 'SweatDrop — Reach Active Gym Members in Belgrade',
    description: 'Sweat Arenas put your brand at the center of a 30-day gym competition. Members compete for your prizes.',
    images: [{ url: '/og/sponsors.png', width: 1200, height: 630 }],
  },
};

export default function SponsorsPage() {
  return (
    <>
      <Navigation />
      <main>
        <SponsorsHero />
        <ProblemComparison />
        <HowArenaWorks />
        <ProjectedNumbers />
        <SponsorProfiles />
        <ArenaPricing />
        <FoundingSponsor />
        <WhatYouReceive />
        <SponsorsFAQ />
        <ProposalForm />
      </main>
      <Footer />
    </>
  );
}
