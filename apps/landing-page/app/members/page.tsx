import type { Metadata } from 'next';
import { Navigation } from '@/components/Navigation';
import { Footer } from '@/components/Footer';
import { MembersHero } from '@/components/sections/members/MembersHero';
import { MembersHowItWorks } from '@/components/sections/members/MembersHowItWorks';
import { WhatYouEarn } from '@/components/sections/members/WhatYouEarn';
import { LeaderboardSection } from '@/components/sections/members/LeaderboardSection';
import { RewardStore } from '@/components/sections/members/RewardStore';
import { ArenasForMembers } from '@/components/sections/members/ArenasForMembers';
import { AppScreenshots } from '@/components/sections/members/AppScreenshots';
import { MembersFinalCTA } from '@/components/sections/members/MembersFinalCTA';

export const metadata: Metadata = {
  title: 'SweatDrop — Earn Rewards at Your Gym',
  description: 'Connect to gym machines, earn drops every session, climb the leaderboard, win real prizes every week.',
  openGraph: {
    title: 'SweatDrop — Earn Rewards at Your Gym',
    description: 'Connect to gym machines, earn drops every session, climb the leaderboard, win real prizes every week.',
    images: [{ url: '/og/members.png', width: 1200, height: 630 }],
  },
};

export default function MembersPage() {
  return (
    <>
      <Navigation />
      <main>
        <MembersHero />
        <MembersHowItWorks />
        <WhatYouEarn />
        <LeaderboardSection />
        <RewardStore />
        <ArenasForMembers />
        <AppScreenshots />
        <MembersFinalCTA />
      </main>
      <Footer />
    </>
  );
}
