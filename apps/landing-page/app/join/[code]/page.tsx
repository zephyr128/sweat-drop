import type { Metadata } from 'next';
import { JoinInvite } from '@/components/sections/JoinInvite';

export const metadata: Metadata = {
  title: 'You\'ve been invited — SweatDrop',
  description: 'Join SweatDrop and start earning drops every time you train. Compete on the leaderboard. Win real prizes.',
  openGraph: {
    title: 'You\'ve been invited — SweatDrop',
    description: 'Earn drops, compete on leaderboards, win real prizes at your gym.',
    images: [{ url: '/og-image.jpg', width: 1200, height: 630 }],
  },
};

interface Props {
  params: Promise<{ code: string }>;
}

export default async function JoinPage({ params }: Props) {
  const { code } = await params;

  return (
    <main className="min-h-screen bg-bg relative overflow-hidden">
      <JoinInvite code={code} />
    </main>
  );
}
