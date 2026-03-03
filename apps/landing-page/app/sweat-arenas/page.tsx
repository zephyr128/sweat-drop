import type { Metadata } from 'next';
import { Navigation } from '@/components/Navigation';
import { Footer } from '@/components/Footer';
import { SweatArenasHero } from '@/components/sections/sweat-arenas/SweatArenasHero';
import { WhatIsArena } from '@/components/sections/sweat-arenas/WhatIsArena';
import { ForGymOwners } from '@/components/sections/sweat-arenas/ForGymOwners';
import { ForSponsors } from '@/components/sections/sweat-arenas/ForSponsors';
import { ArenaFAQ } from '@/components/sections/sweat-arenas/ArenaFAQ';
import { ArenaFinalCTA } from '@/components/sections/sweat-arenas/ArenaFinalCTA';

export const metadata: Metadata = {
  title: 'Sweat Arenas — Sponsored Gym Competitions | SweatDrop',
  description: 'Brand-sponsored leaderboard competitions for gyms. Members compete for prizes. Brands get session data and a captivated audience.',
  openGraph: {
    title: 'Sweat Arenas — Sponsored Gym Competitions',
    description: 'Brand-sponsored leaderboard competitions for gyms. Members compete. Brands get data.',
    images: [{ url: '/og/sweat-arenas.png', width: 1200, height: 630 }],
  },
};

export default function SweatArenasPage() {
  return (
    <>
      <Navigation />
      <main>
        <SweatArenasHero />
        <WhatIsArena />
        <ForGymOwners />
        <ForSponsors />
        <ArenaFAQ />
        <ArenaFinalCTA />
      </main>
      <Footer />
    </>
  );
}
